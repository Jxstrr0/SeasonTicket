/** Match feed: score header, scorers, a stats strip and the event timeline. */
import type { League, MatchEvent, MatchEventType, MatchResult, ScheduledMatch, Team, TeamMatchStats } from '../../sim/types';
import { formatMinute, kit, percent, playerSurname, stageLabel, team, thousands, weatherLabel } from '../format';
import { cls, each, esc } from '../html';
import { resultNotes } from './results';

const GOAL_TYPES: ReadonlySet<MatchEventType> = new Set(['goal', 'ownGoal', 'penaltyScored']);
const YELLOW_TYPES: ReadonlySet<MatchEventType> = new Set(['yellowCard']);
const RED_TYPES: ReadonlySet<MatchEventType> = new Set(['secondYellow', 'redCard']);
/** Period markers and the shootout always show, so the short feed still reads as a match. */
const ALWAYS_SHOWN: ReadonlySet<MatchEventType> = new Set([
  'kickoff',
  'halfTime',
  'fullTime',
  'extraTimeStart',
  'extraTimeHalf',
  'extraTimeEnd',
  'shootoutStart',
  'shootoutKick',
  'shootoutEnd',
]);
const SHOOTOUT_TYPES: ReadonlySet<MatchEventType> = new Set(['shootoutStart', 'shootoutKick', 'shootoutEnd']);

export function isKeyEvent(event: MatchEvent): boolean {
  return event.highlight || GOAL_TYPES.has(event.type) || YELLOW_TYPES.has(event.type) || RED_TYPES.has(event.type) || ALWAYS_SHOWN.has(event.type);
}

export function visibleEvents(events: readonly MatchEvent[], showAll: boolean): MatchEvent[] {
  return showAll ? events.slice() : events.filter(isKeyEvent);
}

export interface GoalLine {
  side: 'home' | 'away';
  event: MatchEvent;
}

/** Goals in order, credited to whichever side's score went up (own goals included). */
export function goalsOf(events: readonly MatchEvent[]): GoalLine[] {
  const goals: GoalLine[] = [];
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (SHOOTOUT_TYPES.has(e.type)) continue;
    if (e.homeScore > home) goals.push({ side: 'home', event: e });
    else if (e.awayScore > away) goals.push({ side: 'away', event: e });
    home = e.homeScore;
    away = e.awayScore;
  }
  return goals;
}

function eventClass(event: MatchEvent): string {
  return cls(
    'event',
    GOAL_TYPES.has(event.type) && 'ev-goal',
    YELLOW_TYPES.has(event.type) && 'ev-yellow',
    RED_TYPES.has(event.type) && 'ev-red',
    ALWAYS_SHOWN.has(event.type) && !SHOOTOUT_TYPES.has(event.type) && 'ev-period',
  );
}

/** Trimmed results drop the commentary line; rebuild a short one from the event. */
const FALLBACK_TEXT: Partial<Record<MatchEventType, string>> = {
  goal: 'Goal',
  ownGoal: 'Own goal',
  penaltyScored: 'Penalty scored',
  redCard: 'Red card',
  secondYellow: 'Second yellow',
  injury: 'Injury',
  yellowCard: 'Yellow card',
  substitution: 'Substitution',
};

export function eventText(league: League, event: MatchEvent): string {
  if (event.text) return event.text;
  const label = FALLBACK_TEXT[event.type] ?? '';
  const who = playerSurname(league, event.playerId);
  return who && label ? `${label}: ${who}` : label;
}

export function renderEvent(league: League, event: MatchEvent): string {
  const side = event.teamId ? kit(team(league, event.teamId)) : '<span class="kit kit-none" aria-hidden="true"></span>';
  return `<li class="${eventClass(event)}">
    <span class="ev-min">${esc(formatMinute(event))}</span>
    ${side}
    <span class="ev-text">${esc(eventText(league, event))}</span>
  </li>`;
}

export function scorerList(league: League, goals: GoalLine[], side: 'home' | 'away'): string {
  const mine = goals.filter((g) => g.side === side);
  if (mine.length === 0) return '';
  return each(mine, (g) => {
    const og = g.event.type === 'ownGoal' ? ' (og)' : '';
    const pen = g.event.type === 'penaltyScored' ? ' (pen)' : '';
    return `<span class="scorer">${esc(playerSurname(league, g.event.playerId))}${og}${pen} ${esc(formatMinute(g.event))}</span>`;
  });
}

export interface StatRow {
  label: string;
  home: number;
  away: number;
  show: (n: number) => string;
}

export function statRows(home: TeamMatchStats, away: TeamMatchStats): StatRow[] {
  const whole = (n: number) => String(n);
  return [
    { label: 'Possession', home: home.possession, away: away.possession, show: (n) => percent(n) },
    { label: 'Shots', home: home.shots, away: away.shots, show: whole },
    { label: 'On target', home: home.shotsOnTarget, away: away.shotsOnTarget, show: whole },
    { label: 'xG', home: home.xg, away: away.xg, show: (n) => n.toFixed(2) },
    { label: 'Corners', home: home.corners, away: away.corners, show: whole },
    { label: 'Fouls', home: home.fouls, away: away.fouls, show: whole },
    { label: 'Yellow cards', home: home.yellowCards, away: away.yellowCards, show: whole },
    { label: 'Red cards', home: home.redCards, away: away.redCards, show: whole },
  ];
}

export function renderStat(row: StatRow): string {
  const total = row.home + row.away;
  const share = total > 0 ? row.home / total : 0.5;
  return `<div class="stat">
    <span class="stat-val">${esc(row.show(row.home))}</span>
    <span class="stat-mid">
      <span class="stat-label">${esc(row.label)}</span>
      <span class="stat-bar" aria-hidden="true"><span style="width:${(share * 100).toFixed(1)}%"></span></span>
    </span>
    <span class="stat-val">${esc(row.show(row.away))}</span>
  </div>`;
}

function headerSide(t: Team, side: 'home' | 'away'): string {
  return `<span class="mh-team ${side}">${kit(t)}<span class="mh-name">${esc(t.shortName)}</span></span>`;
}

export function renderMatchFeed(league: League, match: ScheduledMatch, showAll: boolean): string {
  const result: MatchResult | undefined = match.result;
  if (!result) {
    return `<section class="card"><button type="button" class="btn-secondary" data-action="close-match">Back</button><p class="muted">This match has not been played yet.</p></section>`;
  }
  const home = team(league, match.homeId);
  const away = team(league, match.awayId);
  const goals = goalsOf(result.events);
  const events = visibleEvents(result.events, showAll);
  const hidden = result.events.length - visibleEvents(result.events, false).length;
  const notes = resultNotes(result);
  const crowd = thousands(result.attendanceShare * home.stadiumCapacity);
  const context = [match.stage === 'league' ? `Round ${match.round}` : stageLabel(match.stage), `Week ${match.week}`, weatherLabel(result.weather), `Crowd ${crowd}`];
  return `
  <section class="card match-feed">
    <div class="feed-top">
      <button type="button" class="btn-secondary" data-action="close-match">Back</button>
      <span class="muted small">${esc(context.join(' · '))}</span>
    </div>
    <div class="match-header">
      ${headerSide(home, 'home')}
      <span class="mh-score">${result.homeScore}-${result.awayScore}</span>
      ${headerSide(away, 'away')}
    </div>
    <p class="mh-notes muted small">HT ${result.halfTimeScore.home}-${result.halfTimeScore.away}${notes.length ? ` · ${esc(notes.join(' · '))}` : ''}</p>
    <div class="scorers">
      <div class="scorers-home">${scorerList(league, goals, 'home')}</div>
      <div class="scorers-away">${scorerList(league, goals, 'away')}</div>
    </div>
    <div class="stats-strip">${each(statRows(result.stats.home, result.stats.away), renderStat)}</div>
    <div class="feed-controls">
      <h2 class="feed-title">${showAll ? 'Every event' : 'Key moments'}</h2>
      <button type="button" class="btn-secondary" data-action="toggle-events" aria-pressed="${showAll}">${showAll ? 'Key moments only' : `Show all (+${hidden})`}</button>
    </div>
    <ol class="events">${each(events, (e) => renderEvent(league, e))}</ol>
  </section>`;
}

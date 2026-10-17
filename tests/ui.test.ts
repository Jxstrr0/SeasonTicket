/**
 * The Stage 1 page's view functions are pure (season in, HTML string out), so
 * they run here in Node with no DOM. These tests drive real simulated
 * seasons through them and check what the owner would see.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SEASON_TUNING, WORLD } from '../src/sim/data';
import { createLeague } from '../src/sim/league';
import { advanceWeek, createSeason, defaultHooks, runSeason, type SeasonState } from '../src/sim/season';
import type { MatchEvent } from '../src/sim/types';
import { parseSeed, randomSeed } from '../src/ui/app';
import { formatMinute, thousands } from '../src/ui/format';
import { esc, safeColor } from '../src/ui/html';
import { neighbourWeek, playedWeeks, resultsWeekFor, seasonProgress, statusLabel, type SeasonView } from '../src/ui/model';
import { renderPlayoffs } from '../src/ui/views/bracket';
import { goalsOf, renderMatchFeed, visibleEvents } from '../src/ui/views/matchFeed';
import { renderResults } from '../src/ui/views/results';
import { renderSeason } from '../src/ui/views/season';
import { renderSummary } from '../src/ui/views/summary';
import { formDots, renderTable } from '../src/ui/views/table';
import { renderTitle } from '../src/ui/views/title';
import { simulateMatch } from './helpers/stage1/engine';

// These pages only read results, so whole seasons play on the fast Stage 1 stand-in.
const HOOKS = { ...defaultHooks(), simulate: simulateMatch };

function viewOf(season: SeasonState, patch: Partial<SeasonView> = {}): SeasonView {
  return { season, seed: '4242', tab: 'table', resultsWeek: null, openMatchId: null, showAllEvents: false, running: false, error: null, ...patch };
}

const LEADER_ROW = /<tr class="[^"]*\bleader\b/g;

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function event(patch: Partial<MatchEvent>): MatchEvent {
  return {
    minute: 10, added: 0, type: 'chance', side: 'home', teamId: null, playerId: null, secondaryPlayerId: null,
    xg: null, text: '', homeScore: 0, awayScore: 0, highlight: false, ...patch,
  };
}

let full: SeasonState;
let partial: SeasonState;
const breakWeek = SEASON_TUNING.calendar.breakWeeks[0];

beforeAll(() => {
  full = runSeason(createSeason(createLeague(4242)), HOOKS);
  partial = createSeason(createLeague(4242));
  // Play up to and through the mid-season break.
  while (partial.week <= breakWeek) advanceWeek(partial, HOOKS);
});

describe('html helpers', () => {
  it('escapes markup characters', () => {
    expect(esc(`<b a="1">'&'</b>`)).toBe('&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;');
  });

  it('only lets hex colours through to inline styles', () => {
    expect(safeColor('#0f7c8c')).toBe('#0f7c8c');
    expect(safeColor('#abc')).toBe('#abc');
    expect(safeColor('red;background:url(x)')).toBe('var(--muted)');
    expect(safeColor('#12345')).toBe('var(--muted)');
    expect(safeColor(undefined, '#000')).toBe('#000');
  });

  it('formats minutes, stoppage time and period markers', () => {
    expect(formatMinute(event({ minute: 23 }))).toBe("23'");
    expect(formatMinute(event({ minute: 45, added: 2 }))).toBe("45+2'");
    expect(formatMinute(event({ type: 'halfTime', minute: 45, added: 3 }))).toBe('HT');
    expect(formatMinute(event({ type: 'shootoutKick', minute: 121 }))).toBe('Pens');
    expect(thousands(31234.6)).toBe('31,235');
  });
});

describe('seeds', () => {
  it('turns digits into a number and keeps words as text', () => {
    expect(parseSeed(' 1234 ')).toBe(1234);
    expect(parseSeed('lucky dip')).toBe('lucky dip');
  });

  it('rolls four-digit seeds that differ from one roll to the next', () => {
    const rolls = Array.from({ length: 20 }, randomSeed);
    for (const r of rolls) expect(r).toMatch(/^\d{4}$/);
    expect(new Set(rolls).size).toBeGreaterThan(1);
  });
});

describe('title screen', () => {
  it('shows the league, the seed and both buttons', () => {
    const html = renderTitle({ seed: '7<1', error: null });
    expect(html).toContain(esc(WORLD.league.name));
    expect(html).toContain('value="7&lt;1"');
    expect(html).toContain('Start season');
    expect(html).toContain('data-action="lucky"');
  });
});

describe('status and progress', () => {
  it('counts weeks, flags the break and the playoffs, and ends complete', () => {
    const s = createSeason(createLeague(99));
    const total = s.schedule.weeks;
    expect(statusLabel(s)).toBe(`Week 1 of ${total}`);
    expect(seasonProgress(s)).toBe(0);
    const labels: string[] = [];
    let last = 0;
    while (s.phase !== 'complete') {
      advanceWeek(s, HOOKS);
      labels.push(statusLabel(s));
      const p = seasonProgress(s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(labels).toContain(`Week ${breakWeek} of ${total} · Break`);
    expect(labels).toContain('Playoffs · Semi-finals');
    expect(labels).toContain('Playoffs · Final');
    expect(labels[labels.length - 1]).toBe('Season complete');
    expect(seasonProgress(s)).toBe(1);
  });
});

describe('table', () => {
  it('lists every club, marks the playoff places and the leader, and draws five form dots each', () => {
    const html = renderTable(full);
    const clubs = full.league.teams.length;
    expect(count(html, '<tr class=')).toBe(clubs);
    expect(count(html, 'class="playoff')).toBe(SEASON_TUNING.playoffs.teams);
    expect(count(html, 'playoff-line')).toBe(1);
    expect(html.match(LEADER_ROW)?.length).toBe(1);
    expect(count(html, 'class="dot')).toBe(clubs * SEASON_TUNING.formLength);
    const leader = full.league.teams.find((t) => t.id === full.standings[0].teamId)!;
    expect(html.indexOf(esc(leader.shortName))).toBeLessThan(html.indexOf('</tr>', html.indexOf('<tbody>')));
  });

  it('has no leader highlight before a ball is kicked', () => {
    expect(renderTable(createSeason(createLeague(5)))).not.toMatch(LEADER_ROW);
  });

  it('pads form to five dots, newest last', () => {
    const html = formDots(['W', 'L']);
    expect(count(html, 'class="dot"')).toBe(SEASON_TUNING.formLength - 2);
    expect(html.lastIndexOf('dot loss')).toBeGreaterThan(html.lastIndexOf('dot win'));
  });

  it('escapes club names from data', () => {
    const s = createSeason(createLeague(5));
    s.league.teams[0].shortName = '<img src=x onerror=alert(1)>';
    const html = renderTable(s);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('results', () => {
  it('skips break weeks and walks played weeks in order', () => {
    const weeks = playedWeeks(partial);
    expect(weeks).not.toContain(breakWeek);
    expect(weeks[weeks.length - 1]).toBe(breakWeek - 1);
    expect(neighbourWeek(partial, weeks[0], -1)).toBeNull();
    expect(neighbourWeek(partial, weeks[0], 1)).toBe(weeks[1]);
    expect(neighbourWeek(partial, weeks[weeks.length - 1], 1)).toBeNull();
  });

  it('follows the latest week unless one is picked, and ignores a picked week with no results', () => {
    expect(resultsWeekFor(viewOf(partial))).toBe(breakWeek - 1);
    expect(resultsWeekFor(viewOf(partial, { resultsWeek: 3 }))).toBe(3);
    expect(resultsWeekFor(viewOf(partial, { resultsWeek: breakWeek }))).toBe(breakWeek - 1);
    expect(resultsWeekFor(viewOf(createSeason(createLeague(1))))).toBeNull();
  });

  it('renders one tappable row per match with its score', () => {
    const week = 5;
    const matches = full.schedule.matches.filter((m) => m.week === week);
    const html = renderResults(full, week);
    expect(count(html, 'data-action="open-match"')).toBe(matches.length);
    for (const m of matches) expect(html).toContain(`${m.result!.homeScore}-${m.result!.awayScore}`);
  });

  it('notes extra time and shootouts on playoff results', () => {
    const final = full.bracket!.final!;
    const html = renderResults(full, final.week);
    if (final.result!.extraTime) expect(html).toContain('a.e.t.');
    if (final.result!.shootout) expect(html).toContain('pens ');
  });
});

describe('match feed', () => {
  it('credits exactly the final score in goals for every match of the season', () => {
    for (const m of full.schedule.matches) {
      const r = m.result!;
      const goals = goalsOf(r.events);
      expect(goals.filter((g) => g.side === 'home').length).toBe(r.homeScore);
      expect(goals.filter((g) => g.side === 'away').length).toBe(r.awayScore);
    }
  });

  it('shows every highlight, goal and card by default and everything with Show all', () => {
    for (const m of full.schedule.matches.slice(0, 40)) {
      const events = m.result!.events;
      const key = visibleEvents(events, false);
      expect(key.length).toBeLessThanOrEqual(events.length);
      expect(key.filter((e) => e.highlight).length).toBe(events.filter((e) => e.highlight).length);
      for (const e of events) {
        if (['goal', 'penaltyScored', 'yellowCard', 'redCard', 'secondYellow', 'fullTime'].includes(e.type)) expect(key).toContain(e);
      }
      expect(visibleEvents(events, true)).toEqual(events);
    }
  });

  it('renders the score, half-time, stats and styled goal rows', () => {
    const m = full.schedule.matches.find((x) => x.result && x.result.homeScore + x.result.awayScore >= 2)!;
    const r = m.result!;
    const short = renderMatchFeed(full.league, m, false);
    const long = renderMatchFeed(full.league, m, true);
    expect(short).toContain(`${r.homeScore}-${r.awayScore}`);
    expect(short).toContain(`HT ${r.halfTimeScore.home}-${r.halfTimeScore.away}`);
    for (const label of ['Possession', 'Shots', 'On target', 'xG', 'Corners']) expect(short).toContain(label);
    expect(count(short, 'ev-goal')).toBeGreaterThanOrEqual(r.homeScore + r.awayScore - count(short, 'ownGoal'));
    expect(count(long, '<li class="event')).toBe(r.events.length);
    expect(count(short, '<li class="event')).toBeLessThan(r.events.length);
    expect(short).toContain('data-action="close-match"');
  });

  it('shows extra time and the shootout when the final had them', () => {
    const final = full.bracket!.final!;
    const html = renderMatchFeed(full.league, final, false);
    if (final.result!.extraTime) expect(html).toContain('a.e.t.');
    if (final.result!.shootout) {
      expect(html).toContain(`pens ${final.result!.shootout.home}-${final.result!.shootout.away}`);
      expect(html).toContain('Pens');
    }
  });
});

describe('playoffs', () => {
  it('shows the race and the line before the playoffs', () => {
    const html = renderPlayoffs(partial);
    expect(html).toContain('Playoff race');
    expect(count(html, 'race-row')).toBeGreaterThan(SEASON_TUNING.playoffs.teams);
    expect(count(html, ' line')).toBe(1);
  });

  it('shows every played tie, the champion and the shield winner at the end', () => {
    const b = full.bracket!;
    const html = renderPlayoffs(full);
    const ties = b.quarterFinals.length + b.semiFinals.length + 1;
    expect(count(html, 'data-action="open-match"')).toBe(ties);
    expect(html).toContain(`${esc(WORLD.league.playoffTrophy)} champions`);
    const champ = full.league.teams.find((t) => t.id === full.championId)!;
    const shield = full.league.teams.find((t) => t.id === full.shieldWinnerId)!;
    expect(html.slice(html.indexOf('banner champion'))).toContain(esc(champ.shortName));
    expect(html.slice(html.indexOf('banner shield'))).toContain(esc(shield.shortName));
  });

  it('shows the byes waiting once the quarter-finals are set', () => {
    const s = createSeason(createLeague(4242));
    while (!s.bracket) advanceWeek(s, HOOKS);
    const html = renderPlayoffs(s);
    expect(count(html, 'Quarter-final winner')).toBe(SEASON_TUNING.playoffs.byes);
    expect(html).toContain('To play');
  });
});

describe('season screen', () => {
  it('adds the summary card only when the season is complete', () => {
    expect(renderSummary(partial)).toBe('');
    const html = renderSummary(full);
    expect(html).toContain('Top scorers');
    expect(count(html, '<li>')).toBe(3);
  });

  it('disables the sim buttons while running and once the season is over', () => {
    const running = renderSeason(viewOf(partial, { running: true }));
    expect(running).toMatch(/data-action="sim-week" disabled/);
    expect(running).toMatch(/data-action="new-season" disabled/);
    const done = renderSeason(viewOf(full));
    expect(done).toMatch(/data-action="sim-end" disabled/);
    expect(done).not.toMatch(/data-action="new-season" disabled/);
  });

  it('opens a match feed in place of the tab', () => {
    const m = full.schedule.matches[0];
    const html = renderSeason(viewOf(full, { openMatchId: m.id, tab: 'results' }));
    expect(html).toContain('match-feed');
    expect(html).not.toContain('class="standings"');
  });

  it('renders the same page for the same seed', () => {
    const again = runSeason(createSeason(createLeague(4242)), HOOKS);
    for (const tab of ['table', 'results', 'playoffs'] as const) {
      expect(renderSeason(viewOf(again, { tab }))).toBe(renderSeason(viewOf(full, { tab })));
    }
  });
});

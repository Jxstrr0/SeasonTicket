/** Home: the next match, things that need the owner, the last result and the latest mail. */
import {
  C,
  LADDER_NAMES,
  frontPage,
  paperName,
  money,
  playerPayroll,
  playerName,
  squadOf,
  userBooks,
  userFixture,
  userTeam,
  type Career,
} from '../../../sim/career';
import type { MatchReplay, ScheduledMatch } from '../../../sim/types';
import { clubLabel, kit, stageLabel, team } from '../../format';
import { each, esc } from '../../html';
import { findMatch } from '../../model';
import type { UiState } from '../../career/state';
import { renderMatchFeed } from '../matchFeed';
import { resultNotes } from '../results';
import { renderWaiting } from './story';

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

function tablePlace(career: Career, teamId: string): string {
  const i = career.season.standings.findIndex((r) => r.teamId === teamId);
  return i >= 0 && career.season.standings[i].played > 0 ? ordinal(i + 1) : '';
}

function renderNextMatch(career: Career): string {
  const league = career.season.league;
  if (career.phase === 'preseason') {
    const left = C.calendar.preseasonWeeks - career.preseasonWeek + 1;
    return `<section class="card">
      <div class="card-title">Pre-season</div>
      <p>${left} week${left === 1 ? '' : 's'} until round 1. The transfer window is open: build the squad, sort the sponsor and set ticket prices.</p>
    </section>`;
  }
  if (career.phase !== 'season') return '';
  const fixture = userFixture(career);
  if (!fixture) {
    const out = career.season.phase === 'playoffs' ? 'Your season is over. Watch the playoffs play out.' : 'No match for you this week.';
    return `<section class="card"><div class="card-title">This week</div><p>${esc(out)}</p></section>`;
  }
  const home = fixture.homeId === career.userTeamId;
  const opp = team(league, home ? fixture.awayId : fixture.homeId);
  const place = tablePlace(career, opp.id);
  const live = career.liveMatch?.setup.matchId === fixture.id;
  const stage = fixture.stage === 'league' ? `Round ${fixture.round}` : stageLabel(fixture.stage);
  return `<section class="card next-match">
    <div class="card-title">${esc(stage)} · ${home ? 'Home' : 'Away'}</div>
    <div class="next-opp">${kit(opp)}<strong>${esc(opp.name)}</strong>${place ? `<span class="muted small">${esc(place)} in the table</span>` : ''}</div>
    <div class="row-actions">
      <button type="button" data-action="match-day">${live ? 'Back to match' : 'Go to match day'}</button>
      <button type="button" class="btn-secondary" data-action="tab" data-tab="lineup">Lineup and tactics</button>
    </div>
  </section>`;
}

function alerts(career: Career): string[] {
  const out: string[] = [];
  const league = career.season.league;
  const books = userBooks(career);
  const starters = career.delegation.autoLineup ? [] : (career.userSelection?.lineup.starters ?? []);
  const unavailable = starters
    .map((id) => league.players[id])
    .filter((p) => p && p.teamId === career.userTeamId && (p.injuryWeeks > 0 || p.suspensionMatches > 0));
  if (unavailable.length) out.push(`Out of your eleven: ${unavailable.map((p) => playerName(p)).join(', ')}. The coach will fill in unless you change the lineup.`);
  if (books.cash < 0) out.push(`The club is overdrawn (${money(books.cash)}). The overdraft costs ${Math.round(C.lenders.overdraftRate * 100)}% a year and upsets the lenders.`);
  if (career.ladder.level > 0) {
    const deadline = career.ladder.deadlineWeek;
    const left = deadline === null ? null : Math.max(0, deadline - career.weekIndex);
    out.push(`Lenders: ${LADDER_NAMES[career.ladder.level]}.${left !== null ? ` ${left} week${left === 1 ? '' : 's'} to get back in good standing.` : ''}`);
  }
  const payroll = playerPayroll(career, career.userTeamId);
  if (payroll > C.wageCap.cap) out.push(`Wages are ${money(payroll - C.wageCap.cap)} over the cap. You pay luxury tax on the season average.`);
  const expiring = squadOf(career, career.userTeamId).filter((p) => p.contract.years <= 1 && !career.loansIn.some((l) => l.playerId === p.id));
  if (expiring.length) out.push(`${expiring.length} contract${expiring.length === 1 ? '' : 's'} end this season. Renew from the Squad tab.`);
  if (career.incomingBids.length) out.push(`${career.incomingBids.length} bid${career.incomingBids.length === 1 ? '' : 's'} for your players. See Market → Bids.`);
  return out;
}

function renderAlerts(career: Career): string {
  const list = alerts(career);
  if (!list.length) return '';
  return `<section class="card alerts">
    <div class="card-title">Needs you</div>
    <ul class="alert-list">${each(list, (a) => `<li>${esc(a)}</li>`)}</ul>
  </section>`;
}

/** The stored replay of a match, if it has one (the club's this season, others' latest round). */
export function replayOf(career: Career, matchId: string): MatchReplay | null {
  return career.replays.club[matchId] ?? career.replays.round[matchId] ?? null;
}

export function lastMatchFixture(career: Career): ScheduledMatch | null {
  const r = career.lastUserMatch;
  if (!r) return null;
  const found = findMatch(career.season, r.matchId);
  const base: ScheduledMatch = found ?? { id: r.matchId, week: 0, round: 0, homeId: r.homeId, awayId: r.awayId, stage: 'league' };
  return { ...base, result: r };
}

function renderLastMatch(career: Career, ui: UiState): string {
  const match = lastMatchFixture(career);
  if (!match || !match.result) return '';
  const league = career.season.league;
  const watch = !!replayOf(career, match.id);
  if (ui.reportOpen) return renderMatchFeed(league, match, ui.showAllEvents, watch);
  const r = match.result;
  const home = team(league, r.homeId);
  const away = team(league, r.awayId);
  const notes = resultNotes(r);
  const mine = r.homeId === career.userTeamId ? 'home' : 'away';
  const us = mine === 'home' ? r.homeScore : r.awayScore;
  const them = mine === 'home' ? r.awayScore : r.homeScore;
  const won = r.winnerId ? r.winnerId === career.userTeamId : us > them;
  const lost = r.winnerId ? r.winnerId !== career.userTeamId : us < them;
  const verdict = won ? 'Win' : lost ? 'Defeat' : 'Draw';
  return `<section class="card last-match">
    <div class="card-title">Last match · ${verdict}</div>
    <p class="last-score">${clubLabel(home)} <strong>${r.homeScore}-${r.awayScore}</strong> ${clubLabel(away)}</p>
    ${notes.length ? `<p class="muted small">${esc(notes.join(' · '))}</p>` : ''}
    <div class="button-row">
      <button type="button" class="btn-secondary" data-action="open-report">Match report</button>
      ${watch ? `<button type="button" class="btn-secondary" data-action="watch-2d" data-id="${esc(match.id)}">Watch in 2D</button>` : ''}
    </div>
  </section>`;
}

function renderLatestMail(career: Career): string {
  const latest = career.inbox.slice(0, 3);
  if (!latest.length) return '';
  return `<section class="card">
    <div class="card-title">Latest mail</div>
    <ul class="mail-mini">${each(latest, (m) => `<li class="${m.read ? '' : 'unread'}"><button type="button" class="link-btn" data-action="open-mail" data-id="${esc(m.id)}">${esc(m.title)}</button></li>`)}</ul>
  </section>`;
}

/** The latest front page, a tap from the paper. */
function renderHeadline(career: Career): string {
  const page = frontPage(career);
  if (!page) return '';
  const lead = page.items[0];
  return `<section class="card">
    <div class="card-title">${esc(paperName())} · ${esc(page.label)}</div>
    <p><strong>${esc(lead.headline)}</strong></p>
    <div class="row-actions"><button type="button" class="btn-secondary" data-action="tab" data-tab="news">Read the paper</button></div>
  </section>`;
}

function renderOwner(career: Career): string {
  const t = userTeam(career);
  const books = userBooks(career);
  return `<section class="card owner-card">
    <div class="card-title">Owner</div>
    <dl class="facts">
      <div><dt>Club cash</dt><dd>${esc(money(books.cash))}</dd></div>
      <div><dt>Your fortune</dt><dd>${esc(money(career.owner.fortune))}</dd></div>
      <div><dt>Put in so far</dt><dd>${esc(money(career.owner.injected))}</dd></div>
      <div><dt>Fan mood</dt><dd>${Math.round(t.fanMood * 100)}%</dd></div>
    </dl>
  </section>`;
}

export function renderHome(career: Career, ui: UiState): string {
  if (ui.reportOpen) return renderLastMatch(career, ui);
  return `<div class="home-grid">
    ${renderWaiting(career)}
    ${renderNextMatch(career)}
    ${renderAlerts(career)}
    ${renderLastMatch(career, ui)}
    ${renderHeadline(career)}
    ${renderLatestMail(career)}
    ${renderOwner(career)}
  </div>`;
}

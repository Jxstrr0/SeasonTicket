/** Playoffs tab: the race for the top six before, the bracket during and after. */
import { SEASON_TUNING, WORLD } from '../../sim/data';
import type { SeasonState } from '../../sim/season';
import type { League, PlayoffBracket, ScheduledMatch } from '../../sim/types';
import { clubCell, team } from '../format';
import { cls, each, esc } from '../html';
import { resultNotes } from './results';

/** Clubs shown under the line in the race view, so the chasers are visible. */
const CHASERS_SHOWN = 2;

function seedOf(bracket: PlayoffBracket, teamId: string): number {
  return bracket.seeds.indexOf(teamId) + 1;
}

function bracketSide(league: League, bracket: PlayoffBracket, teamId: string, goals: string, won: boolean): string {
  return `<span class="${cls('bk-side', won && 'won')}">
    <span class="seed">${seedOf(bracket, teamId)}</span>
    <span class="bk-club">${clubCell(team(league, teamId))}</span>
    <span class="bk-goals">${esc(goals)}</span>
  </span>`;
}

function placeholderSide(label: string): string {
  return `<span class="bk-side tbd"><span class="seed">-</span><span class="bk-club muted">${esc(label)}</span><span class="bk-goals"></span></span>`;
}

export function renderBracketMatch(league: League, bracket: PlayoffBracket, match: ScheduledMatch): string {
  const r = match.result;
  const homeGoals = r ? String(r.homeScore) : '';
  const awayGoals = r ? String(r.awayScore) : '';
  const notes = r ? resultNotes(r).join(' · ') : 'To play';
  const inner = `
    ${bracketSide(league, bracket, match.homeId, homeGoals, r?.winnerId === match.homeId)}
    ${bracketSide(league, bracket, match.awayId, awayGoals, r?.winnerId === match.awayId)}
    <span class="bk-note muted small">${esc(notes)}</span>`;
  if (!r) return `<div class="bk-match">${inner}</div>`;
  return `<button type="button" class="bk-match" data-action="open-match" data-match="${esc(match.id)}" aria-label="Open match feed">${inner}</button>`;
}

function pendingMatch(top: string, bottom: string): string {
  return `<div class="bk-match pending">${placeholderSide(top)}${placeholderSide(bottom)}<span class="bk-note muted small">Waiting</span></div>`;
}

function byeMatch(league: League, bracket: PlayoffBracket, teamId: string): string {
  return `<div class="bk-match pending">${bracketSide(league, bracket, teamId, '', false)}${placeholderSide('Quarter-final winner')}<span class="bk-note muted small">Waiting</span></div>`;
}

function semiColumn(league: League, bracket: PlayoffBracket): string {
  if (bracket.semiFinals.length > 0) return each(bracket.semiFinals, (m) => renderBracketMatch(league, bracket, m));
  const byes = bracket.seeds.slice(0, SEASON_TUNING.playoffs.byes);
  return each(byes, (id) => byeMatch(league, bracket, id));
}

function finalColumn(league: League, bracket: PlayoffBracket): string {
  return bracket.final ? renderBracketMatch(league, bracket, bracket.final) : pendingMatch('Semi-final winner', 'Semi-final winner');
}

function banners(season: SeasonState): string {
  const league = season.league;
  const parts: string[] = [];
  if (season.championId) {
    const champ = team(league, season.championId);
    parts.push(`<div class="banner champion"><span class="banner-label">${esc(WORLD.league.playoffTrophy)} champions</span><span class="banner-club">${clubCell(champ)}</span></div>`);
  }
  if (season.shieldWinnerId) {
    const shield = team(league, season.shieldWinnerId);
    parts.push(`<div class="banner shield"><span class="banner-label">${esc(WORLD.league.tableTrophy)}</span><span class="banner-club">${clubCell(shield)}</span></div>`);
  }
  return parts.length ? `<div class="banners">${parts.join('')}</div>` : '';
}

function renderBracket(season: SeasonState, bracket: PlayoffBracket): string {
  const league = season.league;
  return `
  <section class="card playoffs-card">
    ${banners(season)}
    <div class="bracket">
      <div class="bk-col"><h3 class="bk-head">Quarter-finals</h3>${each(bracket.quarterFinals, (m) => renderBracketMatch(league, bracket, m))}</div>
      <div class="bk-col"><h3 class="bk-head">Semi-finals</h3>${semiColumn(league, bracket)}</div>
      <div class="bk-col"><h3 class="bk-head">Final</h3>${finalColumn(league, bracket)}</div>
    </div>
    <p class="muted small">Numbers are seeds. The higher seed hosts. Level after 90 minutes: extra time, then penalties.</p>
  </section>`;
}

function renderRace(season: SeasonState): string {
  const spots = SEASON_TUNING.playoffs.teams;
  const byes = SEASON_TUNING.playoffs.byes;
  const rows = season.standings.slice(0, spots + CHASERS_SHOWN);
  return `
  <section class="card playoffs-card">
    <h2 class="card-title">Playoff race</h2>
    <p class="muted small">The top ${spots} after the last round qualify. ${byes === 1 ? 'Seed 1 goes' : byes === 2 ? 'Seeds 1 and 2 go' : `Seeds 1 to ${byes} go`} straight to the semi-finals.</p>
    <ol class="race">
      ${each(rows, (row, i) => {
        const pos = i + 1;
        return `<li class="${cls('race-row', pos <= spots && 'in', pos === spots && 'line', pos <= byes && 'bye')}">
          <span class="seed">${pos}</span>
          <span class="race-club">${clubCell(team(season.league, row.teamId))}</span>
          <span class="race-pts">${row.points} pts</span>
        </li>`;
      })}
    </ol>
  </section>`;
}

export function renderPlayoffs(season: SeasonState): string {
  return season.bracket ? renderBracket(season, season.bracket) : renderRace(season);
}

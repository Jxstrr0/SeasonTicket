/**
 * Display formatting shared by the views: club labels, minutes, stages and
 * numbers. Pure functions; nothing here touches the DOM or changes sim state.
 */
import { teamById } from '../sim/league';
import type { League, MatchEvent, ScheduledMatch, Team, Weather } from '../sim/types';
import { esc, safeColor } from './html';

/** A thin two-tone stripe in the club's colours. */
export function kit(team: Team): string {
  const c1 = safeColor(team.colors.primary);
  const c2 = safeColor(team.colors.secondary);
  return `<span class="kit" style="--c1:${c1};--c2:${c2}" aria-hidden="true"></span>`;
}

/** Abbreviation on narrow screens, short name on wider ones (CSS picks). */
export function clubLabel(team: Team): string {
  return `<span class="club-abbr">${esc(team.abbr)}</span><span class="club-short">${esc(team.shortName)}</span>`;
}

export function clubCell(team: Team): string {
  return `${kit(team)}${clubLabel(team)}`;
}

export function team(league: League, id: string): Team {
  return teamById(league, id);
}

export function playerName(league: League, id: string | null): string {
  if (!id) return '';
  const p = league.players[id];
  return p ? `${p.firstName} ${p.lastName}` : '';
}

export function playerSurname(league: League, id: string | null): string {
  if (!id) return '';
  return league.players[id]?.lastName ?? '';
}

const PERIOD_LABELS: Partial<Record<MatchEvent['type'], string>> = {
  kickoff: 'KO',
  halfTime: 'HT',
  fullTime: 'FT',
  extraTimeStart: 'ET',
  extraTimeHalf: 'ET HT',
  extraTimeEnd: 'AET',
  shootoutStart: 'Pens',
  shootoutKick: 'Pens',
  shootoutEnd: 'Pens',
};

/** "23'", "45+2'", or a period label such as "HT" or "Pens". */
export function formatMinute(event: MatchEvent): string {
  const label = PERIOD_LABELS[event.type];
  if (label) return label;
  return event.added > 0 ? `${event.minute}+${event.added}'` : `${event.minute}'`;
}

const STAGE_LABELS: Record<ScheduledMatch['stage'], string> = {
  league: 'League',
  quarterFinal: 'Quarter-final',
  semiFinal: 'Semi-final',
  final: 'Final',
};

const STAGE_PLURALS: Record<ScheduledMatch['stage'], string> = {
  league: 'League',
  quarterFinal: 'Quarter-finals',
  semiFinal: 'Semi-finals',
  final: 'Final',
};

export function stageLabel(stage: ScheduledMatch['stage']): string {
  return STAGE_LABELS[stage];
}

export function stagePlural(stage: ScheduledMatch['stage']): string {
  return STAGE_PLURALS[stage];
}

const WEATHER_LABELS: Record<Weather, string> = {
  clear: 'Clear',
  rain: 'Rain',
  wind: 'Windy',
  heat: 'Hot',
  snow: 'Snow',
};

export function weatherLabel(weather: Weather): string {
  return WEATHER_LABELS[weather] ?? weather;
}

export function weatherPill(weather: Weather): string {
  return `<span class="pill weather-${esc(weather)}">${esc(weatherLabel(weather))}</span>`;
}

export function percent(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function thousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

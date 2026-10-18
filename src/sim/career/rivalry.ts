/**
 * Rivalries, derbies and AI owners (Stage 6.4, docs/STAGE_6_EVENTS.md). A derby is a game
 * between two clubs from the same region. Your rivalry with each club ("heat", 0-1) grows
 * from history: derbies, big results, playoff knockouts and what you say in the press, and
 * it cools a little every week. Derbies and rivalry games draw bigger crowds and swing fan
 * mood harder. Every other club has an owner with a name, a temperament and a memory of how
 * you have treated them, which moves the prices they ask and offer.
 */
import { RIVALRY_NEWS, RIVALRY_TUNING } from '../data';
import { defaultNames, homeNationId } from '../names';
import type { ScheduledMatch } from '../types';
import { reportStory } from './news';
import type { Career, RivalOwner, Temperament } from './types';
import { careerRng, clamp, userTeam } from './util';
import { Rng, hashString } from '../rng';

const R = RIVALRY_TUNING;
const O = R.owners;
const TEMPERS = O.temperaments as Record<Temperament, { weight: number; label: string; sellFactor: number; bidFactor: number }>;
export const TEMPERAMENTS = Object.keys(TEMPERS) as Temperament[];

export type RivalLevel = 'derby' | 'rival';

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function regionOf(career: Career, teamId: string): string | undefined {
  return career.season.league.teams.find((t) => t.id === teamId)?.region;
}

/** Two clubs from the same region. */
export function isDerby(career: Career, aId: string, bId: string): boolean {
  if (aId === bId) return false;
  const a = regionOf(career, aId);
  return a !== undefined && a === regionOf(career, bId);
}

/** Your rivalry with a club, 0-1: what history added, plus a base for a derby. */
export function rivalryHeat(career: Career, teamId: string): number {
  if (teamId === career.userTeamId) return 0;
  const earned = career.story.heat[teamId] ?? 0;
  return round3(clamp(earned + (isDerby(career, career.userTeamId, teamId) ? R.derbyBase : 0), 0, R.heat.max));
}

/** Whether a club is your derby rival, a rival by history, or neither. */
export function rivalLevel(career: Career, teamId: string): RivalLevel | null {
  if (teamId === career.userTeamId) return null;
  if (isDerby(career, career.userTeamId, teamId)) return 'derby';
  return (career.story.heat[teamId] ?? 0) >= R.rivalHeat ? 'rival' : null;
}

/** The badge a fixture wears: every same-region game is a derby; a rivalry only counts for your games. */
export function fixtureBadge(career: Career, match: Pick<ScheduledMatch, 'homeId' | 'awayId'>): RivalLevel | null {
  if (isDerby(career, match.homeId, match.awayId)) return 'derby';
  const me = career.userTeamId;
  if (match.homeId === me) return rivalLevel(career, match.awayId);
  if (match.awayId === me) return rivalLevel(career, match.homeId);
  return null;
}

/** Your clubs of note, hottest first: every derby rival and any club past the rivalry line. */
export function rivalsOf(career: Career): { teamId: string; level: RivalLevel; heat: number }[] {
  const out: { teamId: string; level: RivalLevel; heat: number }[] = [];
  for (const t of career.season.league.teams) {
    const level = rivalLevel(career, t.id);
    if (level) out.push({ teamId: t.id, level, heat: rivalryHeat(career, t.id) });
  }
  return out.sort((a, b) => b.heat - a.heat || (a.teamId < b.teamId ? -1 : 1));
}

export function addHeat(career: Career, teamId: string | null | undefined, delta: number): void {
  if (!teamId || teamId === career.userTeamId) return;
  const heat = career.story.heat;
  const next = round3(clamp((heat[teamId] ?? 0) + delta, 0, R.heat.max));
  if (next <= 0) delete heat[teamId];
  else heat[teamId] = next;
}

// ---------------------------------------------------------------------------
// Match day
// ---------------------------------------------------------------------------

/** Share of capacity added for a derby, or for your game against a rival. */
export function crowdBoost(career: Career, homeId: string, awayId: string): number {
  const badge = fixtureBadge(career, { homeId, awayId });
  return badge === 'derby' ? R.derby.crowdBoost : badge === 'rival' ? R.derby.rivalCrowdBoost : 0;
}

/** How much harder a win or loss moves fan mood. */
export function fanSwing(career: Career, homeId: string, awayId: string): number {
  return fixtureBadge(career, { homeId, awayId }) ? R.derby.fanSwing : 1;
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Gives every other club an owner it does not have yet. Seeded by the career and the club, so it is the same however it is reached. */
export function ensureOwners(career: Career): void {
  career.owners ??= {};
  const nation = homeNationId();
  for (const t of career.season.league.teams) {
    if (t.id === career.userTeamId || career.owners[t.id]) continue;
    const rng = new Rng(hashString(`${career.seed}:owner:${t.id}`));
    const temperament = rng.weighted(TEMPERAMENTS, (k) => TEMPERS[k].weight);
    career.owners[t.id] = { name: `${defaultNames.firstName(rng, nation)} ${defaultNames.lastName(rng, nation)}`, temperament, memory: 0 };
  }
}

export function ownerOf(career: Career, teamId: string | null | undefined): RivalOwner | null {
  return (teamId && career.owners?.[teamId]) || null;
}

export function temperamentLabel(t: Temperament): string {
  return TEMPERS[t].label;
}

export function ownerMemory(career: Career, teamId: string | null | undefined, delta: number): void {
  const o = ownerOf(career, teamId);
  if (o) o.memory = round3(clamp(o.memory + delta, -1, 1));
}

export const OWNER_MEMORY = O.memory;

/** What a club's owner adds to the price of a player they sell you. */
export function sellFactor(career: Career, sellerId: string): number {
  const o = ownerOf(career, sellerId);
  if (!o) return 1;
  return TEMPERS[o.temperament].sellFactor * (1 - o.memory * O.priceEffect) * (1 + rivalryHeat(career, sellerId) * O.rivalPremium);
}

/** What a club's owner adds to a bid for one of your players. */
export function bidFactor(career: Career, buyerId: string): number {
  const o = ownerOf(career, buyerId);
  if (!o) return 1;
  return TEMPERS[o.temperament].bidFactor * (1 + o.memory * O.priceEffect);
}

// ---------------------------------------------------------------------------
// The weekly step
// ---------------------------------------------------------------------------

/** After the week's matches: this week's game adds to the rivalry, the rival owner has a say, and old feelings cool. */
export function weeklyRivalry(career: Career): void {
  if (career.phase !== 'season') return;
  const state = career.season;
  const me = career.userTeamId;
  const match = state.schedule.matches.find((m) => m.result && m.week === state.week - 1 && (m.homeId === me || m.awayId === me));
  // Cool first, so this week's heat lands in full.
  const heat = career.story.heat;
  // Both fade by a share each week, so old grudges linger but never stay at full strength.
  for (const id of Object.keys(heat)) {
    const v = heat[id] * (1 - R.heat.drift);
    if (v < 0.005) delete heat[id];
    else heat[id] = round3(v);
  }
  for (const o of Object.values(career.owners)) {
    if (o.memory !== 0) o.memory = Math.abs(o.memory) < 0.005 ? 0 : round3(o.memory * (1 - O.memory.drift));
  }
  if (!match?.result) return;
  const r = match.result;
  const home = match.homeId === me;
  const oppId = home ? match.awayId : match.homeId;
  const us = home ? r.homeScore : r.awayScore;
  const them = home ? r.awayScore : r.homeScore;
  const won = r.winnerId ? r.winnerId === me : us > them;
  const lost = r.winnerId ? r.winnerId !== me : us < them;
  const derby = isDerby(career, me, oppId);
  const before = rivalLevel(career, oppId);
  let add = 0;
  if (derby) add += R.heat.derbyPlayed;
  if (Math.abs(us - them) >= R.heat.bigMargin) add += R.heat.bigResult;
  if (match.stage === 'final') add += R.heat.final;
  else if (match.stage !== 'league' && (won || lost)) add += R.heat.knockout;
  addHeat(career, oppId, add);
  if (won) ownerMemory(career, oppId, match.stage !== 'league' ? O.memory.knockedOut : O.memory.beaten);

  if (!before || !(won || lost)) return;
  const owner = ownerOf(career, oppId);
  if (!owner) return;
  const rng = careerRng(career, 'rivalry-news');
  if (!rng.chance(R.news.chance)) return;
  const lines = (lost ? RIVALRY_NEWS.won : RIVALRY_NEWS.lost) as Record<Temperament, string[]>;
  const oppTeam = state.league.teams.find((t) => t.id === oppId);
  const vars: Record<string, string> = {
    owner: owner.name,
    them: oppTeam?.shortName ?? 'them',
    us: userTeam(career).shortName,
    score: `${them}-${us}`,
  };
  const text = rng.pick(lines[owner.temperament]).replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
  reportStory(career, text, R.news.weight);
}

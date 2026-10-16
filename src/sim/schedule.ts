/**
 * League fixture list: a double round-robin built with the circle method.
 * The second half replays the first half's pairings with venues reversed,
 * in its own shuffled order. A small seeded search then flips venues and
 * swaps round order until no club has a long run of home or away games.
 */
import { SEASON_TUNING } from './data';
import type { Rng } from './rng';
import type { Schedule, ScheduledMatch } from './types';

const CAL = SEASON_TUNING.calendar;
const SEARCH = SEASON_TUNING.scheduleSearch;

type Pair = [string, string];

/** Venue plan for both halves. Half two uses the same pairings with home and away swapped. */
interface Plan {
  /** Pairings of each first-half round (unordered until `flips` is applied). */
  rounds: Pair[][];
  /** flips[r][m] true means the second team of the pair hosts in half one. */
  flips: boolean[][];
  /** Calendar order of rounds in each half (indices into `rounds`). */
  firstOrder: number[];
  secondOrder: number[];
}

export function buildSchedule(rng: Rng, season: number, teamIds: string[]): Schedule {
  validateTeams(teamIds);
  const plan = findBalancedPlan(rng, teamIds);
  const matches = planToMatches(plan, season);
  return { season, weeks: totalWeeks(), breakWeeks: CAL.breakWeeks.slice(), matches };
}

/** League round to calendar week: the break sits between the two halves. */
export function weekOfRound(round: number): number {
  return round <= CAL.roundsPerHalf ? round : round + CAL.breakWeeks.length;
}

export function lastLeagueWeek(): number {
  return weekOfRound(CAL.roundsPerHalf * 2);
}

export function totalWeeks(): number {
  const w = CAL.playoffWeeks;
  return Math.max(lastLeagueWeek(), w.quarterFinal, w.semiFinal, w.final);
}

export function matchId(season: number, tag: string, homeId: string, awayId: string): string {
  return `s${season}-${tag}-${homeId}-v-${awayId}`;
}

function validateTeams(teamIds: string[]): void {
  if (teamIds.length % 2 !== 0) throw new Error(`buildSchedule needs an even number of teams, got ${teamIds.length}`);
  if (teamIds.length - 1 !== CAL.roundsPerHalf) {
    throw new Error(`buildSchedule: ${teamIds.length} teams cannot fill ${CAL.roundsPerHalf} rounds per half`);
  }
  if (new Set(teamIds).size !== teamIds.length) throw new Error('buildSchedule: duplicate team ids');
}

// ---------------------------------------------------------------------------
// Circle method
// ---------------------------------------------------------------------------

/** One full round-robin: the first team stays put while the rest rotate one place per round. */
export function circleRounds(teamIds: readonly string[]): Pair[][] {
  const n = teamIds.length;
  const ring = teamIds.slice(1);
  const rounds: Pair[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const lineup = [teamIds[0], ...ring];
    const pairs: Pair[] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([lineup[i], lineup[n - 1 - i]]);
    rounds.push(pairs);
    ring.unshift(ring.pop() as string);
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Venue balancing search
// ---------------------------------------------------------------------------

function findBalancedPlan(rng: Rng, teamIds: string[]): Plan {
  for (let attempt = 0; attempt <= SEARCH.restarts; attempt++) {
    const plan = randomPlan(rng, teamIds);
    if (improvePlan(rng, plan, teamIds)) return plan;
  }
  throw new Error(`buildSchedule: no fixture list with venue streaks of at most ${SEARCH.maxVenueStreak} found`);
}

function randomPlan(rng: Rng, teamIds: string[]): Plan {
  const rounds = circleRounds(rng.shuffle(teamIds));
  const flips = rounds.map((pairs) => pairs.map(() => rng.chance(0.5)));
  const indices = rounds.map((_, i) => i);
  return { rounds, flips, firstOrder: rng.shuffle(indices), secondOrder: rng.shuffle(indices) };
}

/** Hill-climbs on the streak penalty with sideways moves allowed. True once the penalty reaches zero. */
function improvePlan(rng: Rng, plan: Plan, teamIds: string[]): boolean {
  let cost = streakPenalty(plan, teamIds);
  for (let i = 0; i < SEARCH.maxIterations && cost > 0; i++) {
    const undo = rng.chance(SEARCH.roundSwapShare) ? swapRounds(rng, plan) : flipMatch(rng, plan);
    const next = streakPenalty(plan, teamIds);
    if (next <= cost) cost = next;
    else undo();
  }
  return cost === 0;
}

function flipMatch(rng: Rng, plan: Plan): () => void {
  const r = rng.int(0, plan.rounds.length - 1);
  const m = rng.int(0, plan.rounds[r].length - 1);
  plan.flips[r][m] = !plan.flips[r][m];
  return () => {
    plan.flips[r][m] = !plan.flips[r][m];
  };
}

function swapRounds(rng: Rng, plan: Plan): () => void {
  const order = rng.chance(0.5) ? plan.firstOrder : plan.secondOrder;
  const a = rng.int(0, order.length - 1);
  const b = rng.int(0, order.length - 1);
  [order[a], order[b]] = [order[b], order[a]];
  return () => {
    [order[a], order[b]] = [order[b], order[a]];
  };
}

/** Home team of a pairing in half one. */
function firstHalfHome(plan: Plan, round: number, match: number): string {
  const [a, b] = plan.rounds[round][match];
  return plan.flips[round][match] ? b : a;
}

/** Each club's home (true) / away (false) sequence across all league rounds in calendar order. */
function venuePatterns(plan: Plan, teamIds: string[]): Map<string, boolean[]> {
  const patterns = new Map<string, boolean[]>(teamIds.map((id) => [id, []]));
  const push = (order: number[], reversed: boolean) => {
    for (const r of order) {
      plan.rounds[r].forEach((pair, m) => {
        const home = firstHalfHome(plan, r, m);
        for (const team of pair) (patterns.get(team) as boolean[]).push((team === home) !== reversed);
      });
    }
  };
  push(plan.firstOrder, false);
  push(plan.secondOrder, true);
  return patterns;
}

/** Sum over every club of how far each venue run exceeds the allowed streak. */
function streakPenalty(plan: Plan, teamIds: string[]): number {
  let penalty = 0;
  for (const pattern of venuePatterns(plan, teamIds).values()) {
    for (const run of runLengths(pattern)) penalty += Math.max(0, run - SEARCH.maxVenueStreak);
  }
  return penalty;
}

export function runLengths(pattern: readonly boolean[]): number[] {
  const runs: number[] = [];
  let length = 0;
  pattern.forEach((value, i) => {
    length = i > 0 && value === pattern[i - 1] ? length + 1 : 1;
    if (i === pattern.length - 1 || pattern[i + 1] !== value) runs.push(length);
  });
  return runs;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function planToMatches(plan: Plan, season: number): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];
  const emit = (order: number[], roundOffset: number, reversed: boolean) => {
    order.forEach((r, position) => {
      const round = roundOffset + position + 1;
      plan.rounds[r].forEach((pair, m) => {
        const home = firstHalfHome(plan, r, m);
        const away = pair[0] === home ? pair[1] : pair[0];
        const [homeId, awayId] = reversed ? [away, home] : [home, away];
        matches.push({
          id: matchId(season, `r${String(round).padStart(2, '0')}`, homeId, awayId),
          week: weekOfRound(round),
          round,
          homeId,
          awayId,
          stage: 'league',
        });
      });
    });
  };
  emit(plan.firstOrder, 0, false);
  emit(plan.secondOrder, CAL.roundsPerHalf, true);
  return matches;
}

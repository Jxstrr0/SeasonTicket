/**
 * Public match engine API. A match is plain state advanced one minute at a
 * time, so the headless season and the live match screen share this code.
 */
import { MATCH_TUNING, formation as formationOf } from '../data';
import { Rng } from '../rng';
import type { MatchAction, MatchEvent, MatchResult, MatchSetup, Player, PlayerMatchStats, Side, TeamSelection } from '../types';
import { inMatchDecisions } from '../coach';
import { changeMentality, changeTactics, startEnergy, substitute } from './actions';
import { advanceClock, closePeriod, drawStoppage, periodOver, regulationJustEnded } from './clock';
import { emitEvent } from './events';
import { assignRatings } from './ratings';
import { runShootout } from './shootout';
import { emptyChanceCounts, emptyTeamStats, ensurePlayerStats, type MatchContext, type MatchState, type SideState } from './state';
import { playMinute } from './tick';

const T = MATCH_TUNING;
const SIDES: readonly Side[] = ['home', 'away'];

/** Validates both line-ups, builds the state and emits the kickoff event. */
export function createMatch(setup: MatchSetup, ctx: MatchContext): MatchState {
  for (const side of SIDES) validateSelection(setup, side, ctx);
  const rng = new Rng(setup.seed);
  const state: MatchState = {
    setup,
    rngState: rng.getState(),
    minute: 0,
    added: 0,
    addedTotal: 0,
    addedPlanned: 0,
    period: 'firstHalf',
    homeScore: 0,
    awayScore: 0,
    halfTimeScore: { home: 0, away: 0 },
    possession: 'home',
    events: [],
    home: createSide(setup.homeId, setup.home, setup.aiControlled.home, ctx),
    away: createSide(setup.awayId, setup.away, setup.aiControlled.away, ctx),
    injuries: [],
    shootout: null,
    finished: false,
  };
  emitEvent(state, ctx, rng, { type: 'kickoff', side: 'home', params: { secondary: ctx.teams[setup.homeId].stadiumName } });
  state.rngState = rng.getState();
  return state;
}

/**
 * Plays the next minute (a stoppage minute, an extra-time minute or the whole
 * shootout count as one step). AI-managed sides decide first. Returns the
 * events this step produced; they are also appended to state.events.
 */
export function stepMinute(state: MatchState, ctx: MatchContext): MatchEvent[] {
  if (state.finished) return [];
  const start = state.events.length;
  if (state.period === 'shootout') {
    withRng(state, (rng) => runShootout(state, ctx, rng));
    return state.events.slice(start);
  }
  advanceClock(state);
  for (const side of SIDES) {
    if (!sideOf(state, side).aiControlled) continue;
    for (const action of inMatchDecisions(state, ctx, side)) applyAction(state, ctx, action);
  }
  withRng(state, (rng) => {
    playMinute(state, ctx, rng);
    if (regulationJustEnded(state)) state.addedPlanned = drawStoppage(state, rng);
    if (periodOver(state)) closePeriod(state, ctx, rng);
  });
  return state.events.slice(start);
}

/** Applies a manager action, throwing on anything the rules do not allow. */
export function applyAction(state: MatchState, ctx: MatchContext, action: MatchAction): MatchEvent[] {
  const start = state.events.length;
  withRng(state, (rng) => {
    switch (action.type) {
      case 'substitute':
        substitute(state, ctx, rng, action.side, action.outId, action.inId);
        break;
      case 'setTactics':
        changeTactics(state, ctx, rng, action.side, action.tactics);
        break;
      case 'setMentality':
        changeMentality(state, ctx, rng, action.side, action.mentality);
        break;
    }
  });
  return state.events.slice(start);
}

export function isFinished(state: MatchState): boolean {
  return state.finished;
}

/** Turns the (normally finished) state into the result the season records. */
export function finalizeMatch(state: MatchState, ctx: MatchContext): MatchResult {
  const winner = decideWinner(state);
  assignRatings(state, ctx, winner);
  const playerStats: Record<string, PlayerMatchStats> = {};
  for (const side of SIDES) {
    for (const stats of Object.values(sideOf(state, side).playerStats)) {
      playerStats[stats.playerId] = { ...stats, passes: Math.round(stats.passes) };
    }
  }
  return {
    matchId: state.setup.matchId,
    seed: state.setup.seed,
    homeId: state.setup.homeId,
    awayId: state.setup.awayId,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    halfTimeScore: { ...state.halfTimeScore },
    extraTime: state.events.some((e) => e.type === 'extraTimeStart'),
    shootout: state.shootout ? { home: state.shootout.home, away: state.shootout.away } : null,
    winnerId: winner === null ? null : sideOf(state, winner).teamId,
    stats: { home: finalTeamStats(state.home), away: finalTeamStats(state.away) },
    playerStats,
    events: state.events.slice(),
    injuries: state.injuries.map((i) => ({ ...i })),
    sentOff: [...state.home.sentOff, ...state.away.sentOff],
    booked: [...bookedOnce(state.home), ...bookedOnce(state.away)],
    attendanceShare: state.setup.attendanceShare,
    weather: state.setup.weather,
  };
}

export function simulateMatch(setup: MatchSetup, ctx: MatchContext): MatchResult {
  const state = createMatch(setup, ctx);
  const maxSteps = maxStepsPerMatch();
  let steps = 0;
  while (!isFinished(state)) {
    stepMinute(state, ctx);
    steps += 1;
    if (steps > maxSteps) throw new Error(`Match ${setup.matchId} did not finish after ${maxSteps} steps`);
  }
  return finalizeMatch(state, ctx);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withRng(state: MatchState, work: (rng: Rng) => void): void {
  const rng = Rng.fromState(state.rngState);
  work(rng);
  state.rngState = rng.getState();
}

function sideOf(state: MatchState, side: Side): SideState {
  return side === 'home' ? state.home : state.away;
}

function createSide(teamId: string, selection: TeamSelection, aiControlled: boolean, ctx: MatchContext): SideState {
  const side: SideState = {
    teamId,
    onPitch: selection.lineup.starters.slice(),
    bench: selection.lineup.bench.slice(),
    tactics: { ...selection.tactics, setPieceTakers: { ...selection.tactics.setPieceTakers } },
    subsUsed: 0,
    fatigue: {},
    yellows: {},
    sentOff: [],
    stats: emptyTeamStats(),
    chances: emptyChanceCounts(),
    playerStats: {},
    aiControlled,
  };
  for (const id of side.onPitch) {
    side.fatigue[id] = startEnergy(ctx.players[id]);
    ensurePlayerStats(side, id);
  }
  return side;
}

function validateSelection(setup: MatchSetup, side: Side, ctx: MatchContext): void {
  const teamId = side === 'home' ? setup.homeId : setup.awayId;
  const selection = side === 'home' ? setup.home : setup.away;
  if (!ctx.teams[teamId]) throw new Error(`Unknown team ${teamId}`);
  const { starters, bench } = selection.lineup;
  if (starters.length !== T.squad.starters) throw new Error(`${teamId}: expected ${T.squad.starters} starters, got ${starters.length}`);
  if (bench.length > T.squad.maxBench) throw new Error(`${teamId}: bench of ${bench.length} exceeds ${T.squad.maxBench}`);
  const seen = new Set<string>();
  for (const id of [...starters, ...bench]) {
    if (!ctx.players[id]) throw new Error(`${teamId}: unknown player ${id}`);
    if (seen.has(id)) throw new Error(`${teamId}: ${id} listed twice`);
    seen.add(id);
  }
  formationOf(selection.tactics.formationId);
}

function decideWinner(state: MatchState): Side | null {
  if (state.homeScore > state.awayScore) return 'home';
  if (state.awayScore > state.homeScore) return 'away';
  if (state.shootout && state.shootout.home !== state.shootout.away) return state.shootout.home > state.shootout.away ? 'home' : 'away';
  return null;
}

function finalTeamStats(side: SideState) {
  return { ...side.stats, passes: Math.round(side.stats.passes) };
}

function bookedOnce(side: SideState): string[] {
  return Object.entries(side.yellows)
    .filter(([, count]) => count === 1)
    .map(([id]) => id);
}

function maxStepsPerMatch(): number {
  const C = T.clock;
  const regulation = C.halfMinutes * 2 + C.stoppage.regulation.max * 2;
  const extra = C.extraHalfMinutes * 2 + C.stoppage.extraTime.max * 2;
  // Regulation, extra time, the shootout step and a little slack.
  return (regulation + extra) * 2 + 1;
}

export type { Player };

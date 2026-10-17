/**
 * The Stage 1 statistical match engine, kept only as a fast stand-in for tests of the
 * owner loop (finances, contracts, the stadium) and of the shared match state model.
 * One outcome is rolled per minute, with no player positions; the game plays every
 * match on the spatial engine (src/sim/spatial). Its tuning still reads the Stage 1
 * sections of src/data/tuning/match.json.
 */
import { inMatchDecisions } from '../../../src/sim/coach';
import { MATCH_TUNING } from '../../../src/sim/data';
import { applyAction, createMatch, finalizeMatch, isFinished, withRng } from '../../../src/sim/match/engine';
import type { MatchContext, MatchState } from '../../../src/sim/match/state';
import type { MatchEvent, MatchResult, MatchSetup, Side } from '../../../src/sim/types';
import { advanceClock, closePeriod, drawStoppage, periodOver, regulationJustEnded } from './clock';
import { runShootout } from './shootout';
import { playMinute } from './tick';

const T = MATCH_TUNING;
const SIDES: readonly Side[] = ['home', 'away'];
const sideOf = (state: MatchState, side: Side) => (side === 'home' ? state.home : state.away);

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

function maxStepsPerMatch(): number {
  const C = T.clock;
  const regulation = C.halfMinutes * 2 + C.stoppage.regulation.max * 2;
  const extra = C.extraHalfMinutes * 2 + C.stoppage.extraTime.max * 2;
  // Regulation, extra time, the shootout step and a little slack.
  return (regulation + extra) * 2 + 1;
}

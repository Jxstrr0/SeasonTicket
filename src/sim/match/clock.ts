/**
 * The match clock: which minute comes next, how much stoppage time the
 * referee adds, and what happens when a period ends.
 */
import { MATCH_TUNING } from '../data';
import type { Rng } from '../rng';
import type { MatchEvent } from '../types';
import { emitEvent } from './events';
import type { MatchContext, MatchState, Period } from './state';

const T = MATCH_TUNING;

export interface PeriodBounds {
  /** First regulation minute of the period. */
  start: number;
  /** Last regulation minute of the period. */
  end: number;
}

export function periodBounds(period: Period): PeriodBounds | null {
  const half = T.clock.halfMinutes;
  const etHalf = T.clock.extraHalfMinutes;
  switch (period) {
    case 'firstHalf':
      return { start: 1, end: half };
    case 'secondHalf':
      return { start: half + 1, end: half * 2 };
    case 'etFirstHalf':
      return { start: half * 2 + 1, end: half * 2 + etHalf };
    case 'etSecondHalf':
      return { start: half * 2 + etHalf + 1, end: half * 2 + etHalf * 2 };
    case 'shootout':
    case 'finished':
      return null;
  }
}

/** Moves the clock to the minute about to be played: regulation first, then stoppage. */
export function advanceClock(state: MatchState): void {
  const bounds = periodBounds(state.period);
  if (!bounds) return;
  if (state.minute < bounds.end) {
    state.minute += 1;
    state.added = 0;
    return;
  }
  state.added += 1;
  state.addedTotal += 1;
}

/** True right after the last regulation minute of the period has been played. */
export function regulationJustEnded(state: MatchState): boolean {
  const bounds = periodBounds(state.period);
  return bounds !== null && state.minute === bounds.end && state.added === 0 && state.addedPlanned === 0;
}

export function periodOver(state: MatchState): boolean {
  const bounds = periodBounds(state.period);
  return bounds !== null && state.minute === bounds.end && state.added >= state.addedPlanned;
}

/** Stoppage time for the period just completed, weighted by what happened in it. */
export function drawStoppage(state: MatchState, rng: Rng): number {
  const bounds = periodBounds(state.period);
  if (!bounds) return 0;
  const S = T.clock.stoppage;
  const range = state.period === 'firstHalf' || state.period === 'secondHalf' ? S.regulation : S.extraTime;
  let expected = range.base;
  for (const event of state.events) {
    if (event.minute < bounds.start || event.minute > bounds.end) continue;
    expected += stoppageWeight(event);
  }
  for (const side of [state.home, state.away]) {
    if (side.tactics.timeWasting >= S.timeWastingDialFrom) expected += S.perTimeWastingSide;
  }
  const drawn = Math.round(expected + rng.normal(0, range.sd));
  return Math.min(range.max, Math.max(range.min, drawn));
}

function stoppageWeight(event: MatchEvent): number {
  const S = T.clock.stoppage;
  switch (event.type) {
    case 'goal':
    case 'penaltyScored':
      return S.perGoal;
    case 'substitution':
      return S.perSubstitution;
    case 'yellowCard':
    case 'secondYellow':
    case 'redCard':
      return S.perCard;
    case 'injury':
      return S.perInjury;
    default:
      return 0;
  }
}

/** Emits the whistle event for the period that just ended and sets up the next one. */
export function closePeriod(state: MatchState, ctx: MatchContext, rng: Rng): void {
  const level = state.homeScore === state.awayScore;
  switch (state.period) {
    case 'firstHalf':
      state.halfTimeScore = { home: state.homeScore, away: state.awayScore };
      emitEvent(state, ctx, rng, { type: 'halfTime', side: null });
      startPeriod(state, 'secondHalf');
      return;
    case 'secondHalf':
      emitEvent(state, ctx, rng, { type: 'fullTime', side: null });
      if (state.setup.playoff && level) {
        emitEvent(state, ctx, rng, { type: 'extraTimeStart', side: null });
        startPeriod(state, 'etFirstHalf');
        return;
      }
      finish(state);
      return;
    case 'etFirstHalf':
      emitEvent(state, ctx, rng, { type: 'extraTimeHalf', side: null });
      startPeriod(state, 'etSecondHalf');
      return;
    case 'etSecondHalf':
      emitEvent(state, ctx, rng, { type: 'extraTimeEnd', side: null });
      if (level) {
        state.period = 'shootout';
        state.shootout = { home: 0, away: 0, kicks: 0 };
        return;
      }
      finish(state);
      return;
    case 'shootout':
    case 'finished':
      return;
  }
}

function startPeriod(state: MatchState, period: Period): void {
  state.period = period;
  state.added = 0;
  state.addedPlanned = 0;
}

export function finish(state: MatchState): void {
  state.period = 'finished';
  state.finished = true;
}

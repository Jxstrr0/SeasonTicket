/**
 * The user's live match: stepping it a minute at a time, the moments that
 * pause play for a decision, and the owner's changes (subs, tactics, handing
 * over to the head coach). Every change goes through the engine's
 * applyAction, so the same rules hold as in the headless season.
 */
import { MATCH_TUNING } from '../sim/data';
import { applyAction, stepMinute } from '../sim/match/engine';
import type { MatchState, SideState } from '../sim/match/state';
import { matchContext } from '../sim/season';
import type { Career } from '../sim/career';
import type { Dial, MatchEvent, Side, Tactics } from '../sim/types';

/** The minute of the second half when big-calls mode stops once for a substitution window. */
export const BIG_CALL_MINUTE = 65;

export interface ActionResult {
  ok: boolean;
  message: string;
}

export function userSide(career: Career, state: MatchState): Side {
  return state.setup.homeId === career.userTeamId ? 'home' : 'away';
}

export function userSideState(career: Career, state: MatchState): SideState {
  return userSide(career, state) === 'home' ? state.home : state.away;
}

/** Why play should stop after these events, or null to keep going. */
export function pauseReason(career: Career, state: MatchState, events: MatchEvent[]): string | null {
  const mode = career.delegation.matchMode;
  if (mode === 'coach' || state.finished) return null;
  const mine = userSide(career, state);
  const S = userSideState(career, state);
  for (const e of events) {
    if (e.type === 'injury' && e.side === mine && S.onPitch.includes(e.playerId ?? '')) return 'Injury: one of yours is down.';
    if ((e.type === 'redCard' || e.type === 'secondYellow') && e.side === mine) return 'Red card: you are down to ten.';
  }
  if (mode !== 'bigCalls') return null;
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'ownGoal' || e.type === 'penaltyScored') return e.side === mine ? 'Goal! Hold the lead or push on?' : 'Conceded. Time to react?';
    if ((e.type === 'redCard' || e.type === 'secondYellow') && e.side !== mine) return 'They are down to ten.';
    if (e.type === 'halfTime') return 'Half-time team talk.';
    if (e.type === 'extraTimeStart') return 'Extra time. Fresh legs?';
    if (e.type === 'shootoutStart') return 'Penalties.';
  }
  if (state.period === 'secondHalf' && state.minute === BIG_CALL_MINUTE && state.added === 0) return 'Big call: changes for the last 25 minutes?';
  return null;
}

/**
 * Plays one minute. Returns the new events and, in full or big-calls mode,
 * the reason to pause if something needs the owner.
 */
export function stepLive(career: Career): { events: MatchEvent[]; pause: string | null } {
  const state = career.liveMatch;
  if (!state || state.finished) return { events: [], pause: null };
  const events = stepMinute(state, matchContext(career.season.league));
  return { events, pause: pauseReason(career, state, events) };
}

/** Plays straight to the final whistle (the head coach decides for both sides). */
export function playToEnd(career: Career, maxSteps = 400): void {
  const state = career.liveMatch;
  if (!state) return;
  for (let i = 0; i < maxSteps && !state.finished; i++) stepMinute(state, matchContext(career.season.league));
}

function act(career: Career, run: (state: MatchState, side: Side) => void): ActionResult {
  const state = career.liveMatch;
  if (!state) return { ok: false, message: 'No match is on.' };
  try {
    run(state, userSide(career, state));
    return { ok: true, message: '' };
  } catch (err) {
    return { ok: false, message: friendly(err instanceof Error ? err.message : String(err)) };
  }
}

function friendly(message: string): string {
  if (/used all/.test(message)) return `You have used all ${MATCH_TUNING.squad.maxSubs} substitutions.`;
  if (/sent off/.test(message)) return 'A sent-off player cannot be replaced.';
  if (/not on the bench/.test(message)) return 'That player is not on the bench.';
  if (/not on the pitch/.test(message)) return 'That player is not on the pitch.';
  if (/shootout/.test(message)) return 'No changes during the shootout.';
  if (/finished/.test(message)) return 'The match is over.';
  return message;
}

export function liveSubstitute(career: Career, outId: string, inId: string): ActionResult {
  return act(career, (state, side) => applyAction(state, matchContext(career.season.league), { type: 'substitute', side, outId, inId }));
}

/**
 * Changes the user's tactics. The change also becomes the game plan the head
 * coach works from, so in big-calls mode he adjusts around the owner's call
 * instead of reverting it.
 */
export function liveTactics(career: Career, patch: Partial<Tactics>): ActionResult {
  return act(career, (state, side) => {
    const S = side === 'home' ? state.home : state.away;
    const tactics: Tactics = { ...S.tactics, ...patch, setPieceTakers: { ...S.tactics.setPieceTakers, ...(patch.setPieceTakers ?? {}) } };
    applyAction(state, matchContext(career.season.league), { type: 'setTactics', side, tactics });
    const plan = side === 'home' ? state.setup.home : state.setup.away;
    plan.tactics = { ...tactics, setPieceTakers: { ...tactics.setPieceTakers } };
  });
}

export function liveMentality(career: Career, mentality: Dial): ActionResult {
  return liveTactics(career, { mentality });
}

/** Hands the touchline to the head coach (or takes it back). */
export function setCoachInCharge(career: Career, coach: boolean): void {
  const state = career.liveMatch;
  if (!state) return;
  userSideState(career, state).aiControlled = coach || career.delegation.matchMode !== 'full';
}

export function coachInCharge(career: Career): boolean {
  const state = career.liveMatch;
  return !!state && userSideState(career, state).aiControlled;
}

/** Players hurt this match who are still on the pitch for the user. */
export function injuredOnPitch(career: Career): string[] {
  const state = career.liveMatch;
  if (!state) return [];
  const S = userSideState(career, state);
  return S.onPitch.filter((id) => id !== '' && state.injuries.some((i) => i.playerId === id));
}

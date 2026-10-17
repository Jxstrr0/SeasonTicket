/**
 * The user's live match on the spatial engine (Stage 4.5 step 7b, docs/DESIGN.md 17.9).
 *
 * The engine itself is never saved. `career.liveRecord` keeps what rebuilds it exactly:
 * the setup at kick-off, how many minutes have been played and every change the owner
 * made, at the minute it was made. `career.liveMatch` keeps the match as it stands, for
 * the screens and as the fallback: if the record can no longer replay (the engine or its
 * tuning changed, or the save comes from the Stage 1 engine), the match restarts in the
 * engine from that state (restart-resume) and a new record starts from there.
 *
 * The running engine is cached against the MatchState it keeps in step, so the screens
 * read career.liveMatch as before.
 */
import { SPATIAL_TUNING } from '../data';
import { finalizeMatch } from '../match/engine';
import { sideState, type MatchContext, type MatchState } from '../match/state';
import { matchContext } from '../season';
import {
  applySpatialAction, createSpatialLive, finalizeSpatial, resumeSpatialLive, stepSpatialMinute, tuningKey, type SpatialLive,
} from '../spatial/bridge';
import type { MatchAction, MatchEvent, MatchResult, MatchSetup, Side, Tactics } from '../types';
import type { Career, LiveEntry, LiveRecord } from './types';

/** Hard stop for a live match that somehow never finishes. */
const MAX_LIVE_STEPS = 400;

const engines = new WeakMap<MatchState, SpatialLive>();
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function newRecord(matchId: string, setup: MatchSetup, base: MatchState | null, baseSpatial: boolean): LiveRecord {
  return { matchId, rev: SPATIAL_TUNING.engineRev, tuning: tuningKey(), setup: clone(setup), base, baseSpatial, steps: 0, log: [] };
}

function remember(career: Career, live: SpatialLive): SpatialLive {
  engines.set(live.state, live);
  career.liveMatch = live.state;
  return live;
}

/** Kick off the user's match. */
export function startLive(career: Career, setup: MatchSetup): MatchState {
  const live = createSpatialLive(clone(setup), matchContext(career.season.league), { mode: 'fine', liveStats: true });
  career.liveRecord = newRecord(setup.matchId, setup, null, false);
  return remember(career, live).state;
}

function applyEntry(live: SpatialLive, e: LiveEntry): void {
  if (e.type === 'action') applySpatialAction(live, clone(e.action));
  else if (e.type === 'plan') (e.side === 'home' ? live.state.setup.home : live.state.setup.away).tactics = clone(e.tactics);
  else sideState(live.state, e.side).aiControlled = e.ai;
}

/** Rebuild the engine from a record: the same start, the same minutes, the same changes. */
function replay(rec: LiveRecord, ctx: MatchContext): SpatialLive {
  const live = rec.base
    ? resumeSpatialLive(rec.base, ctx, { mode: 'fine', liveStats: true, spatial: rec.baseSpatial })
    : createSpatialLive(clone(rec.setup), ctx, { mode: 'fine', liveStats: true });
  let k = 0;
  for (let step = 0; ; step++) {
    while (k < rec.log.length && rec.log[k].step === step) applyEntry(live, rec.log[k++]);
    if (step >= rec.steps) break;
    stepSpatialMinute(live);
  }
  return live;
}

/** The rebuilt match is the one that was saved. */
function sameMatch(a: MatchState, b: MatchState): boolean {
  return a.homeScore === b.homeScore && a.awayScore === b.awayScore && a.events.length === b.events.length
    && a.minute === b.minute && a.added === b.added && a.period === b.period && a.finished === b.finished
    && a.home.subsUsed === b.home.subsUsed && a.away.subsUsed === b.away.subsUsed;
}

/**
 * The engine behind the user's match, rebuilt if needed (after a load). Null if there is no
 * match, or it is over and cannot be rebuilt (its result then comes from the saved state).
 */
export function liveOf(career: Career): SpatialLive | null {
  const state = career.liveMatch;
  if (!state) return null;
  const hit = engines.get(state);
  if (hit) return hit;
  const ctx = matchContext(career.season.league);
  const rec = career.liveRecord;
  const ours = !!rec && rec.matchId === state.setup.matchId;
  if (rec && ours && rec.rev === SPATIAL_TUNING.engineRev && rec.tuning === tuningKey()) {
    try {
      const live = replay(rec, ctx);
      if (sameMatch(live.state, state)) return remember(career, live);
    } catch {
      // Falls through to restart-resume.
    }
  }
  if (state.finished) return null;
  const base = clone(state);
  const live = resumeSpatialLive(base, ctx, { mode: 'fine', liveStats: true, spatial: ours });
  career.liveRecord = newRecord(state.setup.matchId, state.setup, base, ours);
  return remember(career, live);
}

/** Note a change in the record, at the minute it was made. */
function log(career: Career, entry: LiveEntry): void {
  const rec = career.liveRecord;
  if (rec) rec.log.push({ ...entry, step: rec.steps });
}

/** Play one minute of the user's match. */
export function stepLiveMinute(career: Career): MatchEvent[] {
  const live = liveOf(career);
  if (!live || live.state.finished) return [];
  const events = stepSpatialMinute(live);
  if (career.liveRecord) career.liveRecord.steps++;
  return events;
}

/** A change by the owner (a substitution, tactics). Throws on anything the rules do not allow. */
export function liveAction(career: Career, action: MatchAction): MatchEvent[] {
  const live = liveOf(career);
  if (!live) throw new Error('The match is finished');
  const events = applySpatialAction(live, action);
  log(career, { step: 0, type: 'action', action: clone(action) });
  return events;
}

/** The game plan the head coach works from for `side` (in big-calls mode he adjusts around it). */
export function livePlan(career: Career, side: Side, tactics: Tactics): void {
  const live = liveOf(career);
  if (!live) return;
  applyEntry(live, { step: 0, type: 'plan', side, tactics: clone(tactics) });
  log(career, { step: 0, type: 'plan', side, tactics: clone(tactics) });
}

/** Who runs the touchline for `side`: the head coach (ai) or the owner. */
export function liveControl(career: Career, side: Side, ai: boolean): void {
  const live = liveOf(career);
  if (!live) return;
  if (sideState(live.state, side).aiControlled === ai) return;
  applyEntry(live, { step: 0, type: 'control', side, ai });
  log(career, { step: 0, type: 'control', side, ai });
}

/** The result of the user's match: the head coach sees out whatever is left of it. */
export function finishLive(career: Career, ctx: MatchContext): MatchResult {
  const state = career.liveMatch;
  if (!state) throw new Error('No match is on');
  const live = liveOf(career);
  career.liveMatch = null;
  career.liveRecord = null;
  if (!live) return finalizeMatch(state, ctx);
  live.state.home.aiControlled = true;
  live.state.away.aiControlled = true;
  for (let i = 0; i < MAX_LIVE_STEPS && !live.state.finished; i++) stepSpatialMinute(live);
  if (!live.state.finished) throw new Error(`Match ${state.setup.matchId} did not finish`);
  return finalizeSpatial(live);
}

/** Drop the live match (the season moved on without it). */
export function clearLive(career: Career): void {
  career.liveMatch = null;
  career.liveRecord = null;
}

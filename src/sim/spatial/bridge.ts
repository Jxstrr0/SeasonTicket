/**
 * The spatial engine behind the season's match API (Stage 4.5 build step 6). A classic
 * MatchState is kept in step with the engine, minute by minute, so the AI head coach,
 * the commentary, the ratings and the match result all work as they did with the
 * Stage 1 engine:
 *
 * - The engine's logs (shots, goals, fouls, cards, subs, whistles, shootout kicks) become
 *   MatchEvents with a commentary line, stamped with the minute they happened.
 * - AI-managed sides get the head coach's decisions once a minute, as engine inputs.
 * - A manager's change goes in at the next whole second; a substitution is made at the
 *   next stoppage.
 *
 * Everything here is deterministic: the engine replays from its seed and inputs, and the
 * commentary, coach and injury lengths draw from the MatchState's own stream.
 */
import { MATCH_TUNING } from '../data';
import { inMatchDecisions } from '../coach';
import { changeTactics } from '../match/actions';
import { shootoutKickLabel } from '../match/commentary';
import { createMatch, finalizeMatch } from '../match/engine';
import { emitEvent, nameOf, type EventDraft } from '../match/events';
import { ensurePlayerStats, sideState, type MatchContext, type MatchState, type Period, type SideState } from '../match/state';
import { Rng } from '../rng';
import type { MatchAction, MatchEvent, MatchResult, MatchSetup, PlayerMatchStats, Side as MatchSide, TeamMatchStats } from '../types';
import { createSpatial, queueSubstitution, queueTactics, resumeSpatial, stepSpatial } from './engine';
import { matchStats } from './onball';
import { spatialSetupFromMatch } from './setup';
import { PSTATS, PS_FOULS, PS_KEY, PS_PASSES, PS_SAVES, PS_SECS, PS_TACKLES, type SpatialMatch } from './state';
import { matchTime } from './systems';
import { PERIOD, PERSONS, personOf, whoOf, whoSide, type ShotRecord, type Side, type SpatialMode, type SpatialResume, type SpatialResumeSide } from './types';

const T = MATCH_TUNING;
const SIDES: readonly MatchSide[] = ['home', 'away'];
const PERIOD_NAMES: readonly Period[] = ['firstHalf', 'secondHalf', 'etFirstHalf', 'etSecondHalf', 'shootout', 'finished'];

export interface SpatialLive {
  m: SpatialMatch;
  /** The classic match state, kept in step with the engine (events, score, stats). */
  state: MatchState;
  ctx: MatchContext;
  /** How far each engine log has been turned into events. */
  cursor: { events: number; shots: number; goals: number; kicks: number };
  /** The fouler of the last foul in the box, for the penalty that follows. */
  boxFouler: string | null;
  /** Keep the team and player stats current every minute (the watched match), not just at the end. */
  liveStats: boolean;
  /** For a restarted match (resumeSpatialLive): the stats before the restart, added to the engine's. */
  carry: StatsCarry | null;
}

interface StatsCarry {
  /** Engine time at the restart. */
  ms: number;
  teams: [TeamMatchStats, TeamMatchStats];
  players: [Record<string, PlayerMatchStats>, Record<string, PlayerMatchStats>];
}

export interface SpatialLiveOptions {
  mode?: SpatialMode;
  liveStats?: boolean;
}

function sideName(s: Side): MatchSide {
  return s === 0 ? 'home' : 'away';
}

function sideIndex(s: MatchSide): Side {
  return s === 'home' ? 0 : 1;
}

function idOfPerson(live: SpatialLive, w: number): string | null {
  if (w < 0 || w >= PERSONS) return null;
  return personOf(live.m.setup, w)?.id ?? null;
}

function withRng(state: MatchState, work: (rng: Rng) => void): void {
  const rng = Rng.fromState(state.rngState);
  work(rng);
  state.rngState = rng.getState();
}

/** Start a live match: the engine and the classic state, with the kick-off event. */
export function createSpatialLive(setup: MatchSetup, ctx: MatchContext, opts: SpatialMode | SpatialLiveOptions = 'fine'): SpatialLive {
  const o = typeof opts === 'string' ? { mode: opts } : opts;
  const state = createMatch(setup, ctx);
  const m = createSpatial(spatialSetupFromMatch(setup, ctx.players, ctx.teams), `match:${setup.seed}`, o.mode ?? 'fine');
  const live: SpatialLive = {
    m, state, ctx, cursor: { events: 0, shots: 0, goals: 0, kicks: 0 }, boxFouler: null, liveStats: o.liveStats ?? false, carry: null,
  };
  sync(live);
  return live;
}

/**
 * Restart a saved match in the engine from where it stood (docs/DESIGN.md 17.9), for when
 * its record can no longer replay exactly: an engine or tuning change, or a save from the
 * Stage 1 engine. The saved state (events, score, stats so far) carries on; the engine
 * picks up with the players back in shape and the ball with the side that had it.
 * `spatial` says the state came from this engine, whose minute is the one being played
 * (the Stage 1 engine's is the one just played). A shootout under way starts again.
 */
export function resumeSpatialLive(saved: MatchState, ctx: MatchContext, opts: SpatialLiveOptions & { spatial?: boolean } = {}): SpatialLive {
  if (saved.finished) throw new Error('The match is finished');
  const state = JSON.parse(JSON.stringify(saved)) as MatchState;
  const setup = state.setup;
  const sp = spatialSetupFromMatch(setup, ctx.players, ctx.teams);
  const period = PERIOD_NAMES.indexOf(state.period);
  if (period === PERIOD.SHOOTOUT) {
    state.shootout = null;
    state.events = state.events.filter((e) => e.type !== 'shootoutStart' && e.type !== 'shootoutKick');
  }
  // Engine time into the period, from the minute shown.
  const base = [0, 45, 90, 105][Math.min(period, 3)];
  const reg = period < PERIOD.ET_FIRST ? T.clock.halfMinutes : T.clock.extraHalfMinutes;
  const shift = opts.spatial ? 1 : 0;
  const elapsed = state.added > 0 ? reg + state.added - shift : Math.min(reg, Math.max(0, state.minute - base - shift));
  const stoppage = state.added > 0 || elapsed >= reg;
  const sideOf = (S: SideState): SpatialResumeSide => {
    const played = new Set<string>([...S.onPitch.filter((id) => id !== ''), ...S.sentOff, ...Object.keys(S.playerStats).filter((id) => !S.bench.includes(id))]);
    return {
      onPitch: [...S.onPitch],
      played: [...played],
      sentOff: [...S.sentOff],
      booked: Object.keys(S.yellows).filter((id) => S.yellows[id] > 0 && !S.sentOff.includes(id)),
      energy: { ...S.fatigue },
      subsUsed: S.subsUsed,
      tactics: { ...S.tactics, setPieceTakers: { ...S.tactics.setPieceTakers } },
    };
  };
  const r: SpatialResume = {
    period,
    elapsedMs: elapsed * 60000,
    added: stoppage ? Math.max(1, state.addedPlanned, state.added) : -1,
    score: [state.homeScore, state.awayScore],
    poss: sideIndex(state.possession),
    sides: [sideOf(state.home), sideOf(state.away)],
  };
  const m = resumeSpatial(sp, `match:${setup.seed}:resume:${state.events.length}`, opts.mode ?? 'fine', r);
  const copyStats = (S: SideState) => JSON.parse(JSON.stringify(S.playerStats)) as Record<string, PlayerMatchStats>;
  const live: SpatialLive = {
    m, state, ctx, cursor: { events: 0, shots: 0, goals: 0, kicks: 0 }, boxFouler: null, liveStats: opts.liveStats ?? false,
    carry: { ms: m.clockMs, teams: [{ ...state.home.stats }, { ...state.away.stats }], players: [copyStats(state.home), copyStats(state.away)] },
  };
  sync(live);
  if (live.liveStats) fillStats(live);
  return live;
}

export function spatialLiveFinished(live: SpatialLive): boolean {
  return live.state.finished;
}

/**
 * Play on to the next minute on the clock (in the shootout, to the next kick). AI-managed
 * sides then make their decisions. Returns the events this step produced; they are also
 * appended to state.events.
 */
export function stepSpatialMinute(live: SpatialLive): MatchEvent[] {
  const { m, state } = live;
  if (state.finished) return [];
  const start = state.events.length;
  if (m.period === PERIOD.SHOOTOUT && m.shootout) {
    const kicks = m.shootout.kicks.length;
    while (m.period === PERIOD.SHOOTOUT && m.shootout.kicks.length === kicks && stepSpatial(m)) { /* to the next kick */ }
  } else {
    const period = m.period;
    const boundary = m.periodStart + (Math.floor((m.clockMs - m.periodStart) / 60000) + 1) * 60000;
    while (m.period === period && m.clockMs < boundary && stepSpatial(m)) { /* to the next minute */ }
  }
  translate(live);
  sync(live);
  if (!state.finished && m.period < PERIOD.SHOOTOUT) {
    for (const side of SIDES) {
      if (!sideState(state, side).aiControlled) continue;
      for (const action of inMatchDecisions(state, live.ctx, side)) {
        try {
          applySpatialAction(live, action);
        } catch {
          // A decision the rules no longer allow (the player has just been sent off): skip it.
        }
      }
    }
  }
  if (live.liveStats) fillStats(live);
  return state.events.slice(start);
}

/** A manager's action. Throws on anything the rules do not allow, like the Stage 1 engine. */
export function applySpatialAction(live: SpatialLive, action: MatchAction): MatchEvent[] {
  const { m, state, ctx } = live;
  const start = state.events.length;
  if (state.finished) throw new Error('The match is finished');
  if (m.period >= PERIOD.SHOOTOUT) throw new Error('No changes during the shootout');
  sync(live);
  const s = sideIndex(action.side);
  const S = sideState(state, action.side);
  if (action.type === 'substitute') {
    if (S.subsUsed >= T.squad.maxSubs) throw new Error(`${S.teamId} has used all ${T.squad.maxSubs} substitutions`);
    if (!S.bench.includes(action.inId)) throw new Error(`${action.inId} is not on the bench`);
    if (S.sentOff.includes(action.inId) || S.sentOff.includes(action.outId)) throw new Error(`${action.outId} has been sent off`);
    if (!S.onPitch.includes(action.outId)) throw new Error(`${action.outId} is not on the pitch`);
    queueSubstitution(m, s, action.outId, action.inId);
    sync(live);
  } else {
    const tactics = action.type === 'setTactics' ? action.tactics : { ...S.tactics, mentality: action.mentality };
    withRng(state, (rng) => changeTactics(state, ctx, rng, action.side, tactics));
    queueTactics(m, s, S.tactics);
    sync(live);
  }
  if (live.liveStats) fillStats(live);
  return state.events.slice(start);
}

/** The result the season records, from a finished match. */
export function finalizeSpatial(live: SpatialLive): MatchResult {
  sync(live);
  fillStats(live);
  return finalizeMatch(live.state, live.ctx);
}

/** A whole match, start to finish, with the AI head coach managing both sides as the setup says. */
export function simulateSpatialMatch(setup: MatchSetup, ctx: MatchContext, mode: SpatialMode = 'coarse'): MatchResult {
  const live = createSpatialLive(setup, ctx, mode);
  // A match is at most 120 minutes, stoppage and a long shootout; this only guards a stall.
  for (let k = 0; k < 400 && !live.state.finished; k++) stepSpatialMinute(live);
  if (!live.state.finished) throw new Error(`Match ${setup.matchId} did not finish`);
  return finalizeSpatial(live);
}

// ---------------------------------------------------------------------------
// Keeping the classic state in step
// ---------------------------------------------------------------------------

/** Copy the clock, line-ups, bench, energy and substitutions from the engine. */
function sync(live: SpatialLive): void {
  const { m, state } = live;
  setClock(live, m.clockMs);
  state.period = PERIOD_NAMES[m.period];
  state.finished = m.period === PERIOD.DONE;
  state.possession = sideName(m.poss as Side);
  for (const s of [0, 1] as Side[]) {
    const S = sideState(state, sideName(s));
    const team = m.teams[s];
    const onPitch: string[] = new Array<string>(11).fill('');
    for (let k = 0; k < 11; k++) {
      const i = s * 11 + k;
      if (!m.on[i]) continue;
      onPitch[team.spot[k]] = idOfPerson(live, m.who[i]) ?? '';
    }
    // Substitutions waiting for a stoppage count as made, so nobody asks for them twice.
    const coming = new Set<number>();
    let waiting = 0;
    const swap = (outW: number, inW: number) => {
      const out = idOfPerson(live, outW), inn = idOfPerson(live, inW);
      const k = out === null ? -1 : onPitch.indexOf(out);
      if (k >= 0 && inn !== null) onPitch[k] = inn;
      coming.add(inW);
    };
    for (const q of m.subQ) if (q.side === s) swap(q.out, q.in);
    for (const a of m.pending) {
      if (a.type !== 'sub' || a.side !== s) continue;
      waiting++;
      swap(whoOf(m.setup, s, a.outId), whoOf(m.setup, s, a.inId));
    }
    S.onPitch = onPitch;
    const bench = (s === 0 ? m.setup.home : m.setup.away).bench ?? [];
    S.bench = bench.map((p) => p.id).filter((id) => {
      const w = whoOf(m.setup, s, id);
      return w >= 0 && m.used[w] === 0 && !coming.has(w);
    });
    S.subsUsed = m.subsUsed[s] + waiting;
    for (let w = 0; w < PERSONS; w++) {
      if (whoSide(w) !== s || m.used[w] === 0) continue;
      const id = idOfPerson(live, w);
      if (id !== null) S.fatigue[id] = m.energy[w];
    }
    for (const w of coming) {
      const id = idOfPerson(live, w);
      if (id !== null) S.fatigue[id] = m.energy[w];
    }
  }
}

/** Stamp the classic clock (minute, stoppage minute) for engine time `ms`. */
function setClock(live: SpatialLive, ms: number): void {
  const { m, state } = live;
  const t = matchTime(m, ms);
  state.minute = t.minute;
  state.added = t.added;
  state.addedPlanned = m.added < 0 || t.period !== m.period ? 0 : m.added;
}

// ---------------------------------------------------------------------------
// Engine logs to events
// ---------------------------------------------------------------------------

type Item = { ms: number; order: number; run: () => void };

/** Turn everything new in the engine's logs into events, in the order it happened. */
function translate(live: SpatialLive): void {
  const { m, cursor } = live;
  const items: Item[] = [];
  let order = 0;
  for (; cursor.shots < m.shotLog.length; cursor.shots++) {
    const r = m.shotLog[cursor.shots];
    items.push({ ms: r.ms, order: order++, run: () => shotEvent(live, r) });
  }
  for (; cursor.goals < m.goalLog.length; cursor.goals++) {
    const g = m.goalLog[cursor.goals];
    items.push({ ms: g.ms, order: order++, run: () => goalEvent(live, g) });
  }
  let shootoutWhistle: Item | null = null;
  for (; cursor.events < m.events.length; cursor.events++) {
    const e = m.events[cursor.events];
    const item = { ms: e.ms, order: order++, run: () => refEvent(live, e) };
    if (e.kind === 'whistle' && e.note === 'shootout') shootoutWhistle = item;
    else items.push(item);
  }
  items.sort((a, b) => a.ms - b.ms || a.order - b.order);
  for (const it of items) {
    setClock(live, it.ms);
    it.run();
  }
  // The shootout, kick by kick, then its final whistle.
  const so = m.shootout;
  if (so) {
    startShootout(live);
    for (; cursor.kicks < so.kicks.length; cursor.kicks++) kickEvent(live, cursor.kicks);
  }
  if (shootoutWhistle) shootoutWhistle.run();
}

function emit(live: SpatialLive, draft: EventDraft): void {
  withRng(live.state, (rng) => emitEvent(live.state, live.ctx, rng, draft));
}

/** The keeper in goal for side s now. */
function keeperOf(live: SpatialLive, s: Side): string | null {
  return idOfPerson(live, live.m.who[s * 11]);
}

function shotEvent(live: SpatialLive, r: ShotRecord): void {
  // A goal is told when the ball crosses the line (goalEvent).
  if (r.outcome === 'goal') return;
  const side = sideName(r.side);
  const player = idOfPerson(live, r.player);
  const keeper = keeperOf(live, (1 - r.side) as Side);
  const xg = r.xg;
  if (r.setPiece === 'penalty') {
    emit(live, { type: r.outcome === 'saved' ? 'penaltySaved' : 'penaltyMissed', side, playerId: player, secondaryPlayerId: keeper, xg, highlight: true });
    return;
  }
  if (r.setPiece === 'freeKick') emit(live, { type: 'freeKick', side, playerId: player });
  if (r.outcome === 'saved') {
    emit(live, { type: 'save', side, playerId: player, secondaryPlayerId: keeper, xg, highlight: xg >= T.highlight.saveXg });
    return;
  }
  emit(live, {
    type: 'chance', side, playerId: player, secondaryPlayerId: null, xg,
    variant: r.outcome === 'blocked' ? 'blocked' : 'offTarget', highlight: xg >= T.highlight.chanceXg,
  });
}

function goalEvent(live: SpatialLive, g: SpatialMatch['goalLog'][number]): void {
  const { state, m } = live;
  const side = sideName(g.side);
  if (g.side === 0) state.homeScore++;
  else state.awayScore++;
  const scorer = idOfPerson(live, g.scorer);
  if (g.ownGoal) {
    emit(live, { type: 'ownGoal', side, playerId: scorer, highlight: true });
    return;
  }
  // The shot it came from, for a penalty and the xG.
  let shot: ShotRecord | null = null;
  for (const r of m.shotLog) if (r.player === g.scorer && r.ms <= g.ms && r.outcome === 'goal') shot = r;
  const pen = shot?.setPiece === 'penalty';
  if (shot?.setPiece === 'freeKick') emit(live, { type: 'freeKick', side, playerId: scorer });
  emit(live, {
    type: pen ? 'penaltyScored' : 'goal', side, playerId: scorer,
    secondaryPlayerId: pen ? null : idOfPerson(live, g.assist), xg: shot ? shot.xg : null, highlight: true,
  });
}

function refEvent(live: SpatialLive, e: SpatialMatch['events'][number]): void {
  const { state } = live;
  const side = sideName(e.side);
  const player = idOfPerson(live, e.player);
  const S = sideState(state, side);
  switch (e.kind) {
    case 'foul':
      // A foul in the box is told as the penalty that follows.
      if (e.note === 'box') { live.boxFouler = player; return; }
      emit(live, { type: 'foul', side, playerId: player, secondaryPlayerId: idOfPerson(live, e.other ?? -1) });
      return;
    case 'penalty':
      emit(live, { type: 'penaltyAwarded', side, playerId: player, secondaryPlayerId: live.boxFouler, highlight: true });
      live.boxFouler = null;
      return;
    case 'yellow':
      if (player !== null) S.yellows[player] = (S.yellows[player] ?? 0) + 1;
      emit(live, { type: e.note === 'second' ? 'secondYellow' : 'yellowCard', side, playerId: player, highlight: e.note === 'second' });
      return;
    case 'red':
      if (player !== null && !S.sentOff.includes(player)) S.sentOff.push(player);
      // A second yellow was told as such.
      if (e.note !== 'second') emit(live, { type: 'redCard', side, playerId: player, highlight: true });
      return;
    case 'offside':
      emit(live, { type: 'offside', side, playerId: player });
      return;
    case 'injury':
      withRng(state, (rng) => {
        if (player !== null) state.injuries.push({ playerId: player, weeks: rng.weighted(T.injury.weeksWeights, (w) => w[1])[0] });
      });
      emit(live, { type: 'injury', side, playerId: player, highlight: true });
      return;
    case 'corner':
      emit(live, { type: 'corner', side, playerId: player });
      return;
    case 'sub': {
      const inn = idOfPerson(live, e.other ?? -1);
      if (inn !== null) ensurePlayerStats(S, inn);
      emit(live, { type: 'substitution', side, playerId: player, secondaryPlayerId: inn });
      return;
    }
    case 'whistle':
      whistle(live, e.note);
      return;
    case 'advantage':
      return;
  }
}

function whistle(live: SpatialLive, note: SpatialMatch['events'][number]['note']): void {
  const { state, m } = live;
  switch (note) {
    case 'half':
      state.halfTimeScore = { home: state.homeScore, away: state.awayScore };
      emit(live, { type: 'halfTime', side: null });
      return;
    case 'full':
      emit(live, { type: 'fullTime', side: null });
      if (m.periodLog.some((r) => r.period === PERIOD.ET_FIRST) || m.period === PERIOD.ET_FIRST) emit(live, { type: 'extraTimeStart', side: null });
      return;
    case 'etHalf':
      emit(live, { type: 'extraTimeHalf', side: null });
      return;
    case 'etFull':
      emit(live, { type: 'extraTimeEnd', side: null });
      return;
    case 'shootout': {
      const so = m.shootout;
      if (!so || so.winner < 0) return;
      const w = so.winner as Side;
      const minute = T.clock.shootoutMinute;
      emit(live, {
        type: 'shootoutEnd', side: sideName(w), minute,
        params: { score: `${so.score[w]}-${so.score[1 - w]}` },
      });
      return;
    }
  }
}

function startShootout(live: SpatialLive): void {
  const { state } = live;
  if (state.shootout) return;
  state.shootout = { home: 0, away: 0, kicks: 0 };
  emit(live, { type: 'shootoutStart', side: null, minute: T.clock.shootoutMinute });
}

function kickEvent(live: SpatialLive, k: number): void {
  const { state, m } = live;
  const so = m.shootout;
  if (!so) return;
  startShootout(live);
  const kick = so.kicks[k];
  const tally = state.shootout as { home: number; away: number; kicks: number };
  tally.kicks++;
  if (kick.outcome === 'scored') tally[sideName(kick.side)]++;
  const keeper = idOfPerson(live, kick.keeper);
  emit(live, {
    type: 'shootoutKick', side: sideName(kick.side), playerId: idOfPerson(live, kick.player), secondaryPlayerId: keeper,
    minute: T.clock.shootoutMinute, highlight: true,
    detail: shootoutKickLabel(kick.outcome).replace('{secondary}', nameOf(live.ctx, keeper)),
    params: { score: `${tally.home}-${tally.away}` },
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Team and player stats for the result, from the engine's counts and logs. */
function fillStats(live: SpatialLive): void {
  const { m, state } = live;
  const st = matchStats(m);
  for (const s of [0, 1] as Side[]) {
    const S: SideState = sideState(state, sideName(s));
    let saves = 0;
    for (let w = 0; w < PERSONS; w++) {
      if (whoSide(w) !== s || m.used[w] === 0) continue;
      const id = idOfPerson(live, w);
      if (id === null) continue;
      const p = ensurePlayerStats(S, id);
      const o = w * PSTATS;
      p.minutes = Math.round(m.pstat[o + PS_SECS] / 60);
      p.passes = m.pstat[o + PS_PASSES];
      p.keyPasses = m.pstat[o + PS_KEY];
      p.tackles = m.pstat[o + PS_TACKLES];
      p.saves = m.pstat[o + PS_SAVES];
      p.fouls = m.pstat[o + PS_FOULS];
      p.goals = 0; p.assists = 0; p.shots = 0; p.shotsOnTarget = 0; p.xg = 0; p.yellowCards = 0; p.redCards = 0;
      saves += p.saves;
    }
    const x = st[s];
    S.stats = {
      goals: m.score[s], shots: x.shots, shotsOnTarget: x.onTarget, xg: x.xg, possession: x.possession,
      passes: x.passes, passAccuracy: x.completion, corners: x.corners, fouls: x.fouls, yellowCards: x.yellows,
      redCards: x.reds, offsides: x.offsides, saves, tackles: x.tackles,
    };
  }
  const statsOf = (w: number) => {
    const id = idOfPerson(live, w);
    return id === null ? null : ensurePlayerStats(sideState(state, sideName(whoSide(w))), id);
  };
  for (const r of m.shotLog) {
    const p = statsOf(r.player);
    if (!p) continue;
    p.shots++;
    p.xg += r.xg;
    if (r.outcome === 'goal' || r.outcome === 'saved') p.shotsOnTarget++;
  }
  for (const g of m.goalLog) {
    if (g.ownGoal) continue;
    const p = statsOf(g.scorer);
    if (p) p.goals++;
    if (p && g.bundled) { p.shots++; p.shotsOnTarget++; }
    const a = g.assist >= 0 ? statsOf(g.assist) : null;
    if (a) a.assists++;
  }
  for (const e of m.events) {
    if (e.kind !== 'yellow' && e.kind !== 'red') continue;
    const p = statsOf(e.player);
    if (!p) continue;
    if (e.kind === 'yellow') p.yellowCards++;
    else p.redCards++;
  }
  if (live.carry) addCarry(live, live.carry);
}

const PLAYER_COUNTS = ['minutes', 'goals', 'assists', 'shots', 'shotsOnTarget', 'xg', 'passes', 'keyPasses', 'tackles', 'saves', 'fouls', 'yellowCards', 'redCards'] as const;
const TEAM_COUNTS = ['shots', 'shotsOnTarget', 'xg', 'passes', 'corners', 'fouls', 'yellowCards', 'redCards', 'offsides', 'saves', 'tackles'] as const;

/** Add the stats from before a restart: counts add up, shares are weighted by time and passes. */
function addCarry(live: SpatialLive, c: StatsCarry): void {
  const { m, state } = live;
  for (const s of [0, 1] as Side[]) {
    const S = sideState(state, sideName(s));
    for (const id in c.players[s]) {
      const p = ensurePlayerStats(S, id);
      const q = c.players[s][id];
      for (const k of PLAYER_COUNTS) p[k] += q[k];
    }
    const n = S.stats, o = c.teams[s];
    const before = c.ms, after = Math.max(0, m.clockMs - c.ms);
    n.possession = before + after > 0 ? (o.possession * before + n.possession * after) / (before + after) : o.possession;
    n.passAccuracy = o.passes + n.passes > 0 ? (o.passAccuracy * o.passes + n.passAccuracy * n.passes) / (o.passes + n.passes) : 0;
    for (const k of TEAM_COUNTS) n[k] += o[k];
  }
}

/**
 * The AI head coach: picks a formation, eleven, bench, set-piece takers and
 * tactics before a match, and makes substitutions and mentality changes
 * during it. Every threshold comes from src/data/tuning/coach.json.
 */
import { COACH_TUNING, FORMATIONS, MATCH_TUNING, formation as formationOf } from './data';
import { Rng } from './rng';
import type { Dial, Formation, FormationSlot, MatchAction, Player, Side, StaffMember, Tactics, Team, TeamSelection } from './types';
import { assignToSlots, positionFit } from './match/lineup';
import { goalMargin, otherSide, sideState, type MatchContext, type MatchState, type SideState } from './match/state';
import { energyOf, unitOfPosition, type Unit } from './match/strength';

const C = COACH_TUNING;
const SQUAD = MATCH_TUNING.squad;
const DIALS = MATCH_TUNING.dials;

export interface SelectionOptions {
  opponent?: Team;
  homegrownMinimum?: number;
}

// ---------------------------------------------------------------------------
// Pre-match selection
// ---------------------------------------------------------------------------

export function pickSelection(rng: Rng, team: Team, players: Record<string, Player>, headCoach: StaffMember | null, opts: SelectionOptions = {}): TeamSelection {
  const available = team.playerIds.filter((id) => isAvailable(players[id]));
  const candidates = FORMATIONS.map((formation) => {
    const starters = pickEleven(available, formation, players, opts.homegrownMinimum ?? 0);
    return { formation, starters, total: lineupScore(starters, formation, players) };
  });
  const best = Math.max(...candidates.map((c) => c.total));
  const good = candidates.filter((c) => c.total >= best * C.selection.preferredFormationTolerance);
  const preferred = good.find((c) => c.formation.id === headCoach?.preferredFormation);
  const chosen = preferred ?? rng.weighted(good, (c) => c.total);

  const bench = pickBench(available.filter((id) => !chosen.starters.includes(id)), players);
  const tactics = coachTactics(headCoach, chosen.formation, chosen.starters, players, opts.opponent);
  return { lineup: { starters: chosen.starters, bench }, tactics };
}

function isAvailable(player: Player | undefined): player is Player {
  return !!player && player.injuryWeeks <= 0 && player.suspensionMatches <= 0;
}

/** Fit times ability times freshness: the number the coach ranks everyone by. */
function selectionScore(player: Player, slot: FormationSlot): number {
  return positionFit(player, slot.position) * player.overall * player.condition;
}

function lineupScore(starters: string[], formation: Formation, players: Record<string, Player>): number {
  let total = 0;
  starters.forEach((id, index) => {
    if (id !== '') total += selectionScore(players[id], formation.slots[index]);
  });
  return total;
}

function pickEleven(available: string[], formation: Formation, players: Record<string, Player>, homegrownMinimum: number): string[] {
  const starters = assignToSlots(available, formation, players, selectionScore);
  if (homegrownMinimum > 0) enforceHomegrown(starters, available, formation, players, homegrownMinimum);
  return starters;
}

function isHomegrown(player: Player): boolean {
  return player.nationality === C.selection.homegrownNation;
}

/** Swaps foreign starters for the cheapest domestic replacements until the quota is met or the squad runs out. */
function enforceHomegrown(starters: string[], available: string[], formation: Formation, players: Record<string, Player>, minimum: number): void {
  const domesticCount = () => starters.filter((id) => id !== '' && isHomegrown(players[id])).length;
  while (domesticCount() < minimum) {
    let bestSwap: { slot: number; inId: string; loss: number } | null = null;
    starters.forEach((outId, slot) => {
      if (outId === '' || isHomegrown(players[outId])) return;
      const current = selectionScore(players[outId], formation.slots[slot]);
      for (const inId of available) {
        if (starters.includes(inId) || !isHomegrown(players[inId])) continue;
        const loss = current - selectionScore(players[inId], formation.slots[slot]);
        if (bestSwap === null || loss < bestSwap.loss) bestSwap = { slot, inId, loss };
      }
    });
    if (bestSwap === null) return;
    const swap: { slot: number; inId: string; loss: number } = bestSwap;
    starters[swap.slot] = swap.inId;
  }
}

/** A keeper, cover for each outfield unit, then the best of the rest. */
function pickBench(rest: string[], players: Record<string, Player>): string[] {
  const bench: string[] = [];
  const freshness = (id: string) => players[id].overall * players[id].condition;
  const ranked = rest.slice().sort((a, b) => freshness(b) - freshness(a) || (a < b ? -1 : 1));
  const take = (predicate: (player: Player) => boolean) => {
    const id = ranked.find((candidate) => !bench.includes(candidate) && predicate(players[candidate]));
    if (id !== undefined && bench.length < C.selection.benchSize) bench.push(id);
  };
  take((p) => p.position === 'GK');
  for (const unit of C.selection.unitCover as Unit[]) take((p) => unitOfPosition(p.position) === unit);
  for (const id of ranked) {
    if (bench.length >= C.selection.benchSize) break;
    if (!bench.includes(id)) bench.push(id);
  }
  return bench;
}

function pickTakers(starters: string[], players: Record<string, Player>): Tactics['setPieceTakers'] {
  const outfield = starters.filter((id) => id !== '' && players[id].position !== 'GK');
  const pool = outfield.length > 0 ? outfield : starters.filter((id) => id !== '');
  const best = (score: (p: Player) => number): string | null => {
    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const id of pool) {
      const value = score(players[id]);
      if (value > bestScore) {
        bestScore = value;
        bestId = id;
      }
    }
    return bestId;
  };
  const penaltyWeight = C.selection.penaltyTakerComposureWeight;
  const cornerWeight = C.selection.cornerTakerCrossingWeight;
  return {
    penalties: best((p) => p.attributes.spk * (1 - penaltyWeight) + p.attributes.cmp * penaltyWeight),
    freeKicks: best((p) => p.attributes.spk),
    corners: best((p) => p.attributes.spk * (1 - cornerWeight) + p.attributes.crs * cornerWeight),
  };
}

function coachTactics(coach: StaffMember | null, formation: Formation, starters: string[], players: Record<string, Player>, opponent: Team | undefined): Tactics {
  const setPieceTakers = pickTakers(starters, players);
  const balanced = C.tactics.balancedDial as Dial;
  if (coach === null) {
    return {
      formationId: formation.id,
      mentality: balanced,
      pressing: balanced,
      defensiveLine: balanced,
      width: balanced,
      tempo: balanced,
      directness: balanced,
      counterAttack: false,
      timeWasting: C.tactics.timeWastingDialDefault as Dial,
      setPieceTakers,
      manMarkTarget: null,
    };
  }
  const lean = coach.attackLean;
  const risk = coach.aggression;
  const half = 0.5;
  return {
    formationId: formation.id,
    mentality: dialFrom(lean),
    pressing: dialFrom(risk),
    defensiveLine: dialFrom((lean + risk) / 2),
    width: dialFrom(half + (lean - half) * C.tactics.widthLeanWeight),
    tempo: dialFrom(risk),
    directness: dialFrom(1 - lean * C.tactics.directnessInverseLeanWeight),
    counterAttack: risk >= C.tactics.counterAttackMinAggression && lean <= C.tactics.counterAttackMaxAttackLean,
    timeWasting: (lean <= C.tactics.timeWastingCautiousLean ? C.tactics.timeWastingDialCautious : C.tactics.timeWastingDialDefault) as Dial,
    setPieceTakers,
    manMarkTarget: opponent && risk <= C.tactics.manMarkMaxAggression ? dangerMan(opponent, players) : null,
  };
}

/** Maps a 0-1 philosophy value onto a five-step dial. */
export function dialFrom(value: number): Dial {
  let dial = DIALS.min;
  for (const threshold of C.tactics.dialThresholds) if (value >= threshold) dial += 1;
  return Math.min(DIALS.max, dial) as Dial;
}

/** The opponent's best starting attacker, the one a cautious coach has marked. */
function dangerMan(opponent: Team, players: Record<string, Player>): string | null {
  let best: string | null = null;
  let bestOverall = -1;
  for (const id of opponent.selection.lineup.starters) {
    const player = players[id];
    if (!player || unitOfPosition(player.position) !== 'attacker') continue;
    if (player.overall > bestOverall) {
      bestOverall = player.overall;
      best = id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// In-match decisions
// ---------------------------------------------------------------------------

export function inMatchDecisions(state: MatchState, ctx: MatchContext, side: Side): MatchAction[] {
  if (state.finished || state.period === 'shootout') return [];
  const actions: MatchAction[] = [];
  const rng = Rng.fromState(state.rngState);
  const sub = chooseSubstitution(state, ctx, side, rng);
  if (sub) actions.push(sub);
  const tactics = chooseTactics(state, side);
  if (tactics) actions.push(tactics);
  state.rngState = rng.getState();
  return actions;
}

interface SubPlan {
  outId: string;
  inId: string;
}

function chooseSubstitution(state: MatchState, ctx: MatchContext, side: Side, rng: Rng): MatchAction | null {
  const S = sideState(state, side);
  if (S.subsUsed >= SQUAD.maxSubs || S.bench.length === 0) return null;
  const formation = formationOf(S.tactics.formationId);
  const plan = emergencySub(state, ctx, S, formation) ?? plannedSub(state, ctx, S, formation, side, rng);
  return plan ? { type: 'substitute', side, outId: plan.outId, inId: plan.inId } : null;
}

/** Injured players and a missing keeper are replaced at any minute. */
function emergencySub(state: MatchState, ctx: MatchContext, S: SideState, formation: Formation): SubPlan | null {
  const injured = S.onPitch.find((id) => id !== '' && state.injuries.some((i) => i.playerId === id));
  if (injured !== undefined) {
    const inId = bestReplacement(S, ctx, formation.slots[S.onPitch.indexOf(injured)], 0);
    if (inId !== null) return { outId: injured, inId };
  }
  const hasKeeper = S.onPitch.some((id) => id !== '' && ctx.players[id].position === 'GK');
  if (!hasKeeper) {
    const keeper = S.bench.find((id) => ctx.players[id].position === 'GK');
    const outId = mostTired(S, ctx, formation, (unit) => unit === 'attacker') ?? mostTired(S, ctx, formation, () => true);
    if (keeper !== undefined && outId !== null) return { outId, inId: keeper };
  }
  return null;
}

function plannedSub(state: MatchState, ctx: MatchContext, S: SideState, formation: Formation, side: Side, rng: Rng): SubPlan | null {
  const I = C.inMatch;
  const minute = state.minute;
  const reserve = minute < I.reserveSubsUntil ? I.reserveSubs : 0;
  if (S.subsUsed + reserve >= SQUAD.maxSubs) return null;
  if (minute < I.subWindow.from || minute > I.subWindow.to) return null;
  const margin = goalMargin(state, side);

  const tired = mostTired(S, ctx, formation, (unit) => unit !== 'goalkeeper');
  if (tired !== null && energyOf(S, tired) < I.fatigueThreshold) return likeForLike(S, ctx, formation, tired);

  const booked = S.onPitch.find((id) => id !== '' && S.yellows[id] === 1 && ctx.players[id].position !== 'GK');
  if (booked !== undefined && rng.chance(I.bookedSubChance)) return likeForLike(S, ctx, formation, booked);

  if (margin < 0 && minute >= I.chase.impactSubFrom && rng.chance(I.chase.impactSubChance)) {
    const outId = mostTired(S, ctx, formation, (unit) => unit === 'midfielder' || unit === 'defender');
    const inId = bestBenchByUnit(S, ctx, 'attacker');
    if (outId !== null && inId !== null) return { outId, inId };
  }
  if (margin > 0 && minute >= I.protect.from && rng.chance(I.protect.defensiveSubChance)) {
    const outId = mostTired(S, ctx, formation, (unit) => unit === 'attacker');
    const inId = bestBenchByUnit(S, ctx, 'midfielder') ?? bestBenchByUnit(S, ctx, 'defender');
    if (outId !== null && inId !== null) return { outId, inId };
  }
  if (tired !== null && energyOf(S, tired) < I.softFatigueThreshold && rng.chance(I.plannedSubChance)) return likeForLike(S, ctx, formation, tired);
  return null;
}

function likeForLike(S: SideState, ctx: MatchContext, formation: Formation, outId: string): SubPlan | null {
  const slot = formation.slots[S.onPitch.indexOf(outId)];
  const inId = bestReplacement(S, ctx, slot, C.inMatch.minReplacementFit);
  return inId === null ? null : { outId, inId };
}

/** Best bench player for a slot by fit, ability and freshness; null when nobody fits well enough. */
function bestReplacement(S: SideState, ctx: MatchContext, slot: FormationSlot, minFit: number): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const id of S.bench) {
    const player = ctx.players[id];
    if (S.sentOff.includes(id)) continue;
    const fit = positionFit(player, slot.position);
    if (fit < minFit) continue;
    const score = fit * player.overall * player.condition;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function bestBenchByUnit(S: SideState, ctx: MatchContext, unit: Unit): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const id of S.bench) {
    const player = ctx.players[id];
    if (unitOfPosition(player.position) !== unit) continue;
    const score = player.overall * player.condition;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** The lowest-energy player on the pitch among those whose unit passes the filter. */
function mostTired(S: SideState, ctx: MatchContext, formation: Formation, filter: (unit: Unit) => boolean): string | null {
  let best: string | null = null;
  let lowest = Infinity;
  S.onPitch.forEach((id, index) => {
    if (id === '') return;
    const player = ctx.players[id];
    const unit = player.position === 'GK' ? 'goalkeeper' : unitOfPosition(formation.slots[index].position);
    if (!filter(unit)) return;
    const energy = energyOf(S, id);
    if (energy < lowest) {
      lowest = energy;
      best = id;
    }
  });
  return best;
}

/** Mentality and shape relative to the kickoff plan: chase when behind, protect when ahead, tighten after a red. */
function chooseTactics(state: MatchState, side: Side): MatchAction | null {
  const S = sideState(state, side);
  const base = (side === 'home' ? state.setup.home : state.setup.away).tactics;
  const I = C.inMatch;
  const minute = state.minute;
  const margin = goalMargin(state, side);

  let mentality: number = base.mentality;
  let line: number = base.defensiveLine;
  let timeWasting: number = base.timeWasting;
  let counterAttack = base.counterAttack;
  let formationId = base.formationId;

  if (margin < 0) {
    if (margin <= -2 && minute >= I.chase.twoGoalsFrom) mentality += I.chase.twoGoalsStep;
    else if (minute >= I.chase.from) mentality += I.chase.mentalityStep;
    if (minute >= I.chase.from) timeWasting = DIALS.min;
  } else if (margin > 0 && minute >= I.protect.from) {
    mentality += I.protect.mentalityStep;
    line += I.protect.lineStep;
    timeWasting = I.protect.timeWasting;
    counterAttack = I.protect.counterAttack;
  }
  const shortBy = S.sentOff.length - sideState(state, otherSide(side)).sentOff.length;
  if (shortBy > 0) {
    const fallback = (I.redCard.formationFallback as Record<string, string>)[base.formationId];
    if (fallback) formationId = fallback;
    mentality += I.redCard.mentalityStep;
  }

  const desired: Tactics = {
    ...S.tactics,
    formationId,
    mentality: clampDial(mentality),
    defensiveLine: clampDial(line),
    timeWasting: clampDial(timeWasting),
    counterAttack,
  };
  const unchanged =
    desired.formationId === S.tactics.formationId &&
    desired.mentality === S.tactics.mentality &&
    desired.defensiveLine === S.tactics.defensiveLine &&
    desired.timeWasting === S.tactics.timeWasting &&
    desired.counterAttack === S.tactics.counterAttack;
  return unchanged ? null : { type: 'setTactics', side, tactics: desired };
}

function clampDial(value: number): Dial {
  return Math.min(DIALS.max, Math.max(DIALS.min, Math.round(value))) as Dial;
}

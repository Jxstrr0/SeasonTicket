/**
 * One minute of play. The side in possession attempts a move whose outcome is
 * nothing, a foul, a corner, a shot or a turnover (which may become a
 * counter). Then injuries, fatigue, minutes and possession are booked.
 */
import { MATCH_TUNING, formation as formationOf } from '../../../src/sim/data';
import type { Rng } from '../../../src/sim/rng';
import type { AttributeKey, Formation, Player, Position, Side } from '../../../src/sim/types';
import { emitEvent } from '../../../src/sim/match/events';
import {
  ensurePlayerStats,
  type ChanceType,
  goalMargin,
  otherSide,
  sideState,
  type MatchContext,
  type MatchState,
  type SideState,
} from '../../../src/sim/match/state';
import {
  byDial,
  effective,
  energyOf,
  goalkeeperId,
  goalkeeperQuality,
  relative,
  sideStrength,
  unitAttribute,
  weightedAttributes,
  type SideStrength,
} from '../../../src/sim/match/strength';

const T = MATCH_TUNING;

type MoveOutcome = 'offside' | 'foul' | 'corner' | 'shot' | 'turnover' | 'nothing';
type PositionWeights = Record<Position, number>;
type AttributeWeights = Partial<Record<AttributeKey, number>>;

interface Tick {
  state: MatchState;
  ctx: MatchContext;
  rng: Rng;
  formation: Record<Side, Formation>;
  strength: Record<Side, SideStrength>;
}

export function playMinute(state: MatchState, ctx: MatchContext, rng: Rng): void {
  const formation = { home: formationOf(state.home.tactics.formationId), away: formationOf(state.away.tactics.formationId) };
  const tick: Tick = {
    state,
    ctx,
    rng,
    formation,
    strength: {
      home: sideStrength(state.home, formation.home, ctx),
      away: sideStrength(state.away, formation.away, ctx),
    },
  };
  const attacking = choosePossession(tick);
  state.possession = attacking;
  if (!wasteTime(tick, otherSide(attacking))) attemptMove(tick, attacking);
  rollInjuries(tick);
  bookMinute(tick, attacking);
}

// ---------------------------------------------------------------------------
// Possession
// ---------------------------------------------------------------------------

function choosePossession(tick: Tick): Side {
  const P = T.possession;
  const home = tick.strength.home.midfield;
  const away = tick.strength.away.midfield;
  const control = home + away > 0 ? (home - away) / (home + away) : 0;
  let pHome = 0.5 + P.midfieldSensitivity * control + T.home.possession * homeFactor(tick.state);
  pHome += possessionBias(tick, 'home') - possessionBias(tick, 'away');
  return tick.rng.chance(clamp(pHome, P.min, P.max)) ? 'home' : 'away';
}

/** How much of the home advantage the crowd delivers today. */
function homeFactor(state: MatchState): number {
  return T.home.attendanceFloor + (1 - T.home.attendanceFloor) * state.setup.attendanceShare;
}

function possessionBias(tick: Tick, side: Side): number {
  const P = T.possession;
  const tactics = sideState(tick.state, side).tactics;
  const balanced = T.dials.balanced;
  let bias =
    P.tempoStep * (tactics.tempo - balanced) +
    P.directnessStep * (tactics.directness - balanced) +
    P.widthStep * (tactics.width - balanced) +
    P.mentalityStep * (tactics.mentality - balanced);
  const margin = goalMargin(tick.state, side);
  if (margin < 0 && tick.state.minute >= P.chasingFromMinute) {
    bias += Math.min(P.chasingMax, -margin * P.chasingBonusPerGoal);
  }
  return bias;
}

// ---------------------------------------------------------------------------
// Time wasting
// ---------------------------------------------------------------------------

/** A side ahead late can kill a minute; returns true when this minute was wasted. */
function wasteTime(tick: Tick, side: Side): boolean {
  const W = T.timeWasting;
  const wasting = sideState(tick.state, side);
  if (goalMargin(tick.state, side) <= 0 || tick.state.minute < W.fromMinute) return false;
  if (!tick.rng.chance(byDial(W.deadTickChance, wasting.tactics.timeWasting))) return false;
  if (tick.rng.chance(W.bookingChance)) {
    const culprit = pickPlayer(tick, side, T.involvement.tackler as PositionWeights, {}, []);
    if (culprit) bookPlayer(tick, side, culprit, 1, 0);
  }
  return true;
}

// ---------------------------------------------------------------------------
// The move
// ---------------------------------------------------------------------------

function attemptMove(tick: Tick, attacking: Side): void {
  const outcome = drawOutcome(tick, attacking);
  switch (outcome) {
    case 'offside':
      resolveOffside(tick, attacking);
      break;
    case 'foul':
      resolveFoul(tick, attacking);
      break;
    case 'corner':
      resolveCorner(tick, attacking);
      break;
    case 'shot':
      resolveOpenPlayShot(tick, attacking);
      break;
    case 'turnover':
      resolveTurnover(tick, attacking);
      break;
    case 'nothing':
      break;
  }
}

function drawOutcome(tick: Tick, attacking: Side): MoveOutcome {
  const defending = otherSide(attacking);
  const A = sideState(tick.state, attacking);
  const D = sideState(tick.state, defending);
  const sA = tick.strength[attacking];
  const sD = tick.strength[defending];
  const weather = T.weather[tick.state.setup.weather];
  const M = T.move;

  const attackRatio = sA.attack / Math.max(1, sD.defense);
  const homeShots = attacking === 'home' ? 1 + T.home.shotRate * homeFactor(tick.state) : 1;
  const pShot =
    M.shot.base *
    Math.pow(attackRatio, M.shot.strengthExponent) *
    byDial(M.shot.mentalityFor, A.tactics.mentality) *
    byDial(M.shot.mentalityAgainst, D.tactics.mentality) *
    byDial(M.shot.tempo, A.tactics.tempo) *
    byDial(M.shot.directness, A.tactics.directness) *
    byDial(M.shot.width, A.tactics.width) *
    weather.shotRate *
    homeShots *
    cushionFactor(tick.state, attacking);

  const defenderAggression = unitAttribute(D, tick.formation[defending], tick.ctx, 'defender', 'agg');
  const pFoul = M.foul.base * byDial(M.foul.pressing, D.tactics.pressing) * (1 + M.foul.aggressionWeight * relative(defenderAggression));

  const pCorner = M.corner.base * byDial(M.corner.width, A.tactics.width) * Math.pow(attackRatio, M.corner.attackExponent);

  const midfieldRatio = sD.midfield / Math.max(1, sA.midfield);
  const pTurnover =
    M.turnover.base *
    byDial(M.turnover.pressing, D.tactics.pressing) *
    byDial(M.turnover.tempo, A.tactics.tempo) *
    byDial(M.turnover.directness, A.tactics.directness) *
    byDial(M.turnover.width, A.tactics.width) *
    Math.pow(midfieldRatio, M.turnover.midfieldExponent);

  const pOffside = M.offside.base * byDial(M.offside.line, D.tactics.defensiveLine);

  const weights: Record<MoveOutcome, number> = {
    offside: pOffside,
    foul: pFoul,
    corner: pCorner,
    shot: pShot,
    turnover: pTurnover,
    nothing: Math.max(0, 1 - (pOffside + pFoul + pCorner + pShot + pTurnover)),
  };
  const outcomes: MoveOutcome[] = ['offside', 'foul', 'corner', 'shot', 'turnover', 'nothing'];
  return tick.rng.weighted(outcomes, (o) => weights[o]);
}

/** Players with a cushion ease off: each goal of lead beyond the first trims their own shot rate. */
export function cushionFactor(state: MatchState, side: Side): number {
  const C = T.scoreEffects;
  const cushion = goalMargin(state, side) - C.cushionFrom + 1;
  if (cushion <= 0) return 1;
  return Math.max(C.minShotRate, 1 - C.shotRatePerGoal * cushion);
}

function resolveOffside(tick: Tick, attacking: Side): void {
  const A = sideState(tick.state, attacking);
  const player = pickPlayer(tick, attacking, T.involvement.shooter.openPlay as PositionWeights, T.involvement.attributeWeights.shooterOpenPlay as AttributeWeights, []);
  A.stats.offsides += 1;
  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'offside', side: attacking, playerId: player });
}

function resolveFoul(tick: Tick, attacking: Side): void {
  const defending = otherSide(attacking);
  const D = sideState(tick.state, defending);
  const fouler = pickPlayer(tick, defending, T.involvement.fouler as PositionWeights, T.involvement.attributeWeights.fouler as AttributeWeights, [], (id) =>
    D.yellows[id] ? T.cards.bookedFoulWeight : 1,
  );
  const fouled = pickPlayer(tick, attacking, T.involvement.fouled as PositionWeights, T.involvement.attributeWeights.fouled as AttributeWeights, []);
  if (fouler === null) return;
  D.stats.fouls += 1;
  ensurePlayerStats(D, fouler).fouls += 1;

  if (tick.rng.chance(T.setPiece.penaltyShareOfFouls)) {
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'penaltyAwarded', side: attacking, playerId: fouled, secondaryPlayerId: fouler, highlight: true });
    bookPlayer(tick, defending, fouler, T.cards.penaltyFoulYellow, T.cards.penaltyFoulRed);
    resolvePenalty(tick, attacking);
    return;
  }

  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'foul', side: defending, playerId: fouler, secondaryPlayerId: fouled });
  bookPlayer(tick, defending, fouler, foulYellowChance(tick, defending, fouler), foulRedChance(tick, defending, fouler));
  resolveFreeKick(tick, attacking);
}

function foulYellowChance(tick: Tick, side: Side, playerId: string): number {
  const S = sideState(tick.state, side);
  const C = T.cards;
  const aggression = effective(tick.ctx.players[playerId], energyOf(S, playerId), 'agg');
  return (
    C.yellowPerFoul *
    (1 + C.aggressionWeight * relative(aggression)) *
    byDial(C.pressingYellow, S.tactics.pressing) *
    (side === 'home' ? T.home.cardLeniency : 1) *
    (S.yellows[playerId] ? C.bookedYellowMultiplier : 1)
  );
}

function foulRedChance(tick: Tick, side: Side, playerId: string): number {
  const S = sideState(tick.state, side);
  const aggression = effective(tick.ctx.players[playerId], energyOf(S, playerId), 'agg');
  return T.cards.redPerFoul * (1 + T.cards.aggressionWeight * relative(aggression)) * (side === 'home' ? T.home.cardLeniency : 1);
}

function resolveFreeKick(tick: Tick, attacking: Side): void {
  if (tick.rng.chance(T.setPiece.freeKickDirectChance)) {
    const taker = setPieceTaker(tick, attacking, 'freeKicks');
    if (taker === null) return;
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'freeKick', side: attacking, playerId: taker });
    takeShot(tick, attacking, 'setPiece', taker, null, 1);
    return;
  }
  if (tick.rng.chance(T.setPiece.freeKickCrossChance)) {
    const taker = setPieceTaker(tick, attacking, 'freeKicks');
    const target = pickPlayer(tick, attacking, T.involvement.shooter.setPiece as PositionWeights, T.involvement.attributeWeights.shooterSetPiece as AttributeWeights, taker ? [taker] : [], markedDown(tick, attacking));
    if (taker === null || target === null) return;
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'freeKick', side: attacking, playerId: taker });
    takeShot(tick, attacking, 'setPiece', target, taker, 1);
  }
}

function resolveCorner(tick: Tick, attacking: Side): void {
  const A = sideState(tick.state, attacking);
  const taker = setPieceTaker(tick, attacking, 'corners');
  A.stats.corners += 1;
  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'corner', side: attacking, playerId: taker });
  if (taker === null || !tick.rng.chance(T.setPiece.cornerChance)) return;
  const target = pickPlayer(tick, attacking, T.involvement.shooter.setPiece as PositionWeights, T.involvement.attributeWeights.shooterSetPiece as AttributeWeights, [taker], markedDown(tick, attacking));
  if (target === null) return;
  takeShot(tick, attacking, 'setPiece', target, taker, 1);
}

function resolveOpenPlayShot(tick: Tick, attacking: Side): void {
  const shooter = pickPlayer(tick, attacking, T.involvement.shooter.openPlay as PositionWeights, T.involvement.attributeWeights.shooterOpenPlay as AttributeWeights, [], markedDown(tick, attacking));
  if (shooter === null) return;
  const creator = tick.rng.chance(T.involvement.assistChance.openPlay)
    ? pickPlayer(tick, attacking, T.involvement.creator as PositionWeights, T.involvement.attributeWeights.creator as AttributeWeights, [shooter], markedDown(tick, attacking))
    : null;
  takeShot(tick, attacking, 'openPlay', shooter, creator, 1);
}

function resolveTurnover(tick: Tick, attacking: Side): void {
  const defending = otherSide(attacking);
  const D = sideState(tick.state, defending);
  const A = sideState(tick.state, attacking);
  const tackler = pickPlayer(tick, defending, T.involvement.tackler as PositionWeights, T.involvement.attributeWeights.tackler as AttributeWeights, []);
  if (tackler !== null) {
    D.stats.tackles += 1;
    ensurePlayerStats(D, tackler).tackles += 1;
  }

  const C = T.move.counter;
  const paceEdge = unitAttribute(D, tick.formation[defending], tick.ctx, 'attacker', 'pac') - unitAttribute(A, tick.formation[attacking], tick.ctx, 'defender', 'pac');
  const paceFactor = Math.max(0, 1 + (C.paceWeight * paceEdge) / C.paceScale);
  let pCounter = C.base * (D.tactics.counterAttack ? C.withCounterTactic : 1) * byDial(C.line, A.tactics.defensiveLine) * paceFactor;
  pCounter += byDial(C.highPressChance, D.tactics.pressing);
  if (!tick.rng.chance(Math.min(C.max, pCounter))) return;

  const shooter = pickPlayer(tick, defending, T.involvement.shooter.counter as PositionWeights, T.involvement.attributeWeights.shooterCounter as AttributeWeights, [], markedDown(tick, defending));
  if (shooter === null) return;
  const creator = tick.rng.chance(T.involvement.assistChance.counter)
    ? pickPlayer(tick, defending, T.involvement.creator as PositionWeights, T.involvement.attributeWeights.creator as AttributeWeights, [shooter], markedDown(tick, defending))
    : null;
  tick.state.possession = defending;
  takeShot(tick, defending, 'counter', shooter, creator, D.tactics.counterAttack ? C.xgBoostWithTactic : 1);
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

function takeShot(tick: Tick, side: Side, type: ChanceType, shooterId: string, creatorId: string | null, xgMultiplier: number): void {
  const defending = otherSide(side);
  const A = sideState(tick.state, side);
  const D = sideState(tick.state, defending);
  const shooter = tick.ctx.players[shooterId];
  const energy = energyOf(A, shooterId);
  const xg = chanceXg(tick, side, type, shooter, energy, xgMultiplier);

  A.stats.shots += 1;
  A.stats.xg += xg;
  A.chances[type] += 1;
  const shooterStats = ensurePlayerStats(A, shooterId);
  shooterStats.shots += 1;
  shooterStats.xg += xg;
  if (creatorId !== null) ensurePlayerStats(A, creatorId).keyPasses += 1;

  const finishing = (effective(shooter, energy, 'fin') + effective(shooter, energy, 'cmp')) / 2;
  const keeperId = goalkeeperId(D, tick.ctx);
  const skill = 1 + T.shot.finishingWeight * relative(finishing) - T.shot.goalkeeperWeight * relative(goalkeeperQuality(D, tick.ctx));
  const pGoal = clamp(xg * skill, T.shot.minGoalChance, T.shot.maxGoalChance);

  if (tick.rng.chance(pGoal)) {
    scoreGoal(tick, side, shooterId, creatorId, xg, 'goal', type);
    return;
  }

  const pBlocked = clamp(T.shot.blocked.base * (1 + T.shot.blocked.defenseWeight * relative(tick.strength[defending].defense)), T.shot.blocked.min, T.shot.blocked.max);
  if (tick.rng.chance(pBlocked)) {
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'chance', side, playerId: shooterId, secondaryPlayerId: creatorId, xg, variant: 'blocked', highlight: xg >= T.highlight.chanceXg });
    return;
  }

  const weather = T.weather[tick.state.setup.weather];
  const pOnTarget = clamp(T.shot.onTargetIfNotGoal.base * (1 + T.shot.onTargetIfNotGoal.finishingWeight * relative(finishing)) * weather.onTarget, T.shot.onTargetIfNotGoal.min, T.shot.onTargetIfNotGoal.max);
  if (tick.rng.chance(pOnTarget)) {
    A.stats.shotsOnTarget += 1;
    shooterStats.shotsOnTarget += 1;
    D.stats.saves += 1;
    if (keeperId !== null) ensurePlayerStats(D, keeperId).saves += 1;
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'save', side, playerId: shooterId, secondaryPlayerId: keeperId, xg, highlight: xg >= T.highlight.saveXg });
    return;
  }
  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'chance', side, playerId: shooterId, secondaryPlayerId: creatorId, xg, variant: 'offTarget', highlight: xg >= T.highlight.chanceXg });
}

function chanceXg(tick: Tick, side: Side, type: ChanceType, shooter: Player, energy: number, multiplier: number): number {
  const spec = T.shot.xg[type];
  if (type === 'penalty') return spec.mean;
  const A = sideState(tick.state, side);
  const weather = T.weather[tick.state.setup.weather];
  // Log-normal spread around the mean so most chances are half-chances and a few are sitters.
  let xg = spec.mean * Math.exp(tick.rng.normal(0, spec.sigma) - (spec.sigma * spec.sigma) / 2) * multiplier;
  const shooterQuality = weightedAttributes(shooter, energy, shooterWeights(type));
  xg *= 1 + T.shot.qualityXgWeight * (relative(shooterQuality) - relative(tick.strength[otherSide(side)].defense));
  xg *= byDial(T.shot.widthXg, A.tactics.width) * byDial(T.shot.directnessXg, A.tactics.directness) * weather.xg;
  if (type === 'setPiece') xg *= weather.setPieceXg;
  return clamp(xg, spec.min, spec.max);
}

function shooterWeights(type: ChanceType): AttributeWeights {
  const W = T.involvement.attributeWeights;
  if (type === 'counter') return W.shooterCounter as AttributeWeights;
  if (type === 'setPiece') return W.shooterSetPiece as AttributeWeights;
  return W.shooterOpenPlay as AttributeWeights;
}

function scoreGoal(tick: Tick, side: Side, scorerId: string, creatorId: string | null, xg: number, type: 'goal' | 'penaltyScored', chance: ChanceType): void {
  const A = sideState(tick.state, side);
  if (side === 'home') tick.state.homeScore += 1;
  else tick.state.awayScore += 1;
  A.stats.goals += 1;
  A.stats.shotsOnTarget += 1;
  const scorer = ensurePlayerStats(A, scorerId);
  scorer.goals += 1;
  scorer.shotsOnTarget += 1;
  if (creatorId !== null) ensurePlayerStats(A, creatorId).assists += 1;
  const variant = chance === 'counter' ? 'counter' : undefined;
  emitEvent(tick.state, tick.ctx, tick.rng, { type, side, playerId: scorerId, secondaryPlayerId: creatorId, xg, highlight: true, ...(variant ? { variant } : {}) });
}

function resolvePenalty(tick: Tick, side: Side): void {
  const defending = otherSide(side);
  const A = sideState(tick.state, side);
  const D = sideState(tick.state, defending);
  const takerId = setPieceTaker(tick, side, 'penalties');
  if (takerId === null) return;
  const taker = tick.ctx.players[takerId];
  const energy = energyOf(A, takerId);
  const xg = T.shot.xg.penalty.mean;
  A.stats.shots += 1;
  A.stats.xg += xg;
  A.chances.penalty += 1;
  const takerStats = ensurePlayerStats(A, takerId);
  takerStats.shots += 1;
  takerStats.xg += xg;

  const keeperId = goalkeeperId(D, tick.ctx);
  const technique = (effective(taker, energy, 'spk') + effective(taker, energy, 'cmp')) / 2;
  const skill = 1 + T.shot.finishingWeight * relative(technique) - T.shot.goalkeeperWeight * relative(goalkeeperQuality(D, tick.ctx));
  if (tick.rng.chance(clamp(xg * skill, T.shot.minGoalChance, T.shot.maxGoalChance))) {
    scoreGoal(tick, side, takerId, null, xg, 'penaltyScored', 'penalty');
    return;
  }
  if (tick.rng.chance(T.setPiece.penaltySavedShareOfMisses)) {
    A.stats.shotsOnTarget += 1;
    takerStats.shotsOnTarget += 1;
    D.stats.saves += 1;
    if (keeperId !== null) ensurePlayerStats(D, keeperId).saves += 1;
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'penaltySaved', side, playerId: takerId, secondaryPlayerId: keeperId, xg, highlight: true });
    return;
  }
  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'penaltyMissed', side, playerId: takerId, secondaryPlayerId: keeperId, xg, highlight: true });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Rolls a straight red, then a yellow; a second yellow sends the player off. */
export function bookPlayer(tick: Tick, side: Side, playerId: string, pYellow: number, pRed: number): void {
  const S = sideState(tick.state, side);
  if (tick.rng.chance(pRed)) {
    sendOff(tick, side, playerId);
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'redCard', side, playerId, highlight: true });
    return;
  }
  if (!tick.rng.chance(pYellow)) return;
  S.yellows[playerId] = (S.yellows[playerId] ?? 0) + 1;
  S.stats.yellowCards += 1;
  ensurePlayerStats(S, playerId).yellowCards += 1;
  if (S.yellows[playerId] >= 2) {
    sendOff(tick, side, playerId);
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'secondYellow', side, playerId, highlight: true });
    return;
  }
  emitEvent(tick.state, tick.ctx, tick.rng, { type: 'yellowCard', side, playerId });
}

function sendOff(tick: Tick, side: Side, playerId: string): void {
  const S = sideState(tick.state, side);
  const slot = S.onPitch.indexOf(playerId);
  if (slot >= 0) S.onPitch[slot] = '';
  S.sentOff.push(playerId);
  S.stats.redCards += 1;
  ensurePlayerStats(S, playerId).redCards += 1;
  tick.strength[side] = sideStrength(S, tick.formation[side], tick.ctx);
}

// ---------------------------------------------------------------------------
// Injuries, fatigue and bookkeeping
// ---------------------------------------------------------------------------

function rollInjuries(tick: Tick): void {
  const I = T.injury;
  const weather = T.weather[tick.state.setup.weather];
  for (const side of ['home', 'away'] as const) {
    if (!tick.rng.chance(I.perMinutePerSide * weather.injury)) continue;
    const S = sideState(tick.state, side);
    const alreadyHurt = tick.state.injuries.map((i) => i.playerId);
    const victim = pickPlayer(tick, side, T.involvement.injured as PositionWeights, {}, alreadyHurt, (id) => {
      const player = tick.ctx.players[id];
      const fragility = 1 - I.durabilityWeight * relative(player.attributes.dur);
      const tiredness = 1 + I.fatigueWeight * (1 - energyOf(S, id));
      return Math.max(I.minWeight, fragility * tiredness);
    });
    if (victim === null) continue;
    const weeks = tick.rng.weighted(I.weeksWeights, (w) => w[1])[0];
    tick.state.injuries.push({ playerId: victim, weeks });
    S.fatigue[victim] = T.fatigue.injuredEnergy;
    emitEvent(tick.state, tick.ctx, tick.rng, { type: 'injury', side, playerId: victim, highlight: true });
  }
}

function bookMinute(tick: Tick, attacking: Side): void {
  const ticksPlayed = tick.state.minute + tick.state.addedTotal;
  for (const side of ['home', 'away'] as const) {
    const S = sideState(tick.state, side);
    drainFatigue(tick, S);
    for (const id of S.onPitch) {
      if (id !== '') ensurePlayerStats(S, id).minutes += 1;
    }
    const inPossession = side === attacking ? 1 : 0;
    S.stats.possession = (S.stats.possession * (ticksPlayed - 1) + inPossession) / ticksPlayed;
  }
  bookPasses(tick, attacking);
}

function drainFatigue(tick: Tick, S: SideState): void {
  const F = T.fatigue;
  const weather = T.weather[tick.state.setup.weather];
  const tacticsCost = 1 + byDial(F.pressingCost, S.tactics.pressing) + byDial(F.tempoCost, S.tactics.tempo);
  for (const id of S.onPitch) {
    if (id === '') continue;
    const player = tick.ctx.players[id];
    const relief = 1 - (F.staminaRelief * player.attributes.sta) / T.attributes.scale;
    const effort = 1 + F.workRateCost * relative(player.attributes.wrk);
    const role = player.position === 'GK' ? F.goalkeeperMultiplier : 1;
    const drain = F.baseDrainPerMinute * relief * effort * tacticsCost * weather.fatigue * role;
    S.fatigue[id] = Math.max(F.minEnergy, energyOf(S, id) - drain);
  }
}

function bookPasses(tick: Tick, attacking: Side): void {
  const P = T.passing;
  const S = sideState(tick.state, attacking);
  const weather = T.weather[tick.state.setup.weather];
  const passes = P.perPossessionTick * byDial(P.tempo, S.tactics.tempo) * byDial(P.directness, S.tactics.directness);
  const accuracy = clamp(
    P.accuracyBase + P.accuracySkillWeight * relative(tick.strength[attacking].midfield) + byDial(P.accuracyDirectness, S.tactics.directness) + weather.passAccuracy,
    P.accuracyMin,
    P.accuracyMax,
  );
  const before = S.stats.passes;
  S.stats.passes = before + passes;
  S.stats.passAccuracy = (S.stats.passAccuracy * before + accuracy * passes) / S.stats.passes;

  const shares = P.positionShare as PositionWeights;
  let shareSum = 0;
  S.onPitch.forEach((id, index) => {
    if (id !== '') shareSum += shares[playedPosition(tick, S, index)];
  });
  if (shareSum <= 0) return;
  S.onPitch.forEach((id, index) => {
    if (id === '') return;
    ensurePlayerStats(S, id).passes += (passes * shares[playedPosition(tick, S, index)]) / shareSum;
  });
}

// ---------------------------------------------------------------------------
// Player selection helpers
// ---------------------------------------------------------------------------

/** Where a player is playing: the slot's position, except a goalkeeper is always a goalkeeper. */
function playedPosition(tick: Tick, S: SideState, slotIndex: number): Position {
  const player = tick.ctx.players[S.onPitch[slotIndex]];
  if (player.position === 'GK') return 'GK';
  const side: Side = S === tick.state.home ? 'home' : 'away';
  return tick.formation[side].slots[slotIndex].position;
}

/**
 * Picks an on-pitch player by position weight times attribute quality, with
 * any caller adjustment applied. Null when nobody qualifies.
 */
function pickPlayer(
  tick: Tick,
  side: Side,
  positionWeights: PositionWeights,
  attributeWeights: AttributeWeights,
  exclude: readonly string[],
  adjust?: (id: string) => number,
): string | null {
  const S = sideState(tick.state, side);
  const candidates: { id: string; weight: number }[] = [];
  S.onPitch.forEach((id, index) => {
    if (id === '' || exclude.includes(id)) return;
    const player = tick.ctx.players[id];
    let weight = positionWeights[playedPosition(tick, S, index)];
    if (Object.keys(attributeWeights).length > 0) weight *= weightedAttributes(player, energyOf(S, id), attributeWeights) / T.attributes.scale;
    if (adjust) weight *= adjust(id);
    candidates.push({ id, weight });
  });
  if (candidates.length === 0) return null;
  return tick.rng.weighted(candidates, (c) => c.weight).id;
}

/** Shooting and creating weight for the attacking side: the player the opponent man-marks gets fewer touches. */
function markedDown(tick: Tick, side: Side): (id: string) => number {
  const target = sideState(tick.state, otherSide(side)).tactics.manMarkTarget;
  return (id) => (id === target ? T.manMarking.targetInvolvement : 1);
}

/** The nominated taker if he is on the pitch, else the best set-piece player available. */
function setPieceTaker(tick: Tick, side: Side, kind: 'penalties' | 'freeKicks' | 'corners'): string | null {
  const S = sideState(tick.state, side);
  const nominated = S.tactics.setPieceTakers[kind];
  if (nominated && S.onPitch.includes(nominated)) return nominated;
  let best: string | null = null;
  let bestScore = -1;
  for (const id of S.onPitch) {
    if (id === '') continue;
    const player = tick.ctx.players[id];
    if (player.position === 'GK' && kind !== 'penalties') continue;
    const score = kind === 'corners' ? (player.attributes.spk + player.attributes.crs) / 2 : player.attributes.spk;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best ?? S.onPitch.find((id) => id !== '') ?? null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

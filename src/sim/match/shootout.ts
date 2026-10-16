/**
 * Penalty shootout: five kicks each, then sudden death. Runs as a single
 * engine step once extra time ends level.
 */
import { MATCH_TUNING } from '../data';
import type { Rng } from '../rng';
import type { Side } from '../types';
import { shootoutKickLabel } from './commentary';
import { emitEvent, nameOf } from './events';
import { finish } from './clock';
import { otherSide, sideState, type MatchContext, type MatchState } from './state';
import { effective, energyOf, goalkeeperId, goalkeeperQuality, relative } from './strength';

const T = MATCH_TUNING;
const S = T.shootout;

export function runShootout(state: MatchState, ctx: MatchContext, rng: Rng): void {
  const minute = T.clock.shootoutMinute;
  state.minute = minute;
  state.added = 0;
  state.shootout = state.shootout ?? { home: 0, away: 0, kicks: 0 };
  emitEvent(state, ctx, rng, { type: 'shootoutStart', side: null, minute });

  const first: Side = rng.chance(S.firstKickHomeChance) ? 'home' : 'away';
  const order: Side[] = [first, otherSide(first)];
  const takers = { home: kickOrder(state, ctx, 'home'), away: kickOrder(state, ctx, 'away') };
  const taken = { home: 0, away: 0 };

  let winner: Side | null = null;
  for (let round = 0; round < S.maxRounds && winner === null; round++) {
    for (const side of order) {
      const list = takers[side];
      if (list.length === 0) continue;
      const takerId = list[taken[side] % list.length];
      taken[side] += 1;
      kick(state, ctx, rng, side, takerId, minute);
      winner = decided(state, taken, round);
      if (winner !== null) break;
    }
  }
  if (winner === null) winner = rng.chance(S.firstKickHomeChance) ? 'home' : 'away';

  const score = state.shootout;
  emitEvent(state, ctx, rng, {
    type: 'shootoutEnd',
    side: winner,
    minute,
    params: { score: winner === 'home' ? `${score.home}-${score.away}` : `${score.away}-${score.home}` },
  });
  finish(state);
}

/** Best set-piece takers first, the nominated penalty taker at the front, the keeper last. */
function kickOrder(state: MatchState, ctx: MatchContext, side: Side): string[] {
  const side_ = sideState(state, side);
  const ids = side_.onPitch.filter((id) => id !== '');
  const nominated = side_.tactics.setPieceTakers.penalties;
  const quality = (id: string) => effective(ctx.players[id], energyOf(side_, id), 'spk') + effective(ctx.players[id], energyOf(side_, id), 'cmp');
  const outfield = ids.filter((id) => ctx.players[id].position !== 'GK').sort((a, b) => quality(b) - quality(a) || (a < b ? -1 : 1));
  const keepers = ids.filter((id) => ctx.players[id].position === 'GK');
  const ordered = [...outfield, ...keepers];
  if (nominated && ordered.includes(nominated)) return [nominated, ...ordered.filter((id) => id !== nominated)];
  return ordered;
}

function kick(state: MatchState, ctx: MatchContext, rng: Rng, side: Side, takerId: string, minute: number): void {
  const defending = sideState(state, otherSide(side));
  const taking = sideState(state, side);
  const keeperId = goalkeeperId(defending, ctx);
  const technique = (effective(ctx.players[takerId], energyOf(taking, takerId), 'spk') + effective(ctx.players[takerId], energyOf(taking, takerId), 'cmp')) / 2;
  const pScore = Math.min(S.maxScore, Math.max(S.minScore, S.scoreBase + S.takerWeight * relative(technique) - S.goalkeeperWeight * relative(goalkeeperQuality(defending, ctx))));
  const shootout = state.shootout!;
  shootout.kicks += 1;
  let outcome: 'scored' | 'saved' | 'missed';
  if (rng.chance(pScore)) {
    shootout[side] += 1;
    outcome = 'scored';
  } else {
    outcome = rng.chance(S.savedShareOfMisses) ? 'saved' : 'missed';
  }
  const detail = shootoutKickLabel(outcome).replace('{secondary}', nameOf(ctx, keeperId));
  emitEvent(state, ctx, rng, {
    type: 'shootoutKick',
    side,
    playerId: takerId,
    secondaryPlayerId: keeperId,
    minute,
    detail,
    highlight: true,
    params: { score: `${shootout.home}-${shootout.away}` },
  });
}

/** The side that can no longer be caught, or null while the shootout is alive. */
function decided(state: MatchState, taken: Record<Side, number>, round: number): Side | null {
  const score = state.shootout!;
  if (round < S.kicksEach) {
    const remainingHome = S.kicksEach - taken.home;
    const remainingAway = S.kicksEach - taken.away;
    if (score.home > score.away + remainingAway) return 'home';
    if (score.away > score.home + remainingHome) return 'away';
    return null;
  }
  // Sudden death: compare only once both sides have kicked in the round.
  if (taken.home !== taken.away) return null;
  if (score.home > score.away) return 'home';
  if (score.away > score.home) return 'away';
  return null;
}

/**
 * Manager actions during a match: substitutions and tactic changes. Both the
 * human owner and the AI head coach go through these, so validation lives here.
 */
import { MATCH_TUNING, formation as formationOf } from '../data';
import type { Rng } from '../rng';
import type { Dial, Player, Side, Tactics } from '../types';
import { mentalityLabel } from './commentary';
import { emitEvent } from './events';
import { assignToSlots, slotAbility } from './lineup';
import { ensurePlayerStats, playersOnPitch, sideState, type MatchContext, type MatchState } from './state';

const T = MATCH_TUNING;

/** Energy a player brings onto the pitch: his condition, with a floor so a wreck can still play. */
export function startEnergy(player: Player): number {
  return Math.max(T.fatigue.minStartEnergy, Math.min(1, player.condition));
}

export function substitute(state: MatchState, ctx: MatchContext, rng: Rng, side: Side, outId: string, inId: string): void {
  assertLive(state);
  const S = sideState(state, side);
  if (S.subsUsed >= T.squad.maxSubs) throw new Error(`${S.teamId} has used all ${T.squad.maxSubs} substitutions`);
  if (!S.bench.includes(inId)) throw new Error(`${inId} is not on the bench`);
  if (S.sentOff.includes(inId) || S.sentOff.includes(outId)) throw new Error(`${inId === outId ? inId : outId} has been sent off`);
  const outSlot = S.onPitch.indexOf(outId);
  if (outSlot < 0) throw new Error(`${outId} is not on the pitch`);
  const incoming = ctx.players[inId];
  if (!incoming) throw new Error(`Unknown player ${inId}`);

  S.bench = S.bench.filter((id) => id !== inId);
  // A replacement keeper goes in goal when the keeper's slot is empty after a sending-off.
  if (incoming.position === 'GK' && S.onPitch[0] === '') {
    S.onPitch[0] = inId;
    S.onPitch[outSlot] = '';
  } else {
    S.onPitch[outSlot] = inId;
  }
  S.subsUsed += 1;
  S.fatigue[inId] = startEnergy(incoming);
  ensurePlayerStats(S, inId);
  emitEvent(state, ctx, rng, { type: 'substitution', side, playerId: outId, secondaryPlayerId: inId });
}

export function changeTactics(state: MatchState, ctx: MatchContext, rng: Rng, side: Side, tactics: Tactics): void {
  assertLive(state);
  const S = sideState(state, side);
  const next = formationOf(tactics.formationId);
  const details: string[] = [];
  if (tactics.formationId !== S.tactics.formationId) {
    S.onPitch = assignToSlots(playersOnPitch(S), next, ctx.players, slotAbility);
    details.push(`switch to a ${next.name}`);
  }
  if (tactics.mentality !== S.tactics.mentality) details.push(`go ${mentalityLabel(tactics.mentality)}`);
  if (tactics.timeWasting > S.tactics.timeWasting) details.push('start running the clock down');
  if (tactics.pressing !== S.tactics.pressing) details.push(tactics.pressing > S.tactics.pressing ? 'press higher' : 'sit off');
  if (details.length === 0) details.push('fresh instructions from the bench');
  S.tactics = { ...tactics, setPieceTakers: { ...tactics.setPieceTakers } };
  emitEvent(state, ctx, rng, { type: 'tacticChange', side, detail: details.join(', ') });
}

export function changeMentality(state: MatchState, ctx: MatchContext, rng: Rng, side: Side, mentality: Dial): void {
  const S = sideState(state, side);
  changeTactics(state, ctx, rng, side, { ...S.tactics, mentality });
}

function assertLive(state: MatchState): void {
  if (state.finished) throw new Error('The match is finished');
  if (state.period === 'shootout') throw new Error('No changes during the shootout');
}

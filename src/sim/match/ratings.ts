/**
 * Match ratings 1-10 from the stats a player produced, the goals his side
 * conceded while he was on and the result.
 */
import { MATCH_TUNING } from '../data';
import { powInt } from '../spatial/det';
import type { Side } from '../types';
import { otherSide, scoreOf, sideState, type MatchContext, type MatchState } from './state';
import { unitOfPosition } from './strength';

const R = MATCH_TUNING.rating;

export function assignRatings(state: MatchState, ctx: MatchContext, winner: Side | null): void {
  const totalMinutes = Math.max(1, longestAppearance(state));
  for (const side of ['home', 'away'] as const) {
    const S = sideState(state, side);
    const conceded = scoreOf(state, otherSide(side));
    const resultBonus = winner === null ? 0 : winner === side ? R.win : R.loss;
    for (const stats of Object.values(S.playerStats)) {
      const player = ctx.players[stats.playerId];
      const unit = unitOfPosition(player.position);
      const share = stats.minutes / totalMinutes;
      let rating = R.base;
      rating += stats.goals * R.goal + stats.assists * R.assist + stats.xg * R.xg;
      rating += stats.keyPasses * R.keyPass + stats.shotsOnTarget * R.shotOnTarget + stats.tackles * R.tackle + stats.saves * R.save;
      rating += stats.yellowCards * R.yellow + stats.redCards * R.red;
      rating += conceded * share * R.concededByUnit[unit];
      if (conceded === 0 && stats.minutes >= R.cleanSheetMinMinutes) rating += R.cleanSheetByUnit[unit];
      rating += penaltyAdjustment(state, stats.playerId);
      rating += resultBonus * share;
      stats.rating = round(Math.min(R.max, Math.max(R.min, rating)));
    }
  }
}

function penaltyAdjustment(state: MatchState, playerId: string): number {
  let total = 0;
  for (const event of state.events) {
    if (event.type === 'penaltySaved' && event.secondaryPlayerId === playerId) total += R.penaltySaved;
    if ((event.type === 'penaltySaved' || event.type === 'penaltyMissed') && event.playerId === playerId) total += R.penaltyMissed;
  }
  return total;
}

function longestAppearance(state: MatchState): number {
  let longest = 0;
  for (const S of [state.home, state.away]) {
    for (const stats of Object.values(S.playerStats)) longest = Math.max(longest, stats.minutes);
  }
  return longest;
}

function round(value: number): number {
  const factor = powInt(10, R.decimals);
  return Math.round(value * factor) / factor;
}

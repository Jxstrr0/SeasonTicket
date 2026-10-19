/** Fixes from the Stage 7.7 launch audit. */
import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import './helpers/quickCareer';
import { C, borrow, createCareer, injectCash, repayDebt, userBooks, type TierId } from '../src/sim/career';
import { SaveError, SAVE_PREFIX, decodeSave, encodeSave } from '../src/game/save';
import { buildSchedule } from '../src/sim/schedule';
import { Rng } from '../src/sim/rng';

function newCareer(seed = 3): ReturnType<typeof createCareer> {
  const tier = C.tiers.order[0] as TierId;
  return createCareer({ seed, teamId: (C.tiers[tier].clubs as string[])[0], tier, homegrownRule: false });
}

describe('7.7 audit fixes', () => {
  it('a save code that inflates to an absurd size is refused, not inflated', () => {
    const bomb = zlibSync(new Uint8Array(80_000_000), { level: 9 });
    const b64 = btoa(String.fromCharCode(...bomb));
    expect(() => decodeSave(SAVE_PREFIX + b64)).toThrow(SaveError);
  });

  it('a normal save code still round-trips', () => {
    const career = newCareer();
    expect(decodeSave(encodeSave(career)).userTeamId).toBe(career.userTeamId);
  });

  it('a missing amount (NaN) is refused by cash, loans and repayments', () => {
    const career = newCareer();
    const before = career.owner.fortune;
    expect(injectCash(career, NaN).ok).toBe(false);
    expect(career.owner.fortune).toBe(before);
    expect(borrow(career, 'nobody', NaN).ok).toBe(false);
    expect(repayDebt(career, 'none', NaN).ok).toBe(false);
    expect(userBooks(career).debts.every((d) => Number.isFinite(d.balance))).toBe(true);
  });

  it('no round of the second half replays the last round of the first', () => {
    const teamIds = Array.from({ length: 16 }, (_, i) => `t${i}`);
    for (let seed = 1; seed <= 12; seed++) {
      const matches = buildSchedule(new Rng(seed), 1, teamIds).matches.filter((m) => m.round >= 15 && m.round <= 16);
      const r15 = new Set(matches.filter((m) => m.round === 15).map((m) => [m.homeId, m.awayId].sort().join('-')));
      const clash = matches.filter((m) => m.round === 16).some((m) => r15.has([m.homeId, m.awayId].sort().join('-')));
      expect(clash).toBe(false);
    }
  });
});

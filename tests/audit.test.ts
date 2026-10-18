/** Fixes from the Stage 5 audit round. */
import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  askingPrice,
  bidForPlayer,
  createCareer,
  ensureUserSelection,
  injectCash,
  matchSelection,
  setTicketPrice,
  squadOf,
  userBooks,
  type Career,
  type TierId,
} from '../src/sim/career';
import { isDomestic } from '../src/sim/data';
import { teamById } from '../src/sim/league';
import { Rng } from '../src/sim/rng';

function newCareer(homegrownRule = false): Career {
  const tier = (C.tiers.order as TierId[])[0];
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed: 5, teamId: club, tier, homegrownRule });
}

describe('audit fixes', () => {
  it('a counter-offer cannot be walked down by lower and lower bids', () => {
    const career = newCareer();
    injectCash(career, Math.min(career.owner.fortune, 50_000_000));
    const other = career.season.league.teams.find((t) => t.id !== career.userTeamId)!;
    const target = squadOf(career, other.id).filter((p) => p.position !== 'GK').sort((a, b) => b.value - a.value)[0];
    const asking = askingPrice(career, target);
    let bid = Math.round(asking * 0.85);
    const counters: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = bidForPlayer(career, target.id, bid, 2);
      expect(r.ok).toBe(false);
      if (r.counter) counters.push(r.counter);
      bid = Math.round(bid * 0.9);
    }
    expect(counters.length).toBeGreaterThan(0);
    // The club holds its first counter, and won't haggle below its floor at all.
    expect(new Set(counters).size).toBe(1);
    expect(Math.min(...counters)).toBeGreaterThanOrEqual(asking * C.transfers.counterShare);
  });

  it('a ticket price that is not a number changes nothing', () => {
    const career = newCareer();
    const before = userBooks(career).ticketPrice;
    expect(setTicketPrice(career, Number.NaN).ok).toBe(false);
    expect(userBooks(career).ticketPrice).toBe(before);
  });

  it("the homegrown rule holds for the owner's own pick", () => {
    const career = newCareer(true);
    const league = career.season.league;
    const sel = ensureUserSelection(career);
    // Swap every Valmeran starter for a foreign squad player, where there are enough.
    const foreign = squadOf(career, career.userTeamId).filter((p) => !isDomestic(p.nationality) && !sel.lineup.starters.includes(p.id));
    sel.lineup.starters = sel.lineup.starters.map((id) => (isDomestic(league.players[id].nationality) && foreign.length ? foreign.pop()!.id : id));
    expect(sel.lineup.starters.filter((id) => isDomestic(league.players[id].nationality)).length).toBeLessThan(6);
    const opponent = teamById(league, league.teams.find((t) => t.id !== career.userTeamId)!.id);
    const picked = matchSelection(career, new Rng(1), opponent);
    const domestic = picked.lineup.starters.filter((id) => isDomestic(league.players[id].nationality)).length;
    expect(domestic).toBeGreaterThanOrEqual(Math.min(6, squadOf(career, career.userTeamId).filter((p) => isDomestic(p.nationality)).length));
    expect(domestic).toBeGreaterThanOrEqual(6);
    expect(new Set([...picked.lineup.starters, ...picked.lineup.bench]).size).toBe(picked.lineup.starters.length + picked.lineup.bench.length);
  });
});

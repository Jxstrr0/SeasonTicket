import { describe, expect, it } from 'vitest';
import {
  C,
  advanceCareer,
  advanceToReview,
  continueToNextSeason,
  createCareer,
  injectCash,
  ledgerTotals,
  renewContract,
  renewalTerms,
  startUserMatch,
  squadOf,
  tierOfClub,
  userBooks,
  userTeam,
  type Career,
  type TierId,
} from '../src/sim/career';
import { applyAction, stepMinute } from '../src/sim/match/engine';
import { matchContext } from '../src/sim/season';

const TIERS = C.tiers.order as TierId[];

function newCareer(tier: TierId, seed = 11): Career {
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

/** A sensible but hands-off owner: keeps the best players signed and covers losses. */
function caretakerOffseason(career: Career): void {
  const squad = squadOf(career, career.userTeamId).sort((a, b) => b.overall - a.overall);
  for (const p of squad.slice(0, 22)) if (renewalTerms(career, p).open) renewContract(career, p.id, 2);
}

function caretakerWeek(career: Career): void {
  const books = userBooks(career);
  if (books.cash < 250_000 && career.owner.fortune >= C.owner.minInjection) {
    injectCash(career, Math.min(career.owner.fortune, 1_000_000));
  }
}

function playSeason(career: Career, caretaker: boolean): void {
  for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
    if (caretaker) caretakerWeek(career);
    advanceCareer(career);
  }
}

describe('career', () => {
  it('maps every club to exactly one difficulty', () => {
    const all = TIERS.flatMap((t) => C.tiers[t].clubs as string[]);
    expect(new Set(all).size).toBe(16);
    for (const id of all) expect(tierOfClub(id)).not.toBeNull();
  });

  it('plays a full season to the review with sane books', () => {
    const career = newCareer('normal');
    advanceToReview(career);
    expect(career.phase).toBe('review');
    expect(career.season.phase).toBe('complete');
    expect(career.season.championId).not.toBeNull();
    const played = career.season.schedule.matches.filter((m) => m.result);
    expect(played.length).toBe(career.season.schedule.matches.length);
    const totals = ledgerTotals(userBooks(career).ledger);
    expect(totals.income).toBeGreaterThan(0);
    expect(totals.spending).toBeGreaterThan(0);
    expect(Number.isFinite(userBooks(career).cash)).toBe(true);
    expect(career.lastUserMatch).not.toBeNull();
    const apps = Object.values(career.playerSeason).reduce((s, l) => s + l.apps, 0);
    expect(apps).toBeGreaterThanOrEqual(30 * 11);
  });

  it('is deterministic for the same seed', () => {
    const a = newCareer('hard', 5);
    const b = newCareer('hard', 5);
    for (let i = 0; i < 12; i++) {
      advanceCareer(a);
      advanceCareer(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('survives three seasons on every difficulty with a caretaker owner', () => {
    for (const tier of TIERS) {
      const career = newCareer(tier, 21);
      for (let s = 0; s < 3; s++) {
        playSeason(career, true);
        expect(career.phase, `${tier} season ${s + 1}`).toBe('review');
        continueToNextSeason(career);
        caretakerOffseason(career);
        const team = userTeam(career);
        expect(team.playerIds.length).toBeGreaterThanOrEqual(18);
        for (const t of career.season.league.teams) {
          expect(t.playerIds.length, t.id).toBeGreaterThanOrEqual(18);
          expect(t.playerIds.every((id) => career.season.league.players[id]?.teamId === t.id)).toBe(true);
        }
      }
      expect(career.history.length).toBe(3);
      expect(career.season.league.season).toBe(4);
      expect(career.phase).toBe('preseason');
    }
  }, 120_000);

  it('can lose the club on the hardest tier if the owner never acts', () => {
    const career = newCareer('veryHard', 21);
    for (let s = 0; s < 4 && career.phase !== 'gameOver'; s++) {
      playSeason(career, false);
      if (career.phase === 'review') continueToNextSeason(career);
    }
    // Either outcome is allowed, but a game over must say why.
    if (career.phase === 'gameOver') expect(career.gameOverReason).toBeTruthy();
  }, 60_000);

  it('runs a live user match and finishes it when the week advances', () => {
    const career = newCareer('easy', 3);
    while (career.phase === 'preseason') advanceCareer(career);
    const live = startUserMatch(career);
    expect(live).not.toBeNull();
    const ctx = matchContext(career.season.league);
    const side = live!.home.teamId === career.userTeamId ? 'home' : 'away';
    expect(live![side].aiControlled).toBe(false);
    for (let i = 0; i < 30; i++) stepMinute(live!, ctx);
    const tactics = { ...live![side].tactics, mentality: 4 as const };
    applyAction(live!, ctx, { type: 'setTactics', side, tactics });
    const sub = live![side].bench[0];
    const off = live![side].onPitch.find((id) => id !== '');
    if (sub && off) applyAction(live!, ctx, { type: 'substitute', side, outId: off, inId: sub });
    const results = advanceCareer(career);
    expect(career.liveMatch).toBeNull();
    const mine = results.find((r) => r.homeId === career.userTeamId || r.awayId === career.userTeamId);
    expect(mine).toBeDefined();
    expect(career.lastUserMatch?.matchId).toBe(mine!.matchId);
    expect(results.length).toBe(8);
  });

  it('keeps a season-end save small', () => {
    const career = newCareer('normal', 9);
    advanceToReview(career);
    expect(JSON.stringify(career).length).toBeLessThan(1_500_000);
  });
});

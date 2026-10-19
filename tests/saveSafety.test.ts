import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import { C, advanceCareer, advanceToReview, continueToNextSeason, createCareer, matchLock, releasePlayer, signFreeAgent, squadOf, startUserMatch, type Career } from '../src/sim/career';
import { BACKUP_KEY, STORAGE_KEY, SaveError, backupSavedCareer, decodeSave, encodeSave, hasBackup, saveCareer, swapBackup, type SaveStore } from '../src/game/save';
import { careerProblem } from '../src/game/saveCheck';
import { playToEnd } from '../src/game/matchday';

function newCareer(seed = 31, tier: 'easy' | 'normal' = 'normal'): Career {
  return createCareer({ seed, teamId: (C.tiers[tier].clubs as string[])[0], tier, homegrownRule: false });
}

function memoryStore(limit = Infinity): SaveStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  const used = (): number => Object.values(data).reduce((a, v) => a + v.length, 0);
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      if (used() - (data[k]?.length ?? 0) + v.length > limit) throw new Error('QuotaExceededError');
      data[k] = v;
    },
    removeItem: (k) => void delete data[k],
  };
}

/** A save code with one change made to the career's JSON, as a player editing it by hand would. */
function edited(career: Career, edit: (c: any) => void): string {
  const copy = JSON.parse(JSON.stringify(career));
  edit(copy);
  return encodeSave(copy);
}

describe('save check (Stage 7.8)', () => {
  it('passes real careers at every stage of a season and the next', () => {
    const career = newCareer();
    expect(careerProblem(career)).toBeNull();
    while (career.phase === 'preseason') advanceCareer(career);
    startUserMatch(career);
    expect(careerProblem(career)).toBeNull();
    for (let i = 0; i < 8; i++) {
      advanceCareer(career);
      expect(careerProblem(career), `week ${career.weekIndex}`).toBeNull();
    }
    advanceToReview(career);
    expect(careerProblem(career)).toBeNull();
    continueToNextSeason(career);
    expect(careerProblem(career)).toBeNull();
    expect(careerProblem(decodeSave(encodeSave(career)))).toBeNull();
  }, 60_000);

  it('refuses hand-edited codes that would break the game', () => {
    const career = newCareer();
    const user = career.userTeamId;
    const somePlayer = squadOf(career, user)[0].id;
    const breaks: [string, (c: any) => void][] = [
      ['cash as words', (c) => (c.books[user].cash = 'lots')],
      ['cash missing', (c) => delete c.books[user].cash],
      ['a club with no books', (c) => delete c.books[c.season.league.teams[3].id]],
      ['a player missing', (c) => delete c.season.league.players[somePlayer]],
      ['an attribute as words', (c) => (c.season.league.players[somePlayer].attributes.pac = 'fast')],
      ['a wage of null', (c) => (c.season.league.players[somePlayer].contract.wage = null)],
      ['an unknown position', (c) => (c.season.league.players[somePlayer].position = 'XX')],
      ['a fixture against no one', (c) => (c.season.schedule.matches[0].awayId = 'nobody')],
      ['an unknown phase', (c) => (c.phase = 'party')],
      ['the fortune as a string', (c) => (c.owner.fortune = '1e9')],
      ['the squad list as a string', (c) => (c.season.league.teams[0].playerIds = 'p1,p2')],
      ['the inbox missing', (c) => delete c.inbox],
    ];
    for (const [what, edit] of breaks) expect(() => decodeSave(edited(career, edit)), what).toThrow(SaveError);
  });

  it('still loads an edit that keeps the shape, such as more cash', () => {
    const career = newCareer();
    const code = edited(career, (c) => (c.books[career.userTeamId].cash = 99_000_000));
    expect(decodeSave(code).books[career.userTeamId].cash).toBe(99_000_000);
  });
});

describe('backup career (Stage 7.8)', () => {
  it('puts the saved career aside, and a restore swaps the two so it can be undone', () => {
    const store = memoryStore();
    const a = newCareer(1);
    const b = newCareer(2, 'easy');
    expect(backupSavedCareer(store)).toBe(false);
    saveCareer(a, store);
    expect(backupSavedCareer(store)).toBe(true);
    saveCareer(b, store);
    expect(hasBackup(store)).toBe(true);
    expect(swapBackup(store)).toBe(true);
    expect(decodeSave(store.data[STORAGE_KEY]).seed).toBe(1);
    expect(decodeSave(store.data[BACKUP_KEY]).seed).toBe(2);
    expect(swapBackup(store)).toBe(true);
    expect(decodeSave(store.data[STORAGE_KEY]).seed).toBe(2);
  });

  it('will not restore a damaged backup, and changes nothing', () => {
    const store = memoryStore();
    saveCareer(newCareer(1), store);
    const main = store.data[STORAGE_KEY];
    store.data[BACKUP_KEY] = 'ST1:broken';
    expect(swapBackup(store)).toBe(false);
    expect(store.data[STORAGE_KEY]).toBe(main);
  });

  it('drops the backup rather than fail to save the career being played', () => {
    const career = newCareer(1);
    const size = encodeSave(career).length;
    const store = memoryStore(size * 1.5);
    saveCareer(career, store);
    backupSavedCareer(store);
    advanceCareer(career);
    expect(saveCareer(career, store)).toBe(true);
    expect(hasBackup(store)).toBe(false);
    expect(decodeSave(store.data[STORAGE_KEY]).weekIndex).toBe(career.weekIndex);
  });
});

describe('match lock (Stage 7.8)', () => {
  it('refuses squad changes while the match is under way, paused or not, and allows them after', () => {
    const career = newCareer(5, 'easy');
    while (career.phase === 'preseason') advanceCareer(career);
    const live = startUserMatch(career);
    expect(live).not.toBeNull();
    const mine = squadOf(career, career.userTeamId).sort((x, y) => x.overall - y.overall)[0];
    const res = releasePlayer(career, mine.id);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/under way/);
    const free = career.season.league.freeAgentIds[0];
    if (free) expect(signFreeAgent(career, free, 1).ok).toBe(false);
    expect(matchLock(career)).toMatch(/under way/);
    playToEnd(career);
    expect(career.liveMatch?.finished).toBe(true);
    expect(matchLock(career)).toBeNull();
    expect(releasePlayer(career, mine.id).message).not.toMatch(/under way/);
  });
});

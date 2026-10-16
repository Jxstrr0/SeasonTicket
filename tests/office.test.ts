/**
 * The 3D office draws only from a plain snapshot, and the graphics setting
 * lives outside the save. Both run in Node with no three.js.
 */
import { describe, expect, it } from 'vitest';
import { C, createCareer, type Career, type SeasonHistoryEntry, type TierId } from '../src/sim/career';
import { QUALITY_TIERS, defaultQuality, isQualitySetting, loadQuality, looksLikePhone } from '../src/render/quality';
import { buildOfficeSnapshot, officeLevel, officeTrophies, officeVisitor } from '../src/ui/career/office';

function newCareer(seed = 7): Career {
  const tier: TierId = 'normal';
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

function season(patch: Partial<SeasonHistoryEntry>): SeasonHistoryEntry {
  return {
    season: 1, position: 8, points: 40, championName: null, shieldName: null, playoff: 'none',
    profit: 0, cashAtEnd: 0, topScorer: null, ...patch,
  };
}

describe('graphics quality', () => {
  it('defaults to Medium on phones and High on desktop', () => {
    expect(defaultQuality({ coarse: true, shortSide: 390 })).toBe('medium');
    expect(defaultQuality({ coarse: false, shortSide: 1080 })).toBe('high');
    expect(looksLikePhone({ coarse: false, shortSide: 500 })).toBe(true);
    expect(looksLikePhone({ coarse: true, shortSide: 1200 })).toBe(true);
  });

  it('accepts only known settings', () => {
    for (const s of ['low', 'medium', 'high', 'off']) expect(isQualitySetting(s)).toBe(true);
    for (const s of ['ultra', '', null, 3]) expect(isQualitySetting(s)).toBe(false);
  });

  it('loads a default without browser storage', () => {
    expect(isQualitySetting(loadQuality())).toBe(true);
  });

  it('gets cheaper from High to Low', () => {
    const { low, medium, high } = QUALITY_TIERS;
    expect(low.pixelRatio).toBeLessThanOrEqual(medium.pixelRatio);
    expect(medium.pixelRatio).toBeLessThanOrEqual(high.pixelRatio);
    expect(low.detail).toBeLessThan(high.detail);
    expect(low.bloom).toBe(false);
    expect(medium.bloom).toBe(false);
  });
});

describe('office snapshot', () => {
  it('grows with seasons and trophies', () => {
    expect(officeLevel(0, 0)).toBe(0);
    expect(officeLevel(1, 0)).toBe(1);
    expect(officeLevel(1, 1)).toBe(2);
    expect(officeLevel(3, 0)).toBe(2);
    expect(officeLevel(3, 2)).toBe(3);
  });

  it('fills the trophy case from the club history', () => {
    const career = newCareer();
    career.history = [
      season({ season: 1, position: 1, playoff: 'champion' }),
      season({ season: 2, position: 4, playoff: 'runnerUp' }),
      season({ season: 3, position: 9 }),
    ];
    const kinds = officeTrophies(career).map((t) => `${t.kind}${t.season}`);
    expect(kinds).toEqual(['cup1', 'shield1', 'runnerUp2']);
    expect(buildOfficeSnapshot(career).level).toBe(3);
  });

  it('brings the newest unread visitor to the door', () => {
    const career = newCareer();
    const mail = (id: string, kind: Career['inbox'][number]['kind'], read = false) =>
      ({ id, weekIndex: 0, season: 1, kind, title: id, body: '', read });
    career.inbox = [mail('a', 'bid'), mail('b', 'ladder'), mail('c', 'match', true)];
    expect(officeVisitor(career)).toEqual({ mailId: 'b', role: 'lender', title: 'b' });
    career.inbox[1].read = true;
    expect(officeVisitor(career)?.role).toBe('agent');
    career.inbox[0].read = true;
    expect(officeVisitor(career)).toBeNull();
  });

  it('describes a new career without touching the render code', () => {
    const career = newCareer();
    const snap = buildOfficeSnapshot(career);
    expect(snap.table).toHaveLength(16);
    expect(snap.table.filter((r) => r.user)).toHaveLength(1);
    expect(snap.slots).toHaveLength(11);
    expect(snap.crestSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(snap.trophies).toEqual([]);
    expect(snap.level).toBe(0);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

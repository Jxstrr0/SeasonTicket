import { describe, expect, it } from 'vitest';
import { advanceCareer, createCareer, orderProject, stadiumOptions, type Career } from '../src/sim/career';
import {
  CORNER_NEIGHBOURS,
  cornerPath,
  cornerProfile,
  crowdFigures,
  pathAt,
  pathLength,
  segNormal,
  signedArea,
  standPath,
  standProfile,
} from '../src/render/stadium/layout';
import { CORNER_KEYS, STAND_KEYS } from '../src/render/stadium/types';
import { buildStadiumSnapshot } from '../src/ui/career/stadiumSnapshot';

const LEVELS = [0, 1, 2, 3, 4];

describe('stadium layout', () => {
  it('builds every stand profile clockwise, with the front wall facing the pitch', () => {
    for (const level of LEVELS) {
      for (const boxRows of [0, 1, 2]) {
        for (const ribbons of [false, true]) {
          const p = standProfile(level, boxRows, ribbons);
          expect(signedArea(p.points)).toBeLessThan(0);
          const front = p.segs[0];
          expect(front.a.d).toBeCloseTo(0, 6);
          expect(segNormal(front).d).toBeLessThan(-0.9);
          expect(p.depth).toBeGreaterThan(0);
          expect(p.height).toBeGreaterThan(0);
          // Seats face up and climb towards the back (an upper tier overhangs the one below).
          for (const s of p.segs.filter((x) => x.kind === 'tread')) expect(segNormal(s).y).toBeGreaterThan(0.9);
          for (let i = 1; i < p.rows.length; i++) {
            expect(p.rows[i].y).toBeGreaterThan(p.rows[i - 1].y);
            if (p.rows[i].tier === p.rows[i - 1].tier) expect(p.rows[i].d0).toBeGreaterThanOrEqual(p.rows[i - 1].d1 - 1e-6);
          }
          // Everything stays inside the footprint.
          for (const pt of p.points) {
            expect(pt.d).toBeGreaterThanOrEqual(-1e-6);
            expect(pt.d).toBeLessThanOrEqual(p.depth + 1e-6);
            expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
          }
        }
      }
    }
  });

  it('makes bigger stands deeper and taller, within a sensible size', () => {
    const sizes = LEVELS.map((l) => standProfile(l, 0));
    expect(sizes[0].standing).toBe(true);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i].standing).toBe(false);
      expect(sizes[i].height).toBeGreaterThan(sizes[i - 1].height);
      // A grass bank is wider than the first small stand, which replaces it.
      if (i > 1) expect(sizes[i].depth).toBeGreaterThan(sizes[i - 1].depth);
    }
    expect(sizes[4].depth).toBeLessThan(45);
    expect(sizes[4].height).toBeLessThan(45);
    // Boxes make a stand taller, not shallower.
    expect(standProfile(3, 2).height).toBeGreaterThan(standProfile(3, 0).height);
  });

  it('puts each stand outside the pitch, facing in', () => {
    for (const id of STAND_KEYS) {
      const path = standPath(id);
      for (const p of path) {
        // The normal points away from the centre spot.
        expect(p.x * p.nx + p.z * p.nz).toBeGreaterThan(0);
        expect(Math.abs(p.x) > 52.5 || Math.abs(p.z) > 34).toBe(true);
      }
      expect(pathLength(path, 0)).toBeGreaterThan(60);
    }
  });

  it('joins each corner to the end of one stand and the start of the next', () => {
    for (const c of CORNER_KEYS) {
      const arc = cornerPath(c, 10);
      const [before, after] = CORNER_NEIGHBOURS[c];
      const end = standPath(before).at(-1)!;
      const start = standPath(after)[0];
      for (const [a, b] of [
        [arc[0], end],
        [arc.at(-1)!, start],
      ]) {
        expect(a.x).toBeCloseTo(b.x, 6);
        expect(a.z).toBeCloseTo(b.z, 6);
        expect(a.nx).toBeCloseTo(b.nx, 6);
        expect(a.nz).toBeCloseTo(b.nz, 6);
      }
      // The back of a corner is longer than its front.
      expect(pathLength(arc, 20)).toBeGreaterThan(pathLength(arc, 0));
    }
    expect(cornerProfile(0)).toBeNull();
    expect(cornerProfile(1)!.depth).toBeCloseTo(standProfile(2, 0).depth, 6);
  });

  it('walks along a path left to right, with the tangent across the normal', () => {
    for (const id of STAND_KEYS) {
      const path = standPath(id);
      const a = pathAt(path, 0.25, 0);
      const b = pathAt(path, 0.75, 0);
      expect(a.tx * a.nx + a.tz * a.nz).toBeCloseTo(0, 6);
      expect((b.x - a.x) * a.tx + (b.z - a.z) * a.tz).toBeGreaterThan(0);
      const back = pathAt(path, 0.5, 10);
      const front = pathAt(path, 0.5, 0);
      expect(Math.hypot(back.x - front.x, back.z - front.z)).toBeCloseTo(10, 6);
    }
  });

  it('thins the crowd with attendance even when the tier cap is lower than the seats', () => {
    // A big ground at Medium: far more seats than the cap.
    const full = crowdFigures(20000, 5400, 1);
    expect(full).toBe(5400);
    expect(crowdFigures(20000, 5400, 0.3) / full).toBeCloseTo(0.3, 6);
    expect(crowdFigures(20000, 5400, 0.6)).toBeLessThan(crowdFigures(20000, 5400, 0.7));
    // A small ground under the cap fills seat by seat.
    expect(crowdFigures(2000, 5400, 0.5)).toBe(1000);
    expect(crowdFigures(2000, 5400, 0)).toBe(0);
  });
});

describe('stadium snapshot', () => {
  function newCareer(): Career {
    const career = createCareer({ seed: 5, teamId: 'crowncaster-city', tier: 'easy', homegrownRule: false });
    career.books[career.userTeamId].cash = 60_000_000;
    return career;
  }

  it('describes the ground, and shows work in progress', () => {
    const career = newCareer();
    const snap = buildStadiumSnapshot(career);
    expect(snap.works).toHaveLength(0);
    expect(snap.crestSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(snap.sponsors.length).toBeGreaterThan(3);
    expect(new Set(snap.sponsors).size).toBe(snap.sponsors.length);
    const option = stadiumOptions(career).find((o) => o.kind === 'stand' && o.available)!;
    expect(orderProject(career, option.key).ok).toBe(true);
    advanceCareer(career);
    const during = buildStadiumSnapshot(career);
    expect(during.works).toHaveLength(1);
    expect(during.works[0].progress).toBeGreaterThan(0);
    expect(during.works[0].progress).toBeLessThanOrEqual(1);
    // The snapshot is a copy: changing it leaves the save alone.
    during.stands.west.level = 9;
    expect(career.stadiums[career.userTeamId].stands.west.level).not.toBe(9);
  });
});

import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = new Rng(1).next();
    const b = new Rng(2).next();
    expect(a).not.toBe(b);
  });

  it('accepts string seeds via a stable hash', () => {
    expect(hashString('season-ticket')).toBe(hashString('season-ticket'));
    expect(new Rng('abc').next()).toBe(new Rng('abc').next());
  });

  it('resumes exactly from a saved state', () => {
    const a = new Rng(99);
    a.next();
    a.next();
    const saved = a.getState();
    const b = Rng.fromState(saved);
    expect(b.next()).toBe(a.next());
  });

  it('int stays within bounds and covers the range', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('normal has the requested mean and spread', () => {
    const r = new Rng(42);
    const n = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = r.normal(10, 2);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('weighted picks follow the weights', () => {
    const r = new Rng(3);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) {
      const pick = r.weighted(['a', 'b'] as const, (x) => (x === 'a' ? 3 : 1));
      counts[pick]++;
    }
    expect(counts.a / 10000).toBeGreaterThan(0.7);
    expect(counts.a / 10000).toBeLessThan(0.8);
  });

  it('shuffle keeps every element', () => {
    const r = new Rng(5);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(items);
    expect(out.slice().sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('child streams are independent and repeatable', () => {
    const r = new Rng(11);
    const c1 = r.child('match-1').next();
    const c2 = r.child('match-2').next();
    expect(c1).not.toBe(c2);
    expect(new Rng(11).child('match-1').next()).toBe(c1);
  });
});

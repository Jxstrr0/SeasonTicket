import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { PLAYERS_TUNING } from '../src/sim/data';
import { POSITIONS, type Player, type Position } from '../src/sim/types';
import { defaultNames, foreignNations, homeNationId, makeIdFactory, type NameSource, type NationWeight } from '../src/sim/names';
import {
  ATTRIBUTE_KEYS,
  computeOverall,
  developPlayer,
  generatePlayer,
  generateSquad,
  marketValue,
  pickNationality,
  positionFit,
  recomputeDerived,
  wageFor,
} from '../src/sim/players';
import { STAFF_ROLES, generateFreeAgentPool, generateStaff } from '../src/sim/staff';

const T = PLAYERS_TUNING;
const HOME = homeNationId();

/** A foreign-nation list the tests control, so nationality checks do not depend on world.json being authored. */
const TEST_NATIONS: NationWeight[] = [
  { id: 'esperia', weight: 3 },
  { id: 'kaltland', weight: 2 },
  { id: 'marrovia', weight: 1 },
];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function squad(seed: number, quality: number, domesticShare?: number): Player[] {
  return generateSquad(new Rng(seed), `team_${seed}`, quality, makeIdFactory(0), defaultNames, {
    domesticShare,
    nations: TEST_NATIONS,
  });
}

/** The best player per starter slot in the JSON starters template. */
function bestEleven(players: Player[]): Player[] {
  const out: Player[] = [];
  for (const position of POSITIONS) {
    const count = T.squad.startersTemplate[position];
    out.push(...players.filter((p) => p.position === position).sort((a, b) => b.overall - a.overall).slice(0, count));
  }
  return out;
}

function meanStarterOverall(quality: number, seeds = 20): number {
  const perSquad: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) perSquad.push(mean(bestEleven(squad(seed, quality)).map((p) => p.overall)));
  return mean(perSquad);
}

function player(seed: number, position: Position, quality: number, age?: number): Player {
  return generatePlayer(new Rng(seed), { position, nationality: HOME, quality, age }, makeIdFactory(0));
}

function withRating(base: Player, overall: number, overrides: Partial<Player> = {}): Player {
  return { ...base, overall, potential: Math.max(overall, base.potential), ...overrides };
}

function allSquads(): Player[] {
  const out: Player[] = [];
  for (const quality of [0, 0.2, 0.5, 0.8, 1]) for (let seed = 1; seed <= 8; seed++) out.push(...squad(seed * 7, quality));
  return out;
}

describe('makeIdFactory', () => {
  it('produces zero-padded sequential ids and reports the next number', () => {
    const ids = makeIdFactory(123);
    expect(ids.next('p')).toBe('p_000123');
    expect(ids.next('s')).toBe('s_000124');
    expect(ids.current()).toBe(125);
  });

  it('starts from zero and keeps counting across prefixes', () => {
    const ids = makeIdFactory(0);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(ids.next(i % 2 ? 'p' : 's'));
    expect(seen.size).toBe(200);
    expect(ids.current()).toBe(200);
  });
});

describe('defaultNames', () => {
  it('returns non-empty names for the home nation and for unknown nations', () => {
    const rng = new Rng(1);
    for (const nationality of [HOME, 'esperia', 'no-such-nation']) {
      const first = defaultNames.firstName(rng, nationality);
      const last = defaultNames.lastName(rng, nationality);
      expect(first.length).toBeGreaterThan(0);
      expect(last.length).toBeGreaterThan(0);
    }
  });

  it('draws different names over many calls', () => {
    const rng = new Rng(2);
    const names = new Set<string>();
    for (let i = 0; i < 100; i++) names.add(`${defaultNames.firstName(rng, HOME)} ${defaultNames.lastName(rng, HOME)}`);
    expect(names.size).toBeGreaterThan(20);
  });

  it('home nation is a non-empty id and foreign nations never include it', () => {
    expect(HOME.length).toBeGreaterThan(0);
    for (const n of foreignNations()) {
      expect(n.id).not.toBe(HOME);
      expect(n.weight).toBeGreaterThan(0);
    }
  });
});

describe('generateSquad', () => {
  it('is deterministic: the same seed gives deep-equal squads', () => {
    expect(squad(42, 0.6)).toEqual(squad(42, 0.6));
    expect(squad(42, 0.6)).not.toEqual(squad(43, 0.6));
  });

  it('matches the JSON squad template in size and positions', () => {
    const players = squad(1, 0.5);
    const total = Object.values(T.squad.template).reduce((a, b) => a + b, 0);
    expect(players).toHaveLength(total);
    expect(total).toBeGreaterThanOrEqual(T.squad.minSize);
    expect(total).toBeLessThanOrEqual(T.squad.maxSize);
    for (const position of POSITIONS) {
      expect(players.filter((p) => p.position === position)).toHaveLength(T.squad.template[position]);
    }
  });

  it('assigns unique jerseys in range and gives a goalkeeper number 1', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const players = squad(seed, 0.5);
      const jerseys = players.map((p) => p.jersey);
      expect(new Set(jerseys).size).toBe(players.length);
      for (const j of jerseys) {
        expect(j).toBeGreaterThanOrEqual(T.squad.jersey.min);
        expect(j).toBeLessThanOrEqual(T.squad.jersey.max);
      }
      const keeper = players.find((p) => p.jersey === T.squad.jersey.goalkeeper);
      expect(keeper?.position).toBe('GK');
    }
  });

  it('sets the team id, fresh state and consistent money on every player', () => {
    for (const p of squad(5, 0.6)) {
      expect(p.teamId).toBe('team_5');
      expect(p.condition).toBe(1);
      expect(p.form).toEqual([]);
      expect(p.injuryWeeks).toBe(0);
      expect(p.suspensionMatches).toBe(0);
      expect(p.seasonYellows).toBe(0);
      expect(p.contract.years).toBeGreaterThanOrEqual(T.contract.minYears);
      expect(p.contract.years).toBeLessThanOrEqual(T.contract.maxYears);
      expect(p.contract.wage).toBe(wageFor(p));
      expect(p.value).toBe(marketValue(p));
      expect(p.id).toMatch(/^p_\d{6}$/);
    }
  });

  it('gives unique ids across a squad', () => {
    const players = squad(9, 0.5);
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
  });

  it('keeps every attribute, overall and potential inside 1-99 at every quality', () => {
    for (const p of allSquads()) {
      for (const key of ATTRIBUTE_KEYS) {
        expect(p.attributes[key]).toBeGreaterThanOrEqual(1);
        expect(p.attributes[key]).toBeLessThanOrEqual(99);
        expect(Number.isInteger(p.attributes[key])).toBe(true);
      }
      expect(p.overall).toBeGreaterThanOrEqual(1);
      expect(p.overall).toBeLessThanOrEqual(99);
      expect(p.overall).toBe(computeOverall(p.attributes, p.position));
      expect(p.potential).toBeGreaterThanOrEqual(p.overall);
      expect(p.potential).toBeLessThanOrEqual(99);
    }
  });

  it('keeps ages in 17-36 and includes youth players', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const players = squad(seed, 0.5);
      for (const p of players) {
        expect(p.age).toBeGreaterThanOrEqual(T.ages.any.min);
        expect(p.age).toBeLessThanOrEqual(T.ages.any.max);
      }
      const youth = players.filter((p) => p.age <= T.ages.youth.max);
      expect(youth.length).toBeGreaterThanOrEqual(T.squad.youthCount.min);
    }
  });

  it('ranks quality 0.9 squads clearly above quality 0.2 squads over 20 seeds', () => {
    const strong = meanStarterOverall(0.9);
    const weak = meanStarterOverall(0.2);
    expect(strong - weak).toBeGreaterThan(20);
  });

  it('puts starter overalls in the bands the match engine expects', () => {
    const q35 = meanStarterOverall(0.35);
    const q60 = meanStarterOverall(0.6);
    const q85 = meanStarterOverall(0.85);
    expect(q35).toBeGreaterThanOrEqual(48);
    expect(q35).toBeLessThanOrEqual(56);
    expect(q60).toBeGreaterThanOrEqual(60);
    expect(q60).toBeLessThanOrEqual(68);
    expect(q85).toBeGreaterThanOrEqual(72);
    expect(q85).toBeLessThanOrEqual(80);
  });

  it('makes starters stronger than the rest of the squad', () => {
    let starterSum = 0;
    let restSum = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const players = squad(seed, 0.6);
      const xi = new Set(bestEleven(players).map((p) => p.id));
      starterSum += mean(players.filter((p) => xi.has(p.id)).map((p) => p.overall));
      restSum += mean(players.filter((p) => !xi.has(p.id)).map((p) => p.overall));
    }
    expect(starterSum / 20 - restSum / 20).toBeGreaterThan(4);
  });

  it('hits the domestic share within 0.15 over many squads', () => {
    const check = (target: number): void => {
      let domestic = 0;
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (const p of squad(seed, 0.5, target)) {
          total += 1;
          if (p.nationality === HOME) domestic += 1;
        }
      }
      expect(Math.abs(domestic / total - target)).toBeLessThan(0.15);
    };
    check(T.squad.domesticShare);
    check(0.3);
    check(0.9);
  });

  it('draws foreign nationalities only from the given nations, by weight', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 60; seed++) {
      for (const p of squad(seed, 0.5, 0.2)) {
        if (p.nationality === HOME) continue;
        counts[p.nationality] = (counts[p.nationality] ?? 0) + 1;
      }
    }
    expect(Object.keys(counts).sort()).toEqual(TEST_NATIONS.map((n) => n.id).sort());
    expect(counts.esperia).toBeGreaterThan(counts.kaltland);
    expect(counts.kaltland).toBeGreaterThan(counts.marrovia);
  });

  it('uses world.json nations (or stays domestic) when none are injected', () => {
    const allowed = new Set([HOME, ...foreignNations().map((n) => n.id)]);
    const players = generateSquad(new Rng(3), 't', 0.5, makeIdFactory(0));
    for (const p of players) expect(allowed.has(p.nationality)).toBe(true);
    if (foreignNations().length === 0) expect(players.every((p) => p.nationality === HOME)).toBe(true);
  });

  it('pickNationality falls back to the home nation when there are no foreign nations', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 50; i++) expect(pickNationality(rng, 0, [])).toBe(HOME);
  });

  it('accepts a custom name source', () => {
    const fixed: NameSource = { firstName: () => 'First', lastName: () => 'Last' };
    const players = generateSquad(new Rng(1), 't', 0.5, makeIdFactory(0), fixed);
    for (const p of players) {
      expect(p.firstName).toBe('First');
      expect(p.lastName).toBe('Last');
    }
  });
});

describe('generatePlayer', () => {
  it('spreads attributes by position archetype', () => {
    const profile = (position: Position): Record<string, number> => {
      const rng = new Rng(11);
      const ps = Array.from({ length: 200 }, () => generatePlayer(rng, { position, nationality: HOME, quality: 0.6, tier: 'starter' }, makeIdFactory(0)));
      const out: Record<string, number> = {};
      for (const key of ATTRIBUTE_KEYS) out[key] = mean(ps.map((p) => p.attributes[key]));
      return out;
    };
    const st = profile('ST');
    expect(st.fin).toBeGreaterThan(65);
    expect(st.pac).toBeGreaterThan(60);
    expect(st.cmp).toBeGreaterThan(60);
    expect(st.tck).toBeLessThan(45);
    expect(st.mrk).toBeLessThan(45);
    expect(st.ref).toBeLessThan(25);

    const gk = profile('GK');
    for (const key of ['ref', 'han', 'kck', 'gkp'] as const) expect(gk[key]).toBeGreaterThan(60);
    expect(gk.pos).toBeGreaterThan(55);
    for (const key of ['fin', 'crs', 'dri', 'tck', 'spk', 'mrk', 'hea', 'vis', 'pac'] as const) {
      expect(gk[key]).toBeGreaterThanOrEqual(10);
      expect(gk[key]).toBeLessThan(50);
    }

    const cb = profile('CB');
    expect(cb.tck).toBeGreaterThan(cb.fin + 25);
    expect(cb.hea).toBeGreaterThan(cb.crs + 25);
  });

  it('honours an explicit age and clamps youth ages to the youth band', () => {
    expect(player(1, 'CM', 0.5, 29).age).toBe(29);
    for (let seed = 1; seed <= 40; seed++) {
      const youth = generatePlayer(new Rng(seed), { position: 'W', nationality: HOME, quality: 0.5, tier: 'youth' }, makeIdFactory(0));
      expect(youth.age).toBeGreaterThanOrEqual(T.ages.youth.min);
      expect(youth.age).toBeLessThanOrEqual(T.ages.youth.max);
    }
  });

  it('gives the young more headroom than the old', () => {
    const headroom = (age: number): number => {
      const rng = new Rng(21);
      const ps = Array.from({ length: 200 }, () => generatePlayer(rng, { position: 'AM', nationality: HOME, quality: 0.6, age }, makeIdFactory(0)));
      return mean(ps.map((p) => p.potential - p.overall));
    };
    const young = headroom(18);
    const prime = headroom(24);
    const veteran = headroom(32);
    expect(young).toBeGreaterThan(prime + 5);
    expect(prime).toBeGreaterThan(veteran);
    expect(veteran).toBe(0);
  });

  it('ranks tiers: starter above rotation above youth at equal quality and age', () => {
    const tierMean = (tier: 'starter' | 'rotation' | 'youth'): number => {
      const rng = new Rng(31);
      return mean(Array.from({ length: 200 }, () => generatePlayer(rng, { position: 'CM', nationality: HOME, quality: 0.5, age: 20, tier }, makeIdFactory(0)).overall));
    };
    expect(tierMean('starter')).toBeGreaterThan(tierMean('rotation') + 2);
    expect(tierMean('rotation')).toBeGreaterThan(tierMean('youth'));
  });

  it('only takes secondary positions from the adjacency table and never the main one', () => {
    for (const p of allSquads()) {
      const allowed: readonly string[] = T.secondaryPositions.adjacency[p.position];
      expect(new Set(p.secondaryPositions).size).toBe(p.secondaryPositions.length);
      for (const s of p.secondaryPositions) {
        expect(s).not.toBe(p.position);
        expect(allowed).toContain(s);
      }
      if (p.position === 'GK') expect(p.secondaryPositions).toEqual([]);
    }
  });

  it('gives most outfield players at least one secondary position', () => {
    const outfield = allSquads().filter((p) => p.position !== 'GK');
    const withSecondary = outfield.filter((p) => p.secondaryPositions.length > 0).length;
    expect(withSecondary / outfield.length).toBeGreaterThan(0.6);
    expect(withSecondary / outfield.length).toBeLessThan(0.95);
  });
});

describe('computeOverall and positionFit', () => {
  it('overall is the position-weighted average, so a uniform player scores that number', () => {
    const uniform = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 70])) as unknown as Player['attributes'];
    for (const position of POSITIONS) expect(computeOverall(uniform, position)).toBe(70);
  });

  it('a striker rates higher at ST than at CB, and a keeper higher at GK than anywhere', () => {
    const gaps: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const st = player(seed, 'ST', 0.7, 26);
      gaps.push(computeOverall(st.attributes, 'ST') - computeOverall(st.attributes, 'CB'));
    }
    expect(mean(gaps)).toBeGreaterThan(5);
    for (let seed = 1; seed <= 20; seed++) {
      const gk = player(seed, 'GK', 0.7, 26);
      for (const position of POSITIONS) {
        if (position !== 'GK') expect(computeOverall(gk.attributes, 'GK')).toBeGreaterThan(computeOverall(gk.attributes, position) + 10);
      }
    }
  });

  it('fit is 1 at the main position, ~0.92 at a secondary, lower elsewhere and very low across the GK line', () => {
    const fb = { ...player(3, 'FB', 0.5, 25), secondaryPositions: ['W'] as Position[] };
    expect(positionFit(fb, 'FB')).toBe(1);
    expect(positionFit(fb, 'W')).toBeCloseTo(T.positionFit.secondary, 5);
    expect(positionFit(fb, 'CB')).toBeLessThan(T.positionFit.secondary);
    expect(positionFit(fb, 'CB')).toBeGreaterThan(positionFit(fb, 'ST'));
    expect(positionFit(fb, 'GK')).toBeLessThan(0.5);
    const gk = player(4, 'GK', 0.5, 25);
    for (const position of POSITIONS) {
      if (position !== 'GK') expect(positionFit(gk, position)).toBeLessThan(0.5);
    }
  });

  it('every fit is within 0-1 for every position pair', () => {
    for (const main of POSITIONS) {
      const p = { ...player(5, main, 0.5, 25), secondaryPositions: [] as Position[] };
      for (const target of POSITIONS) {
        const fit = positionFit(p, target);
        expect(fit).toBeGreaterThan(0);
        expect(fit).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('wageFor', () => {
  const base = player(1, 'CM', 0.6, 26);

  it('is monotonic in overall and rounded to the nearest thousand', () => {
    let previous = 0;
    for (let overall = 1; overall <= 99; overall++) {
      const wage = wageFor(withRating(base, overall));
      expect(wage).toBeGreaterThanOrEqual(previous);
      expect(wage % T.wage.roundTo).toBe(0);
      expect(wage).toBeGreaterThanOrEqual(T.wage.min);
      previous = wage;
    }
  });

  it('hits the target curve within 25%', () => {
    const targets: [number, number][] = [[55, 60000], [65, 120000], [75, 300000], [85, 800000], [92, 1600000]];
    for (const [overall, expected] of targets) {
      const wage = wageFor(withRating(base, overall));
      expect(wage).toBeGreaterThan(expected * 0.75);
      expect(wage).toBeLessThan(expected * 1.25);
    }
  });
});

describe('marketValue', () => {
  const base = player(2, 'CM', 0.6, 26);

  it('is positive, rounded and grows steeply with overall', () => {
    let previous = 0;
    for (let overall = 1; overall <= 99; overall++) {
      const value = marketValue(withRating(base, overall, { age: 26 }));
      expect(value).toBeGreaterThan(0);
      expect(value % T.value.roundTo).toBe(0);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(marketValue(withRating(base, 80, { age: 26 }))).toBeGreaterThan(marketValue(withRating(base, 60, { age: 26 })) * 5);
  });

  it('values a 24-year-old above a 33-year-old at equal overall', () => {
    for (const overall of [50, 65, 80]) {
      const young = marketValue(withRating(base, overall, { age: 24, potential: overall }));
      const old = marketValue(withRating(base, overall, { age: 33, potential: overall }));
      expect(young).toBeGreaterThan(old);
    }
  });

  it('adds a premium for potential and a discount for goalkeepers', () => {
    const plain = marketValue(withRating(base, 60, { age: 20, potential: 60 }));
    const prospect = marketValue(withRating(base, 60, { age: 20, potential: 75 }));
    expect(prospect).toBeGreaterThan(plain);
    const keeper = marketValue(withRating(base, 70, { age: 26, potential: 70, position: 'GK' }));
    const outfield = marketValue(withRating(base, 70, { age: 26, potential: 70, position: 'CM' }));
    expect(keeper).toBeLessThan(outfield);
  });
});

describe('recomputeDerived', () => {
  it('refreshes overall, value and keeps potential at or above overall', () => {
    const p = player(6, 'ST', 0.5, 25);
    const before = { overall: p.overall, value: p.value };
    for (const key of ATTRIBUTE_KEYS) p.attributes[key] = Math.min(99, p.attributes[key] + 10);
    recomputeDerived(p);
    expect(p.overall).toBeGreaterThan(before.overall);
    expect(p.value).toBeGreaterThan(before.value);
    expect(p.potential).toBeGreaterThanOrEqual(p.overall);
    expect(p.overall).toBe(computeOverall(p.attributes, p.position));
    expect(p.value).toBe(marketValue(p));
  });
});

describe('developPlayer', () => {
  function averageChange(age: number, coaching: number, samples = 200): number {
    const rng = new Rng(100 + age);
    const deltas: number[] = [];
    for (let i = 0; i < samples; i++) {
      const p = generatePlayer(rng, { position: 'CM', nationality: HOME, quality: 0.6, age }, makeIdFactory(0));
      const before = p.overall;
      developPlayer(rng, p, coaching);
      deltas.push(p.overall - before);
    }
    return mean(deltas);
  }

  it('moves 20-year-olds up and 33-year-olds down on average', () => {
    expect(averageChange(20, 0.5)).toBeGreaterThan(1.5);
    expect(averageChange(33, 0.5)).toBeLessThan(-1);
  });

  it('grows faster with better coaching and declines less', () => {
    expect(averageChange(19, 0.9)).toBeGreaterThan(averageChange(19, 0.1) + 0.5);
    expect(averageChange(34, 0.9)).toBeGreaterThan(averageChange(34, 0.1));
  });

  it('is deterministic and keeps every number inside the contract', () => {
    const run = (seed: number): Player => {
      const rng = new Rng(seed);
      const p = generatePlayer(rng, { position: 'W', nationality: HOME, quality: 0.5, age: 18 }, makeIdFactory(0));
      for (let season = 0; season < 6; season++) developPlayer(rng, p, 0.7);
      return p;
    };
    expect(run(8)).toEqual(run(8));
    const p = run(8);
    for (const key of ATTRIBUTE_KEYS) {
      expect(p.attributes[key]).toBeGreaterThanOrEqual(1);
      expect(p.attributes[key]).toBeLessThanOrEqual(99);
    }
    expect(p.overall).toBe(computeOverall(p.attributes, p.position));
    expect(p.potential).toBeGreaterThanOrEqual(p.overall);
    expect(p.value).toBe(marketValue(p));
  });

  it('never grows past potential and collapses potential once declining', () => {
    const rng = new Rng(9);
    const young = generatePlayer(rng, { position: 'ST', nationality: HOME, quality: 0.6, age: 19 }, makeIdFactory(0));
    const ceiling = young.potential;
    for (let season = 0; season < 10; season++) {
      developPlayer(rng, young, 1);
      expect(young.overall).toBeLessThanOrEqual(ceiling);
    }
    const old = generatePlayer(rng, { position: 'ST', nationality: HOME, quality: 0.6, age: 33 }, makeIdFactory(0));
    developPlayer(rng, old, 0.5);
    expect(old.potential).toBe(old.overall);
  });
});

describe('generateStaff', () => {
  it('creates one member per role in order, deterministically', () => {
    const a = generateStaff(new Rng(5), 'team_x', 0.6, makeIdFactory(10));
    const b = generateStaff(new Rng(5), 'team_x', 0.6, makeIdFactory(10));
    expect(a).toEqual(b);
    expect(a.map((s) => s.role)).toEqual(STAFF_ROLES);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    for (const s of a) {
      expect(s.teamId).toBe('team_x');
      expect(s.id).toMatch(/^s_\d{6}$/);
      expect(s.rating).toBeGreaterThanOrEqual(1);
      expect(s.rating).toBeLessThanOrEqual(99);
      expect(s.age).toBeGreaterThanOrEqual(T.staff.age.min);
      expect(s.age).toBeLessThanOrEqual(T.staff.age.max);
      expect(s.contract.wage).toBeGreaterThan(0);
      expect(s.contract.years).toBeGreaterThanOrEqual(T.staff.contract.minYears);
      expect(s.contract.years).toBeLessThanOrEqual(T.staff.contract.maxYears);
      expect(s.firstName.length).toBeGreaterThan(0);
      expect(s.lastName.length).toBeGreaterThan(0);
    }
  });

  it('gives the head coach a philosophy and everyone else neutral values', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const staff = generateStaff(new Rng(seed), 't', 0.5, makeIdFactory(0));
      for (const s of staff) {
        expect(s.attackLean).toBeGreaterThanOrEqual(0);
        expect(s.attackLean).toBeLessThanOrEqual(1);
        expect(s.aggression).toBeGreaterThanOrEqual(0);
        expect(s.aggression).toBeLessThanOrEqual(1);
        if (s.role === 'headCoach') {
          expect(T.staff.formations).toContain(s.preferredFormation);
        } else {
          expect(s.attackLean).toBe(T.staff.neutralLean);
          expect(s.aggression).toBe(T.staff.neutralAggression);
          expect(s.preferredFormation).toBe(T.staff.neutralFormation);
        }
      }
    }
  });

  it('head coaches vary in formation and lean across seeds', () => {
    const formations = new Set<string>();
    const leans: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const coach = generateStaff(new Rng(seed), 't', 0.5, makeIdFactory(0))[0];
      formations.add(coach.preferredFormation);
      leans.push(coach.attackLean);
    }
    expect(formations.size).toBeGreaterThan(3);
    expect(Math.max(...leans) - Math.min(...leans)).toBeGreaterThan(0.3);
  });

  it('rates staff by club quality', () => {
    const avg = (quality: number): number => {
      const ratings: number[] = [];
      for (let seed = 1; seed <= 20; seed++) ratings.push(...generateStaff(new Rng(seed), 't', quality, makeIdFactory(0)).map((s) => s.rating));
      return mean(ratings);
    };
    expect(avg(0.9) - avg(0.2)).toBeGreaterThan(15);
  });
});

describe('generateFreeAgentPool', () => {
  it('produces the requested number of clubless, modest players deterministically', () => {
    const a = generateFreeAgentPool(new Rng(7), 30, makeIdFactory(500));
    const b = generateFreeAgentPool(new Rng(7), 30, makeIdFactory(500));
    expect(a).toEqual(b);
    expect(a).toHaveLength(30);
    expect(new Set(a.map((p) => p.id)).size).toBe(30);
    for (const p of a) {
      expect(p.teamId).toBeNull();
      expect(p.contract.years).toBe(0);
      expect(p.age).toBeGreaterThanOrEqual(T.freeAgents.age.min);
      expect(p.age).toBeLessThanOrEqual(T.freeAgents.age.max);
      expect(p.overall).toBe(computeOverall(p.attributes, p.position));
    }
    const positions = new Set(a.map((p) => p.position));
    expect(positions.size).toBeGreaterThan(4);
  });

  it('is weaker on average than a mid-quality squad', () => {
    const pool = generateFreeAgentPool(new Rng(8), 100, makeIdFactory(0));
    expect(mean(pool.map((p) => p.overall))).toBeLessThan(meanStarterOverall(0.6, 5) - 8);
  });
});

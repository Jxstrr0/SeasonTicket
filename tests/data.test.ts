import { describe, expect, it } from 'vitest';
import { CLUBS, NAMES, WORLD, isDomestic, nation, type ClubSeed } from '../src/sim/data';
import { defaultNames, foreignNations, homeNationId } from '../src/sim/names';
import { Rng } from '../src/sim/rng';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;
const UNIT_FIELDS = ['marketSize', 'stadiumCondition', 'finances', 'fanMood', 'squadQuality', 'staffQuality'] as const;
const MIN_FIRST = 70;
const MIN_LAST = 90;

/** A sample of famous real surnames that must never appear in a name pool. */
const BANNED_SURNAMES = [
  'Messi', 'Ronaldo', 'Beckham', 'Zidane', 'Pelé', 'Maradona', 'Neymar', 'Mbappé', 'Haaland', 'Kane',
  'Salah', 'Modric', 'Ibrahimovic', 'Lewandowski', 'Benzema', 'Iniesta', 'Pirlo', 'Buffon', 'Cruyff', 'Rooney',
];

/** Pools referenced by the world, plus the two domestic pools. */
function requiredPools(): string[] {
  return ['valmere', 'valmere-fr', ...WORLD.nations.map((n) => n.namePool)];
}

function unique<T>(xs: readonly T[]): boolean {
  return new Set(xs).size === xs.length;
}

function byQuality(lo: number, hi: number): ClubSeed[] {
  return CLUBS.filter((c) => c.squadQuality >= lo && c.squadQuality <= hi);
}

describe('world.json', () => {
  it('describes Valmere and its league', () => {
    expect(WORLD.country).toEqual({
      id: 'valmere', name: 'Valmere', demonym: 'Valmeran', currency: 'Valmeran dollar', currencySymbol: '$',
    });
    expect(WORLD.league).toEqual({
      name: 'Kestrel Football League', abbr: 'KFL', tableTrophy: 'Valmere Shield', playoffTrophy: "Founders' Cup",
    });
  });

  it('lists the seven design-doc regions with kebab-case ids', () => {
    expect(WORLD.regions.map((r) => r.name)).toEqual([
      'Capital District', 'Eastern Shore', 'Rivière Valley', 'Lakelands', 'Iron Belt', 'Highlands', 'Western Plains',
    ]);
    for (const r of WORLD.regions) expect(r.id).toMatch(KEBAB);
    expect(unique(WORLD.regions.map((r) => r.id))).toBe(true);
  });

  it('lists the eight foreign nations with sane weights', () => {
    expect(WORLD.nations.map((n) => n.name).sort()).toEqual(
      ['Caravelle', 'Esperia', 'Kaltland', 'Marrovia', 'Norrvik', 'Ostenburg', 'Sundara', 'Vostria'],
    );
    expect(unique(WORLD.nations.map((n) => n.id))).toBe(true);
    for (const n of WORLD.nations) {
      expect(n.id).toMatch(/^[a-z]+$/);
      expect(n.id).not.toBe(WORLD.country.id);
      expect(n.demonym.length).toBeGreaterThan(0);
      expect(n.weight).toBeGreaterThanOrEqual(0.5);
      expect(n.weight).toBeLessThanOrEqual(2);
    }
    const weights = WORLD.nations.map((n) => n.weight);
    expect(Math.max(...weights)).toBeGreaterThan(Math.min(...weights));
  });

  it('is wired into the nation lookups the generators use', () => {
    expect(homeNationId()).toBe('valmere');
    expect(isDomestic('valmere')).toBe(true);
    expect(isDomestic('kaltland')).toBe(false);
    expect(nation('valmere').namePool).toBe('valmere');
    expect(foreignNations().map((n) => n.id).sort()).toEqual(WORLD.nations.map((n) => n.id).sort());
  });
});

describe('names.json', () => {
  it('has every required pool', () => {
    for (const key of requiredPools()) expect(NAMES[key], key).toBeDefined();
  });

  it('meets pool sizes with distinct, trimmed, non-empty names', () => {
    for (const key of requiredPools()) {
      const { first, last } = NAMES[key];
      expect(first.length, `${key} first`).toBeGreaterThanOrEqual(MIN_FIRST);
      expect(last.length, `${key} last`).toBeGreaterThanOrEqual(MIN_LAST);
      expect(unique(first), `${key} first distinct`).toBe(true);
      expect(unique(last), `${key} last distinct`).toBe(true);
      for (const name of [...first, ...last]) {
        expect(name.trim()).toBe(name);
        expect(name.length).toBeGreaterThan(1);
        expect(name[0]).toBe(name[0].toUpperCase());
      }
    }
  });

  it('gives each foreign nation a pool of its own flavour', () => {
    const keys = WORLD.nations.map((n) => n.namePool);
    expect(unique(keys)).toBe(true);
    // Pools should be clearly different, not copies of one another.
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = new Set(NAMES[keys[i]].last);
        const shared = NAMES[keys[j]].last.filter((x) => a.has(x)).length;
        expect(shared, `${keys[i]} vs ${keys[j]}`).toBeLessThan(5);
      }
    }
  });

  it('contains no famous real surnames', () => {
    const banned = new Set(BANNED_SURNAMES.map((s) => s.toLowerCase()));
    for (const [key, pool] of Object.entries(NAMES)) {
      for (const name of [...pool.first, ...pool.last]) {
        expect(banned.has(name.toLowerCase()), `${key}: ${name}`).toBe(false);
      }
    }
  });

  it('feeds the name generator for every nation, deterministically', () => {
    for (const n of WORLD.nations) {
      const rngA = new Rng(`names-${n.id}`);
      const rngB = new Rng(`names-${n.id}`);
      const drawsA: string[] = [];
      const drawsB: string[] = [];
      for (let i = 0; i < 200; i++) {
        drawsA.push(defaultNames.lastName(rngA, n.id));
        drawsB.push(defaultNames.lastName(rngB, n.id));
      }
      expect(drawsA).toEqual(drawsB);
      for (const d of drawsA) expect(NAMES[n.namePool].last).toContain(d);
      // 200 draws from 90+ names should spread across most of the pool.
      expect(new Set(drawsA).size).toBeGreaterThan(60);
    }
    const first = defaultNames.firstName(new Rng(7), 'valmere');
    expect(NAMES.valmere.first).toContain(first);
  });
});

describe('clubs.json', () => {
  it('has the 16 design-doc clubs in order', () => {
    expect(CLUBS.map((c) => c.name)).toEqual([
      'Kingsbridge City FC', 'Port Alder Athletic', 'Cape Fenwick United', 'Saltwater Cove FC',
      'Olympique Sainte-Rivière', 'Racing Val-Delacroix', 'Lakehaven United', 'Westmere Wanderers',
      'Blackwater Rovers', 'Stonegate Ironworks FC', 'Fort Sterling FC', 'Silverpeak Alpine',
      'Coldbrook Town', 'Northolt FC', 'Prairie Junction FC', 'Grandview SC',
    ]);
  });

  it('has unique, well-formed identifiers', () => {
    expect(unique(CLUBS.map((c) => c.id))).toBe(true);
    expect(unique(CLUBS.map((c) => c.name))).toBe(true);
    expect(unique(CLUBS.map((c) => c.shortName))).toBe(true);
    expect(unique(CLUBS.map((c) => c.abbr))).toBe(true);
    expect(unique(CLUBS.map((c) => c.stadiumName))).toBe(true);
    for (const c of CLUBS) {
      expect(c.id).toMatch(KEBAB);
      expect(c.abbr).toMatch(/^[A-Z]{3}$/);
      expect(c.shortName.length).toBeLessThanOrEqual(12);
      expect(c.nickname.length).toBeGreaterThan(0);
      expect(c.city.length).toBeGreaterThan(0);
      expect(c.blurb?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('places every club in a known region and covers every region', () => {
    const regionIds = new Set(WORLD.regions.map((r) => r.id));
    for (const c of CLUBS) expect(regionIds.has(c.region), `${c.id} region ${c.region}`).toBe(true);
    expect(new Set(CLUBS.map((c) => c.region)).size).toBe(WORLD.regions.length);
  });

  it('uses valid, varied colours', () => {
    for (const c of CLUBS) {
      expect(c.colors.primary).toMatch(HEX);
      expect(c.colors.secondary).toMatch(HEX);
      expect(c.colors.primary.toLowerCase()).not.toBe(c.colors.secondary.toLowerCase());
    }
    expect(new Set(CLUBS.map((c) => c.colors.primary.toLowerCase())).size).toBe(CLUBS.length);
    const pairs = CLUBS.map((c) => `${c.colors.primary}/${c.colors.secondary}`.toLowerCase());
    expect(unique(pairs)).toBe(true);
  });

  it('keeps capacities and 0-1 attributes in range', () => {
    for (const c of CLUBS) {
      expect(Number.isInteger(c.stadiumCapacity)).toBe(true);
      expect(c.stadiumCapacity).toBeGreaterThanOrEqual(8000);
      expect(c.stadiumCapacity).toBeLessThanOrEqual(48000);
      for (const f of UNIT_FIELDS) {
        expect(c[f], `${c.id}.${f}`).toBeGreaterThanOrEqual(0);
        expect(c[f], `${c.id}.${f}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the capital the biggest market and stadium', () => {
    const capital = CLUBS.find((c) => c.region === 'capital-district');
    expect(capital).toBeDefined();
    expect(capital!.stadiumCapacity).toBe(Math.max(...CLUBS.map((c) => c.stadiumCapacity)));
    expect(capital!.marketSize).toBe(Math.max(...CLUBS.map((c) => c.marketSize)));
  });

  it('spreads squad quality into clear tiers', () => {
    const q = CLUBS.map((c) => c.squadQuality);
    expect(Math.max(...q) - Math.min(...q)).toBeGreaterThanOrEqual(0.4);
    const powerhouses = byQuality(0.78, 0.85).length;
    const solid = byQuality(0.62, 0.72).length;
    const middling = byQuality(0.48, 0.58).length;
    const strugglers = byQuality(0.3, 0.42).length;
    expect(powerhouses).toBeGreaterThanOrEqual(2);
    expect(powerhouses).toBeLessThanOrEqual(3);
    expect(solid).toBeGreaterThanOrEqual(4);
    expect(solid).toBeLessThanOrEqual(5);
    expect(middling).toBeGreaterThanOrEqual(5);
    expect(middling).toBeLessThanOrEqual(6);
    expect(strugglers).toBe(3);
    expect(powerhouses + solid + middling + strugglers).toBe(CLUBS.length);
  });

  it('includes difficulty mismatches for interesting career starts', () => {
    const bigMarketPoorSquad = CLUBS.filter((c) => c.marketSize >= 0.7 && c.squadQuality <= 0.45);
    const smallMarketRichOrLoyal = CLUBS.filter(
      (c) => c.marketSize <= 0.35 && (c.finances >= 0.7 || c.fanMood >= 0.85),
    );
    expect(bigMarketPoorSquad.length).toBeGreaterThanOrEqual(1);
    expect(smallMarketRichOrLoyal.length).toBeGreaterThanOrEqual(1);
  });
});

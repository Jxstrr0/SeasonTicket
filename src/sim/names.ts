/**
 * Name generation and id factories.
 *
 * Name pools come from src/data/names.json, keyed by the nation's `namePool`
 * from world.json. Both content files may still be empty while the world is
 * being authored, so every lookup falls back to a small built-in pool and the
 * home nation defaults to Valmere. Generation never fails for lack of content.
 */
import type { NationId } from './types';
import { NAMES, WORLD, nation, type NationDef, type NamePool } from './data';
import type { Rng } from './rng';

export interface NameSource {
  firstName(rng: Rng, nationality: NationId): string;
  lastName(rng: Rng, nationality: NationId): string;
}

/** A nation entry as players.ts needs it: just an id and a draw weight. */
export type NationWeight = Pick<NationDef, 'id' | 'weight'>;

/** Home nation id used when world.json has not been filled in yet. */
export const FALLBACK_HOME_NATION: NationId = 'valmere';

/** Digits in the numeric part of an id, e.g. "p_000123". */
const ID_DIGITS = 6;

/** Fictional, generic Valmeran-flavoured names used when a pool is missing. */
const GENERIC_POOL: NamePool = {
  first: [
    'Alden', 'Bram', 'Cato', 'Dorian', 'Elliot', 'Finn', 'Garrick', 'Hale',
    'Ivo', 'Jory', 'Kellan', 'Lorne', 'Mace', 'Niall', 'Orin', 'Piers',
    'Quill', 'Rafe', 'Soren', 'Tobin', 'Ulric', 'Vance', 'Wren', 'Yule',
  ],
  last: [
    'Ashcombe', 'Bellward', 'Corrick', 'Dunmore', 'Eastley', 'Farrow', 'Greaves', 'Holloway',
    'Ingram', 'Jessop', 'Kestrel', 'Larkin', 'Merriweather', 'Northcote', 'Oakes', 'Pemberton',
    'Quarrie', 'Rowntree', 'Stanhope', 'Thorne', 'Underhill', 'Varley', 'Whitlock', 'Yardley',
  ],
};

/** True once world.json carries a country and a nations list. */
function worldLoaded(): boolean {
  const country = WORLD.country as WorldCountry | undefined;
  return country !== undefined && Array.isArray(WORLD.nations);
}

type WorldCountry = typeof WORLD.country;

/** The home nation id, or the Valmere fallback while world.json is empty. */
export function homeNationId(): NationId {
  const country = WORLD.country as WorldCountry | undefined;
  return country?.id ?? FALLBACK_HOME_NATION;
}

/** Foreign nations players can be drawn from, with positive weights only. Empty while world.json is empty. */
export function foreignNations(): NationWeight[] {
  if (!worldLoaded()) return [];
  const home = homeNationId();
  return WORLD.nations.filter((n) => n.id !== home && n.weight > 0);
}

/** The names.json key for a nationality: its namePool when known, else the id itself. */
function poolKeyFor(nationality: NationId): string {
  if (!worldLoaded()) return nationality;
  try {
    return nation(nationality).namePool;
  } catch {
    return nationality;
  }
}

function namesFor(nationality: NationId, part: keyof NamePool): readonly string[] {
  const candidates = [poolKeyFor(nationality), nationality];
  for (const key of candidates) {
    const pool = NAMES[key] as NamePool | undefined;
    const list = pool?.[part];
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return GENERIC_POOL[part];
}

export const defaultNames: NameSource = {
  firstName(rng, nationality) {
    return rng.pick(namesFor(nationality, 'first'));
  },
  lastName(rng, nationality) {
    return rng.pick(namesFor(nationality, 'last'));
  },
};

/**
 * Sequential id factory. `current()` is the next unused number, so it can be
 * stored straight back into League.nextId and resumed later.
 */
export function makeIdFactory(start: number): { next(prefix: string): string; current(): number } {
  let counter = Math.max(0, Math.floor(start));
  return {
    next(prefix: string): string {
      const id = `${prefix}_${String(counter).padStart(ID_DIGITS, '0')}`;
      counter += 1;
      return id;
    },
    current(): number {
      return counter;
    },
  };
}

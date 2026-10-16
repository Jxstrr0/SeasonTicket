/**
 * Hand-built spatial match setups: two sides of eleven with even, controllable
 * attributes, so shape tests read the tactics and nothing else.
 */
import type { Attributes, Position, Tactics } from '../../src/sim/types';
import type { SpatialSetup, SpatialSide } from '../../src/sim/spatial/types';

const KEYS: (keyof Attributes)[] = ['pac', 'sta', 'str', 'dri', 'pas', 'vis', 'fin', 'hea', 'crs', 'spk', 'tck', 'mrk', 'pos', 'cmp', 'wrk', 'agg', 'ref', 'han', 'kck', 'gkp', 'dur'];
const POSITIONS: Position[] = ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'CM', 'CM', 'W', 'ST', 'W'];

export function tactics(over: Partial<Tactics> = {}): Tactics {
  return {
    formationId: '4-3-3',
    mentality: 3,
    pressing: 3,
    defensiveLine: 3,
    width: 3,
    tempo: 3,
    directness: 3,
    counterAttack: false,
    timeWasting: 1,
    setPieceTakers: { penalties: null, freeKicks: null, corners: null },
    manMarkTarget: null,
    ...over,
  };
}

function attrs(value: number): Attributes {
  const a = {} as Attributes;
  for (const k of KEYS) a[k] = value;
  return a;
}

export function side(prefix: string, t: Tactics = tactics(), value = 65): SpatialSide {
  return {
    name: `${prefix} Town`,
    short: prefix.slice(0, 3).toUpperCase(),
    colors: { primary: '#204080', secondary: '#ffffff' },
    tactics: t,
    players: POSITIONS.map((position, s) => ({
      id: `${prefix}-${s}`,
      name: `${prefix}${s}`,
      jersey: s + 1,
      position,
      attributes: attrs(value),
    })),
  };
}

export function setup(home: Partial<Tactics> = {}, away: Partial<Tactics> = {}): SpatialSetup {
  return { home: side('home', tactics(home)), away: side('away', tactics(away)) };
}

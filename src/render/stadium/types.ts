/**
 * What the 3D stadium needs to know. The UI builds this plain snapshot from
 * the career; the render code never reads the sim, so these types are local
 * copies of the sim's string ids.
 */

export type StandKey = 'west' | 'north' | 'east' | 'south';
export type CornerKey = 'nw' | 'ne' | 'se' | 'sw';
/** What a tap on the 3D ground selects (the Stadium tab's picks, less 'look'). */
export type StadiumPart = StandKey | 'corners' | 'ground';

export const STAND_KEYS: readonly StandKey[] = ['west', 'north', 'east', 'south'];
export const CORNER_KEYS: readonly CornerKey[] = ['nw', 'ne', 'se', 'sw'];

export interface StandSnap {
  /** 0 grass bank, 1 small stand, 2 single tier, 3 two tiers, 4 three tiers. */
  level: number;
  /** 0 none, 1 part roof, 2 full roof. */
  roof: number;
  boxRows: number;
}

export interface StadiumUpgrades {
  floodlights: number;
  videoBoard: number;
  signage: number;
  concourse: number;
  shop: number;
  pitch: number;
}

export interface StadiumWork {
  kind: 'stand' | 'roof' | 'boxes' | 'corner' | 'upgrade' | 'refurbish';
  /** A stand, corner or upgrade id ('ground' for a refurbishment). */
  target: string;
  toLevel: number;
  /** 0-1 share of the work done. */
  progress: number;
  /** Paid for, waiting for the off-season. */
  queued: boolean;
}

export interface StadiumLookSnap {
  seats: 'primary' | 'secondary' | 'mixed' | 'initials';
  mow: 'stripes' | 'wide' | 'checks' | 'diagonal' | 'rings';
  roof: 'white' | 'primary' | 'secondary' | 'grey';
}

export interface StadiumSnapshot {
  name: string;
  clubName: string;
  abbr: string;
  primary: string;
  secondary: string;
  /** The crest as an SVG document string. */
  crestSvg: string;
  stands: Record<StandKey, StandSnap>;
  corners: Record<CornerKey, number>;
  upgrades: StadiumUpgrades;
  look: StadiumLookSnap;
  works: StadiumWork[];
  /** Share (0-1) of each stand's seats shut by building work. */
  closed: Partial<Record<StandKey, number>>;
  /** 0-1 share of open seats sold at the last home match. */
  attendance: number;
  /** 0-1 stadium condition. */
  condition: number;
  /** Advertisers for the boards, most prominent first. */
  sponsors: string[];
}

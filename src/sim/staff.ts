/**
 * Coaching staff and the free-agent pool.
 *
 * Staff ratings track the club's staff quality with a swing. Only the head
 * coach carries a tactical philosophy; the other roles sit at neutral values
 * so the engine can read them without special cases.
 */
import type { Player, StaffMember, StaffRole } from './types';
import { POSITIONS, STAFF_ROLES as ROLE_ORDER } from './types';
import { PLAYERS_TUNING } from './data';
import type { Rng } from './rng';
import { defaultNames, foreignNations, type NameSource } from './names';
import { clampRating, generatePlayer, logCurveAt, pickNationality, roundTo, type IdSource } from './players';

const T = PLAYERS_TUNING;

/** Every role a club employs, in generation order. Mirrors the contract list in types.ts. */
export const STAFF_ROLES: StaffRole[] = [...ROLE_ORDER];

/** Id prefix for staff. */
const STAFF_ID_PREFIX = 's';

interface Philosophy {
  attackLean: number;
  aggression: number;
  preferredFormation: string;
}

function drawHeadCoachPhilosophy(rng: Rng): Philosophy {
  const h = T.staff.headCoach;
  return {
    attackLean: rng.normalClamped(h.leanMean, h.leanSd, 0, 1),
    aggression: rng.normalClamped(h.aggressionMean, h.aggressionSd, 0, 1),
    preferredFormation: rng.pick(T.staff.formations),
  };
}

function neutralPhilosophy(): Philosophy {
  return {
    attackLean: T.staff.neutralLean,
    aggression: T.staff.neutralAggression,
    preferredFormation: T.staff.neutralFormation,
  };
}

export function staffWage(rating: number): number {
  const w = T.staff.wage;
  return Math.max(w.min, roundTo(logCurveAt(w.curve, rating), w.roundTo));
}

export function drawStaffRating(rng: Rng, quality: number): number {
  const s = T.staff;
  const mean = s.ratingBase + (Math.min(1, Math.max(0, quality)) - 0.5) * s.ratingSpan;
  return clampRating(Math.round(rng.normal(mean, s.ratingSd)));
}

export function generateStaffMember(rng: Rng, role: StaffRole, teamId: string | null, quality: number, ids: IdSource, names: NameSource): StaffMember {
  const s = T.staff;
  const nationality = pickNationality(rng, s.domesticShare, foreignNations());
  const id = ids.next(STAFF_ID_PREFIX);
  const firstName = names.firstName(rng, nationality);
  const lastName = names.lastName(rng, nationality);
  const rating = drawStaffRating(rng, quality);
  const age = rng.int(s.age.min, s.age.max);
  const years = rng.int(s.contract.minYears, s.contract.maxYears);
  const philosophy = role === 'headCoach' ? drawHeadCoachPhilosophy(rng) : neutralPhilosophy();
  return {
    id,
    firstName,
    lastName,
    role,
    nationality,
    rating,
    age,
    contract: { wage: staffWage(rating), years },
    teamId,
    ...philosophy,
  };
}

/** One staff member per role, in STAFF_ROLES order. */
export function generateStaff(rng: Rng, teamId: string, quality: number, ids: IdSource, names: NameSource = defaultNames): StaffMember[] {
  return STAFF_ROLES.map((role) => generateStaffMember(rng, role, teamId, quality, ids, names));
}

/** Out-of-contract players: modest quality, mixed ages, no club, nothing left on their deal. */
export function generateFreeAgentPool(rng: Rng, count: number, ids: IdSource, names: NameSource = defaultNames): Player[] {
  const f = T.freeAgents;
  const pool: Player[] = [];
  for (let i = 0; i < count; i++) {
    const position = rng.weighted(POSITIONS, (p) => T.squad.template[p]);
    const nationality = pickNationality(rng, T.squad.domesticShare, foreignNations());
    const quality = rng.float(f.quality.min, f.quality.max);
    const age = rng.int(f.age.min, f.age.max);
    const player = generatePlayer(rng, { position, nationality, quality, age, tier: 'rotation' }, ids, names);
    player.teamId = null;
    player.contract.years = 0;
    pool.push(player);
  }
  return pool;
}

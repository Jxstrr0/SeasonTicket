/**
 * Typed access to the JSON content and tuning files.
 * Every number the sim uses comes from here, never from literals in logic.
 */
import worldJson from '../data/world.json';
import namesJson from '../data/names.json';
import clubsJson from '../data/clubs.json';
import formationsJson from '../data/formations.json';
import playersTuningJson from '../data/tuning/players.json';
import matchTuningJson from '../data/tuning/match.json';
import seasonTuningJson from '../data/tuning/season.json';
import coachTuningJson from '../data/tuning/coach.json';
import careerTuningJson from '../data/tuning/career.json';
import stadiumTuningJson from '../data/tuning/stadium.json';
import spatialTuningJson from '../data/tuning/spatial.json';
import type { Formation, NationId, Position, TeamColors } from './types';

export interface NationDef {
  id: NationId;
  name: string;
  demonym: string;
  /** Flavour key used to pick name pools in names.json. */
  namePool: string;
  /** Relative share of foreign players from this nation (home nation uses domesticShare instead). */
  weight: number;
}

export interface WorldDef {
  country: { id: NationId; name: string; demonym: string; currency: string; currencySymbol: string };
  league: { name: string; abbr: string; tableTrophy: string; playoffTrophy: string };
  regions: { id: string; name: string }[];
  nations: NationDef[];
}

export interface NamePool {
  first: string[];
  last: string[];
}

export interface ClubSeed {
  id: string;
  name: string;
  shortName: string;
  nickname: string;
  city: string;
  region: string;
  abbr: string;
  colors: TeamColors;
  stadiumName: string;
  stadiumCapacity: number;
  marketSize: number;
  stadiumCondition: number;
  finances: number;
  fanMood: number;
  squadQuality: number;
  staffQuality: number;
  /** One sentence of flavour for club selection. */
  blurb?: string;
}

export const WORLD = worldJson as unknown as WorldDef;
export const NAMES = namesJson as unknown as Record<string, NamePool>;
export const CLUBS = clubsJson as unknown as ClubSeed[];
export const FORMATIONS = formationsJson as unknown as Formation[];

export const PLAYERS_TUNING = playersTuningJson;
export const MATCH_TUNING = matchTuningJson;
export const SEASON_TUNING = seasonTuningJson;
export const COACH_TUNING = coachTuningJson;
export const CAREER_TUNING = careerTuningJson;
export const STADIUM_TUNING = stadiumTuningJson;
export const SPATIAL_TUNING = spatialTuningJson;

export type PlayersTuning = typeof playersTuningJson;
export type MatchTuning = typeof matchTuningJson;
export type SeasonTuning = typeof seasonTuningJson;
export type CoachTuning = typeof coachTuningJson;
export type CareerTuning = typeof careerTuningJson;
export type StadiumTuning = typeof stadiumTuningJson;
export type SpatialTuning = typeof spatialTuningJson;

export function formation(id: string): Formation {
  const f = FORMATIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown formation ${id}`);
  return f;
}

export function nation(id: NationId): NationDef {
  if (id === WORLD.country.id) {
    return { id, name: WORLD.country.name, demonym: WORLD.country.demonym, namePool: id, weight: 0 };
  }
  const n = WORLD.nations.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown nation ${id}`);
  return n;
}

export function isDomestic(nationality: NationId): boolean {
  return nationality === WORLD.country.id;
}

export function positionLabel(p: Position): string {
  switch (p) {
    case 'GK': return 'Goalkeeper';
    case 'CB': return 'Centre-back';
    case 'FB': return 'Full-back';
    case 'DM': return 'Defensive midfielder';
    case 'CM': return 'Central midfielder';
    case 'AM': return 'Attacking midfielder';
    case 'W': return 'Winger';
    case 'ST': return 'Striker';
  }
}

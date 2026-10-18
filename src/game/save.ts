/**
 * Saving and loading a career. A save is the career as JSON, deflated with
 * fflate and written as base64 behind a short prefix ("ST1:"), so the same
 * string works in localStorage and as a copy-and-paste save code.
 *
 * Every save carries the career's `version`. Loading runs each migration from
 * that version up to the current one, so an old save is never thrown away.
 */
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { CAREER_VERSION, fullCapacity, initialStadium, newNews, newStory, type Career, type Stadium } from '../sim/career';
import type { Team } from '../sim/types';

export const SAVE_PREFIX = 'ST1:';
export const STORAGE_KEY = 'seasonticket.career';

/**
 * Migrations by the version they upgrade FROM. Each takes the parsed JSON of
 * that version and returns the next version's shape. Add one whenever
 * CAREER_VERSION goes up.
 */
type Migration = (save: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  /** Version 2 adds the stadium builder: every club gets a ground fitted to its old capacity, and hospitality money. */
  1: (save) => {
    const season = save.season as { league: { teams: Team[] } };
    const stadiums: Record<string, Stadium> = {};
    for (const team of season.league.teams) {
      stadiums[team.id] = initialStadium(team);
      team.stadiumCapacity = fullCapacity(stadiums[team.id]);
    }
    save.stadiums = stadiums;
    type Ledger = { income: Record<string, number> };
    for (const books of Object.values(save.books as Record<string, { ledger: Ledger; lastLedger: Ledger | null }>)) {
      books.ledger.income.hospitality ??= 0;
      if (books.lastLedger) books.lastLedger.income.hospitality ??= 0;
    }
    return save;
  },
  /**
   * Version 3 plays every match on the spatial engine (Stage 4.5). A match saved part-way
   * has no record the engine can replay, so it restarts in the engine from where it stood
   * the next time it is opened (src/sim/career/live.ts).
   */
  2: (save) => {
    save.liveRecord = null;
    return save;
  },
  /** Version 4 keeps replays for the 2D viewer. Matches played before it have none. */
  3: (save) => {
    save.replays = { club: {}, round: {} };
    return save;
  },
  /** Version 5 adds the story layer (Stage 6): neutral moods, no events yet, and an "other" income line. */
  4: (save) => {
    save.story = newStory();
    type Ledger = { income: Record<string, number> };
    for (const books of Object.values(save.books as Record<string, { ledger: Ledger; lastLedger: Ledger | null }>)) {
      books.ledger.income.other ??= 0;
      if (books.lastLedger) books.lastLedger.income.other ??= 0;
    }
    return save;
  },
  /** Version 6 adds the newspaper and the social feed (Stage 6.2); the first edition comes next week. */
  5: (save) => {
    save.news = newNews();
    return save;
  },
  /** Version 7 adds press conferences (Stage 6.3): rivalry heat and promises to win, both empty. */
  6: (save) => {
    const story = save.story as Record<string, unknown>;
    story.heat = {};
    story.claims = [];
    story.lastPress = -1;
    return save;
  },
};

export class SaveError extends Error {}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The career as a save code. */
export function encodeSave(career: Career): string {
  const json = JSON.stringify(career);
  return SAVE_PREFIX + toBase64(zlibSync(strToU8(json), { level: 9 }));
}

/** Brings parsed save JSON up to the current version. */
export function migrate(save: Record<string, unknown>): Career {
  let version = typeof save.version === 'number' ? save.version : 0;
  if (version > CAREER_VERSION) throw new SaveError('This save comes from a newer version of the game. Reload the page to update, then try again.');
  let data = save;
  while (version < CAREER_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SaveError(`No way to upgrade a version ${version} save.`);
    data = step(data);
    version += 1;
    data.version = version;
  }
  return data as unknown as Career;
}

/** Reads a save code (spaces and line breaks are ignored). Throws SaveError if it is not one. */
export function decodeSave(code: string): Career {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(SAVE_PREFIX)) throw new SaveError('That is not a Season Ticket save code. It should start with ST1:');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(unzlibSync(fromBase64(clean.slice(SAVE_PREFIX.length)))));
  } catch {
    throw new SaveError('The save code is damaged or incomplete. Check it was copied in full.');
  }
  if (!parsed || typeof parsed !== 'object') throw new SaveError('The save code holds no career.');
  const career = migrate(parsed as Record<string, unknown>);
  if (!career.season || !career.books || !career.userTeamId) throw new SaveError('The save code holds no career.');
  // A code can inflate and parse yet be cut short or hand-edited: check the parts every screen reads.
  const league = career.season.league;
  if (!league || !Array.isArray(league.teams) || !league.players || !league.teams.some((t) => t.id === career.userTeamId) || !career.books[career.userTeamId]) {
    throw new SaveError('The save code is damaged or incomplete. Check it was copied in full.');
  }
  return career;
}

/** Minimal storage interface so tests can pass a fake. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): SaveStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Writes the career to the browser. Returns false if storage is unavailable or full. */
export function saveCareer(career: Career, store: SaveStore | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, encodeSave(career));
    return true;
  } catch {
    return false;
  }
}

export function hasSavedCareer(store: SaveStore | null = defaultStore()): boolean {
  try {
    return !!store?.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/** The saved career, or null if there is none. Throws SaveError if the saved data is unreadable. */
export function loadCareer(store: SaveStore | null = defaultStore()): Career | null {
  let code: string | null = null;
  try {
    code = store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  return code ? decodeSave(code) : null;
}

export function deleteSavedCareer(store: SaveStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: storage is blocked.
  }
}

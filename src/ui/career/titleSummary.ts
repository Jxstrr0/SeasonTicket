/**
 * The title screen's view of the saved career (club, season, crest), kept beside the save
 * so the start-up screen can show "Continue" before the game's code has downloaded
 * (Stage 7.4). The save itself stays the truth: the game rewrites this once it loads.
 */
import type { SavedSummary } from './state';

const KEY = 'seasonticket.title';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadTitleSummary(): SavedSummary | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSummary> | null;
    return s && typeof s.club === 'string' && typeof s.season === 'number' && s.crest && typeof s.crest === 'object' ? (s as SavedSummary) : null;
  } catch {
    return null;
  }
}

export function storeTitleSummary(summary: SavedSummary | null): void {
  try {
    const s = store();
    if (!s) return;
    if (summary) s.setItem(KEY, JSON.stringify(summary));
    else s.removeItem(KEY);
  } catch {
    // Storage full or blocked: the start-up screen just shows no "Continue" until the game loads.
  }
}

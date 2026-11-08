/**
 * Keeping a career safe beyond this browser.
 *
 * The game has its own web address (seasonticket.longlight.games) and so its own browser
 * storage, but if a phone runs low on space the browser may still clear it. Three things help:
 *
 * 1. Asking the browser to keep our storage (`navigator.storage.persist`), once per page load,
 *    and only once there is a career worth keeping (after a save, a backup or a restore).
 * 2. Backup files: the same ST1: save code as a small .txt file, shared to Files on a phone
 *    (or downloaded on a computer), and loaded back through the normal Load code check.
 * 3. A quiet reminder when a career with real progress has no backup, or the last one is old.
 *
 * The last backup time is a per-device setting (its own `seasonticket.lastBackup` key), not
 * part of the save. Nothing here throws: every browser call is feature-checked and wrapped.
 */
import savesTuning from '../../data/tuning/saves.json';

const T = savesTuning.backup;
const LAST_KEY = 'seasonticket.lastBackup';
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Asking the browser to keep the storage
// ---------------------------------------------------------------------------

/** What the storage line on the save-code screen says; null hides it (no storage API). */
export type StorageState = 'protected' | 'at-risk' | null;

interface StorageApi {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

function storageApi(): StorageApi | null {
  try {
    const s = (globalThis.navigator as { storage?: StorageApi } | undefined)?.storage;
    return s && typeof s.persisted === 'function' ? s : null;
  } catch {
    return null;
  }
}

let asked = false;
let known: StorageState = null;

/** The last storage state found, for a render that cannot wait. */
export function storageState(): StorageState {
  return known;
}

/** Looks up whether the browser has promised to keep our storage. */
export async function checkStorage(api: StorageApi | null = storageApi()): Promise<StorageState> {
  if (!api?.persisted) return (known = null);
  try {
    known = (await api.persisted()) ? 'protected' : 'at-risk';
  } catch {
    known = null;
  }
  return known;
}

/**
 * Asks the browser to keep our storage, at most once per page load. Firefox may ask the player;
 * Chrome and Safari decide on their own. Call it once there is progress worth keeping.
 */
export async function requestPersist(api: StorageApi | null = storageApi()): Promise<StorageState> {
  if (asked || !api?.persist) return known;
  asked = true;
  try {
    if (await checkStorage(api) === 'protected') return known;
    known = (await api.persist()) ? 'protected' : 'at-risk';
  } catch {
    // The browser said no or has no answer: the backup file is the safety net.
  }
  return known;
}

/** Tests only: forget that persist was asked for this page load. */
export function resetPersistAsk(): void {
  asked = false;
  known = null;
}

export function storageLine(state: StorageState): string {
  if (state === 'protected') return 'Storage: protected on this device.';
  if (state === 'at-risk') return 'Storage: your browser may clear saves if the phone runs low on space. Keep a backup file.';
  return '';
}

// ---------------------------------------------------------------------------
// The last backup, for the reminder
// ---------------------------------------------------------------------------

/** When the last backup was made, and of which career (its seed), on this device. */
export interface LastBackup {
  at: number;
  seed: number;
}

interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadLastBackup(store: KeyStore | null = defaultStore()): LastBackup | null {
  try {
    const raw = store?.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastBackup> | null;
    return v && Number.isFinite(v.at) && Number.isFinite(v.seed) ? { at: v.at as number, seed: v.seed as number } : null;
  } catch {
    return null;
  }
}

/** Remembers a backup of this career (code copied, file saved, or a code loaded back). */
export function noteBackup(seed: number, now = Date.now(), store: KeyStore | null = defaultStore()): void {
  try {
    store?.setItem(LAST_KEY, JSON.stringify({ at: now, seed }));
  } catch {
    // Storage full or blocked: the reminder may show again, which does no harm.
  }
}

/** The bits of a career the reminder looks at. */
export interface BackupSubject {
  seed: number;
  weekIndex: number;
}

/** True when a career with real progress has never been backed up here, or not for a while. */
export function needsBackupReminder(career: BackupSubject, last: LastBackup | null, now = Date.now()): boolean {
  if (career.weekIndex < T.progressWeeks) return false;
  if (!last || last.seed !== career.seed) return true;
  return now - last.at >= T.remindAfterDays * DAY_MS;
}

/** "3 November 2026" for the save-code screen, or null if this career has no backup here. */
export function lastBackupText(career: BackupSubject, last: LastBackup | null): string | null {
  if (!last || last.seed !== career.seed) return null;
  return new Date(last.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Backup files
// ---------------------------------------------------------------------------

/** `season-ticket-backup-2026-11-06.txt`, by the phone's local date. */
export function backupFileName(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${T.fileSlug}-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.txt`;
}

/**
 * Hands the save code over as a file. On phones that can share files (iPhone: "Save to Files",
 * also from the Home Screen app) it opens the share sheet; elsewhere it downloads. Resolves true
 * when the file was handed over, false if the owner cancelled or nothing worked.
 */
export async function deliverBackupFile(code: string, date = new Date()): Promise<boolean> {
  const name = backupFileName(date);
  const text = code.endsWith('\n') ? code : `${code}\n`;
  try {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof File === 'function' && nav.canShare && nav.share) {
      const file = new File([text], name, { type: 'text/plain' });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file] });
          return true;
        } catch (err) {
          // Cancelled: not saved, and nothing to say about it.
          if ((err as { name?: string })?.name === 'AbortError') return false;
          // Any other share failure falls back to a download.
        }
      }
    }
  } catch {
    // No sharing here: download instead.
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** The text of a chosen backup file, trimmed; null if it is far too big or could not be read. */
export async function readBackupFile(file: Blob): Promise<string | null> {
  if (file.size > T.maxFileMB * 1_000_000) return null;
  try {
    if (typeof file.text === 'function') return (await file.text()).trim();
    // Older Safari has no Blob.text().
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.trim() : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  } catch {
    return null;
  }
}

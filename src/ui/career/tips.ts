/**
 * First-time tips (Stage 7.1): which tip the current view can show, and the
 * record of tips already seen. The record is per device (localStorage), not
 * in the save: tips belong to the person holding the phone, not the career.
 */
import tipsData from '../../data/help/tips.json';
import type { UiState } from './state';

export type TipId = keyof typeof tipsData.tips;
export const TIP_IDS = Object.keys(tipsData.tips) as TipId[];

export interface Tip {
  title: string;
  text: string;
}

export function tipOf(id: TipId): Tip {
  return tipsData.tips[id];
}

export interface TipStore {
  /** The owner turned tips off. */
  off: boolean;
  seen: TipId[];
}

const KEY = 'seasonticket.tips';

function isTipId(v: unknown): v is TipId {
  return typeof v === 'string' && (TIP_IDS as string[]).includes(v);
}

export function loadTips(): TipStore {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as { off?: unknown; seen?: unknown };
      return { off: v.off === true, seen: Array.isArray(v.seen) ? v.seen.filter(isTipId) : [] };
    }
  } catch {
    // Storage blocked or garbled: start fresh.
  }
  return { off: false, seen: [] };
}

export function storeTips(store: TipStore): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage blocked: tips come back next visit.
  }
}

/** What is on screen besides the screen itself: a visitor's card or a press conference. */
export interface OnScreen {
  event: boolean;
  press: boolean;
}

/** Reads the rendered markup for the cards that carry their own tip. */
export function onScreenOf(html: string): OnScreen {
  const press = html.includes('press-card');
  return { press, event: !press && html.includes('event-card') };
}

function liveViewerTip(ui: UiState): TipId | null {
  if (!ui.live.pitch) return null;
  return ui.match3d && ui.quality !== 'off' && !ui.match3dFailed ? 'live-3d' : 'live-pitch';
}

/** While the menu is open or a week is playing, tips wait (and a tip that was showing is not counted as seen). */
export function tipsPaused(ui: UiState): boolean {
  return ui.menuOpen || ui.weekRun !== null || ui.simming;
}

/**
 * Tips the view could show, first choice first: the welcome, then a visitor
 * or press card in front of the owner, then the screen itself.
 */
export function tipCandidates(ui: UiState, hasCareer: boolean, on: OnScreen): TipId[] {
  if (ui.screen === 'new' && ui.draft) return [ui.draft.step === 'club' ? 'new-club' : 'new-brand'];
  if (!hasCareer) return [];
  const cards: TipId[] = [...(on.press ? (['press'] as const) : []), ...(on.event ? (['visitor'] as const) : [])];
  switch (ui.screen) {
    case 'hub':
      return ['welcome', ...cards, ui.inOffice ? 'office' : ui.tab === 'home' ? null : ui.tab].filter((t): t is TipId => t !== null);
    case 'live':
      return ['live', liveViewerTip(ui)].filter((t): t is TipId => t !== null);
    case 'deadline':
      return ['deadline'];
    case 'replay':
      return ['replay'];
    case 'review':
      return ['review'];
    default:
      return [];
  }
}

/** The first tip of the candidates not yet seen, or null (also when tips are off). */
export function nextTip(store: TipStore, candidates: readonly TipId[]): TipId | null {
  if (store.off) return null;
  return candidates.find((t) => !store.seen.includes(t)) ?? null;
}

export function markSeen(store: TipStore, id: TipId): void {
  if (!store.seen.includes(id)) store.seen.push(id);
}

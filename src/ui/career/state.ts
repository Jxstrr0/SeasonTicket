/**
 * View state for the career screens. None of this is saved: the career
 * itself (src/sim/career) is the save, and this only remembers which screen,
 * tab and panel the owner is looking at.
 */
import type { Crest, MatchMode, StandId, TierId } from '../../sim/career';
import type { Position, StaffRole } from '../../sim/types';
import { loadQuality, type QualitySetting } from '../../render/quality';
import audioTuning from '../../data/tuning/audio.json';
import type { Mix } from '../../render/audio/hub';

export type Screen = 'title' | 'new' | 'hub' | 'live' | 'review' | 'gameOver' | 'saveCode' | 'replay' | 'deadline' | 'help' | 'contact' | 'whatsNew';

export type HubTab = 'home' | 'squad' | 'lineup' | 'market' | 'money' | 'club' | 'stadium' | 'inbox' | 'news' | 'league';

export const HUB_TABS: readonly { id: HubTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'squad', label: 'Squad' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'market', label: 'Market' },
  { id: 'money', label: 'Money' },
  { id: 'club', label: 'Club' },
  { id: 'stadium', label: 'Stadium' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'news', label: 'News' },
  { id: 'league', label: 'League' },
];

export type MarketView = 'scout' | 'free' | 'bids';
export type LeagueTab = 'table' | 'results' | 'playoffs';
export type NewsView = 'paper' | 'feed';
export type LivePanel = 'none' | 'subs' | 'tactics';
/** The part of the ground picked on the Stadium tab. */
export type StadiumPick = StandId | 'corners' | 'ground' | 'look';
export const STADIUM_PICKS: readonly StadiumPick[] = ['west', 'east', 'north', 'south', 'corners', 'ground', 'look'];
/** The Stadium tab shows the ground in 3D, or as a flat plan. */
export type StadiumView = 'model' | 'plan';

export interface BrandDraft {
  name: string;
  shortName: string;
  city: string;
  abbr: string;
  primary: string;
  secondary: string;
}

export interface NewCareerDraft {
  step: 'club' | 'brand';
  tier: TierId;
  teamId: string | null;
  branding: BrandDraft;
  crest: Crest;
  homegrown: boolean;
  matchMode: MatchMode;
  seed: string;
}

export interface Flash {
  kind: 'ok' | 'error';
  text: string;
}

/** A summary of the stored career for the title screen. */
export interface SavedSummary {
  club: string;
  season: number;
  crest: Crest;
}

export interface LiveView {
  running: boolean;
  /** Milliseconds per match minute. */
  speed: number;
  panel: LivePanel;
  /** Player picked to come off in the subs panel. */
  subOut: string | null;
  pause: string | null;
  showAll: boolean;
  /** The 2D pitch is showing; play then runs second by second instead of a minute at a time. */
  pitch: boolean;
  /** Match seconds per real second on the 2D pitch. */
  pitchSpeed: number;
  /** The pitch fills the screen, with the subs and tactics laid over it (Stage 5.4). */
  full: boolean;
}

export const PITCH_SPEEDS: readonly { x: number; label: string }[] = [
  { x: 2, label: '2x' },
  { x: 4, label: '4x' },
  { x: 8, label: '8x' },
  { x: 16, label: '16x' },
];

/** Whether the owner watches on the 2D pitch: kept per device, like the quality setting. */
const PITCH_KEY = 'seasonticket.livePitch';

export function loadLivePitch(): boolean {
  try {
    return globalThis.localStorage?.getItem(PITCH_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function storeLivePitch(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(PITCH_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Whether matches show in 3D: kept per device, like the 2D pitch. */
const MATCH_3D_KEY = 'seasonticket.match3d';

export function loadMatch3d(): boolean {
  try {
    return globalThis.localStorage?.getItem(MATCH_3D_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function storeMatch3d(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(MATCH_3D_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Highlights mode for 3D matches (2D between big moments): kept per device. */
const HIGHLIGHTS_KEY = 'seasonticket.matchHighlights';

export function loadHighlights(): boolean {
  try {
    return globalThis.localStorage?.getItem(HIGHLIGHTS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function storeHighlights(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(HIGHLIGHTS_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Full-screen match view: kept per device. */
const FULL_KEY = 'seasonticket.liveFull';

export function loadLiveFull(): boolean {
  try {
    return globalThis.localStorage?.getItem(FULL_KEY) === 'on';
  } catch {
    return false;
  }
}

export function storeLiveFull(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(FULL_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The tactics overlay on the 3D grass: kept per device. */
const SHAPE_KEY = 'seasonticket.matchShape';

export function loadMatchShape(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHAPE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function storeMatchShape(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHAPE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The 3D match camera the owner last picked: kept per device. */
const CAMERA_KEY = 'seasonticket.matchCamera';

export function loadMatchCamera(): string | null {
  try {
    return globalThis.localStorage?.getItem(CAMERA_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeMatchCamera(key: string): void {
  try {
    globalThis.localStorage?.setItem(CAMERA_KEY, key);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/**
 * The sound mix (Stage 7.2): mute and the three sliders, kept per device like the quality
 * setting. Players who had the old Off/Low/Medium/High match sound keep it as the crowd and
 * effects sliders.
 */
const AUDIO_KEY = 'seasonticket.audio';
const OLD_SOUND_KEY = 'seasonticket.sound';
const RADIO_KEY = 'seasonticket.radio';

const level = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

export function loadMix(): Mix {
  const base = audioTuning.mix;
  try {
    const raw = globalThis.localStorage?.getItem(AUDIO_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Mix> | null;
      if (v && typeof v === 'object') {
        return { muted: v.muted === true, crowd: level(v.crowd, base.crowd), effects: level(v.effects, base.effects), music: level(v.music, base.music) };
      }
    }
    const old = globalThis.localStorage?.getItem(OLD_SOUND_KEY) as keyof typeof audioTuning.oldLevels | null;
    if (old && old in audioTuning.oldLevels) {
      const lv = audioTuning.oldLevels[old];
      return old === 'off' ? { ...base, muted: true } : { ...base, crowd: lv, effects: lv };
    }
  } catch {
    // Storage blocked or a bad record: the default.
  }
  return { ...base };
}

export function storeMix(mix: Mix): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_KEY, JSON.stringify(mix));
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The office radio, on or off (off to begin with). */
export function loadRadio(): boolean {
  try {
    return globalThis.localStorage?.getItem(RADIO_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeRadio(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(RADIO_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The frame-rate readout on the 3D match (Stage 5.6), per device. */
const FPS_KEY = 'seasonticket.fps';

export function loadShowFps(): boolean {
  try {
    return globalThis.localStorage?.getItem(FPS_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeShowFps(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(FPS_KEY, '1');
    else globalThis.localStorage?.removeItem(FPS_KEY);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

export const LIVE_SPEEDS: readonly { ms: number; label: string }[] = [
  { ms: 700, label: '1x' },
  { ms: 350, label: '2x' },
  { ms: 120, label: '5x' },
];

export interface UiState {
  screen: Screen;
  /** Where Back on the save-code screen goes. */
  returnTo: Screen;
  title: { saved: SavedSummary | null; error: string | null; importText: string };
  draft: NewCareerDraft | null;
  tab: HubTab;
  /** True while the hub shows the 3D office instead of a tab. */
  inOffice: boolean;
  /** The story event open over the office, if any. */
  sceneId: string | null;
  /** Graphics setting for this device ('off' means plain menus, no office). */
  quality: QualitySetting;
  /** The sound mix for this device. */
  mix: Mix;
  /** The office radio is on. */
  radio: boolean;
  /** The frame-rate readout on the 3D match, for this device. */
  showFps: boolean;
  /** First-time tips are on, for this device (the app keeps the record; this mirrors it for the menu). */
  tipsOn: boolean;
  squadPlayerId: string | null;
  lineupSlot: number | null;
  marketView: MarketView;
  marketPos: Position | 'all';
  marketLimit: number;
  marketPlayerId: string | null;
  leagueTab: LeagueTab;
  resultsWeek: number | null;
  openMatchId: string | null;
  showAllEvents: boolean;
  staffRole: StaffRole | null;
  inboxOpen: string | null;
  newsView: NewsView;
  /** The edition shown (its weekIndex); null for the latest. */
  newsEdition: number | null;
  stadiumPick: StadiumPick;
  stadiumView: StadiumView;
  /** True once the 3D stadium failed on this device; the plan shows instead. */
  stadium3dFailed: boolean;
  /** Matches show in 3D (when Graphics is not Off): kept per device. */
  match3d: boolean;
  /** 3D only for the big moments, 2D between them: kept per device. */
  highlights: boolean;
  /** True once the 3D match failed on this device; the 2D pitch shows instead. */
  match3dFailed: boolean;
  reportOpen: boolean;
  /** The match the 2D replay shows (screen 'replay'). */
  replayId: string | null;
  flash: Flash | null;
  menuOpen: boolean;
  /** An action waiting for a second tap, such as "release:p123". */
  pendingConfirm: string | null;
  /** True while "Sim to season end" steps through weeks. */
  simming: boolean;
  /** The week being played in the background, while "Playing the week..." shows. */
  weekRun: WeekRun | null;
  live: LiveView;
  saveCode: string;
}

export interface WeekRun {
  /** Matches played so far, of `total` (0 of 0 until the week is set up). */
  done: number;
  total: number;
  /** Part of "Sim to end": the screen offers to stop after this week. */
  toEnd: boolean;
  /** The week, as the top bar shows it. */
  label: string;
}

export const MARKET_PAGE = 40;

export function initialUi(): UiState {
  return {
    screen: 'title',
    returnTo: 'hub',
    title: { saved: null, error: null, importText: '' },
    draft: null,
    tab: 'home',
    inOffice: false,
    sceneId: null,
    quality: loadQuality(),
    mix: loadMix(),
    radio: loadRadio(),
    showFps: loadShowFps(),
    tipsOn: true,
    squadPlayerId: null,
    lineupSlot: null,
    marketView: 'scout',
    marketPos: 'all',
    marketLimit: MARKET_PAGE,
    marketPlayerId: null,
    leagueTab: 'table',
    resultsWeek: null,
    openMatchId: null,
    showAllEvents: false,
    staffRole: null,
    inboxOpen: null,
    newsView: 'paper',
    newsEdition: null,
    stadiumPick: 'west',
    stadiumView: 'model',
    stadium3dFailed: false,
    match3d: loadMatch3d(),
    highlights: loadHighlights(),
    match3dFailed: false,
    reportOpen: false,
    replayId: null,
    flash: null,
    menuOpen: false,
    pendingConfirm: null,
    simming: false,
    weekRun: null,
    live: { running: false, speed: 350, panel: 'none', subOut: null, pause: null, showAll: false, pitch: loadLivePitch(), pitchSpeed: 8, full: loadLiveFull() },
    saveCode: '',
  };
}

/**
 * Graphics quality tiers. This file has no three.js import so the menus can
 * read and change the setting without loading the 3D code.
 *
 * The setting is per device (its own localStorage key), not part of the save:
 * a career moved to a laptop with a save code should get High there.
 */
import office from '../data/tuning/office.json';

export type QualityTier = 'low' | 'medium' | 'high';
/** 'off' shows the plain Stage 2 menus with no 3D at all. */
export type QualitySetting = QualityTier | 'off';

export interface TierSettings {
  label: string;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  /** 0 trims decorative props and geometry segments, 2 keeps everything. */
  detail: number;
  crowdDensity: number;
  cityBlocks: number;
}

export const QUALITY_TIERS = office.quality.tiers as Record<QualityTier, TierSettings>;

export const QUALITY_OPTIONS: readonly { id: QualitySetting; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'off', label: 'Off (plain menus)' },
];

const STORAGE_KEY = 'seasonticket.quality';

export function isQualitySetting(value: unknown): value is QualitySetting {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'off';
}

/** Phones and tablets: a coarse pointer or a small screen. */
export function looksLikePhone(env: { coarse: boolean; shortSide: number }): boolean {
  return env.coarse || env.shortSide < 600;
}

export function defaultQuality(env: { coarse: boolean; shortSide: number }): QualityTier {
  return (looksLikePhone(env) ? office.quality.defaultPhone : office.quality.defaultDesktop) as QualityTier;
}

function browserEnv(): { coarse: boolean; shortSide: number } {
  if (typeof window === 'undefined') return { coarse: false, shortSide: 1080 };
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return { coarse, shortSide: Math.min(window.screen?.width ?? 1080, window.screen?.height ?? 1080) };
}

export function loadQuality(): QualitySetting {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isQualitySetting(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the default.
  }
  return defaultQuality(browserEnv());
}

export function storeQuality(setting: QualitySetting): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, setting);
  } catch {
    // Storage blocked: the setting lasts until the page closes.
  }
}

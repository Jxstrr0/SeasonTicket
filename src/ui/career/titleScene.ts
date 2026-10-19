/**
 * The 3D half of the title backdrop (titleBackdrop.ts): the Stadium tab's view in its
 * dusk mode, turning slowly. Loaded only when the title screen shows with graphics on.
 */
import CAREER from '../../data/tuning/career.json';
import type { QualityTier } from '../../render/quality';
import { createStadiumView } from '../../render/stadium/view';
import type { StadiumSnapshot } from '../../render/stadium/types';
import { BRAND, longlightMark } from '../brand';

export interface TitleSceneHandle {
  readonly tier: QualityTier;
  update(ground: StadiumSnapshot | null): void;
  dispose(): void;
}

/** Before any career: a two-tier ground under roofs, in the studio's colours. */
export function defaultGround(): StadiumSnapshot {
  const stand = { level: 3, roof: 2, boxRows: 1 };
  const crest = longlightMark('').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('viewBox="116 172 280 168"', `viewBox="96 132 320 240" style="background:${BRAND.purple}"`);
  return {
    name: 'Longlight Park',
    clubName: 'Season Ticket',
    abbr: 'ST',
    primary: BRAND.purple,
    secondary: BRAND.copper,
    crestSvg: crest,
    stands: { west: { ...stand, level: 4 }, north: { ...stand }, east: { ...stand }, south: { ...stand } },
    corners: { nw: 2, ne: 2, se: 2, sw: 2 },
    upgrades: { floodlights: 2, videoBoard: 1, signage: 1, concourse: 1, shop: 1, pitch: 2 },
    look: { seats: 'primary', mow: 'stripes', roof: 'white' },
    works: [],
    closed: {},
    attendance: 0.85,
    condition: 1,
    sponsors: (CAREER.sponsors.brands as string[]).slice(0, 6),
  };
}

export function createTitleScene(
  slot: HTMLElement,
  tier: QualityTier,
  ground: StadiumSnapshot | null,
  onLost: () => void,
): TitleSceneHandle {
  const view = createStadiumView(slot, { tier, ambient: true, onPick: () => {}, onLost });
  view.update(ground ?? defaultGround());
  const backdrop = slot.parentElement;
  // Let the first frame draw, then fade the 3D in over the still picture.
  const fade = requestAnimationFrame(() => requestAnimationFrame(() => backdrop?.classList.add('live')));
  const onVisibility = (): void => (document.hidden ? view.pause() : view.resume());
  document.addEventListener('visibilitychange', onVisibility);
  return {
    tier,
    update(next) {
      view.update(next ?? defaultGround());
    },
    dispose() {
      cancelAnimationFrame(fade);
      document.removeEventListener('visibilitychange', onVisibility);
      view.dispose();
    },
  };
}

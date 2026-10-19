/**
 * Behind the title screen (Stage 7.6): your stadium at dusk. Every device gets a still
 * picture in the Longlight colours straight away; with graphics on, a slow 3D turn around
 * the ground (your own once you have a career) fades in over it once it has loaded.
 *
 * Plain DOM, so the start-up script can draw the picture before the game has downloaded.
 * The 3D part loads with a dynamic import and is thrown away when the title screen closes,
 * so it never holds a graphics context the office or the match needs.
 */
import type { QualityTier } from '../../render/quality';
import type { StadiumSnapshot } from '../../render/stadium/types';
import type { TitleSceneHandle } from './titleScene';

/** A dusk sky over a floodlit bowl, in the studio's purple and copper. */
const STILL = `<svg class="title-still" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="tb-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1430"/><stop offset="0.45" stop-color="#583696"/><stop offset="0.8" stop-color="#c2826a"/><stop offset="1" stop-color="#e0a47f"/>
    </linearGradient>
    <radialGradient id="tb-glow"><stop offset="0" stop-color="#fff4dc" stop-opacity="0.95"/><stop offset="1" stop-color="#fff4dc" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#tb-sky)"/>
  <path d="M0 760 Q180 700 360 735 T760 720 T1180 730 T1600 700 V900 H0z" fill="#2b2038" opacity="0.7"/>
  <ellipse cx="800" cy="700" rx="520" ry="60" fill="#f3d9a8" opacity="0.18"/>
  <g fill="#1c1820">
    <path d="M220 900 V735 Q800 655 1380 735 V900z"/>
    <path d="M190 748 L220 700 Q800 612 1380 700 L1410 748 Q800 662 190 748z" fill="#2a2233"/>
    <rect x="296" y="520" width="9" height="210"/><rect x="1295" y="520" width="9" height="210"/>
    <rect x="553" y="585" width="7" height="95"/><rect x="1040" y="585" width="7" height="95"/>
    <rect x="272" y="502" width="56" height="24" rx="3"/><rect x="1272" y="502" width="56" height="24" rx="3"/>
    <rect x="536" y="570" width="42" height="18" rx="3"/><rect x="1022" y="570" width="42" height="18" rx="3"/>
  </g>
  <g fill="url(#tb-glow)"><circle cx="300" cy="514" r="66"/><circle cx="1300" cy="514" r="66"/><circle cx="557" cy="579" r="44"/><circle cx="1043" cy="579" r="44"/></g>
  <g fill="none" stroke-width="2"><path d="M250 770 Q800 696 1350 770" stroke="#c2826a" opacity="0.55"/><path d="M240 800 Q800 728 1360 800" stroke="#583696" opacity="0.6"/><path d="M232 832 Q800 762 1368 832" stroke="#583696" opacity="0.45"/></g>
</svg>`;

let root: HTMLDivElement | null = null;
let scene: TitleSceneHandle | null = null;
let loading = 0;
let wanted: { tier: QualityTier; ground: StadiumSnapshot | null } | null = null;

function ensureRoot(): HTMLDivElement {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'title-backdrop';
  root.innerHTML = `${STILL}<div class="title-3d"></div><div class="title-shade"></div>`;
  document.body.prepend(root);
  return root;
}

/**
 * Shows or hides the backdrop. `tier` null keeps the still picture only (graphics Off, or
 * the 3D failed); `ground` null draws a made-up ground in the studio colours.
 */
export function setTitleBackdrop(on: boolean, tier: QualityTier | null = null, ground: StadiumSnapshot | null = null): void {
  if (!on) {
    root?.classList.remove('on');
    document.documentElement.classList.remove('has-title-backdrop');
    dropScene();
    return;
  }
  const el = ensureRoot();
  el.classList.add('on');
  document.documentElement.classList.add('has-title-backdrop');
  if (!tier || prefersStill()) {
    dropScene();
    return;
  }
  wanted = { tier, ground };
  if (scene) {
    if (scene.tier === tier) return scene.update(ground);
    dropScene();
    wanted = { tier, ground };
  }
  void startScene(el);
}

function prefersStill(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function startScene(el: HTMLDivElement): Promise<void> {
  const token = ++loading;
  try {
    const { createTitleScene } = await import('./titleScene');
    const want = wanted;
    if (token !== loading || !want || !root?.classList.contains('on')) return;
    const slot = el.querySelector<HTMLElement>('.title-3d')!;
    scene = createTitleScene(slot, want.tier, want.ground, () => dropScene());
  } catch {
    // No WebGL or the download failed: the still picture stays.
  }
}

function dropScene(): void {
  loading++;
  wanted = null;
  scene?.dispose();
  scene = null;
  root?.classList.remove('live');
}

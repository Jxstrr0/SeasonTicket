/**
 * The 2D pitch on the live match screen (Stage 4.5). The app plays the match a step at a
 * time (src/game/matchday.ts stepLiveView) and tells this view before each step and once
 * per screen frame; the view draws the players between the last two steps, keeps a running
 * clock on the pitch and flashes goals. Like the replay, it lives in one element that is
 * moved into the screen's `[data-slot="live-2d"]` slot after every render, so the canvas
 * survives the menus being rebuilt each minute.
 */
import type { SpatialMatch } from '../../sim/spatial/state';
import { clockLabel } from '../../sim/spatial/systems';
import { PitchView, goalBanner } from '../pitch2d';

const BANNER_MS = 2500;

export class LiveHost {
  private readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly clock: HTMLElement;
  private readonly banner: HTMLElement;
  private view: PitchView | null = null;
  private m: SpatialMatch | null = null;
  /** Match time the view has reached (ms); the engine is at most one step ahead. */
  private viewMs = 0;
  private goalsSeen = 0;
  private bannerUntil = 0;
  private clockText = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'live-pitch';
    this.el.innerHTML = `<canvas aria-label="Top-down view of the match"></canvas>
      <span class="lp-clock"></span>
      <div class="rp-banner" hidden></div>`;
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.clock = this.el.querySelector('.lp-clock') as HTMLElement;
    this.banner = this.el.querySelector('.rp-banner') as HTMLElement;
    new ResizeObserver(() => this.fit()).observe(this.el);
  }

  /** Match time on the pitch. */
  get at(): number {
    return this.viewMs;
  }

  /** Shows `m` in the page's slot, or takes the view away when there is none. */
  sync(root: ParentNode, m: SpatialMatch | null): void {
    const slot = m ? root.querySelector('[data-slot="live-2d"]') : null;
    if (!slot || !m) {
      this.el.remove();
      return;
    }
    slot.replaceWith(this.el);
    if (m !== this.m) {
      // A new match, or the same one rebuilt after a load: start from where it stands.
      this.m = m;
      this.view = new PitchView(this.canvas, m.setup);
      this.view.savePrev(m);
      this.viewMs = m.clockMs;
      this.goalsSeen = m.goalLog.length;
      this.bannerUntil = 0;
      this.banner.hidden = true;
    }
    this.fit();
  }

  /** Call before each engine step, so the view can blend from it. */
  beforeStep(): void {
    if (this.m) this.view?.savePrev(this.m);
  }

  /** Draw the match at `toMs` (no further than the engine has played). */
  show(toMs: number, now: number): void {
    const m = this.m;
    if (!m || !this.view) return;
    this.viewMs = Math.min(toMs, m.clockMs);
    if (m.goalLog.length !== this.goalsSeen) {
      this.goalsSeen = m.goalLog.length;
      this.banner.innerHTML = goalBanner(m);
      this.banner.style.setProperty('--c', this.view.kit[m.goalLog[m.goalLog.length - 1].side].line);
      this.banner.hidden = false;
      this.bannerUntil = now + BANNER_MS;
    } else if (this.bannerUntil && now >= this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.hidden = true;
    }
    this.view.draw(m, this.viewMs);
    const text = clockLabel(m);
    if (text !== this.clockText) this.clock.textContent = this.clockText = text;
  }

  private fit(): void {
    if (!this.view || !this.m || !this.el.isConnected) return;
    this.view.fit(this.el.clientWidth, this.el.clientHeight);
    this.show(this.viewMs, performance.now());
  }
}

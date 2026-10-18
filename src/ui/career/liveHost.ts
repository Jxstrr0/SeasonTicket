/**
 * The 2D pitch on the live match screen (Stage 4.5). The app plays the match a step at a
 * time (src/game/matchday.ts stepLiveView) and tells this view before each step and once
 * per screen frame; the view draws the players between the last two steps, keeps a running
 * clock on the pitch and flashes goals. Like the replay, it lives in one element that is
 * moved into the screen's `[data-slot="live-2d"]` slot after every render, so the canvas
 * survives the menus being rebuilt each minute. With 3D on, the shared 3D match view is
 * laid over the canvas and the 2D pitch stops drawing once the players have loaded (in
 * highlights mode, only while the 3D view is showing a big moment).
 *
 * The 3D view runs a little behind the engine (MatchTape.lagMs). Whenever play stands still
 * (paused, a break, the final whistle) it catches up to where the engine stopped, so the
 * moment that stopped play is seen and heard; when play goes on it waits for the engine to
 * pull that far ahead again.
 */
import type { SpatialMatch } from '../../sim/spatial/state';
import { clockLabel } from '../../sim/spatial/systems';
import { PERIOD } from '../../sim/spatial/types';
import { esc } from '../html';
import { PitchView, goalBanner } from '../pitch2d';
import type { Atmosphere } from './atmosphere';
import type { Match3D, ThreeChoice } from './match3d';
import { MatchTape } from './match3dTape';

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
  /** How far (ms, up to the 3D lag) the 3D view has caught up on the engine. */
  private ahead = 0;
  private lastNow = 0;
  private speed = 1;
  private settleRaf = 0;
  private readonly card: HTMLElement;

  constructor(
    private readonly three: Match3D,
    private readonly atmosphere: Atmosphere,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'live-pitch';
    this.el.innerHTML = `<canvas aria-label="Top-down view of the match"></canvas>
      <span class="lp-clock"></span>
      <div class="rp-banner" hidden></div>
      <div class="lp-break" hidden></div>`;
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.clock = this.el.querySelector('.lp-clock') as HTMLElement;
    this.banner = this.el.querySelector('.rp-banner') as HTMLElement;
    this.card = this.el.querySelector('.lp-break') as HTMLElement;
    new ResizeObserver(() => this.fit()).observe(this.el);
  }

  /** Match time on the pitch. */
  get at(): number {
    return this.viewMs;
  }

  /** Shows `m` in the page's slot, or takes the view away when there is none. */
  sync(root: ParentNode, m: SpatialMatch | null, key = '', choice: ThreeChoice | null = null): void {
    const slot = m ? root.querySelector('[data-slot="live-2d"]') : null;
    if (!slot || !m) {
      this.stopSettle();
      this.three.detach(this.el);
      this.atmosphere.detach(this.el);
      this.el.remove();
      // The match plays on without the pitch (text mode): rebuild from where it stands next time.
      this.m = null;
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
      this.ahead = 0;
      this.stopSettle();
      this.breakCard(null);
    }
    this.atmosphere.attach(this.el, m);
    if (choice?.want && choice.tier) this.three.attach(this.el, this.canvas, key, m, choice);
    else this.three.detach(this.el);
    this.fit();
  }

  /**
   * The match jumped on (skip to the end): nothing from before it plays, and the next
   * sync draws the pitch from where the match now stands.
   */
  jumped(): void {
    if (this.m) this.atmosphere.skip(this.m);
    this.stopSettle();
    this.m = null;
  }

  /** Call before each engine step, so the view can blend from it. */
  beforeStep(): void {
    if (!this.m) return;
    this.view?.savePrev(this.m);
    this.three.savePrev(this.m);
    this.atmosphere.observe(this.m);
  }

  /**
   * Draw the match at `toMs` (no further than the engine has played). `speed` (match
   * seconds per real second) is given while the match is playing; `running` is false while
   * it is held up (a break), when the crowd settles once the view has caught up.
   */
  show(toMs: number, now: number, speed?: number, running = true): void {
    const m = this.m;
    if (!m || !this.view) return;
    if (speed !== undefined) {
      this.stopSettle();
      this.speed = speed;
    }
    const moved = Math.min(toMs, m.clockMs) - this.viewMs;
    this.viewMs += moved;
    const dt = this.lastNow ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;
    const catching = this.ahead < MatchTape.lagMs;
    // Catching up only while play is held: a replay holding the match keeps the lag.
    if (moved > 0) this.ahead = Math.max(0, this.ahead - moved);
    else if (!running) this.ahead = Math.min(MatchTape.lagMs, this.ahead + dt);
    if (moved > 0) this.breakCard(null);
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
    const in3d = this.three.show(m, this.viewMs + this.ahead);
    if (!in3d) this.view.draw(m, this.viewMs);
    // The 3D view runs a little behind the engine; the sound and ticker keep to what is shown.
    if (speed !== undefined) {
      const at = in3d ? MatchTape.shown(this.viewMs + this.ahead) : this.viewMs;
      this.atmosphere.show(m, at, running || moved > 0 || catching, speed, now);
    }
    const text = clockLabel(m);
    if (text !== this.clockText) this.clock.textContent = this.clockText = text;
  }

  /**
   * Play has stopped (paused, or over): let the 3D view, its sound and the ticker catch up
   * to where the engine stopped, then leave the crowd murmuring.
   */
  settle(): void {
    if (!this.m || this.settleRaf) return;
    const frame = (now: number): void => {
      this.settleRaf = 0;
      if (!this.m || !this.el.isConnected) return;
      const done = this.ahead >= MatchTape.lagMs;
      this.show(this.viewMs, now, this.speed, false);
      // show() stops any settling: keep going until a frame finds the view caught up.
      if (!done) this.settleRaf = requestAnimationFrame(frame);
    };
    this.lastNow = performance.now();
    this.settleRaf = requestAnimationFrame(frame);
  }

  /**
   * A card over the pitch for a break (half-time, or before extra time): `coach` when the
   * head coach takes play back on by himself, `owner` when it waits for Play, null to take
   * it away (play going on takes it away too).
   */
  breakCard(who: 'coach' | 'owner' | null): void {
    const m = this.m;
    if (!who || !m) {
      if (!this.card.hidden) this.card.hidden = true;
      return;
    }
    const s = m.setup;
    const title = m.period === PERIOD.SECOND ? 'Half time' : 'Extra time next';
    const next = m.period === PERIOD.SECOND ? 'the second half' : 'extra time';
    const note = who === 'coach' ? `The head coach has the team talk. On with ${next} shortly.` : `Make your changes, then Play for ${next}.`;
    this.card.innerHTML = `<strong>${title}</strong><span class="lp-score">${esc(s.home.short)} ${m.score[0]}-${m.score[1]} ${esc(s.away.short)}</span><span class="small muted">${note}</span>`;
    this.card.hidden = false;
  }

  private stopSettle(): void {
    cancelAnimationFrame(this.settleRaf);
    this.settleRaf = 0;
  }

  private fit(): void {
    if (!this.view || !this.m || !this.el.isConnected) return;
    this.view.fit(this.el.clientWidth, this.el.clientHeight);
    this.show(this.viewMs, performance.now());
  }
}

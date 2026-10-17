/**
 * The 2D replay of a finished match (Stage 4.5, docs/DESIGN.md 17.9). A replay is a recipe,
 * not a film: the engine plays the match again from its record (seed, line-ups and every
 * change). Opening one first plays it through once, a few frames at a time, to check it
 * ends exactly where the real match did and to list its key moments; then it plays back on
 * the pitch. Going back in time plays again from kick-off, quickly, up to that moment.
 *
 * Like the 3D stadium, the view lives in one element that is moved into the screen's slot
 * after every render, so the canvas and the match survive the menus being rebuilt. Its own
 * buttons (data-rp) are handled here; Back (data-action) goes to the app.
 */
import { replayProblem } from '../../sim/spatial/bridge';
import { createSpatial, fingerprint, spatialFinished, stepSpatial } from '../../sim/spatial/engine';
import type { SpatialMatch } from '../../sim/spatial/state';
import { clockLabel, matchTime } from '../../sim/spatial/systems';
import { PERIOD, PERSONS, personOf, type Side } from '../../sim/spatial/types';
import type { MatchReplay } from '../../sim/types';
import { cls, each, esc } from '../html';
import { PitchView, goalBanner, nameOf } from '../pitch2d';
import type { Match3D, ThreeChoice } from './match3d';

/** Match time per real second. */
const SPEEDS = [1, 4, 8, 16, 32] as const;
const DEFAULT_SPEED = 8;
/** A long gap between frames (tab hidden, phone locked) never fast-forwards the match. */
const MAX_FRAME_S = 0.1;
/** Wall time spent stepping per screen frame while loading or seeking. */
const BUSY_MS = 24;
/** A jump to a moment starts this long before it, to see it coming. */
const LEAD_MS = 8000;
const JUMP_MS = 60_000;
const BANNER_MS = 2500;
const READOUT_MS = 200;
/** Engine steps between clock checks while stepping fast. */
const BATCH = 64;

interface Moment {
  ms: number;
  side: Side | -1;
  text: string;
}

type Phase = 'checking' | 'ready' | 'broken';

export class ReplayHost {
  private readonly el: HTMLDivElement;
  private view: PitchView | null = null;
  private replayed: MatchReplay | null = null;
  private phase: Phase = 'checking';
  /** The match on the pitch. */
  private m: SpatialMatch | null = null;
  /** The check run: played to the end once, for the moments and the final whistle. */
  private full: SpatialMatch | null = null;
  private moments: Moment[] = [];
  private endMs = 0;
  /** Match time the view has reached (ms); the engine is at most one step ahead. */
  private viewMs = 0;
  /** Set while fast-stepping to a moment. */
  private target: number | null = null;
  private playing = true;
  private speed = DEFAULT_SPEED;
  private raf = 0;
  private lastFrame = 0;
  private lastReadout = 0;
  private goalsSeen = 0;
  private bannerUntil = 0;
  private visible = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly score: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly seek: HTMLInputElement;
  private readonly controls: HTMLElement;
  private readonly list: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly toggle3d: HTMLButtonElement;

  constructor(private readonly three: Match3D) {
    this.el = document.createElement('div');
    this.el.className = 'replay';
    this.el.innerHTML = `
      <div class="rp-top">
        <button type="button" class="btn-secondary" data-action="close-replay">Back</button>
        <div class="rp-score" aria-live="polite"></div>
        <span class="rp-clock"></span>
        <button type="button" class="btn-secondary rp-3d" data-action="match-3d" hidden>3D</button>
      </div>
      <div class="rp-pitch"><canvas aria-label="Top-down replay of the match"></canvas>
        <div class="rp-status" hidden></div>
        <div class="rp-banner" hidden></div>
      </div>
      <div class="rp-side">
        <div class="rp-controls"></div>
        <label class="rp-seek-label"><span class="muted small">Match time</span>
          <input type="range" class="rp-seek" min="0" max="1" step="1000" value="0" aria-label="Match time">
        </label>
        <div class="rp-moments"></div>
      </div>`;
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.canvas = q('canvas');
    this.status = q('.rp-status');
    this.banner = q('.rp-banner');
    this.score = q('.rp-score');
    this.clock = q('.rp-clock');
    this.seek = q('.rp-seek');
    this.controls = q('.rp-controls');
    this.list = q('.rp-moments');
    this.wrap = q('.rp-pitch');
    this.toggle3d = q('.rp-3d');
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.seek.addEventListener('change', () => this.seekTo(Number(this.seek.value)));
    this.seek.addEventListener('input', () => { this.clock.textContent = this.timeAt(Number(this.seek.value)); });
    new ResizeObserver(() => this.view?.fit(this.wrap.clientWidth, this.wrap.clientHeight)).observe(this.wrap);
  }

  /**
   * Shows `replay` in the page's `[data-slot="replay-2d"]` slot, or stops when there is
   * none. The same replay keeps playing across renders; a new one starts from kick-off.
   */
  sync(root: ParentNode, replay: MatchReplay | null, key = '', choice: ThreeChoice | null = null): void {
    const slot = replay ? root.querySelector('[data-slot="replay-2d"]') : null;
    if (!slot || !replay) {
      this.three.detach(this.wrap);
      this.visible = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.el.remove();
      return;
    }
    slot.replaceWith(this.el);
    if (replay !== this.replayed) this.open(replay);
    this.visible = true;
    const offered = !!choice?.tier && !this.three.failed && this.phase !== 'broken';
    this.toggle3d.hidden = !offered;
    this.toggle3d.textContent = choice?.want ? '2D' : '3D';
    this.toggle3d.setAttribute('aria-label', choice?.want ? 'Show the 2D pitch' : 'Show the match in 3D');
    if (offered && choice?.want && this.m) this.three.attach(this.wrap, this.canvas, key, this.m, choice);
    else this.three.detach(this.wrap);
    this.view?.fit(this.wrap.clientWidth, this.wrap.clientHeight);
    if (!this.raf) {
      this.lastFrame = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  // -------------------------------------------------------------------------
  // The match
  // -------------------------------------------------------------------------

  private fresh(): SpatialMatch {
    const r = structuredClone((this.replayed as MatchReplay).record);
    return createSpatial(r.setup, r.seed, r.mode, r.actions);
  }

  private open(replay: MatchReplay): void {
    this.replayed = replay;
    this.moments = [];
    this.target = null;
    this.viewMs = 0;
    this.goalsSeen = 0;
    this.bannerUntil = 0;
    this.playing = true;
    this.banner.hidden = true;
    this.full = null;
    this.m = null;
    const problem = replayProblem(replay);
    if (problem) return this.fail(problem);
    try {
      this.m = this.fresh();
      this.full = this.fresh();
    } catch {
      return this.fail('This replay could not be read.');
    }
    this.view = new PitchView(this.canvas, this.m.setup);
    this.view.savePrev(this.m);
    this.three.savePrev(this.m);
    this.phase = 'checking';
    this.setStatus('Loading the match…');
    this.renderScore();
    this.renderControls();
    this.list.innerHTML = '';
  }

  private fail(text: string): void {
    this.phase = 'broken';
    this.setStatus(text);
    this.renderControls();
    this.list.innerHTML = '';
  }

  /** Step `m` until `toMs` (or the end) or the time budget runs out; true when there. */
  private fastStep(m: SpatialMatch, toMs: number, until: number): boolean {
    let n = 0;
    while (m.clockMs < toMs && !spatialFinished(m)) {
      stepSpatial(m);
      if (++n % BATCH === 0 && performance.now() >= until) return false;
    }
    return true;
  }

  /** The check run, a slice per frame. */
  private check(until: number): void {
    const full = this.full as SpatialMatch;
    if (!this.fastStep(full, Infinity, until)) {
      this.setStatus(`Loading the match… ${Math.min(99, Math.round((full.clockMs / (95 * 60_000)) * 100))}%`);
      return;
    }
    if (fingerprint(full) !== (this.replayed as MatchReplay).check) {
      return this.fail('This replay comes out differently from the match that was played, so it is not shown.');
    }
    this.phase = 'ready';
    this.endMs = full.clockMs;
    this.moments = momentsOf(full);
    this.seek.max = String(this.endMs);
    this.setStatus(null);
    this.renderControls();
    this.renderMoments();
  }

  private seekTo(ms: number): void {
    if (this.phase !== 'ready' || !Number.isFinite(ms)) return;
    const to = Math.max(0, Math.min(this.endMs, ms));
    const m = this.m as SpatialMatch;
    if (to < m.clockMs) {
      this.m = this.fresh();
      this.goalsSeen = 0;
    }
    this.target = to;
    this.banner.hidden = true;
    this.bannerUntil = 0;
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (!this.visible) return;
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, MAX_FRAME_S) : 0;
    this.lastFrame = now;
    const m = this.m;
    if (this.phase === 'checking') this.check(now + BUSY_MS);
    else if (m && this.phase === 'ready') {
      if (this.target !== null) this.seekFrame(now);
      else if (this.playing && !spatialFinished(m)) this.advance(this.viewMs + dt * 1000 * this.speed);
      this.checkGoals(now);
    }
    if (this.bannerUntil && now >= this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.hidden = true;
    }
    if (this.m && this.three.ready && this.target === null) this.three.show(this.m, this.viewMs);
    else if (this.m && this.view) this.view.draw(this.m, this.viewMs);
    if (now - this.lastReadout >= READOUT_MS) {
      this.lastReadout = now;
      this.renderScore();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private seekFrame(now: number): void {
    const m = this.m as SpatialMatch;
    const to = this.target as number;
    // Stop one step short, so the view blends into the moment like normal play.
    const done = this.fastStep(m, to - m.stepMs, now + BUSY_MS);
    if (!done) {
      this.setStatus('Finding the moment…');
      return;
    }
    this.target = null;
    this.goalsSeen = m.goalLog.length;
    this.view?.savePrev(m);
    this.three.savePrev(m);
    this.viewMs = m.clockMs;
    this.setStatus(null);
    this.renderControls();
  }

  /** Step the engine until it reaches `toMs`, keeping the step before for smooth drawing. */
  private advance(toMs: number): void {
    const m = this.m as SpatialMatch;
    while (m.clockMs < toMs) {
      this.view?.savePrev(m);
      this.three.savePrev(m);
      if (!stepSpatial(m)) break;
    }
    this.viewMs = Math.min(toMs, m.clockMs);
    if (spatialFinished(m)) this.renderControls();
  }

  private checkGoals(now: number): void {
    const m = this.m as SpatialMatch;
    if (m.goalLog.length === this.goalsSeen) return;
    const g = m.goalLog[m.goalLog.length - 1];
    this.goalsSeen = m.goalLog.length;
    this.banner.innerHTML = goalBanner(m);
    this.banner.style.setProperty('--c', this.view?.kit[g.side].line ?? '#fff');
    this.banner.hidden = false;
    this.bannerUntil = now + BANNER_MS;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-rp]');
    const m = this.m;
    if (!el || !m || this.phase !== 'ready') return;
    const at = this.target ?? m.clockMs;
    switch (el.dataset.rp) {
      case 'play':
        if (spatialFinished(m)) {
          this.playing = true;
          this.seekTo(0);
        } else this.playing = !this.playing;
        break;
      case 'speed': {
        const s = Number(el.dataset.speed);
        if ((SPEEDS as readonly number[]).includes(s)) this.speed = s;
        break;
      }
      case 'back':
        this.seekTo(at - JUMP_MS);
        break;
      case 'fwd':
        this.seekTo(at + JUMP_MS);
        break;
      case 'next': {
        const next = this.moments.find((k) => k.ms - LEAD_MS > at + 1000);
        if (next) this.seekTo(next.ms - LEAD_MS);
        break;
      }
      case 'moment':
        // A moment is for seeing how it happened: at real speed.
        this.speed = 1;
        this.playing = true;
        this.seekTo(Number(el.dataset.ms) - LEAD_MS);
        break;
      default:
        return;
    }
    this.renderControls();
  }

  // -------------------------------------------------------------------------
  // Readouts
  // -------------------------------------------------------------------------

  private setStatus(text: string | null): void {
    this.status.hidden = text === null;
    if (text !== null && this.status.textContent !== text) this.status.textContent = text;
  }

  private timeAt(ms: number): string {
    const full = this.full;
    if (!full || this.phase !== 'ready') return '';
    const t = matchTime(full, ms);
    if (t.period >= PERIOD.SHOOTOUT) return 'Pens';
    return `${t.minute}${t.added > 0 ? `+${t.added}` : ''}'`;
  }

  private renderScore(): void {
    const m = this.m;
    if (!m) {
      this.score.textContent = '';
      this.clock.textContent = '';
      return;
    }
    const s = m.setup;
    const k = this.view?.kit;
    const dot = (side: Side) => (k ? `<span class="kit-dot" style="background:${k[side].fill};border-color:${k[side].edge}"></span>` : '');
    const pens = m.shootout ? ` <span class="small">(${m.shootout.score[0]}-${m.shootout.score[1]} pens)</span>` : '';
    const html = `${dot(0)}<span>${esc(s.home.short)}</span> <strong>${m.score[0]}-${m.score[1]}</strong>${pens} <span>${esc(s.away.short)}</span>${dot(1)}`;
    if (this.score.innerHTML !== html) this.score.innerHTML = html;
    this.clock.textContent = this.target !== null ? '…' : clockLabel(m);
    if (this.phase === 'ready' && this.target === null && document.activeElement !== this.seek) this.seek.value = String(Math.round(this.viewMs / 1000) * 1000);
  }

  private renderControls(): void {
    const ready = this.phase === 'ready';
    const ended = ready && !!this.m && spatialFinished(this.m) && this.target === null;
    const off = ready ? '' : ' disabled';
    this.seek.disabled = !ready;
    this.controls.innerHTML = `
      <div class="live-controls">
        <button type="button" class="play-btn" data-rp="play"${off}>${ended ? 'Watch again' : this.playing ? 'Pause' : 'Play'}</button>
        <div class="segmented" role="group" aria-label="Speed">
          ${each(SPEEDS, (s) => `<button type="button" class="${cls('seg', s === this.speed && 'on')}" data-rp="speed" data-speed="${s}" aria-pressed="${s === this.speed}"${off}>${s}x</button>`)}
        </div>
      </div>
      <div class="live-controls rp-jumps">
        <button type="button" class="btn-secondary" data-rp="back"${off}>−1 min</button>
        <button type="button" class="btn-secondary" data-rp="fwd"${off}>+1 min</button>
        <button type="button" class="btn-secondary" data-rp="next"${off}>Next moment</button>
      </div>`;
  }

  private renderMoments(): void {
    const k = this.view?.kit;
    if (!this.moments.length) {
      this.list.innerHTML = '<p class="muted small">No goals or red cards in this one.</p>';
      return;
    }
    this.list.innerHTML = `<div class="card-title">Key moments</div>
      <ul class="rp-moment-list">${each(this.moments, (mo) => `<li><button type="button" class="pick" data-rp="moment" data-ms="${mo.ms}">
        ${mo.side >= 0 && k ? `<span class="kit-dot" style="background:${k[mo.side as Side].fill};border-color:${k[mo.side as Side].edge}"></span>` : ''}
        <span>${esc(this.timeAt(mo.ms))} ${esc(mo.text)}</span></button></li>`)}</ul>
      <p class="muted small">Tap one to watch it at real speed (1x).</p>`;
  }
}

/** Goals, red cards, penalties and the half-time whistle, in time order. */
function momentsOf(m: SpatialMatch): Moment[] {
  const out: Moment[] = [];
  for (const g of m.goalLog) {
    out.push({ ms: g.ms, side: g.side, text: `Goal: ${nameOf(m, g.scorer)}${g.ownGoal ? ' (own goal)' : ''}` });
  }
  for (const e of m.events) {
    if (e.kind === 'red' || (e.kind === 'yellow' && e.note === 'second')) out.push({ ms: e.ms, side: e.side, text: `Red card: ${nameOf(m, e.player)}` });
    else if (e.kind === 'penalty') out.push({ ms: e.ms, side: e.side, text: 'Penalty' });
    else if (e.kind === 'whistle' && e.note === 'half') out.push({ ms: e.ms, side: -1, text: 'Half-time' });
  }
  const shootout = m.periodLog.find((p) => p.period === PERIOD.SHOOTOUT);
  if (shootout) out.push({ ms: shootout.startMs, side: -1, text: 'Penalties' });
  return out.sort((a, b) => a.ms - b.ms);
}

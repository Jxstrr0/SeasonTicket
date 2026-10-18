/**
 * The 3D match (Stage 5, docs/STAGE_5_MATCH_DAY.md) on the live and replay screens. One
 * of these is shared by both hosts, so a match day uses a single WebGL context. It lays
 * the 3D view over the 2D pitch canvas; until the players have loaded (or if 3D cannot
 * start) the 2D pitch keeps drawing underneath.
 *
 * The render code never reads the sim: this turns the engine's state into plain frames
 * (blended between two steps exactly as the 2D pitch does) and a plain scene description.
 * The frames run a little behind the engine (MatchTape), so the players' actions can start
 * before the engine's contact: a leg swings back before the ball leaves it.
 *
 * Stage 5.3 adds the camera buttons and the replays: after a goal or a big chance the match
 * holds (the hosts stop stepping the engine) while this plays the moment again from the tape,
 * slowed down, from one or two angles. In highlights mode the host draws the 2D pitch, and
 * each big moment is played in 3D from its build-up the same way (match3dDirector.ts).
 */
import type { QualityTier } from '../../render/quality';
import { CAMERA_PRESETS, type CameraKey } from '../../render/match/cameras';
import type { MatchFrame3D, MatchScene3D, MatchViewHandle, KitColours, ShapeOverlay3D } from '../../render/match/view';
import type { StadiumSnapshot } from '../../render/stadium/types';
import { teamShapeInfo } from '../../sim/spatial/engine';
import { LENGTH, type SpatialMatch } from '../../sim/spatial/state';
import { PERIOD, PERSONS, personOf, whoSide, type Side, type SpatialSetup } from '../../sim/spatial/types';
import tuning from '../../data/tuning/match3d.json';
import { esc } from '../html';
import { KEEPER_FILL, matchKits } from '../pitch2d';
import { MatchTape } from './match3dTape';
import { Director, type Replay, type Take } from './match3dDirector';
import { loadMatchCamera, loadMatchShape, loadShowFps, storeMatchCamera, storeMatchShape } from './state';

const CAMERA_LABELS: Record<string, { text: string; label: string }> = {
  broadcast: { text: 'TV', label: 'Broadcast camera' },
  box: { text: 'Box', label: "Owner's box camera" },
  goal: { text: 'Goal', label: 'Behind the goal camera' },
  overhead: { text: 'Top', label: 'Overhead tactics camera' },
};

/** A replay being played: which take, and the tape time it has reached. */
interface Playing {
  r: Replay;
  take: number;
  t: number;
  started: boolean;
}

/** What the card shows for a player tapped in the 3D view (Stage 5.4). */
export interface PlayerCard {
  name: string;
  /** Position and the like, already worded. */
  detail: string;
  /** 0 to 1, or null when not known. */
  energy: number | null;
  rating: number | null;
  /** Goals, cards and the like, already worded ('' for none). */
  notes: string;
  /** Set when the owner can take him off: his player id. */
  subId?: string;
}

/** What a host is asked to show. `tier` null means 3D is not offered (Graphics: Off). */
export interface ThreeChoice {
  want: boolean;
  /** 3D for the big moments only, the 2D pitch between them. */
  highlights: boolean;
  tier: QualityTier | null;
  /** The home club's ground for this match. */
  ground: () => StadiumSnapshot;
  /** Played under the floodlights (see nightMatch in atmosphere.ts). */
  night: boolean;
  /** The owner's side, whose shape the tactics overlay draws. */
  side: Side;
  /** The card for the player with person code `who`, or null for none. */
  card?: (who: number) => PlayerCard | null;
}

type Status = 'idle' | 'loading' | 'ready' | 'failed';

/** The kits as the 3D players wear them: outfield [home, away], then the keepers. */
export function sceneKits(setup: SpatialSetup): { kits: [KitColours, KitColours]; keepers: [KitColours, KitColours] } {
  const k = matchKits(setup);
  const outfield = (i: 0 | 1): KitColours => ({ shirt: k[i].fill, trim: k[i].edge, shorts: k[i].edge, socks: k[i].fill });
  const keeper = (i: 0 | 1): KitColours => ({
    shirt: KEEPER_FILL[i],
    trim: tuning.kit.keeperTrim,
    shorts: tuning.kit.keeperShorts,
    socks: KEEPER_FILL[i],
  });
  return { kits: [outfield(0), outfield(1)], keepers: [keeper(0), keeper(1)] };
}

export function sceneOf(setup: SpatialSetup, ground: StadiumSnapshot, night = false): MatchScene3D {
  const people: string[] = [];
  for (let w = 0; w < PERSONS; w++) people.push(personOf(setup, w)?.id ?? '');
  return { ...sceneKits(setup), people, ground, night, weather: setup.weather ?? 'clear' };
}

/**
 * The lines of a side's formation as player indices, back line first: the outfield spots on
 * the pitch in order of their depth without the ball, with a new line wherever the next spot
 * sits more than rowGap deeper. So the lines are the shape the team defends in: a 4-3-3
 * draws 4-5-1 (the wingers drop in beside the midfield) and a 3-5-2 draws 5-3-2.
 */
export function shapeRows(m: SpatialMatch, side: Side): number[][] {
  const t = m.teams[side];
  const order: number[] = [];
  for (let s = 1; s < 11; s++) if (m.on[side * 11 + s]) order.push(s);
  order.sort((a, b) => t.defU[a] - t.defU[b] || a - b);
  const rows: number[][] = [];
  let prev = -Infinity;
  for (const s of order) {
    if (t.defU[s] - prev > tuning.overlay.rowGap) rows.push([]);
    prev = t.defU[s];
    rows[rows.length - 1].push(side * 11 + s);
  }
  return rows;
}

/** The tactics overlay for `side`: its lines, and where its back line is aiming. */
export function shapeOverlay(m: SpatialMatch, side: Side): ShapeOverlay3D {
  const aim = teamShapeInfo(m, side).targetLine;
  return { colour: tuning.overlay.colour, rows: shapeRows(m, side), aimX: side === 0 ? aim : LENGTH - aim };
}

export class Match3D {
  /** Laid over the 2D canvas inside whichever host is showing. */
  private readonly el: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly loading: HTMLElement;
  private handle: MatchViewHandle | null = null;
  private status: Status = 'idle';
  private token = 0;
  private losses = 0;
  private key = '';
  private tier: QualityTier | null = null;
  private parent: HTMLElement | null = null;
  private source: { setup: SpatialSetup; ground: () => StadiumSnapshot; night: boolean } | null = null;
  private readonly tape = new MatchTape();
  private readonly director = new Director();
  private readonly cams: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly shapeBtn: HTMLButtonElement;
  private readonly card: HTMLElement;
  private readonly fps: HTMLElement;
  private fpsTimer = 0;
  private camera: CameraKey;
  /** The tactics overlay is on, and the engine step it was last worked out at. */
  private shape: boolean;
  private shapeStep = -1;
  private choice: ThreeChoice | null = null;
  private match: SpatialMatch | null = null;
  /** Person code of the player whose card is open, or -1; and when the card was last filled. */
  private picked = -1;
  private cardAt = 0;
  private highlights = false;
  /** The 3D view is showing (in highlights mode only during a replay; otherwise 2D). */
  private visible = true;
  private playing: Playing | null = null;
  private epoch = -1;
  /** The host's last view time, and when (real time) it last moved on. */
  private viewMs = 0;
  private movedAt = 0;
  private shootout = false;
  private raf = 0;
  private lastTick = 0;
  private readonly f: MatchFrame3D = {
    px: new Float32Array(22),
    py: new Float32Array(22),
    vx: new Float32Array(22),
    vy: new Float32Array(22),
    on: new Uint8Array(22),
    who: new Int16Array(22),
    ballX: 52.5,
    ballY: 34,
    ballZ: 0,
    ballState: 0,
    owner: -1,
    inHands: false,
    overhead: false,
    matchMs: 0,
    cues: [],
  };

  constructor(private readonly onFail: (message: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'match3d';
    const saved = loadMatchCamera();
    this.camera = CAMERA_PRESETS.find((k) => k === saved) ?? 'broadcast';
    this.el.innerHTML = `<div class="match3d-stage"></div><p class="match3d-loading" hidden>Loading the ground…</p>
      <div class="m3d-bar"><div class="m3d-cams segmented" role="group" aria-label="Camera">${CAMERA_PRESETS.map((k) => `<button type="button" class="seg" data-cam="${k}" aria-label="${CAMERA_LABELS[k].label}">${CAMERA_LABELS[k].text}</button>`).join('')}</div>
      <button type="button" class="m3d-shape" data-m3d="shape" aria-label="Shape: draw your team's lines on the grass">Shape</button></div>
      <div class="m3d-card" hidden></div>
      <span class="m3d-fps" hidden></span>
      <div class="m3d-replay" hidden><span class="m3d-badge" aria-live="polite">Replay</span><button type="button" class="btn-secondary" data-m3d="skip">Skip</button></div>`;
    this.stage = this.el.querySelector('.match3d-stage') as HTMLDivElement;
    this.loading = this.el.querySelector('.match3d-loading') as HTMLElement;
    this.cams = this.el.querySelector('.m3d-cams') as HTMLElement;
    this.badge = this.el.querySelector('.m3d-replay') as HTMLElement;
    this.shapeBtn = this.el.querySelector('.m3d-shape') as HTMLButtonElement;
    this.card = this.el.querySelector('.m3d-card') as HTMLElement;
    this.fps = this.el.querySelector('.m3d-fps') as HTMLElement;
    this.shape = loadMatchShape();
    this.showFps(loadShowFps());
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.renderCams();
    // For checking the draw-call and frame-rate budgets from the browser console.
    if (import.meta.env.DEV) (globalThis as { match3dStats?: () => unknown }).match3dStats = () => this.handle?.stats() ?? null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.handle?.pause();
      else if (this.parent && this.visible) this.handle?.resume();
    });
  }

  /** Shows or hides the frame-rate readout (frames drawn a second, and the longest wait). */
  showFps(on: boolean): void {
    clearInterval(this.fpsTimer);
    this.fpsTimer = 0;
    this.fps.hidden = true;
    if (!on) return;
    this.fpsTimer = window.setInterval(() => {
      const s = this.ready ? this.handle?.stats() : null;
      this.fps.hidden = !s;
      if (s) this.fps.textContent = `${Math.round(s.fps)} fps · ${Math.round(s.worstMs)} ms`;
    }, 1000);
  }

  /** The 3D view is loaded and laid over a host. */
  get ready(): boolean {
    return this.status === 'ready' && !!this.parent;
  }

  /** A replay is playing: the host should hold the match where it is. */
  get holding(): boolean {
    return this.playing !== null && this.ready;
  }

  get failed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Shows match `key` over `canvas` (inside `parent`), loading it if needed. A different
   * key or quality builds the scene again.
   */
  attach(parent: HTMLElement, canvas: HTMLCanvasElement, key: string, m: SpatialMatch, choice: ThreeChoice): void {
    if (this.status === 'failed' || !choice.tier) return this.detach(parent);
    if (this.el.parentElement !== parent) canvas.after(this.el);
    this.parent = parent;
    if (key !== this.key || choice.tier !== this.tier) {
      this.drop();
      this.key = key;
      this.tier = choice.tier;
      this.tape.reset(m);
    }
    this.source = { setup: m.setup, ground: choice.ground, night: choice.night };
    this.choice = choice;
    if (choice.highlights !== this.highlights) {
      this.highlights = choice.highlights;
      this.cancel();
      this.visible = !this.highlights;
    }
    if (this.status === 'idle') this.load(choice.tier, this.source);
    if (this.visible) this.handle?.resume();
    this.mark();
  }

  /** Takes the view out of `parent` (if it is there) and pauses it. */
  detach(parent: HTMLElement): void {
    if (this.parent !== parent) return;
    this.parent = null;
    parent.classList.remove('is-3d');
    this.el.remove();
    this.handle?.pause();
    this.cancel();
  }

  /** Keep the engine's state before its next step (the tape needs every step). */
  savePrev(m: SpatialMatch): void {
    this.tape.capture(m);
  }

  /**
   * Draw the match as it stood a moment before `viewMs` (the engine is at or past it). False
   * when the 3D view is not drawing it, so the host should draw the 2D pitch.
   */
  show(m: SpatialMatch, viewMs: number): boolean {
    this.tape.capture(m);
    if (this.tape.epoch !== this.epoch) {
      // A new match or a seek: the tape started again, and so do the replays.
      this.epoch = this.tape.epoch;
      this.director.reset();
      this.stop(false);
    }
    if (viewMs !== this.viewMs) {
      this.viewMs = viewMs;
      this.movedAt = performance.now();
    }
    this.shootout = m.period >= PERIOD.SHOOTOUT;
    this.match = m;
    const h = this.handle;
    if (!h || !this.ready) return false;
    if (this.picked >= 0 && performance.now() - this.cardAt >= tuning.overlay.cardMs) this.renderCard();
    if (this.playing) return true;
    if (this.shape && m.steps !== this.shapeStep) {
      this.shapeStep = m.steps;
      h.overlay(shapeOverlay(m, this.choice?.side ?? 0));
    }
    const ms = MatchTape.shown(viewMs);
    this.director.scan(this.tape.cues, this.shootout, this.highlights);
    const r = this.director.due(ms, false);
    if (r) {
      this.start(r);
      return true;
    }
    if (this.highlights) return this.wake(false);
    this.tape.frameAt(ms, this.f);
    h.frame(this.f);
    return this.wake(true);
  }

  /** Stop any replay and forget the ones waiting (the host jumped somewhere). */
  /** The home fans jump (a home goal on screen). */
  celebrate(): void {
    this.handle?.celebrate();
  }

  cancel(): void {
    this.director.reset();
    this.epoch = -1;
    this.stop(false);
  }

  /** Lets a new quality setting try again after a failure. */
  reset(): void {
    this.drop();
    this.key = '';
    this.status = 'idle';
    this.losses = 0;
  }

  private mark(): void {
    const on = this.status === 'ready' && this.visible;
    this.parent?.classList.toggle('is-3d', on);
    this.el.classList.toggle('on', on);
  }

  // -------------------------------------------------------------------------
  // Replays and highlights
  // -------------------------------------------------------------------------

  /** Highlights mode: show the 3D view (for a replay) or hide it (the host draws 2D). */
  private setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    if (on) this.handle?.resume();
    else this.handle?.pause();
    this.mark();
  }

  /**
   * Keeps this view's own loop running while a replay waits: when the match stops moving
   * (paused, or over) a replay that is waiting starts at once. Returns `drawn`.
   */
  private wake(drawn: boolean): boolean {
    if (this.director.pending.length && !this.raf) {
      this.lastTick = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
    return drawn;
  }

  private start(r: Replay): void {
    this.playing = { r, take: 0, t: 0, started: false };
    // The replays show the moment itself, without the overlay.
    this.handle?.overlay(null);
    this.shapeStep = -1;
    this.shapeBtn.hidden = true;
    this.setVisible(true);
    this.badge.hidden = false;
    this.label(r, r.takes[0]);
    if (!this.raf) {
      this.lastTick = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** A highlight's run-up plays at real speed, then come the slow-motion replays. */
  private label(r: Replay, take: Take): void {
    const text = take.rate >= 1 ? 'Highlight' : r.kind === 'goal' ? 'Replay: goal' : r.kind === 'save' ? 'Replay: save' : 'Replay';
    this.badge.querySelector('.m3d-badge')!.textContent = text;
  }

  /** Ends the replay (if one is playing); `resume` goes back to the live view. */
  private stop(resume: boolean): void {
    const was = this.playing;
    this.playing = null;
    this.badge.hidden = true;
    this.cams.hidden = false;
    this.shapeBtn.hidden = false;
    if (!was || !this.handle) return;
    this.handle.setCamera(this.camera);
    if (this.highlights) this.setVisible(false);
    if (!resume) return;
    const ms = MatchTape.shown(this.viewMs);
    // Moments that happened during the replay's own run-up were just shown.
    this.director.dropBefore(ms - 1000);
    if (this.highlights) return;
    this.tape.frameAt(ms, this.f);
    this.handle.frame(this.f, true);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const h = this.handle;
    if (!h || !this.ready) return;
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    const p = this.playing;
    if (!p) {
      // Waiting: start a replay once the match has stood still a moment.
      if (now - this.movedAt >= tuning.replays.idleMs) {
        this.director.scan(this.tape.cues, this.shootout, this.highlights);
        const r = this.director.due(MatchTape.shown(this.viewMs), true);
        if (r) this.start(r);
      }
      if (this.playing || this.director.pending.length) this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const take = p.r.takes[p.take];
    // The tape only holds so much: keep inside it.
    const from = Math.max(take.from, this.tape.oldest);
    const to = Math.min(take.to, MatchTape.shown(this.tape.latest));
    let cut = false;
    if (!p.started) {
      p.started = true;
      p.t = from;
      cut = true;
      h.setCamera(take.camera === 'preset' ? this.camera : take.camera, take.end);
      // The owner's own camera can be changed during a take on it, not during the set angles.
      this.cams.hidden = take.camera !== 'preset';
      this.label(p.r, take);
    } else p.t += dt * 1000 * take.rate;
    if (p.t >= to || to <= from) {
      if (p.take + 1 < p.r.takes.length) {
        p.take += 1;
        p.started = false;
      } else {
        this.stop(true);
        this.wake(true);
        return;
      }
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.tape.frameAt(p.t, this.f);
    h.frame(this.f, cut);
    this.raf = requestAnimationFrame(this.tick);
  };

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-cam], [data-m3d]');
    if (!el) {
      // A tap on the grass picks the player nearest it (the card's own buttons belong to the app).
      if (!target.closest('button, .m3d-card') && e instanceof MouseEvent) this.pickAt(e.clientX, e.clientY);
      return;
    }
    e.stopPropagation();
    if (el.dataset.m3d === 'skip') return this.stop(true);
    if (el.dataset.m3d === 'shape') return this.toggleShape();
    if (el.dataset.m3d === 'close') return this.setPicked(-1);
    const key = CAMERA_PRESETS.find((k) => k === el.dataset.cam);
    if (!key || key === this.camera) return;
    this.camera = key;
    storeMatchCamera(key);
    const p = this.playing;
    const take = p?.r.takes[p.take];
    if (!p) this.handle?.setCamera(key);
    else if (take?.camera === 'preset') this.handle?.setCamera(key, take.end);
    this.renderCams();
  }

  private toggleShape(): void {
    this.shape = !this.shape;
    storeMatchShape(this.shape);
    this.shapeStep = -1;
    if (!this.shape) this.handle?.overlay(null);
    else if (this.match && !this.playing) {
      this.shapeStep = this.match.steps;
      this.handle?.overlay(shapeOverlay(this.match, this.choice?.side ?? 0));
    }
    this.renderCams();
  }

  // -------------------------------------------------------------------------
  // The player card
  // -------------------------------------------------------------------------

  private pickAt(x: number, y: number): void {
    const h = this.handle;
    if (!h || !this.ready || !this.visible) return;
    const i = h.pick(x, y);
    this.setPicked(i >= 0 ? this.f.who[i] : -1);
  }

  private setPicked(who: number): void {
    this.picked = who;
    this.handle?.select(who);
    this.renderCard();
  }

  private renderCard(): void {
    this.cardAt = performance.now();
    const c = this.picked >= 0 ? this.choice?.card?.(this.picked) ?? null : null;
    if (!c || !this.source) {
      this.card.hidden = true;
      this.card.innerHTML = '';
      return;
    }
    const kit = matchKits(this.source.setup)[whoSide(this.picked)];
    const energy = c.energy === null ? '' : Math.round(c.energy * 100);
    const band = c.energy === null ? '' : c.energy >= 0.75 ? 'good' : c.energy >= 0.55 ? 'ok' : 'low';
    this.card.innerHTML = `<div class="m3d-card-head"><span class="m3d-swatch" style="--c:${esc(kit.fill)};--e:${esc(kit.edge)}"></span>
      <strong class="m3d-card-name">${esc(c.name)}</strong>
      <button type="button" class="m3d-close" data-m3d="close" aria-label="Close the player card">✕</button></div>
      <div class="muted small">${esc(c.detail)}</div>
      ${c.energy === null ? '' : `<div class="m3d-energy energy-${band}" role="img" aria-label="Energy ${energy}%"><span style="width:${energy}%"></span></div><div class="small">Energy ${energy}%</div>`}
      <div class="small">${c.rating === null ? '' : `Rating <strong>${c.rating.toFixed(1)}</strong>`}${c.rating !== null && c.notes ? ' · ' : ''}${esc(c.notes)}</div>
      ${c.subId ? `<button type="button" class="btn-secondary m3d-sub" data-action="live-sub-pick" data-id="${esc(c.subId)}">Take him off</button>` : ''}`;
    this.card.hidden = false;
  }

  private renderCams(): void {
    for (const b of this.cams.querySelectorAll<HTMLButtonElement>('[data-cam]')) {
      const on = b.dataset.cam === this.camera;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.shapeBtn.classList.toggle('on', this.shape);
    this.shapeBtn.setAttribute('aria-pressed', String(this.shape));
  }

  private load(tier: QualityTier, { setup, ground, night }: NonNullable<Match3D['source']>): void {
    const token = ++this.token;
    this.status = 'loading';
    this.loading.hidden = false;
    let scene: MatchScene3D;
    try {
      scene = sceneOf(setup, ground(), night);
      if (import.meta.env.DEV) {
        // For checking the looks while developing: ?weather=rain&night=1 (left out of the game build).
        const q = new URLSearchParams(location.search);
        const w = q.get('weather');
        if (w) scene.weather = w as MatchScene3D['weather'];
        if (q.has('night')) scene.night = q.get('night') === '1';
      }
    } catch (err) {
      return this.fail(err, 'The 3D match could not start, so the 2D pitch is showing instead.');
    }
    import('../../render/match/view')
      .then(({ createMatchView }) => {
        if (token !== this.token) return;
        this.handle = createMatchView(this.stage, {
          tier,
          scene,
          onReady: () => {
            if (token !== this.token) return;
            this.handle?.setCamera(this.camera);
            this.handle?.select(this.picked);
            this.shapeStep = -1;
            this.status = 'ready';
            this.loading.hidden = true;
            this.mark();
          },
          onError: (err) => {
            if (token === this.token) this.fail(err, 'The 3D players could not load, so the 2D pitch is showing instead.');
          },
          onLost: () => this.lost(token),
        });
        if (!this.parent) this.handle.pause();
      })
      .catch((err: unknown) => {
        if (token === this.token) this.fail(err, 'The 3D match could not start on this device, so the 2D pitch is showing instead.');
      });
  }

  private fail(err: unknown, message: string): void {
    console.error(err);
    this.drop();
    this.status = 'failed';
    this.mark();
    this.parent = null;
    this.el.remove();
    this.onFail(message);
  }

  /** The browser dropped the 3D context. Rebuild once or twice, then give up. */
  private lost(token: number): void {
    if (token !== this.token) return;
    this.losses += 1;
    if (this.losses > 2) {
      this.fail(new Error('WebGL context lost'), 'The 3D match keeps stopping on this device, so the 2D pitch is showing instead. Try Graphics: Low in the menu.');
      return;
    }
    this.drop();
    this.mark();
    if (this.parent && this.tier && this.source) this.load(this.tier, this.source);
  }

  private drop(): void {
    this.stop(false);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.token += 1;
    this.handle?.dispose();
    this.handle = null;
    this.loading.hidden = true;
    if (this.status !== 'failed') this.status = 'idle';
  }
}

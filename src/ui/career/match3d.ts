/**
 * The 3D match (Stage 5, docs/STAGE_5_MATCH_DAY.md) on the live and replay screens. One
 * of these is shared by both hosts, so a match day uses a single WebGL context. It lays
 * the 3D view over the 2D pitch canvas; until the players have loaded (or if 3D cannot
 * start) the 2D pitch keeps drawing underneath.
 *
 * The render code never reads the sim: this turns the engine's state into plain frames
 * (blended between two steps exactly as the 2D pitch does) and a plain scene description.
 */
import type { QualityTier } from '../../render/quality';
import type { MatchFrame3D, MatchScene3D, MatchViewHandle, KitColours } from '../../render/match/view';
import type { StadiumSnapshot } from '../../render/stadium/types';
import type { SpatialMatch } from '../../sim/spatial/state';
import { PERSONS, personOf, type SpatialSetup } from '../../sim/spatial/types';
import tuning from '../../data/tuning/match3d.json';
import { KEEPER_FILL, matchKits } from '../pitch2d';

/** What a host is asked to show. `tier` null means 3D is not offered (Graphics: Off). */
export interface ThreeChoice {
  want: boolean;
  tier: QualityTier | null;
  /** The home club's ground for this match. */
  ground: () => StadiumSnapshot;
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

export function sceneOf(setup: SpatialSetup, ground: StadiumSnapshot): MatchScene3D {
  const people: string[] = [];
  for (let w = 0; w < PERSONS; w++) people.push(personOf(setup, w)?.id ?? '');
  return { ...sceneKits(setup), people, ground, night: false };
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
  private source: { setup: SpatialSetup; ground: () => StadiumSnapshot } | null = null;
  private readonly prevX = new Float64Array(22);
  private readonly prevY = new Float64Array(22);
  private readonly prevBall = new Float64Array(3);
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
    matchMs: 0,
  };

  constructor(private readonly onFail: (message: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'match3d';
    this.el.innerHTML = `<div class="match3d-stage"></div><p class="match3d-loading" hidden>Loading the ground…</p>`;
    this.stage = this.el.querySelector('.match3d-stage') as HTMLDivElement;
    this.loading = this.el.querySelector('.match3d-loading') as HTMLElement;
    // For checking the draw-call and frame-rate budgets from the browser console.
    if (import.meta.env.DEV) (globalThis as { match3dStats?: () => unknown }).match3dStats = () => this.handle?.stats() ?? null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.handle?.pause();
      else if (this.parent) this.handle?.resume();
    });
  }

  /** The 3D view is drawing (the host can stop drawing the 2D pitch). */
  get ready(): boolean {
    return this.status === 'ready' && !!this.parent;
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
      this.savePrev(m);
    }
    this.source = { setup: m.setup, ground: choice.ground };
    if (this.status === 'idle') this.load(choice.tier, m.setup, choice.ground);
    this.handle?.resume();
    this.mark();
  }

  /** Takes the view out of `parent` (if it is there) and pauses it. */
  detach(parent: HTMLElement): void {
    if (this.parent !== parent) return;
    this.parent = null;
    parent.classList.remove('is-3d');
    this.el.remove();
    this.handle?.pause();
  }

  /** Keep the positions before the next engine step, to blend from. */
  savePrev(m: SpatialMatch): void {
    this.prevX.set(m.px);
    this.prevY.set(m.py);
    this.prevBall[0] = m.ball.x;
    this.prevBall[1] = m.ball.y;
    this.prevBall[2] = m.ball.z;
  }

  /** Draw the match as it stands at `viewMs`, between the step before and the engine's. */
  show(m: SpatialMatch, viewMs: number): void {
    const h = this.handle;
    if (!h || this.status !== 'ready') return;
    const f = this.f;
    const a = m.clockMs > viewMs ? Math.min(1, Math.max(0, 1 - (m.clockMs - viewMs) / m.stepMs)) : 1;
    for (let i = 0; i < 22; i++) {
      f.px[i] = this.prevX[i] + (m.px[i] - this.prevX[i]) * a;
      f.py[i] = this.prevY[i] + (m.py[i] - this.prevY[i]) * a;
      f.vx[i] = m.vx[i];
      f.vy[i] = m.vy[i];
      f.on[i] = m.on[i];
      f.who[i] = m.who[i];
    }
    f.ballX = this.prevBall[0] + (m.ball.x - this.prevBall[0]) * a;
    f.ballY = this.prevBall[1] + (m.ball.y - this.prevBall[1]) * a;
    f.ballZ = this.prevBall[2] + (m.ball.z - this.prevBall[2]) * a;
    f.ballState = m.ball.state;
    f.owner = m.ball.owner;
    f.inHands = m.onball.inHands;
    f.matchMs = viewMs;
    h.frame(f);
  }

  /** Lets a new quality setting try again after a failure. */
  reset(): void {
    this.drop();
    this.key = '';
    this.status = 'idle';
    this.losses = 0;
  }

  private mark(): void {
    this.parent?.classList.toggle('is-3d', this.status === 'ready');
    this.el.classList.toggle('on', this.status === 'ready');
  }

  private load(tier: QualityTier, setup: SpatialSetup, ground: () => StadiumSnapshot): void {
    const token = ++this.token;
    this.status = 'loading';
    this.loading.hidden = false;
    let scene: MatchScene3D;
    try {
      scene = sceneOf(setup, ground());
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
    if (this.parent && this.tier && this.source) this.load(this.tier, this.source.setup, this.source.ground);
  }

  private drop(): void {
    this.token += 1;
    this.handle?.dispose();
    this.handle = null;
    this.loading.hidden = true;
    if (this.status !== 'failed') this.status = 'idle';
  }
}

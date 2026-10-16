/**
 * Hosts the 3D stadium on the Stadium tab. Like the office it loads the 3D
 * code only when first needed. The view lives in one element that is moved
 * into the tab's slot after every render (the menus are rebuilt as HTML, but
 * the canvas and its WebGL context survive the move).
 */
import type { Career } from '../../sim/career';
import type { QualityTier } from '../../render/quality';
import type { StadiumPart, StadiumViewHandle, ViewPresetId } from '../../render/stadium/view';
import type { StadiumPick } from './state';
import { buildStadiumSnapshot } from './stadiumSnapshot';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

const PRESETS: readonly { id: ViewPresetId; label: string }[] = [
  { id: 'aerial', label: 'Aerial' },
  { id: 'main', label: 'Main Stand' },
  { id: 'end', label: 'Behind goal' },
  { id: 'top', label: 'Overhead' },
];

function partOfPick(pick: StadiumPick): StadiumPart | null {
  return pick === 'look' ? null : pick;
}

export class StadiumHost {
  private handle: StadiumViewHandle | null = null;
  private status: Status = 'idle';
  private tier: QualityTier | null = null;
  private token = 0;
  private losses = 0;
  private career: Career | null = null;
  private part: StadiumPart | null = null;
  private night = false;
  private preset = 0;
  private visible = false;
  /** Moved into the Stadium tab's slot after each render. */
  private readonly el: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly viewButton: HTMLButtonElement;
  private readonly nightButton: HTMLButtonElement;

  constructor(
    private readonly onPick: (part: StadiumPart) => void,
    private readonly onFail: (message: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'stadium-3d';
    this.el.innerHTML = `<div class="stadium-stage"></div>
      <div class="stadium-loading" hidden><p>Building the ground…</p></div>
      <div class="stadium-tools">
        <button type="button" class="stadium-tool" data-tool="view" aria-label="Change camera">Aerial</button>
        <button type="button" class="stadium-tool" data-tool="night" aria-pressed="false">Night</button>
        <button type="button" class="stadium-tool square" data-tool="out" aria-label="Zoom out">−</button>
        <button type="button" class="stadium-tool square" data-tool="in" aria-label="Zoom in">+</button>
      </div>`;
    this.stage = this.el.querySelector('.stadium-stage') as HTMLDivElement;
    this.loading = this.el.querySelector('.stadium-loading') as HTMLDivElement;
    this.viewButton = this.el.querySelector('[data-tool="view"]') as HTMLButtonElement;
    this.nightButton = this.el.querySelector('[data-tool="night"]') as HTMLButtonElement;
    this.el.addEventListener('click', (e) => {
      const tool = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool;
      if (tool) this.useTool(tool);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.handle?.pause();
      else if (this.visible) this.handle?.resume();
    });
  }

  get failed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Shows the stadium in the page's `[data-slot="stadium-3d"]` slot, or pauses
   * it when there is none. `focus` turns the camera to face the picked part.
   */
  sync(root: ParentNode, career: Career | null, tier: QualityTier | null, pick: StadiumPick, focus: boolean): void {
    if (!career) this.drop();
    this.career = career;
    const slot = root.querySelector('[data-slot="stadium-3d"]');
    this.visible = !!slot && !!career && !!tier && this.status !== 'failed';
    if (!this.visible || !slot || !career || !tier) {
      this.handle?.pause();
      return;
    }
    if (this.el.parentElement !== slot) slot.appendChild(this.el);
    if (this.tier !== tier) this.drop();
    this.tier = tier;
    this.part = partOfPick(pick);
    if (this.status === 'idle') this.load(tier);
    if (this.handle) {
      this.handle.update(buildStadiumSnapshot(career));
      this.handle.select(this.part, focus);
      this.handle.resume();
    }
  }

  private useTool(tool: string): void {
    const h = this.handle;
    if (!h) return;
    if (tool === 'view') {
      this.preset = (this.preset + 1) % PRESETS.length;
      const p = PRESETS[this.preset];
      h.preset(p.id);
      this.viewButton.textContent = p.label;
    } else if (tool === 'night') {
      this.night = !this.night;
      h.setNight(this.night);
      this.nightButton.textContent = this.night ? 'Day' : 'Night';
      this.nightButton.setAttribute('aria-pressed', String(this.night));
    } else if (tool === 'in') {
      h.zoom(-1);
    } else if (tool === 'out') {
      h.zoom(1);
    }
  }

  private load(tier: QualityTier): void {
    const token = ++this.token;
    this.status = 'loading';
    this.loading.hidden = false;
    import('../../render/stadium/view')
      .then(({ createStadiumView }) => {
        if (token !== this.token) return;
        const handle = createStadiumView(this.stage, {
          tier,
          onPick: (part) => this.onPick(part),
          onLost: () => this.lost(token),
        });
        this.handle = handle;
        this.status = 'ready';
        this.loading.hidden = true;
        this.preset = 0;
        this.viewButton.textContent = PRESETS[0].label;
        handle.setNight(this.night);
        if (this.career) handle.update(buildStadiumSnapshot(this.career));
        handle.select(this.part);
        if (!this.visible) handle.pause();
      })
      .catch((err: unknown) => {
        if (token !== this.token) return;
        console.error(err);
        this.drop();
        this.status = 'failed';
        this.visible = false;
        this.onFail('The 3D stadium could not start on this device, so the plan is showing instead.');
      });
  }

  /** The browser dropped the 3D context. Rebuild once or twice, then give up. */
  private lost(token: number): void {
    if (token !== this.token) return;
    this.drop();
    this.losses += 1;
    if (this.losses > 2) {
      this.status = 'failed';
      this.visible = false;
      this.onFail('The 3D stadium keeps stopping on this device, so the plan is showing instead. Try Graphics: Low in the menu.');
      return;
    }
    if (this.visible && this.tier) this.load(this.tier);
  }

  private drop(): void {
    this.token += 1;
    this.handle?.dispose();
    this.handle = null;
    this.loading.hidden = true;
    if (this.status !== 'failed') this.status = 'idle';
  }

  /** Lets a new quality setting try again after a failure. */
  reset(): void {
    this.drop();
    this.status = 'idle';
    this.losses = 0;
  }
}

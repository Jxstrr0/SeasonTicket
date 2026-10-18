/**
 * Hosts the 3D office behind the hub frame. It loads the office code only
 * when it is first needed (so the plain menus never download three.js),
 * shows a loading bar, keeps it in step with the career, and pauses it
 * whenever another screen covers it.
 */
import type { Career } from '../../sim/career';
import type { QualityTier } from '../../render/quality';
import type { OfficeHandle, OfficePick } from '../../render/office';
import type { OfficeSnapshot } from '../../render/office/types';
import { buildOfficeSnapshot } from './office';

type Status = 'idle' | 'loading' | 'ready' | 'failed';

export class OfficeHost {
  private handle: OfficeHandle | null = null;
  private status: Status = 'idle';
  private tier: QualityTier | null = null;
  /** Bumped to drop a load that finished after the office was switched off. */
  private token = 0;
  private losses = 0;
  private readonly loading: HTMLDivElement;
  private readonly bar: HTMLSpanElement;
  private career: Career | null = null;
  private radio = false;

  constructor(
    private readonly layer: HTMLElement,
    private readonly onPick: (pick: OfficePick) => void,
    private readonly onFail: (message: string) => void,
  ) {
    this.loading = document.createElement('div');
    this.loading.className = 'office-loading';
    this.loading.hidden = true;
    this.loading.innerHTML = '<p>Opening the office…</p><div class="office-loading-bar"><span></span></div>';
    this.bar = this.loading.querySelector('span') as HTMLSpanElement;
    layer.appendChild(this.loading);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.handle?.pause();
      else if (this.layer.classList.contains('on')) this.handle?.resume();
    });
  }

  /** True once loading failed on this device; the hub then uses the plain menus. */
  get failed(): boolean {
    return this.status === 'failed';
  }

  /** Shows the office for this career at this tier, or hides it when career is null. */
  sync(career: Career | null, tier: QualityTier | null, radio = false): void {
    this.career = career;
    this.radio = radio;
    const want = !!career && !!tier && this.status !== 'failed';
    document.body.classList.toggle('office-mode', want);
    this.layer.classList.toggle('on', want);
    if (!want || !career || !tier) {
      this.handle?.pause();
      return;
    }
    if (this.tier !== tier) this.drop();
    this.tier = tier;
    if (this.status === 'idle') this.load(tier);
    if (this.handle) {
      this.handle.update(this.snapshot(career));
      this.handle.resume();
    }
  }

  /** The room's picture of the career, with this device's radio. */
  private snapshot(career: Career): OfficeSnapshot {
    return { ...buildOfficeSnapshot(career), radio: this.radio };
  }

  private load(tier: QualityTier): void {
    const token = ++this.token;
    this.status = 'loading';
    this.loading.hidden = false;
    this.bar.style.width = '4%';
    import('../../render/office')
      .then(({ createOffice }) =>
        createOffice(this.layer, {
          tier,
          onPick: (p) => this.onPick(p),
          onProgress: (f) => {
            if (token === this.token) this.bar.style.width = `${Math.round(Math.max(0.04, f) * 100)}%`;
          },
          onLost: () => this.lost(token),
        }),
      )
      .then((handle) => {
        if (token !== this.token) return handle.dispose();
        this.handle = handle;
        this.status = 'ready';
        this.loading.hidden = true;
        // Sync again so the room shows the latest career, or pauses if the owner moved on.
        const on = this.layer.classList.contains('on');
        if (on && this.career) handle.update(this.snapshot(this.career));
        else handle.pause();
      })
      .catch((err: unknown) => {
        if (token !== this.token) return;
        console.error(err);
        this.status = 'failed';
        this.loading.hidden = true;
        this.sync(null, null);
        this.onFail('The 3D office could not start on this device, so the plain menus are showing. You can try a lower Graphics setting in the menu.');
      });
  }

  /** The browser dropped the 3D context. Rebuild once or twice, then give up. */
  private lost(token: number): void {
    if (token !== this.token) return;
    this.drop();
    this.losses += 1;
    if (this.losses > 2) {
      this.status = 'failed';
      this.sync(null, null);
      this.onFail('The 3D office keeps stopping on this device, so the plain menus are showing. Try Graphics: Low in the menu.');
      return;
    }
    if (this.layer.classList.contains('on')) this.sync(this.career, this.tier, this.radio);
  }

  /** Throws the current office away (for a new quality tier). */
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

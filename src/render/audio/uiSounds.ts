/**
 * The menus' small sounds (Stage 7.2): a soft tap on buttons, a knock when a visitor arrives,
 * the phone for offers and deadline-day calls, a page for the newspaper, cameras at a press
 * conference and the war room's clock. All are made in code (synth.ts) on first use and play
 * on the effects slider.
 */
import tuning from '../../data/tuning/audio.json';
import { audioHub } from './hub';
import { synth, type SynthKey } from './synth';

const U = tuning.ui;

export class UiSounds {
  private readonly buffers = new Map<SynthKey, AudioBuffer>();
  private lastTap = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  /** Plays a sound now (`delayS` later), if the effects slider is up. */
  play(key: SynthKey, opts: { delayS?: number; gain?: number; rate?: number } = {}): void {
    if (!audioHub.audible('effects')) return;
    if (key === 'tap') {
      const now = performance.now();
      if (now - this.lastTap < U.tapGapMs) return;
      this.lastTap = now;
    }
    const ctx = audioHub.context();
    const out = audioHub.bus('effects');
    if (!ctx || !out) return;
    audioHub.touch();
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = audioHub.buffer(synth(key, ctx.sampleRate), ctx.sampleRate) ?? undefined;
      if (!buf) return;
      this.buffers.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = U.gain[key] * (opts.gain ?? 1);
    src.connect(gain);
    gain.connect(out);
    src.start(ctx.currentTime + (opts.delayS ?? 0));
  }

  /** The press pack's cameras: a few shutters, close together. */
  cameras(): void {
    for (let i = 0; i < U.shutterBurst; i++) {
      const u = (i * 0.618) % 1;
      this.play('shutter', { delayS: (i / U.shutterBurst) * (U.shutterSpreadMs / 1000) + u * 0.08, gain: 0.6 + 0.4 * u, rate: 0.9 + 0.2 * u });
    }
  }

  /** The war room's clock ticks while `on`. */
  ticking(on: boolean): void {
    if (on === (this.tickTimer !== null)) return;
    if (!on) {
      clearInterval(this.tickTimer as ReturnType<typeof setInterval>);
      this.tickTimer = null;
      return;
    }
    this.tickTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') this.play('tick');
    }, U.tickMs);
  }
}

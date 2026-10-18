/**
 * The game's one audio context (Stage 7.2), shared by the match crowd, the office and the
 * taps and rings of the menus. Phones allow only a few contexts and only start one inside a
 * tap, so everything plays through this. Three buses (crowd, effects, music) each have the
 * volume of their slider in the menu, and mute silences the lot.
 *
 * The context runs while a scene holds it (the match, the office) and for a moment after a
 * one-shot, and sleeps otherwise, so a quiet menu costs no battery.
 */
export type Bus = 'crowd' | 'effects' | 'music';
export const BUSES: readonly Bus[] = ['crowd', 'effects', 'music'];

export interface Mix {
  muted: boolean;
  crowd: number;
  effects: number;
  music: number;
}

/** How long the context stays awake after a one-shot with no scene holding it. */
const IDLE_MS = 3000;
const RAMP_S = 0.15;

type AudioCtor = typeof AudioContext;

function audioContextClass(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Below this the start of a decoded file is the encoder's padding, not the recording. */
const SILENT = 1e-4;

/** First sample (in seconds) louder than the encoder's padding. */
export function firstSound(buf: AudioBuffer): number {
  const x = buf.getChannelData(0);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > SILENT) return i / buf.sampleRate;
  return 0;
}

export class AudioHub {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly holders = new Set<string>();
  private readonly files = new Map<string, Promise<AudioBuffer>>();
  private mix: Mix = { muted: true, crowd: 0, effects: 0, music: 0 };
  private failed = false;
  private hidden = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  /** The browser can play sound at all. */
  static get supported(): boolean {
    return audioContextClass() !== null;
  }

  setMix(mix: Mix): void {
    this.mix = { muted: !!mix.muted, crowd: clamp01(mix.crowd), effects: clamp01(mix.effects), music: clamp01(mix.music) };
    for (const b of BUSES) this.ramp(this.buses.get(b)?.gain, this.mix[b]);
    if (this.mix.muted) this.sleepNow();
    else this.wake();
  }

  getMix(): Mix {
    return { ...this.mix };
  }

  /** Whether a bus would be heard at all. */
  audible(bus: Bus): boolean {
    return !this.mix.muted && this.mix[bus] > 0;
  }

  /** The context, made on first use; null while muted or if the browser has none. */
  context(): AudioContext | null {
    if (this.mix.muted || this.failed) return null;
    if (this.ctx) return this.ctx;
    const Ctor = audioContextClass();
    if (!Ctor) return null;
    // On iPhones, follow the ring/silent switch and leave the owner's own music playing.
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    try {
      this.ctx = new Ctor();
    } catch {
      this.failed = true;
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (const b of BUSES) {
      const g = this.ctx.createGain();
      g.gain.value = this.mix[b];
      g.connect(this.master);
      this.buses.set(b, g);
    }
    return this.ctx;
  }

  /** The bus's input, or null with no context. */
  bus(b: Bus): GainNode | null {
    return this.context() ? (this.buses.get(b) ?? null) : null;
  }

  /** A scene (`who`) wants the context awake (true) or is done with it (false). */
  hold(who: string, on: boolean): void {
    if (on) this.holders.add(who);
    else this.holders.delete(who);
    if (on) this.wake();
    else if (!this.holders.size) this.idle();
  }

  /**
   * Call inside every tap: phones only let a context start in one. Without a scene holding
   * it, it goes back to sleep after a moment.
   */
  unlock(): void {
    if (!this.context()) return;
    this.wake();
    if (!this.holders.size) this.idle();
  }

  /** The page went to the background (true) or came back. */
  sleep(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) this.sleepNow();
    else if (this.holders.size) this.wake();
  }

  /** A one-shot is about to play: keep the context awake long enough to hear it. */
  touch(): void {
    if (!this.ctx) return;
    this.wake();
    if (!this.holders.size) this.idle();
  }

  /** Whether sound can start right now. */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** A sound file under the site's base, fetched and decoded once. */
  load(path: string): Promise<AudioBuffer> {
    const ctx = this.context();
    if (!ctx) return Promise.reject(new Error('No sound'));
    let p = this.files.get(path);
    if (!p) {
      p = fetch(`${import.meta.env.BASE_URL}${path}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: ${r.status}`);
          return r.arrayBuffer();
        })
        // The callback form works on older Safari as well as the promise form elsewhere.
        .then(
          (bytes) =>
            new Promise<AudioBuffer>((ok, fail) => {
              // Newer browsers also return a promise, which rejects alongside `fail`.
              const q = ctx.decodeAudioData(bytes, ok, (err) => fail(err ?? new Error(`${path}: could not decode`))) as Promise<AudioBuffer> | undefined;
              q?.catch(() => undefined);
            }),
        );
      // A failed file can be tried again later.
      p.catch(() => this.files.delete(path));
      this.files.set(path, p);
    }
    return p;
  }

  /** A buffer of made samples. */
  buffer(samples: Float32Array, rate: number): AudioBuffer | null {
    const ctx = this.context();
    if (!ctx) return null;
    const buf = ctx.createBuffer(1, samples.length, rate);
    buf.getChannelData(0).set(samples);
    return buf;
  }

  private wake(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx || this.mix.muted || this.hidden || ctx.state === 'running') return;
    void ctx.resume().catch(() => undefined);
  }

  private idle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.holders.size) this.sleepNow();
    }, IDLE_MS);
  }

  private sleepNow(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    void this.ctx?.suspend().catch(() => undefined);
  }

  private ramp(param: AudioParam | undefined, value: number): void {
    const ctx = this.ctx;
    if (!param || !ctx) return;
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, RAMP_S / 3);
  }
}

/** The one hub for the page. */
export const audioHub = new AudioHub();

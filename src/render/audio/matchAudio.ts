/**
 * Match-day sound (Stage 5.5): a Web Audio mixer for recorded crowd and referee sounds. It
 * knows nothing about football: the UI (src/ui/career/matchSound.ts) reads the match and
 * tells it how big and how excited the crowd is, and which one-shot sounds to play.
 *
 * Two looping beds play under everything: the crowd's murmur, scaled by how full the ground
 * is, and a louder swell that rises as attacks near the box. One-shots (roars, oohs, boos,
 * whistles and kicks) go on top. Sounds load only when the first match-day screen asks for
 * them, and phones only let audio start after a tap, so `unlock` is called from tap handlers.
 */
import tuning from '../../data/tuning/atmosphere.json';

const T = tuning.sound;

export type SoundKey = keyof typeof T.files;
type LoopKey = keyof typeof T.loops;

/** A one-shot: its gain (times the sound's own), stereo pan (-1 left to 1 right) and pitch. */
export interface PlayOptions {
  gain?: number;
  pan?: number;
  rate?: number;
  /** A muffled version, as if from the far end of the ground. */
  far?: boolean;
}

/** Below this the start of a decoded file is the encoder's padding, not the recording. */
const SILENT = 1e-4;

type AudioCtor = typeof AudioContext;

function audioContextClass(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** First sample (in seconds) louder than the encoder's padding. */
function firstSound(buf: AudioBuffer): number {
  const x = buf.getChannelData(0);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > SILENT) return i / buf.sampleRate;
  return 0;
}

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundKey, AudioBuffer[]>();
  private loading: Promise<void> | null = null;
  private readonly beds = new Map<LoopKey, { src: AudioBufferSourceNode; gain: GainNode }>();
  private level = 0;
  private crowd = 0.6;
  private excite = 0;
  private paused = true;
  private duck = 1;
  private failed = false;
  /** A match screen wants sound (between `prepare` and `stop`). */
  private active = false;

  /** The browser can play sound at all. */
  static get supported(): boolean {
    return audioContextClass() !== null;
  }

  /** Volume 0 to 1 (0 stops everything). */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    if (this.level === 0) {
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }
    this.ramp(this.master?.gain, this.level);
    if (this.active) this.prepare();
  }

  /**
   * Wake the audio context inside a tap: phones only let sound start in one, and after that
   * it can be started and stopped freely. Off a match screen it goes straight back to sleep.
   */
  unlock(): void {
    const ctx = this.context();
    if (!ctx || ctx.state === 'running') return;
    void ctx.resume().then(
      () => {
        if (!this.active) void ctx.suspend().catch(() => undefined);
      },
      () => undefined,
    );
  }

  /** A match screen opened: load the sounds (once) and let them play. */
  prepare(): void {
    this.active = true;
    if (!this.context()) return;
    void this.load();
    this.mixBeds();
  }

  private context(): AudioContext | null {
    if (this.level === 0 || this.failed) return null;
    if (this.ctx) return this.ctx;
    const Ctor = audioContextClass();
    if (!Ctor) return null;
    // On iPhones, follow the ring/silent switch and leave the owner's music playing.
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    try {
      this.ctx = new Ctor();
    } catch {
      this.failed = true;
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.level;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** How full the ground is (0 to 1): the bed's loudness. */
  setCrowd(share: number): void {
    this.crowd = Math.max(0, Math.min(1, share));
    this.mixBeds();
  }

  /** How close an attack is to a goal, 0 to 1: the swell's loudness. Call every frame. */
  setExcitement(x: number): void {
    const v = Math.max(0, Math.min(1, x));
    if (Math.abs(v - this.excite) < 0.01) return;
    this.excite = v;
    this.mixBeds();
  }

  /** The match is playing (beds at full) or paused (beds low, no new one-shots). */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.mixBeds();
  }

  /** Quieten the beds for a moment under a big one-shot (a goal's roar). */
  duckBeds(amount: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.duck = amount;
    this.mixBeds();
    window.setTimeout(() => {
      this.duck = 1;
      this.mixBeds();
    }, seconds * 1000);
  }

  play(key: SoundKey, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.level === 0 || ctx.state !== 'running') return;
    const list = this.buffers.get(key);
    if (!list?.length) return;
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = (T.gain[key] ?? 1) * (opts.gain ?? 1);
    let node: AudioNode = src;
    if (opts.far) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      node.connect(lp);
      node = lp;
    }
    if (opts.pan && ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(pan);
      node = pan;
    }
    node.connect(gain);
    gain.connect(out);
    src.start(ctx.currentTime, firstSound(buf));
  }

  /** Stop everything and let the context go (leaving match day). */
  stop(): void {
    this.active = false;
    this.paused = true;
    for (const { src } of this.beds.values()) {
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
    }
    this.beds.clear();
    void this.ctx?.suspend().catch(() => undefined);
  }

  /** The page went to the background: no sound until it comes back. */
  sleep(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => undefined);
    else if (this.active && this.level > 0) void this.ctx.resume().catch(() => undefined);
  }

  private load(): Promise<void> {
    const ctx = this.ctx;
    if (this.loading || !ctx) return this.loading ?? Promise.resolve();
    const base = import.meta.env.BASE_URL;
    const fetchOne = (path: string): Promise<AudioBuffer> =>
      fetch(`${base}${path}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: ${r.status}`);
          return r.arrayBuffer();
        })
        // The callback form works on older Safari as well as the promise form elsewhere.
        .then(
          (bytes) =>
            new Promise<AudioBuffer>((ok, fail) => {
              // Newer browsers also return a promise, which rejects alongside `fail`.
              const p = ctx.decodeAudioData(bytes, ok, (err) => fail(err ?? new Error(`${path}: could not decode`))) as Promise<AudioBuffer> | undefined;
              p?.catch(() => undefined);
            }),
        );
    const keys = Object.keys(T.files) as SoundKey[];
    this.loading = Promise.all(
      keys.map((key) =>
        Promise.all(T.files[key].map(fetchOne)).then(
          (list) => void this.buffers.set(key, list),
          (err: unknown) => console.warn('Match sound did not load:', err),
        ),
      ),
    ).then(() => this.mixBeds());
    return this.loading;
  }

  /** Start the looping beds once they have loaded, and set their gains. */
  private mixBeds(): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.active) return;
    const playing = !this.paused;
    const crowd = T.crowdFloor + (1 - T.crowdFloor) * this.crowd;
    const want: Record<LoopKey, number> = {
      bed: T.gain.bed * crowd * (playing ? 1 : T.pausedBed) * (this.duck < 1 ? T.excite.bedDuck : 1),
      swell: playing ? T.gain.swell * crowd * this.excite * this.duck : 0,
    };
    for (const key of Object.keys(T.loops) as LoopKey[]) {
      let bed = this.beds.get(key);
      if (!bed) {
        const buf = this.buffers.get(key)?.[0];
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = firstSound(buf);
        src.loopEnd = Math.min(buf.duration, src.loopStart + T.loops[key]);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(out);
        src.start(ctx.currentTime, src.loopStart);
        bed = { src, gain };
        this.beds.set(key, bed);
      }
      this.ramp(bed.gain.gain, want[key]);
    }
    if (this.level > 0 && ctx.state !== 'running' && document.visibilityState !== 'hidden') void ctx.resume().catch(() => undefined);
  }

  private ramp(param: AudioParam | undefined, value: number): void {
    const ctx = this.ctx;
    if (!param || !ctx) return;
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, T.fadeS / 3);
  }
}

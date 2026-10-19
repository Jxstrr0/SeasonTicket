/**
 * Match-day sound (Stage 5.5): a Web Audio mixer for recorded crowd and referee sounds. It
 * knows nothing about football: the UI (src/ui/career/matchSound.ts) reads the match and
 * tells it how big and how excited the crowd is, and which one-shot sounds to play.
 *
 * Two looping beds play under everything: the crowd's murmur, scaled by how full the ground
 * is, and a louder swell that rises as attacks near the box. One-shots (roars, oohs, boos,
 * whistles, kicks and chants) go on top. Sounds load only when the first match-day screen asks
 * for them. It plays through the shared audio hub (hub.ts), which owns the context, the
 * volume sliders and mute.
 */
import tuning from '../../data/tuning/atmosphere.json';
import { audioHub, firstSound, type Bus } from './hub';

const T = tuning.sound;
const EFFECTS = new Set<string>(T.effects);

/** Whistles and the ball go on the effects slider; everything the crowd makes on the crowd's. */
export function busOf(key: SoundKey): Bus {
  return EFFECTS.has(key) ? 'effects' : 'crowd';
}

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

export class MatchAudio {
  private readonly buffers = new Map<SoundKey, AudioBuffer[]>();
  private loading: Promise<void> | null = null;
  private readonly beds = new Map<LoopKey, { src: AudioBufferSourceNode; gain: GainNode }>();
  private crowd = 0.6;
  /** The crowd's loudness on top of the ground's fill: a derby is louder. */
  private boost = 1;
  private excite = 0;
  private paused = true;
  private duck = 1;
  private duckTimer = 0;
  /** A match screen wants sound (between `prepare` and `stop`). */
  private active = false;

  /** A match screen opened: load the sounds (once) and let them play. */
  prepare(): void {
    this.active = true;
    if (!audioHub.context()) return;
    audioHub.hold('match', true);
    void this.load();
    this.mixBeds();
  }

  /** The mix changed (unmuted, say): start again if a match screen is open. */
  refresh(): void {
    if (this.active) this.prepare();
  }

  /** How full the ground is (0 to 1): the bed's loudness. */
  setCrowd(share: number): void {
    this.crowd = Math.max(0, Math.min(1, share));
    this.mixBeds();
  }

  /** How much louder than its fill the crowd is (1 normally, more at a derby). */
  setBoost(boost: number): void {
    this.boost = Math.max(0, boost);
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
    if (!this.active) return;
    this.duck = amount;
    this.mixBeds();
    window.clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => {
      this.duck = 1;
      this.mixBeds();
    }, seconds * 1000);
  }

  play(key: SoundKey, opts: PlayOptions = {}): void {
    const ctx = audioHub.context();
    const out = audioHub.bus(busOf(key));
    if (!ctx || !out || !this.active || ctx.state !== 'running' || !audioHub.audible(busOf(key))) return;
    const list = this.buffers.get(key);
    if (!list?.length) return;
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = (T.gain[key] ?? 1) * (opts.gain ?? 1) * (busOf(key) === 'crowd' ? this.boost : 1);
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
    window.clearTimeout(this.duckTimer);
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
    audioHub.hold('match', false);
  }

  private load(): Promise<void> {
    if (this.loading || !audioHub.context()) return this.loading ?? Promise.resolve();
    const keys = Object.keys(T.files) as SoundKey[];
    this.loading = Promise.all(
      keys.map((key) =>
        Promise.all(T.files[key].map((path) => audioHub.load(path))).then(
          (list) => void this.buffers.set(key, list),
          (err: unknown) => console.warn('Match sound did not load:', err),
        ),
      ),
    ).then(() => {
      // Try again next time for any that failed.
      if (this.buffers.size < keys.length) this.loading = null;
      this.mixBeds();
    });
    return this.loading;
  }

  /** Start the looping beds once they have loaded, and set their gains. */
  private mixBeds(): void {
    const ctx = audioHub.context();
    const out = audioHub.bus('crowd');
    if (!ctx || !out || !this.active) return;
    const playing = !this.paused;
    const crowd = (T.crowdFloor + (1 - T.crowdFloor) * this.crowd) * this.boost;
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
      this.ramp(ctx, bed.gain.gain, want[key]);
    }
  }

  private ramp(ctx: AudioContext, param: AudioParam, value: number): void {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, T.fadeS / 3);
  }
}

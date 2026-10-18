/**
 * Small sounds made in code (Stage 7.2): the button tap, the visitor's knock, the phone,
 * the newspaper's page, the press cameras, the war-room clock and the office's room tone.
 * Each is a plain array of samples, so they cost no download and can be tested without a
 * browser. The noise comes from a fixed-seed generator, so a sound is the same every time.
 */
import tuning from '../../data/tuning/audio.json';

export type SynthKey = keyof typeof tuning.ui.gain;

/** A tiny fixed-seed noise source (-1 to 1). */
function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0x1_0000_0000) * 2 - 1;
  };
}

/** One-pole low-pass, in place. */
function lowpass(x: Float32Array, hz: number, rate: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y += a * (x[i] - y);
  return x;
}

/** One-pole high-pass, in place. */
function highpass(x: Float32Array, hz: number, rate: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * hz) / rate);
  let px = 0;
  let py = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    py = a * (py + v - px);
    px = v;
    x[i] = py;
  }
  return x;
}

/** A resonant body (two-pole band-pass) ringing at `hz`, decaying over about `q` cycles. */
function resonate(x: Float32Array, hz: number, q: number, rate: number): Float32Array {
  const w = (2 * Math.PI * hz) / rate;
  const r = Math.exp(-w / (2 * q));
  const b1 = 2 * r * Math.cos(w);
  const b2 = -r * r;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (1 - r) * x[i] + b1 * y1 + b2 * y2;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Scales so the loudest sample is `peak`. */
function normalise(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

/** Adds `src` into `out` from sample `at`. */
function mixIn(out: Float32Array, src: Float32Array, at: number, gain = 1): void {
  for (let i = 0; i < src.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += src[i] * gain;
}

/** A short burst of noise with an exponential decay of `tau` seconds. */
function burst(seconds: number, tau: number, rate: number, seed: number): Float32Array {
  const n = Math.max(1, Math.round(seconds * rate));
  const r = noise(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * Math.exp(-i / rate / tau);
  return x;
}

/** A soft, dry tick for buttons: a little wooden click. */
function tap(rate: number): Float32Array {
  const x = burst(0.05, 0.006, rate, 7);
  resonate(x, 1900, 6, rate);
  return normalise(highpass(x, 400, rate), 0.9);
}

/** Two knuckle knocks on a wooden door. */
function knock(rate: number): Float32Array {
  const out = new Float32Array(Math.round(0.62 * rate));
  const one = (seed: number, hz: number): Float32Array => {
    const thud = burst(0.16, 0.025, rate, seed);
    resonate(thud, hz, 4, rate);
    const click = burst(0.01, 0.002, rate, seed + 1);
    resonate(click, 2300, 3, rate);
    mixIn(thud, click, 0, 0.2);
    return lowpass(thud, 3000, rate);
  };
  mixIn(out, one(11, 170), 0);
  mixIn(out, one(13, 185), Math.round(0.23 * rate), 0.9);
  return normalise(highpass(out, 70, rate), 0.95);
}

/** A desk phone's double ring, twice. */
function ring(rate: number): Float32Array {
  const seconds = 2.6;
  const out = new Float32Array(Math.round(seconds * rate));
  const bursts = [0, 0.45, 1.6, 2.05];
  for (const at of bursts) {
    const n = Math.round(0.38 * rate);
    const start = Math.round(at * rate);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / rate;
      // Two tones, warbled at 20 Hz like an old bell ringer, with soft edges.
      const warble = 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 20 * t));
      const env = Math.min(1, t / 0.01, (0.38 - t) / 0.03);
      const v = Math.sin(2 * Math.PI * 1020 * t) * warble + Math.sin(2 * Math.PI * 1260 * t) * (1 - warble);
      out[start + i] += 0.5 * v * env;
    }
  }
  return normalise(lowpass(out, 4500, rate), 0.6);
}

/** A newspaper page turned: a rising rustle and a soft flap. */
function page(rate: number): Float32Array {
  const n = Math.round(0.5 * rate);
  const r = noise(21);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Rustle swells and fades; crackle comes from random sparse spikes.
    const env = Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 2;
    const crackle = r() > 0.94 ? r() * 2 : 0;
    x[i] = (r() * 0.5 + crackle) * env;
  }
  highpass(x, 900, rate);
  lowpass(x, 7000, rate);
  const flap = burst(0.12, 0.03, rate, 23);
  lowpass(flap, 500, rate);
  mixIn(x, flap, Math.round(0.36 * rate), 2.5);
  return normalise(x, 0.7);
}

/** One press camera's shutter: a sharp double click. */
function shutter(rate: number): Float32Array {
  const out = new Float32Array(Math.round(0.14 * rate));
  const click = (seed: number): Float32Array => {
    const c = burst(0.025, 0.003, rate, seed);
    resonate(c, 3200, 3, rate);
    return highpass(c, 1200, rate);
  };
  mixIn(out, click(31), 0);
  mixIn(out, click(33), Math.round(0.07 * rate), 0.7);
  return normalise(out, 0.85);
}

/** A wall clock's tick. */
function tick(rate: number): Float32Array {
  const x = burst(0.04, 0.004, rate, 41);
  resonate(x, 2800, 8, rate);
  return normalise(highpass(x, 1000, rate), 0.7);
}

/**
 * The office's room tone: a few seconds of soft, low air (brown noise) that loops without a
 * seam, its end faded into its start.
 */
function room(rate: number): Float32Array {
  const seconds = tuning.office.roomToneS;
  const fade = Math.round(1 * rate);
  const n = Math.round(seconds * rate) + fade;
  const r = noise(51);
  const x = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) {
    b = (b + 0.02 * r()) * 0.998;
    x[i] = b;
  }
  highpass(x, 40, rate);
  lowpass(x, 600, rate);
  const out = x.slice(0, n - fade);
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    out[i] = out[i] * Math.sin((u * Math.PI) / 2) + x[n - fade + i] * Math.cos((u * Math.PI) / 2);
  }
  return normalise(out, 0.5);
}

const MAKERS: Record<SynthKey | 'room', (rate: number) => Float32Array> = { tap, knock, ring, page, shutter, tick, room };

/** The samples (mono, at `rate`) for a made sound. */
export function synth(key: SynthKey | 'room', rate: number): Float32Array {
  return MAKERS[key](rate);
}

export const SYNTH_KEYS = Object.keys(tuning.ui.gain) as SynthKey[];

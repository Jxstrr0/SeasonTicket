/**
 * Canvas textures for the stadium: seats in the club's scheme, the outside
 * cladding, hospitality glass, advertising, the pitch, the video board and
 * the hoarding around queued building work.
 *
 * All canvases use the default flipY, so the bottom of a canvas is v = 0.
 */
import { RepeatWrapping } from 'three';
import { ScreenTexture } from '../office/screens';
import { PITCH, seatsAlong } from './layout';
import type { StadiumLookSnap, StadiumSnapshot } from './types';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const ROW_PX = 4;
/** The pitch canvas covers the grass beyond the lines too. */
export const GRASS = { length: PITCH.length + 12, width: PITCH.width + 10 };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function luma(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/** Seat colour is the club colour, but very pale or very dark colours are pulled in a little so rows still read. */
function seatColour(hex: string): string {
  const l = luma(hex);
  if (l > 225) return shade(hex, 0.86);
  if (l < 28) return '#2a2d33';
  return hex;
}

export interface SeatPaint {
  /** Row length in metres at the front (sets seats per row). */
  length: number;
  rows: number;
  /** Rows in the lowest tier, where initials go. */
  lowerRows: number;
  scheme: StadiumLookSnap['seats'];
  primary: string;
  secondary: string;
  abbr: string;
  /** Share of the stand (from its left end) closed for building work. */
  closed: number;
  /** Corners skip the initials. */
  initials: boolean;
}

export function seatTexture(p: SeatPaint, anisotropy: number): ScreenTexture {
  const seats = seatsAlong(p.length);
  const w = Math.min(2048, Math.max(64, seats * 2));
  const h = Math.max(8, p.rows * ROW_PX);
  const s = new ScreenTexture(w, h, anisotropy);
  const { ctx } = s;
  const prim = seatColour(p.primary);
  const sec = seatColour(p.secondary);
  const px = w / p.length;
  const base = p.scheme === 'secondary' ? sec : prim;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  if (p.scheme === 'mixed') {
    ctx.fillStyle = sec;
    for (let x = 6; x < p.length; x += 18) ctx.fillRect(x * px, 0, 6 * px, h);
  }
  if (p.scheme === 'initials' && p.initials && p.abbr) {
    // Big letters in the second colour across the lower tier.
    const rows = Math.max(4, p.lowerRows);
    const size = rows * ROW_PX * 0.86;
    ctx.save();
    ctx.fillStyle = sec;
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = p.abbr.split('').join(String.fromCharCode(8202));
    const maxW = w * 0.7;
    const mw = ctx.measureText(text).width;
    const sx = mw > maxW ? maxW / mw : 1;
    ctx.translate(w / 2, h - (rows * ROW_PX) / 2);
    ctx.scale(sx * 1.6, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // Aisles every 12 m.
  ctx.fillStyle = '#6c7077';
  for (let x = 6; x < p.length - 1; x += 12) ctx.fillRect(Math.round(x * px), 0, Math.max(2, Math.round(px * 0.9)), h);
  // Seat edges and the shadow of each row's seat backs.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 1; x < w; x += 2) ctx.fillRect(x, 0, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  for (let r = 0; r < p.rows; r++) ctx.fillRect(0, h - r * ROW_PX - 1, w, 1);
  // Seats shut for building work: grey with hazard hatching.
  if (p.closed > 0) {
    const cw = Math.round(w * Math.min(1, p.closed));
    ctx.fillStyle = '#7d8087';
    ctx.fillRect(0, 0, cw, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,40,44,0.55)';
    ctx.lineWidth = 3;
    for (let x = -h; x < cw + h; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  s.done();
  return s;
}

/** Light grey cladding panels; the material colour tints it. 8 m by 40 m per tile. */
export function claddingTexture(anisotropy: number): ScreenTexture {
  const s = new ScreenTexture(128, 640, anisotropy);
  const { ctx, w, h } = s;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#d6d6d6');
  g.addColorStop(1, '#bdbdbd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const m = w / 8;
  // Vertical panel joints every 2 m, horizontal every 4 m.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < 8; x += 2) ctx.fillRect(x * m, 0, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < 40; y += 4) ctx.fillRect(0, h - y * m - 1, w, 1);
  // A darker plinth at the bottom.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, h - 1.2 * m, w, 1.2 * m);
  // Window bands (dark when the concourse is unlit).
  ctx.fillStyle = 'rgba(30,36,48,0.7)';
  for (const [y0, y1] of WINDOW_BANDS) for (let x = 0.3; x < 8; x += 2) ctx.fillRect(x * m, h - y1 * m, 1.4 * m, (y1 - y0) * m);
  s.texture.wrapS = RepeatWrapping;
  s.texture.wrapT = RepeatWrapping;
  s.done();
  return s;
}

/** Heights (m) of the window bands on the outside of a stand. */
const WINDOW_BANDS: [number, number][] = [
  [3.0, 4.8],
  [10.4, 11.8],
  [20.6, 21.8],
];

/** Glow for the window bands, used as an emissive map when the concourse is upgraded. */
export function windowGlowTexture(anisotropy: number): ScreenTexture {
  const s = new ScreenTexture(128, 640, anisotropy);
  const { ctx, w, h } = s;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const m = w / 8;
  for (const [y0, y1] of WINDOW_BANDS) {
    for (let x = 0.3; x < 8; x += 2) {
      const g = ctx.createLinearGradient(0, h - y1 * m, 0, h - y0 * m);
      g.addColorStop(0, '#ffe7b8');
      g.addColorStop(1, '#f2a75a');
      ctx.fillStyle = g;
      ctx.fillRect(x * m, h - y1 * m, 1.4 * m, (y1 - y0) * m);
    }
  }
  s.texture.wrapS = RepeatWrapping;
  s.texture.wrapT = RepeatWrapping;
  s.done();
  return s;
}

/** Hospitality boxes: lit rooms behind glass, `boxes` across, `rows` high. */
export function glassTexture(boxes: number, rows: number, primary: string, seed: string, anisotropy: number): ScreenTexture {
  const w = Math.min(1024, Math.max(128, boxes * 24));
  const s = new ScreenTexture(w, 48 * rows, anisotropy);
  const { ctx, h } = s;
  ctx.fillStyle = '#111821';
  ctx.fillRect(0, 0, w, h);
  let x = hash(seed) || 1;
  const rnd = (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const cw = w / boxes;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < boxes; i++) {
      const bx = i * cw + 2;
      const by = r * rh + 3;
      const bw = cw - 4;
      const bh = rh - 6;
      const lit = rnd() > 0.12;
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, lit ? '#fff1d0' : '#2a3442');
      g.addColorStop(1, lit ? '#d9944f' : '#1a2230');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw, bh);
      if (lit) {
        // Guests: small dark heads and shoulders along the window.
        ctx.fillStyle = 'rgba(30,22,18,0.75)';
        const n = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          const gx = bx + 2 + rnd() * (bw - 6);
          ctx.fillRect(gx, by + bh * 0.55, 3, bh * 0.45);
          ctx.fillRect(gx + 0.5, by + bh * 0.42, 2, 2);
        }
      }
      // A club-colour strip along the box fronts.
      ctx.fillStyle = primary;
      ctx.fillRect(i * cw, r * rh + rh - 3, cw, 3);
    }
  }
  // Mullions.
  ctx.fillStyle = '#0b0f15';
  for (let i = 0; i <= boxes; i++) ctx.fillRect(Math.round(i * cw) - 1, 0, 2, h);
  s.done();
  return s;
}

const AD_COLOURS = ['#c8102e', '#0b3d91', '#f2a900', '#00843d', '#5b2c83', '#e35205', '#00a3e0', '#222831'];

/**
 * A strip of advertising, 48 m long per repeat: three sponsors and the
 * club. Used on the pitch-side boards and the LED ribbons on tier fronts.
 */
export function paintAds(s: ScreenTexture, snap: Pick<StadiumSnapshot, 'sponsors' | 'primary' | 'secondary' | 'abbr' | 'clubName'>): void {
  const { ctx, w, h } = s;
  const brands = [...snap.sponsors];
  while (brands.length < 3) brands.push(brands[0] ?? snap.clubName);
  const panels: { text: string; bg: string; fg: string }[] = [
    { text: brands[0], bg: AD_COLOURS[hash(brands[0]) % AD_COLOURS.length], fg: '#ffffff' },
    { text: snap.abbr, bg: snap.primary, fg: luma(snap.primary) > 150 ? '#10131a' : '#ffffff' },
    { text: brands[1], bg: AD_COLOURS[hash(brands[1]) % AD_COLOURS.length], fg: '#ffffff' },
    { text: brands[2], bg: '#f4f4f0', fg: AD_COLOURS[hash(brands[2]) % AD_COLOURS.length] },
  ];
  const pw = w / panels.length;
  panels.forEach((p, i) => {
    ctx.fillStyle = p.bg;
    ctx.fillRect(i * pw, 0, pw + 1, h);
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = h * 0.62;
    ctx.font = `800 ${size}px ${FONT}`;
    const text = p.text.toUpperCase();
    while (size > 8 && ctx.measureText(text).width > pw * 0.88) {
      size -= 2;
      ctx.font = `800 ${size}px ${FONT}`;
    }
    ctx.fillText(text, i * pw + pw / 2, h / 2 + 1);
  });
  s.texture.wrapS = RepeatWrapping;
  s.done();
}

export function adsTexture(anisotropy: number): ScreenTexture {
  return new ScreenTexture(1024, 48, anisotropy);
}

/** The video board: crest, initials and a welcome. Resolves when the crest has drawn. */
export function paintBoard(s: ScreenTexture, snap: Pick<StadiumSnapshot, 'crestSvg' | 'abbr' | 'clubName' | 'name' | 'primary' | 'secondary'>): Promise<void> {
  const { ctx, w, h } = s;
  const draw = (img: HTMLImageElement | null): void => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, shade(snap.primary, 0.55));
    g.addColorStop(1, '#0a0d14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const size = h * 0.7;
    if (img) ctx.drawImage(img, h * 0.12, (h - size) / 2, size, size);
    const tx = img ? h * 0.12 + size + h * 0.1 : w * 0.08;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `900 ${h * 0.34}px ${FONT}`;
    ctx.fillText(snap.abbr, tx, h * 0.48);
    ctx.font = `700 ${h * 0.11}px ${FONT}`;
    const maxW = w - tx - h * 0.1;
    let name = snap.clubName.toUpperCase();
    while (name.length > 1 && ctx.measureText(name).width > maxW) name = name.slice(0, -1);
    ctx.fillText(name, tx, h * 0.66);
    ctx.fillStyle = luma(snap.secondary) > 60 ? snap.secondary : '#cfd6e4';
    ctx.font = `600 ${h * 0.085}px ${FONT}`;
    let welcome = `Welcome to ${snap.name}`;
    while (welcome.length > 1 && ctx.measureText(welcome).width > maxW) welcome = welcome.slice(0, -1);
    ctx.fillText(welcome, tx, h * 0.8);
    s.done();
  };
  draw(null);
  return loadSvg(snap.crestSvg).then((img) => {
    if (img) draw(img);
  });
}

/** Decodes an SVG string to an image, or null if it can't. */
export function loadSvg(svg: string): Promise<HTMLImageElement | null> {
  if (!svg || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export interface PitchPaint {
  mow: StadiumLookSnap['mow'];
  /** 0-3 pitch upgrade level: better grass, less wear. */
  level: number;
  condition: number;
  /** 0-1 progress of pitch work under way, or null. */
  relaying: number | null;
}

/**
 * The grass: mowing pattern, wear, markings and (optionally) the crest at
 * the centre circle. The canvas covers GRASS, centred on the pitch.
 */
export function paintPitch(s: ScreenTexture, p: PitchPaint, crest: HTMLImageElement | null): void {
  const { ctx, w, h } = s;
  const m = w / GRASS.length;
  const cx = w / 2;
  const cy = h / 2;
  const q = Math.max(0, Math.min(3, p.level));
  const light = ['#5a9a49', '#58a04a', '#52a646', '#4fae47'][q];
  const dark = ['#467f39', '#438739', '#3c8c37', '#389536'][q];
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = light;
  ctx.save();
  ctx.beginPath();
  switch (p.mow) {
    case 'stripes':
    case 'wide': {
      const n = p.mow === 'stripes' ? 20 : 10;
      const sw = (PITCH.length * m) / n;
      const x0 = cx - (PITCH.length * m) / 2;
      for (let i = -2; i < n + 2; i += 2) ctx.rect(x0 + i * sw, 0, sw, h);
      ctx.fill();
      break;
    }
    case 'checks': {
      const n = 14;
      const sw = (PITCH.length * m) / n;
      const x0 = cx - (PITCH.length * m) / 2;
      const rows = Math.ceil(h / sw) + 1;
      const y0 = cy - Math.ceil(rows / 2) * sw;
      for (let i = -2; i < n + 2; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) ctx.rect(x0 + i * sw, y0 + j * sw, sw, sw);
      ctx.fill();
      break;
    }
    case 'diagonal': {
      const sw = 6 * m;
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      const r = Math.hypot(w, h);
      for (let x = -r; x < r; x += sw * 2) ctx.rect(x, -r, sw, r * 2);
      ctx.fill();
      break;
    }
    case 'rings': {
      const sw = 4.5 * m;
      const r = Math.hypot(w, h) / 2;
      for (let k = Math.ceil(r / sw); k > 0; k--) {
        ctx.beginPath();
        ctx.arc(cx, cy, k * sw, 0, Math.PI * 2);
        ctx.fillStyle = k % 2 ? light : dark;
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();

  // Wear in the goalmouths and the middle; better pitches and grounds hold up.
  const wear = Math.max(0, Math.min(1, (1 - q / 3) * 0.75 + (1 - p.condition) * 0.5));
  if (wear > 0.05) {
    const patch = (x: number, y: number, rx: number, ry: number): void => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, `rgba(120,96,58,${0.75 * wear})`);
      g.addColorStop(1, 'rgba(120,96,58,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const gx = (PITCH.length / 2 - 3) * m;
    patch(cx - gx, cy, (4 + 6 * wear) * m, (5 + 6 * wear) * m);
    patch(cx + gx, cy, (4 + 6 * wear) * m, (5 + 6 * wear) * m);
    patch(cx, cy, (3 + 7 * wear) * m, (5 + 9 * wear) * m);
  }

  // Pitch work: one half dug up, new turf rolled out as the work goes on.
  if (p.relaying !== null) {
    const half = (PITCH.length / 2 + 6) * m;
    ctx.fillStyle = '#6b4c31';
    ctx.fillRect(0, 0, half, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < half; x += 1.2 * m) ctx.fillRect(x, 0, 0.4 * m, h);
    const laid = Math.round(Math.max(0, Math.min(1, p.relaying)) * 18);
    const rw = half / 18;
    for (let i = 0; i < laid; i++) {
      ctx.fillStyle = i % 2 ? light : dark;
      ctx.fillRect(i * rw, 0, rw - 1, h);
    }
  }

  if (crest) {
    const size = 15 * m;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(crest, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }

  // Markings.
  const L = PITCH.length * m;
  const W = PITCH.width * m;
  const x0 = cx - L / 2;
  const y0 = cy - W / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = Math.max(2, 0.14 * m);
  ctx.strokeRect(x0, y0, L, W);
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx, y0 + W);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 9.15 * m, 0, Math.PI * 2);
  ctx.stroke();
  const spot = (x: number, y: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, 0.3 * m), 0, Math.PI * 2);
    ctx.fill();
  };
  spot(cx, cy);
  for (const side of [-1, 1]) {
    const gx = side < 0 ? x0 : x0 + L;
    const into = -side;
    const box = (d: number, wd: number): void => {
      const bx = into > 0 ? gx : gx - d * m;
      ctx.strokeRect(bx, cy - (wd * m) / 2, d * m, wd * m);
    };
    box(16.5, 40.32);
    box(5.5, 18.32);
    const px = gx + into * 11 * m;
    spot(px, cy);
    // The arc outside the box: the part of a 9.15 m circle round the spot beyond 16.5 m.
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (into > 0) ctx.arc(px, cy, 9.15 * m, -a, a);
    else ctx.arc(px, cy, 9.15 * m, Math.PI - a, Math.PI + a);
    ctx.stroke();
    for (const cyCorner of [y0, y0 + W]) {
      ctx.beginPath();
      const start = cyCorner === y0 ? 0 : -Math.PI / 2;
      const turn = into > 0 ? 0 : Math.PI / 2;
      ctx.arc(gx, cyCorner, 1 * m, start + (cyCorner === y0 ? (into > 0 ? 0 : Math.PI / 2) : turn - (into > 0 ? 0 : Math.PI)), start + (cyCorner === y0 ? (into > 0 ? 0 : Math.PI / 2) : turn - (into > 0 ? 0 : Math.PI)) + Math.PI / 2);
      ctx.stroke();
    }
  }
  s.done();
}

export function pitchTexture(anisotropy: number): ScreenTexture {
  const w = 1024;
  return new ScreenTexture(w, Math.round((w * GRASS.width) / GRASS.length), anisotropy);
}

/** Hoarding round paid-for work waiting for the off-season. */
export function hoardingTexture(snap: Pick<StadiumSnapshot, 'primary' | 'secondary' | 'abbr'>, anisotropy: number): ScreenTexture {
  const s = new ScreenTexture(512, 32, anisotropy);
  const { ctx, w, h } = s;
  ctx.fillStyle = snap.primary;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = snap.secondary;
  ctx.fillRect(0, h - 5, w, 5);
  ctx.fillStyle = luma(snap.primary) > 150 ? '#10131a' : '#ffffff';
  ctx.font = `800 ${h * 0.5}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${snap.abbr} · BUILDING AFTER THE SEASON`, w / 2, h / 2 - 2);
  s.texture.wrapS = RepeatWrapping;
  s.done();
  return s;
}

/** A shop sign: the club's initials and a word, on the club colour. */
export function signTexture(snap: Pick<StadiumSnapshot, 'primary' | 'secondary' | 'abbr'>, word: string, anisotropy: number): ScreenTexture {
  const s = new ScreenTexture(256, 64, anisotropy);
  const { ctx, w, h } = s;
  ctx.fillStyle = snap.primary;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = snap.secondary;
  ctx.fillRect(0, h - 6, w, 6);
  ctx.fillStyle = luma(snap.primary) > 150 ? '#10131a' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${h * 0.5}px ${FONT}`;
  ctx.fillText(`${snap.abbr} ${word}`, w / 2, h / 2 - 2);
  s.done();
  return s;
}

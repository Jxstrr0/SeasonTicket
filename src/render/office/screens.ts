/**
 * Canvas textures for everything in the office that shows club data: the
 * laptop (finances), the TV (front page and table), the whiteboard (formation), the
 * phone's display and the framed crest. Each painter redraws its canvas from
 * the snapshot; the caller flags the texture for upload.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { OfficeSnapshot } from './types';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MARKER = '"Chalkboard SE", "Bradley Hand", "Segoe Print", "Noteworthy", cursive';

export class ScreenTexture {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;

  /**
   * `gltfUv` is for canvases shown on a glTF model's own UVs: glTF uses
   * top-left origin (no flipY) and some screens sit outside the 0-1 range.
   */
  constructor(width: number, height: number, anisotropy: number, gltfUv = false) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    if (gltfUv) {
      this.texture.flipY = false;
      this.texture.wrapS = RepeatWrapping;
      this.texture.wrapT = RepeatWrapping;
    }
  }

  get w(): number {
    return this.canvas.width;
  }

  get h(): number {
    return this.canvas.height;
  }

  done(): void {
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Readable text colour on a club colour. */
function inkOn(hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10131a' : '#ffffff';
}

export function paintLaptop(s: ScreenTexture, snap: OfficeSnapshot): void {
  const { ctx, w, h } = s;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16203d');
  g.addColorStop(1, '#0b1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = snap.primary;
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = inkOn(snap.primary);
  ctx.font = `700 26px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, `${snap.shortName} · Finances`, w - 40), 20, 28);

  ctx.fillStyle = '#9aa3c2';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('Cash', 20, 92);
  ctx.fillStyle = snap.cashNegative ? '#ff8a8a' : '#f2c14e';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(fitText(ctx, snap.cash, w - 40), 20, 146);

  ctx.fillStyle = '#9aa3c2';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('Payroll', 20, 210);
  ctx.fillStyle = '#f4f5fa';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(`${snap.payroll}  /  cap ${snap.wageCap}`, 20, 244);

  let y = 300;
  if (snap.ladderLabel) {
    ctx.fillStyle = 'rgba(239, 91, 91, 0.22)';
    roundRect(ctx, 16, y - 24, w - 32, 48, 10);
    ctx.fill();
    ctx.fillStyle = '#ff8a8a';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(fitText(ctx, `Lenders: ${snap.ladderLabel}`, w - 60), 30, y);
    y += 60;
  }
  if (snap.sponsorOffers > 0) {
    ctx.fillStyle = '#4ecdc4';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(`${snap.sponsorOffers} sponsor offer${snap.sponsorOffers === 1 ? '' : 's'} waiting`, 20, y);
    y += 44;
  }
  ctx.fillStyle = '#9aa3c2';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(fitText(ctx, snap.weekLabel, w - 40), 20, h - 26);
  s.done();
}

export function paintTv(s: ScreenTexture, snap: OfficeSnapshot): void {
  const { ctx, w, h } = s;
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#141b33';
  ctx.fillRect(0, 0, w, 76);
  ctx.fillStyle = '#f2c14e';
  ctx.font = `800 38px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, snap.leagueName, w * 0.6), 28, 40);
  ctx.fillStyle = '#9aa3c2';
  ctx.font = `600 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(fitText(ctx, snap.weekLabel, w * 0.36), w - 28, 40);
  ctx.textAlign = 'left';
  if (snap.news) {
    paintFrontPage(ctx, snap, 20, 92, w * 0.6 - 30, h - 92 - 76);
    paintMiniTable(ctx, snap, w * 0.6, 92, w * 0.4 - 20, h - 92 - 76);
  } else paintTable(ctx, snap, w, h);

  ctx.fillStyle = '#141b33';
  ctx.fillRect(0, h - 64, w, 64);
  ctx.fillStyle = '#4ecdc4';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(fitText(ctx, snap.nextFixture ?? 'Season over', w - 56), 28, h - 32);
  s.done();
}

/** Word-wraps into at most `lines` lines; the last one ends in an ellipsis if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      out.push(line);
      line = word;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && line) out.push(line);
  else if (out.length === lines) out[lines - 1] = fitText(ctx, `${out[lines - 1]} ${line}`, maxWidth);
  return out;
}

function paintFrontPage(ctx: CanvasRenderingContext2D, snap: OfficeSnapshot, x: number, y: number, w: number, h: number): void {
  const news = snap.news!;
  ctx.fillStyle = '#f3efe4';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  const pad = 18;
  ctx.fillStyle = '#1c1a16';
  ctx.textAlign = 'center';
  ctx.font = `700 34px Georgia, "Times New Roman", serif`;
  ctx.fillText(fitText(ctx, news.paper, w - pad * 2), x + w / 2, y + 30);
  ctx.fillStyle = '#5a5345';
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(fitText(ctx, news.edition.toUpperCase(), w - pad * 2), x + w / 2, y + 58);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1c1a16';
  ctx.fillRect(x + pad, y + 72, w - pad * 2, 2);
  ctx.fillRect(x + pad, y + 77, w - pad * 2, 1);
  ctx.font = `700 40px Georgia, "Times New Roman", serif`;
  let ty = y + 112;
  for (const line of wrap(ctx, news.lead, w - pad * 2, 3)) {
    ctx.fillText(line, x + pad, ty);
    ty += 46;
  }
  ctx.font = `600 22px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = '#3a352c';
  for (const more of news.more) {
    if (ty + 20 > y + h - 8) break;
    ctx.fillStyle = '#c9c1ad';
    ctx.fillRect(x + pad, ty - 14, w - pad * 2, 1);
    ctx.fillStyle = '#3a352c';
    ctx.fillText(fitText(ctx, more, w - pad * 2), x + pad, ty + 10);
    ty += 40;
  }
}

/** The top six (and us) in a narrow column beside the paper. */
function paintMiniTable(ctx: CanvasRenderingContext2D, snap: OfficeSnapshot, x: number, y: number, w: number, h: number): void {
  const rows = snap.table.slice(0, 6);
  const user = snap.table.find((r) => r.user);
  if (user && user.pos > 6) rows.push(user);
  const rowH = Math.min(52, h / Math.max(rows.length, 1));
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    if (r.user) {
      ctx.fillStyle = snap.primary;
      roundRect(ctx, x, ry, w, rowH - 6, 10);
      ctx.fill();
    } else if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x, ry, w, rowH - 6);
    }
    const ink = r.user ? inkOn(snap.primary) : '#f4f5fa';
    const mid = ry + (rowH - 6) / 2;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = r.user ? ink : '#9aa3c2';
    ctx.fillText(String(r.pos), x + 14, mid);
    ctx.fillStyle = ink;
    ctx.fillText(r.abbr, x + 64, mid);
    ctx.textAlign = 'right';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(String(r.points), x + w - 14, mid);
    ctx.textAlign = 'left';
  });
}

function paintTable(ctx: CanvasRenderingContext2D, snap: OfficeSnapshot, w: number, h: number): void {
  const rows = snap.table.slice(0, 6);
  const user = snap.table.find((r) => r.user);
  if (user && user.pos > 6) rows.push(user);
  const top = 100;
  const rowH = Math.min(58, (h - top - 80) / Math.max(rows.length, 1));
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = '#9aa3c2';
  ctx.fillText('Club', 110, top + 6);
  ctx.textAlign = 'right';
  ctx.fillText('P', w - 190, top + 6);
  ctx.fillText('Pts', w - 40, top + 6);
  ctx.textAlign = 'left';
  rows.forEach((r, i) => {
    const y = top + 28 + i * rowH + (user && user.pos > 6 && i === 6 ? 10 : 0);
    if (r.user) {
      ctx.fillStyle = snap.primary;
      roundRect(ctx, 20, y, w - 40, rowH - 6, 10);
      ctx.fill();
    } else if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(20, y, w - 40, rowH - 6);
    }
    const ink = r.user ? inkOn(snap.primary) : '#f4f5fa';
    const mid = y + (rowH - 6) / 2;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = r.user ? ink : '#9aa3c2';
    ctx.fillText(String(r.pos), 40, mid);
    ctx.fillStyle = ink;
    ctx.fillText(r.abbr, 110, mid);
    ctx.textAlign = 'right';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(String(r.played), w - 190, mid);
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText(String(r.points), w - 40, mid);
    ctx.textAlign = 'left';
    if (r.pos === 6 && i === 5) {
      ctx.strokeStyle = '#f2c14e';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, y + rowH - 3);
      ctx.lineTo(w - 20, y + rowH - 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

export function paintWhiteboard(s: ScreenTexture, snap: OfficeSnapshot): void {
  const { ctx, w, h } = s;
  ctx.fillStyle = '#f3f4f1';
  ctx.fillRect(0, 0, w, h);
  // Faint smudges so it reads as a used board.
  ctx.fillStyle = 'rgba(120, 130, 150, 0.06)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 137) % w, (i * 89) % h, 90 + i * 9, 30 + i * 4, i, 0, Math.PI * 2);
    ctx.fill();
  }
  const pad = 40;
  const px = pad;
  const py = 70;
  const pw = w - pad * 2;
  const ph = h - py - 30;
  ctx.strokeStyle = '#2a6b3c';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeRect(px, py, pw, ph);
  ctx.beginPath();
  ctx.moveTo(px + pw / 2, py);
  ctx.lineTo(px + pw / 2, py + ph);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px + pw / 2, py + ph / 2, ph * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(px, py + ph * 0.22, pw * 0.14, ph * 0.56);
  ctx.strokeRect(px + pw * 0.86, py + ph * 0.22, pw * 0.14, ph * 0.56);

  ctx.fillStyle = '#1d3f8a';
  ctx.font = `700 34px ${MARKER}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(snap.formation ? `Plan: ${snap.formation}` : 'Plan: TBC', pad, 36);

  for (const slot of snap.slots) {
    // The board is landscape: our goal on the left, attacking right.
    const x = px + (slot.y * 0.9 + 0.05) * pw;
    const y = py + (1 - slot.x) * ph;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1f2a';
    ctx.font = `700 20px ${MARKER}`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, slot.name || slot.label, 120), x, y + 30);
    ctx.textAlign = 'left';
  }
  s.done();
}

export function paintPhone(s: ScreenTexture, snap: OfficeSnapshot): void {
  const { ctx, w, h } = s;
  ctx.fillStyle = '#0d1a14';
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `700 34px ${FONT}`;
  if (snap.bids > 0) {
    ctx.fillStyle = '#ffcf5a';
    ctx.fillText(`${snap.bids} BID${snap.bids === 1 ? '' : 'S'}`, w / 2, h / 2);
  } else {
    // A little feed: three post cards and the count since the last edition.
    ctx.fillStyle = '#5fd39a';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('FEED', w / 2, 28);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(95, 211, 154, 0.18)';
      roundRect(ctx, 12, 52 + i * 52, w - 24, 42, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(95, 211, 154, 0.6)';
      ctx.fillRect(22, 62 + i * 52, (w - 44) * (0.8 - i * 0.15), 6);
      ctx.fillRect(22, 76 + i * 52, (w - 44) * 0.5, 6);
    }
    if (snap.posts > 0) {
      ctx.fillStyle = '#5fd39a';
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText(`${snap.posts} new`, w / 2, h - 30);
    }
  }
  ctx.textAlign = 'left';
  s.done();
}

/** Draws the crest SVG once it decodes; resolves either way. */
export function paintCrest(s: ScreenTexture, snap: OfficeSnapshot): Promise<void> {
  const { ctx, w, h } = s;
  const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#f6f1e6');
  g.addColorStop(1, '#ddd3bf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  s.done();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(w, h) * 0.78;
      ctx.drawImage(img, (w - size) / 2, (h - size) / 2 - 10, size, size);
      ctx.fillStyle = '#3a3226';
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, snap.clubName.toUpperCase(), w - 40), w / 2, h - 26);
      ctx.textAlign = 'left';
      s.done();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snap.crestSvg)}`;
  });
}

/** Lit and dark windows for the city towers seen outside. */
export function paintCityWindows(s: ScreenTexture, seed: number): void {
  const { ctx, w, h } = s;
  ctx.fillStyle = '#0c0f18';
  ctx.fillRect(0, 0, w, h);
  let x = seed >>> 0 || 1;
  const rnd = (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const cols = 8;
  const rows = 16;
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rnd();
      ctx.fillStyle = v > 0.55 ? `rgba(255, ${190 + Math.floor(rnd() * 50)}, ${110 + Math.floor(rnd() * 60)}, ${0.65 + rnd() * 0.35})` : 'rgba(40, 52, 72, 1)';
      ctx.fillRect(c * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.56);
    }
  }
  s.done();
}

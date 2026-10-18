/**
 * The 2D top-down pitch (Stage 4.5): grass and markings, both teams in their kits with
 * shirt numbers, and the ball with its height. Shared by the Engine Lab, the match replay
 * and the live match. It only reads engine state; the caller steps the engine, calls
 * savePrev before each step and draw once per screen frame, which blends the two steps
 * so movement is smooth at any speed.
 */
import { markingPair, teamShapeInfo } from '../sim/spatial/engine';
import type { SpatialMatch } from '../sim/spatial/state';
import { PERSONS, ROLE, personOf, type Side, type SpatialPlayer, type SpatialSetup } from '../sim/spatial/types';
import { esc, safeColor } from './html';

/** A player's name by engine index (or '?'). */
export function nameOf(m: SpatialMatch, w: number): string {
  return w >= 0 && w < PERSONS ? personOf(m.setup, w)?.name ?? '?' : '?';
}

/** The banner for the match's latest goal: score and scorer. */
export function goalBanner(m: SpatialMatch): string {
  const g = m.goalLog[m.goalLog.length - 1];
  const s = m.setup;
  return `<strong>GOAL!</strong> ${esc(s.home.short)} ${m.score[0]}-${m.score[1]} ${esc(s.away.short)}<br><span class="small">${esc(nameOf(m, g.scorer))}${g.ownGoal ? ' (own goal)' : ''}</span>`;
}

/** Metres of grass drawn around the touchlines and goal lines. */
export const MARGIN = 3;
const VIEW_W = 105 + 2 * MARGIN;
const VIEW_H = 68 + 2 * MARGIN;

export const ROLE_RING: Partial<Record<number, string>> = {
  [ROLE.PRESS]: '#ff5d5d',
  [ROLE.COVER]: '#ffa94d',
  [ROLE.MARK]: '#5ee0ff',
  [ROLE.COUNTER]: '#ffe066',
  [ROLE.TRACK]: '#b197fc',
  [ROLE.RUN]: '#69db7c',
  [ROLE.BOX]: '#f783ac',
};
export const KEEPER_FILL = ['#ff9f1c', '#c77dff'];
const GRASS = '#2f803d';

export interface Kit { fill: string; edge: string; text: string; /** Whichever kit colour shows best on grass, for lines. */ line: string }

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colourGap(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

export function textOn(fill: string): string {
  const [r, g, b] = rgb(fill);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10131f' : '#ffffff';
}

/** Home wears its first colours; away switches to its second colours on a clash. */
export function matchKits(setup: SpatialSetup): [Kit, Kit] {
  // The colours come from the save (which may be an imported code): only plain hex gets through.
  const clean = (c: { primary: string; secondary: string }) => ({ primary: safeColor(c.primary, '#223355'), secondary: safeColor(c.secondary, '#ffffff') });
  const h = clean(setup.home.colors);
  const a = clean(setup.away.colors);
  const home = { fill: h.primary, edge: h.secondary };
  let away = { fill: a.primary, edge: a.secondary };
  if (colourGap(home.fill, away.fill) < 110) away = { fill: a.secondary, edge: a.primary };
  if (colourGap(home.fill, away.fill) < 110) {
    const fill = textOn(home.fill) === '#ffffff' ? '#f4f5fa' : '#1b1f2e';
    away = { fill, edge: a.primary };
  }
  const line = (k: { fill: string; edge: string }) => (colourGap(k.edge, GRASS) > colourGap(k.fill, GRASS) + 40 ? k.edge : k.fill);
  return [
    { ...home, text: textOn(home.fill), line: line(home) },
    { ...away, text: textOn(away.fill), line: line(away) },
  ];
}

/** What is drawn over the players. The replay and live views show only the shape lines. */
export interface PitchOverlays {
  /** Rings for pressing, marking, runs and the like, and the man-marking pair. */
  roles: boolean;
  /** Each back line and the line it is aiming for. */
  lines: boolean;
  /** Every shot so far, sized by expected goals. */
  shots: boolean;
  /** Each player's spot in the shape. */
  spots: boolean;
  /** Where each player is heading. */
  moves: boolean;
}

export class PitchView {
  overlays: PitchOverlays = { roles: false, lines: true, shots: false, spots: false, moves: false };
  /** A player to ring and link to his spot in the shape, or -1. */
  selected = -1;
  kit: [Kit, Kit];
  private m: SpatialMatch | null = null;
  private readonly prevX = new Float64Array(22);
  private readonly prevY = new Float64Array(22);
  private readonly prevBall = new Float64Array(3);
  private readonly ix = new Float64Array(22);
  private readonly iy = new Float64Array(22);
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pitch = document.createElement('canvas');
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** CSS pixels per metre. */
  private scale = 1;

  constructor(readonly canvas: HTMLCanvasElement, setup: SpatialSetup) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.kit = matchKits(setup);
  }

  /** Keep the positions before the next step, to blend from. */
  savePrev(m: SpatialMatch): void {
    this.prevX.set(m.px);
    this.prevY.set(m.py);
    this.prevBall[0] = m.ball.x;
    this.prevBall[1] = m.ball.y;
    this.prevBall[2] = m.ball.z;
  }

  /** The player drawn nearest a tap (client pixels), or -1 if none is close. */
  pick(clientX: number, clientY: number): number {
    const m = this.m;
    if (!m) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const wx = (clientX - rect.left) / this.scale - MARGIN;
    const wy = (clientY - rect.top) / this.scale - MARGIN;
    const reach = Math.max(3, 22 / this.scale);
    let best = -1;
    let bestD = reach * reach;
    for (let i = 0; i < 22; i++) {
      if (!m.on[i]) continue;
      const dx = this.ix[i] - wx;
      const dy = this.iy[i] - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Fit the pitch, centred, into a box `w` by `h` CSS pixels (the canvas's positioned parent). */
  fit(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);
    this.scale = scale;
    this.cssW = Math.floor(VIEW_W * scale);
    this.cssH = Math.floor(VIEW_H * scale);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = this.canvas;
    c.style.width = `${this.cssW}px`;
    c.style.height = `${this.cssH}px`;
    c.style.left = `${Math.floor((w - this.cssW) / 2)}px`;
    c.style.top = `${Math.floor((h - this.cssH) / 2)}px`;
    c.width = Math.round(this.cssW * this.dpr);
    c.height = Math.round(this.cssH * this.dpr);
    this.buildPitch();
  }

  /** Grass and markings, drawn once per resize. Units are metres. */
  private buildPitch(): void {
    const c = this.pitch;
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    if (!g) return;
    const k = this.scale * this.dpr;
    g.setTransform(k, 0, 0, k, MARGIN * k, MARGIN * k);
    g.fillStyle = '#2b7638';
    g.fillRect(-MARGIN, -MARGIN, VIEW_W, VIEW_H);
    g.fillStyle = GRASS;
    for (let s = 0; s < 10; s += 2) g.fillRect(s * 10.5, 0, 10.5, 68);
    g.strokeStyle = 'rgba(255,255,255,0.78)';
    g.fillStyle = 'rgba(255,255,255,0.78)';
    g.lineWidth = Math.max(0.12, 1.25 / this.scale);
    g.strokeRect(0, 0, 105, 68);
    g.beginPath(); g.moveTo(52.5, 0); g.lineTo(52.5, 68); g.stroke();
    g.beginPath(); g.arc(52.5, 34, 9.15, 0, Math.PI * 2); g.stroke();
    const spot = Math.max(0.25, 1.6 / this.scale);
    const dot = (x: number, y: number) => { g.beginPath(); g.arc(x, y, spot, 0, Math.PI * 2); g.fill(); };
    dot(52.5, 34);
    const arcA = Math.acos(5.5 / 9.15);
    for (const end of [0, 1]) {
      const gx = end === 0 ? 0 : 105;
      const dir = end === 0 ? 1 : -1;
      g.strokeRect(Math.min(gx, gx + dir * 16.5), 34 - 20.16, 16.5, 40.32);
      g.strokeRect(Math.min(gx, gx + dir * 5.5), 34 - 9.16, 5.5, 18.32);
      const px = gx + dir * 11;
      dot(px, 34);
      g.beginPath();
      if (end === 0) g.arc(px, 34, 9.15, -arcA, arcA);
      else g.arc(px, 34, 9.15, Math.PI - arcA, Math.PI + arcA);
      g.stroke();
      g.strokeRect(end === 0 ? -1.8 : 105, 34 - 3.66, 1.8, 7.32);
    }
    for (const [cx, cy, a0] of [[0, 0, 0], [105, 0, Math.PI / 2], [105, 68, Math.PI], [0, 68, Math.PI * 1.5]]) {
      g.beginPath(); g.arc(cx, cy, 1, a0, a0 + Math.PI / 2); g.stroke();
    }
  }

  private X(x: number): number { return (x + MARGIN) * this.scale; }
  private Y(y: number): number { return (y + MARGIN) * this.scale; }

  /** Draw the match as it stands at `viewMs`, between the frame before (savePrev) and the engine's. */
  draw(m: SpatialMatch, viewMs: number): void {
    this.m = m;
    if (!this.cssW) return;
    const ctx = this.ctx;
    const a = m.clockMs > viewMs ? Math.min(1, Math.max(0, 1 - (m.clockMs - viewMs) / m.stepMs)) : 1;
    for (let i = 0; i < 22; i++) {
      this.ix[i] = this.prevX[i] + (m.px[i] - this.prevX[i]) * a;
      this.iy[i] = this.prevY[i] + (m.py[i] - this.prevY[i]) * a;
    }
    const bx = this.prevBall[0] + (m.ball.x - this.prevBall[0]) * a;
    const by = this.prevBall[1] + (m.ball.y - this.prevBall[1]) * a;
    const bz = this.prevBall[2] + (m.ball.z - this.prevBall[2]) * a;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.drawImage(this.pitch, 0, 0, this.cssW, this.cssH);
    const r = Math.max(1.25 * this.scale, 8);
    const o = this.overlays;

    if (o.lines) this.drawLines();
    if (o.shots) this.drawShots();
    if (o.spots) {
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i++) {
        if (i % 11 === 0 || !m.on[i]) continue;
        ctx.strokeStyle = this.kit[i < 11 ? 0 : 1].line;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(this.X(m.sx[i]), this.Y(m.sy[i]), r * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (o.roles) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = ROLE_RING[ROLE.MARK] as string;
      ctx.lineWidth = 1.5;
      for (const side of [0, 1] as Side[]) {
        const pair = markingPair(m, side);
        if (!pair) continue;
        ctx.beginPath();
        ctx.moveTo(this.X(this.ix[pair[0]]), this.Y(this.iy[pair[0]]));
        ctx.lineTo(this.X(this.ix[pair[1]]), this.Y(this.iy[pair[1]]));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (o.moves) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i++) {
        if (!m.on[i]) continue;
        ctx.beginPath();
        ctx.moveTo(this.X(this.ix[i]), this.Y(this.iy[i]));
        ctx.lineTo(this.X(this.ix[i] + m.vx[i]), this.Y(this.iy[i] + m.vy[i]));
        ctx.stroke();
      }
    }
    if (this.selected >= 0) {
      const i = this.selected;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.X(this.ix[i]), this.Y(this.iy[i]));
      ctx.lineTo(this.X(m.sx[i]), this.Y(m.sy[i]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(this.X(m.sx[i]), this.Y(m.sy[i]), 3, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.font = `700 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 22; i++) {
      if (!m.on[i]) continue;
      const side = i < 11 ? 0 : 1;
      const slot = i % 11;
      const kit = this.kit[side];
      const x = this.X(this.ix[i]);
      const y = this.Y(this.iy[i]);
      const ring = o.roles ? ROLE_RING[m.role[i]] : undefined;
      if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (i === this.selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 5.5, 0, Math.PI * 2); ctx.stroke();
      }
      const fill = slot === 0 ? KEEPER_FILL[side] : kit.fill;
      ctx.fillStyle = fill;
      ctx.strokeStyle = kit.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = slot === 0 ? '#10131f' : kit.text;
      const p = personOf(m.setup, m.who[i]) as SpatialPlayer;
      ctx.fillText(String(p.jersey), x, y + 0.5);
    }

    // Ball: the shadow stays on the grass, the ball lifts and grows with height.
    const sx = this.X(bx);
    const sy = this.Y(by);
    const br = Math.max(0.42 * this.scale, 3) * (1 + bz * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx, sy, br, br * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10131f';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sx, sy - bz * 0.45 * this.scale, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  /**
   * Every shot so far where it was struck: size by expected goals, filled for a goal, a solid
   * ring if saved or blocked, a faint ring if it missed.
   */
  private drawShots(): void {
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    for (const r of (this.m as SpatialMatch).shotLog) {
      const rad = Math.max(3, (0.5 + 2.2 * Math.sqrt(r.xg)) * this.scale);
      const c = this.kit[r.side].line;
      ctx.beginPath(); ctx.arc(this.X(r.x), this.Y(r.y), rad, 0, Math.PI * 2);
      if (r.outcome === 'goal') {
        ctx.globalAlpha = 0.9; ctx.fillStyle = c; ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.stroke();
      } else {
        ctx.globalAlpha = r.outcome === 'saved' || r.outcome === 'blocked' ? 0.9 : 0.45;
        ctx.strokeStyle = c; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Each team's back line (solid, from the players drawn) and the line it is aiming for (dotted). */
  private drawLines(): void {
    const m = this.m as SpatialMatch;
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    for (const side of [0, 1] as Side[]) {
      const team = m.teams[side];
      let sum = 0;
      let n = 0;
      for (let s = 1; s < 11; s++) {
        if (team.defU[s] !== 0 || !m.on[side * 11 + s]) continue;
        sum += this.ix[side * 11 + s];
        n++;
      }
      if (n === 0) continue;
      const aim = teamShapeInfo(m, side).targetLine;
      const aimX = side === 0 ? aim : 105 - aim;
      ctx.strokeStyle = this.kit[side].line;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(this.X(sum / n), this.Y(0)); ctx.lineTo(this.X(sum / n), this.Y(68)); ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(this.X(aimX), this.Y(0)); ctx.lineTo(this.X(aimX), this.Y(68)); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
}

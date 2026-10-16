/**
 * Engine Lab: a 2D top-down view of the spatial match engine (Stage 4.5). It is the
 * owner's tool for judging the engine: watch both shapes, change either side's tactics
 * while the match runs and see the change land. The engine runs on the main thread here;
 * it moves into a Web Worker in step 6. This file only reads engine state and queues
 * tactics: no match rules live here.
 */
import './lab.css';
import { FORMATIONS } from '../../sim/data';
import { createLeague } from '../../sim/league';
import { createSpatial, markingPair, queueTactics, stepSpatial, teamShapeInfo } from '../../sim/spatial/engine';
import { spatialSetupFromLeague } from '../../sim/spatial/setup';
import type { SpatialMatch } from '../../sim/spatial/state';
import { ROLE, type Side, type SpatialMode, type SpatialSetup } from '../../sim/spatial/types';
import type { Dial, League, Tactics } from '../../sim/types';
import { parseSeed, randomSeed } from '../app';
import { esc } from '../html';

const SPEEDS = [1, 2, 4, 8] as const;
/** Metres of grass drawn around the touchlines and goal lines. */
const MARGIN = 3;
const VIEW_W = 105 + 2 * MARGIN;
const VIEW_H = 68 + 2 * MARGIN;
/** A long gap between frames (tab hidden, phone locked) never fast-forwards the match. */
const MAX_FRAME_S = 0.1;
const READOUT_MS = 250;
const SKIP_MS = 60_000;

type DialKey = 'mentality' | 'pressing' | 'defensiveLine' | 'width';
const DIALS: { key: DialKey; label: string; low: string; high: string }[] = [
  { key: 'mentality', label: 'Mentality', low: 'Defensive', high: 'Attacking' },
  { key: 'pressing', label: 'Pressing', low: 'Sit off', high: 'All-out' },
  { key: 'defensiveLine', label: 'Defensive line', low: 'Deep', high: 'High' },
  { key: 'width', label: 'Width with the ball', low: 'Narrow', high: 'Wide' },
];
const DIAL_VALUES: Dial[] = [1, 2, 3, 4, 5];

const ROLE_NAMES = ['Holding shape', 'Goalkeeper', 'On the ball', 'Receiving', 'Pressing', 'Covering the press', 'Man-marking', 'Counter run'];
const ROLE_RING: Partial<Record<number, string>> = {
  [ROLE.PRESS]: '#ff5d5d',
  [ROLE.COVER]: '#ffa94d',
  [ROLE.MARK]: '#5ee0ff',
  [ROLE.COUNTER]: '#ffe066',
};
const KEEPER_FILL = ['#ff9f1c', '#c77dff'];
const GRASS = '#2f803d';

interface Kit { fill: string; edge: string; text: string; /** Whichever kit colour shows best on grass, for lines. */ line: string }

function copyTactics(t: Tactics): Tactics {
  return { ...t, setPieceTakers: { ...t.setPieceTakers } };
}

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

function textOn(fill: string): string {
  const [r, g, b] = rgb(fill);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10131f' : '#ffffff';
}

/** Home wears its first colours; away switches to its second colours on a clash. */
function kits(setup: SpatialSetup): [Kit, Kit] {
  const h = setup.home.colors;
  const a = setup.away.colors;
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

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class EngineLab {
  private readonly league: League;
  private readonly leagueSeed: string;
  private homeId: string;
  private awayId: string;
  private mode: SpatialMode = 'fine';
  private matchNo = 0;
  private m!: SpatialMatch;
  private tactics!: [Tactics, Tactics];
  private kit!: [Kit, Kit];
  private side: Side = 0;
  private speed = 1;
  private playing = true;
  /** Match time the view has reached (ms). The engine is at most one step ahead of it. */
  private viewMs = 0;
  private readonly prevX = new Float64Array(22);
  private readonly prevY = new Float64Array(22);
  private readonly prevBall = new Float64Array(3);
  private readonly ix = new Float64Array(22);
  private readonly iy = new Float64Array(22);
  private readonly pendingMs: [number, number] = [0, 0];
  private overlays = { roles: true, lines: true, spots: false, moves: false };
  private selected = -1;
  private lastFrame = 0;
  private lastReadout = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pitch = document.createElement('canvas');
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** CSS pixels per metre. */
  private scale = 1;

  constructor(private readonly root: HTMLElement) {
    const fromHash = location.hash.split('/')[1];
    this.leagueSeed = fromHash && fromHash.trim() ? decodeURIComponent(fromHash).slice(0, 40) : randomSeed();
    this.league = createLeague(parseSeed(this.leagueSeed));
    this.homeId = this.league.teams[0].id;
    this.awayId = this.league.teams[1].id;

    root.innerHTML = this.shellHtml();
    this.canvas = root.querySelector('canvas') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onPitchTap(e));
    const wrap = root.querySelector('.lab-pitch') as HTMLElement;
    new ResizeObserver(() => this.resize(wrap)).observe(wrap);

    this.newMatch();
    this.resize(wrap);
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Match control
  // -------------------------------------------------------------------------

  private newMatch(): void {
    this.matchNo += 1;
    const setup = spatialSetupFromLeague(this.league, this.homeId, this.awayId);
    this.tactics = [copyTactics(setup.home.tactics), copyTactics(setup.away.tactics)];
    this.kit = kits(setup);
    this.m = createSpatial(setup, `${this.leagueSeed}:${this.homeId}:${this.awayId}:${this.matchNo}`, this.mode);
    this.viewMs = 0;
    this.pendingMs[0] = 0;
    this.pendingMs[1] = 0;
    this.selected = -1;
    this.savePrev();
    this.renderBar();
    this.renderTabs();
    this.renderTactics();
    this.renderMatchSection();
    this.updateReadout();
  }

  private ended(): boolean {
    return this.m.clockMs >= this.m.endMs;
  }

  private savePrev(): void {
    const m = this.m;
    this.prevX.set(m.px);
    this.prevY.set(m.py);
    this.prevBall[0] = m.ball.x;
    this.prevBall[1] = m.ball.y;
    this.prevBall[2] = m.ball.z;
  }

  /** Step the engine until it reaches `toMs`, keeping the step before for smooth drawing. */
  private advance(toMs: number): void {
    const m = this.m;
    const to = Math.min(toMs, m.endMs);
    while (m.clockMs < to) {
      this.savePrev();
      if (!stepSpatial(m)) break;
    }
    this.viewMs = to;
  }

  private applyTactics(side: Side): void {
    if (this.ended()) return;
    const action = queueTactics(this.m, side, this.tactics[side]);
    this.pendingMs[side] = action.ms;
    this.renderTactics();
    this.updateReadout();
  }

  private readonly frame = (now: number): void => {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, MAX_FRAME_S) : 0;
    this.lastFrame = now;
    if (this.playing && !this.ended()) {
      this.advance(this.viewMs + dt * 1000 * this.speed);
      if (this.ended()) this.renderBar();
    }
    this.draw();
    if (now - this.lastReadout >= READOUT_MS) {
      this.lastReadout = now;
      this.updateReadout();
    }
    requestAnimationFrame(this.frame);
  };

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'play') {
      if (this.ended()) this.newMatch();
      else this.playing = !this.playing;
      this.renderBar();
    } else if (act === 'speed') {
      this.speed = Number(el.dataset.speed) || 1;
      this.renderBar();
    } else if (act === 'skip') {
      this.advance(this.m.clockMs + SKIP_MS);
      this.renderBar();
      this.updateReadout();
    } else if (act === 'tab') {
      this.side = el.dataset.side === '1' ? 1 : 0;
      this.renderTabs();
      this.renderTactics();
    } else if (act === 'dial') {
      const key = el.dataset.key as DialKey;
      const value = Number(el.dataset.value) as Dial;
      if (!DIALS.some((d) => d.key === key) || !DIAL_VALUES.includes(value)) return;
      this.tactics[this.side][key] = value;
      this.applyTactics(this.side);
    } else if (act === 'counter') {
      this.tactics[this.side].counterAttack = !this.tactics[this.side].counterAttack;
      this.applyTactics(this.side);
    } else if (act === 'restart') {
      this.newMatch();
    } else if (act === 'swap') {
      [this.homeId, this.awayId] = [this.awayId, this.homeId];
      this.newMatch();
    }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const field = el.dataset.field;
    if (field === 'formation') {
      if (!FORMATIONS.some((f) => f.id === el.value)) return;
      this.tactics[this.side].formationId = el.value;
      this.applyTactics(this.side);
    } else if (field === 'mark') {
      this.tactics[this.side].manMarkTarget = el.value || null;
      this.applyTactics(this.side);
    } else if (field === 'home' || field === 'away') {
      if (!this.league.teams.some((t) => t.id === el.value)) return;
      if (field === 'home') this.homeId = el.value;
      else this.awayId = el.value;
      if (this.homeId === this.awayId) {
        // Picking the same club twice swaps the pair instead.
        const other = this.league.teams.find((t) => t.id !== this.homeId);
        if (field === 'home') this.awayId = other ? other.id : this.awayId;
        else this.homeId = other ? other.id : this.homeId;
      }
      this.newMatch();
    } else if (field === 'mode') {
      this.mode = el.value === 'coarse' ? 'coarse' : 'fine';
      this.newMatch();
    } else if (field === 'overlay') {
      const key = (el as HTMLInputElement).value as keyof EngineLab['overlays'];
      if (key in this.overlays) this.overlays[key] = (el as HTMLInputElement).checked;
    }
  }

  private onPitchTap(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / this.scale - MARGIN;
    const wy = (e.clientY - rect.top) / this.scale - MARGIN;
    const reach = Math.max(3, 22 / this.scale);
    let best = -1;
    let bestD = reach * reach;
    for (let i = 0; i < 22; i++) {
      const dx = this.ix[i] - wx;
      const dy = this.iy[i] - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.selected = best === this.selected ? -1 : best;
    this.updateReadout();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  private shellHtml(): string {
    const speeds = SPEEDS.map((s) => `<button type="button" class="seg" data-act="speed" data-speed="${s}" aria-pressed="false">${s}×</button>`).join('');
    const overlay = (key: keyof EngineLab['overlays'], label: string) =>
      `<label class="check"><input type="checkbox" data-field="overlay" value="${key}"${this.overlays[key] ? ' checked' : ''}> ${label}</label>`;
    return `
<div class="lab">
  <header class="lab-bar">
    <a class="btn btn-icon lab-back" href="#" aria-label="Back to the title screen">‹</a>
    <div class="lab-score" aria-live="off"></div>
    <button type="button" class="btn-icon lab-play" data-act="play" aria-label="Pause">❚❚</button>
    <div class="segmented lab-speed" role="group" aria-label="Playback speed">${speeds}</div>
    <button type="button" class="btn-secondary lab-skip" data-act="skip">+1 min</button>
  </header>
  <div class="lab-main">
    <div class="lab-pitch"><canvas aria-label="Top-down view of the match"></canvas></div>
    <aside class="lab-panel">
      <p class="lab-rotate small muted">Turn your phone sideways for a bigger pitch.</p>
      <section class="lab-sel card" hidden></section>
      <div class="segmented lab-tabs" role="group" aria-label="Team to change"></div>
      <section class="lab-tactics"></section>
      <section class="lab-readout card"></section>
      <section class="lab-overlays">
        <h3 class="lab-h">Show on the pitch</h3>
        ${overlay('roles', 'Pressing, cover, marking and counter runs')}
        ${overlay('lines', 'Each back line (solid) and where it is aiming (dotted)')}
        ${overlay('spots', 'Shape spots (where each player wants to stand)')}
        ${overlay('moves', 'Movement arrows (one second ahead)')}
        <p class="small muted lab-legend">
          <span style="--c:#ff5d5d">Pressing</span>
          <span style="--c:#ffa94d">Cover</span>
          <span style="--c:#5ee0ff">Man-marking</span>
          <span style="--c:#ffe066">Counter run</span>
        </p>
      </section>
      <section class="lab-match"></section>
      <p class="small muted">Engine step 2 of 7. The ball follows a script for now (no real passes, shots or goals), so this is for judging team shape and movement. Passing arrives in step 3. Tap a player to follow him.</p>
    </aside>
  </div>
</div>`;
  }

  private renderBar(): void {
    const m = this.m;
    const s = m.setup;
    const score = this.root.querySelector('.lab-score') as HTMLElement;
    score.innerHTML = `
      <span class="lab-team"><span class="lab-dot" style="background:${this.kit[0].fill};border-color:${this.kit[0].edge}"></span>${esc(s.home.short)}</span>
      <span class="lab-clock">${this.ended() ? 'FT' : clock(m.clockMs)}</span>
      <span class="lab-team">${esc(s.away.short)}<span class="lab-dot" style="background:${this.kit[1].fill};border-color:${this.kit[1].edge}"></span></span>`;
    const play = this.root.querySelector('.lab-play') as HTMLButtonElement;
    play.textContent = this.ended() ? '↺' : this.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', this.ended() ? 'Play again' : this.playing ? 'Pause' : 'Play');
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-act="speed"]')) {
      const on = Number(b.dataset.speed) === this.speed;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    (this.root.querySelector('.lab-skip') as HTMLButtonElement).disabled = this.ended();
  }

  private renderTabs(): void {
    const tabs = this.root.querySelector('.lab-tabs') as HTMLElement;
    const s = this.m.setup;
    tabs.innerHTML = ([0, 1] as Side[]).map((side) => {
      const on = side === this.side;
      const name = side === 0 ? s.home.short : s.away.short;
      return `<button type="button" class="seg${on ? ' on' : ''}" data-act="tab" data-side="${side}" aria-pressed="${on}">
        <span class="lab-dot" style="background:${this.kit[side].fill};border-color:${this.kit[side].edge}"></span>${esc(name)}${side === 0 ? ' (home)' : ' (away)'}</button>`;
    }).join('');
  }

  private renderTactics(): void {
    const box = this.root.querySelector('.lab-tactics') as HTMLElement;
    const t = this.tactics[this.side];
    const oppSide = this.side === 0 ? this.m.setup.away : this.m.setup.home;
    const oppTeam = this.m.teams[(1 - this.side) as Side];
    const formations = FORMATIONS.map((f) => `<option value="${esc(f.id)}"${f.id === t.formationId ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
    const dials = DIALS.map((d) => {
      const buttons = DIAL_VALUES.map((v) => {
        const on = t[d.key] === v;
        return `<button type="button" class="seg${on ? ' on' : ''}" data-act="dial" data-key="${d.key}" data-value="${v}" aria-pressed="${on}" aria-label="${d.label} ${v}">${v}</button>`;
      }).join('');
      return `<div class="lab-dial">
        <div class="lab-dial-head"><span>${d.label}</span><span class="small muted">${d.low} – ${d.high}</span></div>
        <div class="segmented lab-dial-seg">${buttons}</div>
      </div>`;
    }).join('');
    const marks = oppSide.players.slice(1).map((p, k) => {
      const label = oppTeam.formation.slots[k + 1]?.label ?? p.position;
      return `<option value="${esc(p.id)}"${p.id === t.manMarkTarget ? ' selected' : ''}>#${p.jersey} ${esc(p.name)} (${esc(label)})</option>`;
    }).join('');
    box.innerHTML = `
      <label>Formation<select class="field" data-field="formation">${formations}</select></label>
      ${dials}
      <button type="button" class="btn-secondary lab-wide${t.counterAttack ? ' on' : ''}" data-act="counter" aria-pressed="${t.counterAttack}">
        Counter-attacks: ${t.counterAttack ? 'on' : 'off'}</button>
      <label>Man-mark<select class="field" data-field="mark"><option value="">Nobody</option>${marks}</select></label>
      <p class="small muted lab-pending" aria-live="polite"></p>`;
  }

  private renderMatchSection(): void {
    const box = this.root.querySelector('.lab-match') as HTMLElement;
    const teams = [...this.league.teams].sort((a, b) => a.shortName.localeCompare(b.shortName));
    const options = (selected: string) => teams.map((t) => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.shortName)}</option>`).join('');
    box.innerHTML = `
      <h3 class="lab-h">Match</h3>
      <div class="lab-pair">
        <label>Home<select class="field" data-field="home">${options(this.homeId)}</select></label>
        <label>Away<select class="field" data-field="away">${options(this.awayId)}</select></label>
      </div>
      <label>Engine detail<select class="field" data-field="mode">
        <option value="fine"${this.mode === 'fine' ? ' selected' : ''}>Fine (the match you watch)</option>
        <option value="coarse"${this.mode === 'coarse' ? ' selected' : ''}>Coarse (background matches)</option>
      </select></label>
      <div class="row-actions">
        <button type="button" class="btn-secondary" data-act="restart">Kick off again</button>
        <button type="button" class="btn-secondary" data-act="swap">Swap ends</button>
      </div>
      <p class="small muted">League seed ${esc(this.leagueSeed)}, match ${this.matchNo}. Quote these if something looks wrong.</p>`;
  }

  private updateReadout(): void {
    const m = this.m;
    const bar = this.root.querySelector('.lab-clock');
    if (bar) bar.textContent = this.ended() ? 'FT' : clock(m.clockMs);

    const box = this.root.querySelector('.lab-readout') as HTMLElement;
    const rows = ([0, 1] as Side[]).map((side) => {
      const info = teamShapeInfo(m, side);
      const name = side === 0 ? m.setup.home.short : m.setup.away.short;
      const press = m.teams[side].pressEngaged ? m.teams[side].pressSet.length : 0;
      return `<tr><th scope="row"><span class="lab-dot" style="background:${this.kit[side].fill};border-color:${this.kit[side].edge}"></span>${esc(name)}${m.poss === side ? ' ●' : ''}</th>
        <td>${info.backLine.toFixed(0)}</td><td>${info.targetLine.toFixed(0)}</td><td>${info.length.toFixed(0)}</td><td>${info.width.toFixed(0)}</td><td>${press}</td></tr>`;
    }).join('');
    box.innerHTML = `<table class="lab-table">
      <thead><tr><th></th><th>Line</th><th>Aim</th><th>Length</th><th>Width</th><th>Press</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="small muted">Metres. Line is the back line's distance from its own goal; ● has the ball.</p>`;

    const pending = this.root.querySelector('.lab-pending');
    if (pending) {
      const at = this.pendingMs[this.side];
      pending.textContent = at > m.clockMs ? `Change lands at ${clock(at)}.` : at > 0 ? 'Change applied.' : 'Changes land at the next whole second.';
    }

    const sel = this.root.querySelector('.lab-sel') as HTMLElement;
    if (this.selected < 0) {
      sel.hidden = true;
    } else {
      const i = this.selected;
      const side = (i < 11 ? 0 : 1) as Side;
      const slot = i % 11;
      const p = (side === 0 ? m.setup.home : m.setup.away).players[slot];
      const label = m.teams[side].formation.slots[slot]?.label ?? p.position;
      const speed = Math.sqrt(m.vx[i] * m.vx[i] + m.vy[i] * m.vy[i]) * 3.6;
      sel.hidden = false;
      sel.innerHTML = `<p class="lab-sel-name"><span class="lab-dot" style="background:${i % 11 === 0 ? KEEPER_FILL[side] : this.kit[side].fill};border-color:${this.kit[side].edge}"></span>#${p.jersey} ${esc(p.name)} <span class="muted">${esc(label)}</span></p>
        <p class="small">${ROLE_NAMES[m.role[i]] ?? 'Unknown'} · ${speed.toFixed(0)} km/h · ${(m.dist[i] / 1000).toFixed(2)} km run</p>
        <p class="small muted">Dashed line: where his shape wants him. Tap him again to stop following.</p>`;
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private resize(wrap: HTMLElement): void {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
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

  private draw(): void {
    if (!this.cssW) return;
    const m = this.m;
    const ctx = this.ctx;
    const a = m.clockMs > this.viewMs ? Math.min(1, Math.max(0, 1 - (m.clockMs - this.viewMs) / m.stepMs)) : 1;
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

    if (this.overlays.lines) this.drawLines();
    if (this.overlays.spots) {
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i++) {
        if (i % 11 === 0) continue;
        ctx.strokeStyle = this.kit[i < 11 ? 0 : 1].line;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(this.X(m.sx[i]), this.Y(m.sy[i]), r * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (this.overlays.roles) {
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
    if (this.overlays.moves) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i++) {
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
      const side = i < 11 ? 0 : 1;
      const slot = i % 11;
      const kit = this.kit[side];
      const x = this.X(this.ix[i]);
      const y = this.Y(this.iy[i]);
      const ring = this.overlays.roles ? ROLE_RING[m.role[i]] : undefined;
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
      const p = (side === 0 ? m.setup.home : m.setup.away).players[slot];
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

  /** Each team's back line (solid, from the players drawn) and the line it is aiming for (dotted). */
  private drawLines(): void {
    const m = this.m;
    const ctx = this.ctx;
    ctx.lineWidth = 2;
    for (const side of [0, 1] as Side[]) {
      const team = m.teams[side];
      let sum = 0;
      let n = 0;
      for (let s = 1; s < 11; s++) {
        if (team.defU[s] !== 0) continue;
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

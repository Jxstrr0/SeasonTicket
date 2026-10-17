/**
 * Engine Lab: a 2D top-down view of the spatial match engine (Stage 4.5). It is the
 * owner's tool for judging the engine: watch both shapes, change either side's tactics
 * while the match runs and see the change land, and see every shot and goal. The watched match
 * runs on the main thread; "Play a league week in the background" checks the worker pool
 * (src/game/matchRunner.ts) against this thread. This file only reads engine state and
 * queues tactics: no match rules live here.
 */
import './lab.css';
import { FORMATIONS } from '../../sim/data';
import { createInThreadRunner, createMatchRunner, fingerprintOf, resultFingerprint, type MatchJob, type MatchRunner } from '../../game/matchRunner';
import { createLeague } from '../../sim/league';
import { buildMatchSetup, createSeason, defaultHooks, matchContext, matchesForWeek } from '../../sim/season';
import { createSpatial, matchStats, queueTactics, spatialFinished, stepSpatial, teamShapeInfo } from '../../sim/spatial/engine';
import { clockLabel, matchTime } from '../../sim/spatial/systems';
import { spatialSetupFromLeague } from '../../sim/spatial/setup';
import {
  RESTART_CORNER, RESTART_DROP, RESTART_FREE_KICK, RESTART_GOAL_KICK, RESTART_KICKOFF, RESTART_PENALTY, RESTART_THROW_IN,
  type SpatialMatch,
} from '../../sim/spatial/state';
import {
  PERSONS, ROLE, personOf, type GoalRecord, type Side, type SpatialEvent, type SpatialMode, type SpatialPlayer, type SpatialSetup,
} from '../../sim/spatial/types';
import type { Dial, League, Tactics } from '../../sim/types';
import { parseSeed, randomSeed } from '../app';
import { esc } from '../html';
import { KEEPER_FILL, PitchView, matchKits, type Kit } from '../pitch2d';

const SPEEDS = [1, 2, 4, 8] as const;
/** A long gap between frames (tab hidden, phone locked) never fast-forwards the match. */
const MAX_FRAME_S = 0.1;
const READOUT_MS = 250;
const SKIP_MS = 60_000;
/** How long the GOAL banner stays up, in real time (so it reads at any speed). */
const BANNER_MS = 3000;
/** The referee's list shows this many of the latest cards, penalties and injuries. */
const EVENT_ROWS = 8;

type DialKey = 'mentality' | 'pressing' | 'defensiveLine' | 'width';
const DIALS: { key: DialKey; label: string; low: string; high: string }[] = [
  { key: 'mentality', label: 'Mentality', low: 'Defensive', high: 'Attacking' },
  { key: 'pressing', label: 'Pressing', low: 'Sit off', high: 'All-out' },
  { key: 'defensiveLine', label: 'Defensive line', low: 'Deep', high: 'High' },
  { key: 'width', label: 'Width with the ball', low: 'Narrow', high: 'Wide' },
];
const DIAL_VALUES: Dial[] = [1, 2, 3, 4, 5];

const ROLE_NAMES = [
  'Holding shape', 'Goalkeeper', 'On the ball', 'Receiving', 'Pressing', 'Covering the press', 'Man-marking',
  'Counter run', 'Tracking a runner', 'Run in behind', 'Attacking the box', 'In the wall',
];
const RESTART_NAMES: Partial<Record<number, string>> = {
  [RESTART_KICKOFF]: 'Kick-off',
  [RESTART_GOAL_KICK]: 'Goal kick',
  [RESTART_CORNER]: 'Corner',
  [RESTART_THROW_IN]: 'Throw-in',
  [RESTART_FREE_KICK]: 'Free kick',
  [RESTART_PENALTY]: 'Penalty',
  [RESTART_DROP]: 'Dropped ball',
};
/** Referee moments worth listing (fouls, offsides and advantages are counted in the stats). */
const EVENT_NAMES: Partial<Record<SpatialEvent['kind'], string>> = {
  yellow: 'Yellow card',
  red: 'Red card',
  penalty: 'Penalty won',
  injury: 'Injured',
};
function copyTactics(t: Tactics): Tactics {
  return { ...t, setPieceTakers: { ...t.setPieceTakers } };
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
  private readonly pendingMs: [number, number] = [0, 0];
  private overlays = { roles: true, lines: true, shots: false, spots: false, moves: false };
  private selected = -1;
  private lastFrame = 0;
  private lastReadout = 0;
  /** Goals already listed and bannered, and when the banner comes down (real time). */
  private goalsSeen = 0;
  /** Referee events already looked at. */
  private eventsSeen = 0;
  private bannerUntil = 0;
  /** The background-week check (see playWeek). */
  private runner: MatchRunner | null = null;
  private weekBusy = false;
  private weekHtml = '';

  private readonly canvas: HTMLCanvasElement;
  private view: PitchView | null = null;

  constructor(private readonly root: HTMLElement) {
    const fromHash = location.hash.split('/')[1];
    this.leagueSeed = fromHash && fromHash.trim() ? decodeURIComponent(fromHash).slice(0, 40) : randomSeed();
    this.league = createLeague(parseSeed(this.leagueSeed));
    this.homeId = this.league.teams[0].id;
    this.awayId = this.league.teams[1].id;

    root.innerHTML = this.shellHtml();
    this.canvas = root.querySelector('canvas') as HTMLCanvasElement;

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onPitchTap(e));
    const wrap = root.querySelector('.lab-pitch') as HTMLElement;
    new ResizeObserver(() => this.view?.fit(wrap.clientWidth, wrap.clientHeight)).observe(wrap);

    this.newMatch();
    this.view?.fit(wrap.clientWidth, wrap.clientHeight);
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Match control
  // -------------------------------------------------------------------------

  private newMatch(): void {
    this.matchNo += 1;
    const setup = spatialSetupFromLeague(this.league, this.homeId, this.awayId);
    this.tactics = [copyTactics(setup.home.tactics), copyTactics(setup.away.tactics)];
    this.view ??= new PitchView(this.canvas, setup);
    this.view.overlays = this.overlays;
    this.kit = this.view.kit = matchKits(setup);
    this.m = createSpatial(setup, `${this.leagueSeed}:${this.homeId}:${this.awayId}:${this.matchNo}`, this.mode);
    this.viewMs = 0;
    this.pendingMs[0] = 0;
    this.pendingMs[1] = 0;
    this.selected = -1;
    this.goalsSeen = 0;
    this.eventsSeen = 0;
    this.bannerUntil = 0;
    this.savePrev();
    this.renderBar();
    this.renderTabs();
    this.renderTactics();
    this.renderMatchSection();
    this.renderGoals();
    this.renderEvents();
    this.updateReadout();
    this.hideBanner();
  }

  private ended(): boolean {
    return spatialFinished(this.m);
  }

  private savePrev(): void {
    this.view?.savePrev(this.m);
  }

  /** Step the engine until it reaches `toMs`, keeping the step before for smooth drawing. */
  private advance(toMs: number): void {
    const m = this.m;
    while (m.clockMs < toMs) {
      this.savePrev();
      if (!stepSpatial(m)) break;
    }
    this.viewMs = Math.min(toMs, m.clockMs);
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
    this.checkGoals(now);
    this.checkEvents();
    if (this.bannerUntil && now >= this.bannerUntil) this.hideBanner();
    if (this.view) {
      this.view.selected = this.selected;
      this.view.draw(this.m, this.viewMs);
    }
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
    } else if (act === 'week') {
      void this.playWeek();
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
    const best = this.view ? this.view.pick(e.clientX, e.clientY) : -1;
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
    <div class="lab-pitch">
      <canvas aria-label="Top-down view of the match"></canvas>
      <p class="lab-restart" aria-hidden="true" hidden></p>
      <p class="lab-banner" role="status" aria-live="polite" hidden></p>
    </div>
    <aside class="lab-panel">
      <p class="lab-rotate small muted">Turn your phone sideways for a bigger pitch.</p>
      <section class="lab-sel card" hidden></section>
      <div class="segmented lab-tabs" role="group" aria-label="Team to change"></div>
      <section class="lab-tactics"></section>
      <section class="lab-readout card"></section>
      <section class="lab-stats card"></section>
      <section class="lab-goals-list card"></section>
      <section class="lab-events card"></section>
      <section class="lab-overlays">
        <h3 class="lab-h">Show on the pitch</h3>
        ${overlay('roles', 'What players are doing (rings, key below)')}
        ${overlay('lines', 'Each back line (solid) and where it is aiming (dotted)')}
        ${overlay('shots', 'Shot map (bigger = better chance, filled = goal)')}
        ${overlay('spots', 'Shape spots (where each player wants to stand)')}
        ${overlay('moves', 'Movement arrows (one second ahead)')}
        <p class="small muted lab-legend">
          <span style="--c:#ff5d5d">Pressing</span>
          <span style="--c:#ffa94d">Cover</span>
          <span style="--c:#5ee0ff">Man-marking</span>
          <span style="--c:#ffe066">Counter run</span>
          <span style="--c:#b197fc">Tracking a runner</span>
          <span style="--c:#69db7c">Run in behind</span>
          <span style="--c:#f783ac">Attacking the box</span>
        </p>
      </section>
      <section class="lab-match"></section>
      <p class="small muted">The full engine: shape, passing, shooting, the referee, fatigue, substitutions and the AI coach, tuned against real-match numbers. Every league and playoff match plays on it. Tap a player to follow him.</p>
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
      <span class="lab-goals" aria-label="${esc(s.home.short)} goals">${m.score[0]}</span>
      <span class="lab-clock">${clockLabel(m)}</span>
      <span class="lab-goals" aria-label="${esc(s.away.short)} goals">${m.score[1]}</span>
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
      <p class="small muted">League seed ${esc(this.leagueSeed)}, match ${this.matchNo}. Quote these if something looks wrong.</p>
      <h3 class="lab-h">Background matches</h3>
      <p class="small muted">Plays this league's first week (8 coarse matches, AI coaches on both sides) in two background workers, then again on this screen, and checks the results are identical.</p>
      <button type="button" class="btn-secondary lab-wide" data-act="week"${this.weekBusy ? ' disabled' : ''}>Play a league week in the background</button>
      <div class="small lab-week" aria-live="polite">${this.weekHtml}</div>`;
  }

  /** The week check: the worker pool against this thread, timed, with fingerprints compared. */
  private async playWeek(): Promise<void> {
    if (this.weekBusy) return;
    this.weekBusy = true;
    const show = (html: string) => {
      this.weekHtml = html;
      const box = this.root.querySelector('.lab-week');
      if (box) box.innerHTML = html;
      const btn = this.root.querySelector<HTMLButtonElement>('[data-act="week"]');
      if (btn) btn.disabled = this.weekBusy;
    };
    try {
      const league = structuredClone(this.league);
      const season = createSeason(league);
      const ctx = matchContext(league);
      const jobs: MatchJob[] = matchesForWeek(season, 1).map((match) => ({ setup: buildMatchSetup(season, match, defaultHooks()), ctx }));
      this.runner ??= createMatchRunner(2);
      show(`Playing ${jobs.length} matches in the background...`);
      let t0 = performance.now();
      const bg = await this.runner.run(jobs, (done, total) => show(`Playing in the background: ${done} of ${total}...`));
      const bgMs = performance.now() - t0;
      const where = this.runner.kind === 'worker' ? 'on two background workers' : 'on this screen (background workers are not available here)';
      show(`Background done in ${(bgMs / 1000).toFixed(2)} s. Now playing them again on this screen...`);
      t0 = performance.now();
      const here = await createInThreadRunner().run(jobs, (done, total) => show(`Playing on this screen: ${done} of ${total}...`));
      const hereMs = performance.now() - t0;
      const a = bg.map(resultFingerprint), b = here.map(resultFingerprint);
      const same = a.every((f, k) => f === b[k]);
      const name = (id: string) => esc(league.teams.find((t) => t.id === id)?.abbr ?? id);
      const scores = bg.map((r) => `${name(r.homeId)} ${r.homeScore}-${r.awayScore} ${name(r.awayId)}`).join(' · ');
      this.weekBusy = false;
      show(`<p><strong>${same ? 'Results match ✓' : 'Results differ ✗'}</strong> (week code ${fingerprintOf(a)}${same ? '' : ` vs ${fingerprintOf(b)}`})</p>
        <p>${jobs.length} matches in ${(bgMs / 1000).toFixed(2)} s ${where}; ${(hereMs / 1000).toFixed(2)} s on this screen, one at a time.</p>
        <p class="muted">${scores}</p>`);
    } catch (e) {
      this.weekBusy = false;
      show(`Could not play the week: ${esc(e instanceof Error ? e.message : String(e))}`);
    }
  }

  private updateReadout(): void {
    const m = this.m;
    const bar = this.root.querySelector('.lab-clock');
    if (bar) bar.textContent = clockLabel(m);
    const goals = this.root.querySelectorAll('.lab-goals');
    if (goals.length === 2) { goals[0].textContent = String(m.score[0]); goals[1].textContent = String(m.score[1]); }
    const restart = this.root.querySelector('.lab-restart') as HTMLElement;
    const name = this.ended() ? undefined : RESTART_NAMES[m.restartKind];
    restart.hidden = !name;
    if (name) restart.textContent = `${name} · ${(m.restartSide === 0 ? m.setup.home : m.setup.away).short}`;

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

    const stats = matchStats(m);
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const statRow = (label: string, f: (t: (typeof stats)[0]) => string): string =>
      `<tr><th scope="row">${label}</th><td>${f(stats[0])}</td><td>${f(stats[1])}</td></tr>`;
    const statBox = this.root.querySelector('.lab-stats') as HTMLElement;
    statBox.innerHTML = `<h3 class="lab-h">Match stats</h3><table class="lab-table">
      <thead><tr><th></th>${([0, 1] as Side[]).map((side) => this.statHead(side)).join('')}</tr></thead>
      <tbody>
        ${statRow('Possession', (t) => pct(t.possession))}
        ${statRow('Passes', (t) => String(t.passes))}
        ${statRow('Pass completion', (t) => (t.passes > 0 ? pct(t.completion) : '–'))}
        ${statRow('Passes cut out', (t) => String(t.intercepted))}
        ${statRow('Tackles made', (t) => String(t.tackles))}
        ${statRow('Box entries', (t) => String(t.boxEntries))}
        ${statRow('Shots', (t) => String(t.shots))}
        ${statRow('On target', (t) => String(t.onTarget))}
        ${statRow('Blocked', (t) => String(t.blocked))}
        ${statRow('Expected goals', (t) => t.xg.toFixed(2))}
        ${statRow('Crosses', (t) => String(t.crosses))}
        ${statRow('Corners', (t) => String(t.corners))}
        ${statRow('Throw-ins', (t) => String(t.throwIns))}
        ${statRow('Fouls', (t) => String(t.fouls))}
        ${statRow('Offsides', (t) => String(t.offsides))}
        ${statRow('Free kicks won', (t) => String(t.freeKicks))}
        ${statRow('Penalties (scored)', (t) => `${t.penalties} (${t.penGoals})`)}
        ${statRow('Yellow cards', (t) => String(t.yellows))}
        ${statRow('Red cards', (t) => String(t.reds))}
      </tbody></table>`;

    const pending = this.root.querySelector('.lab-pending');
    if (pending) {
      const at = this.pendingMs[this.side];
      pending.textContent = at > m.clockMs ? `Change lands at ${clock(at)}.` : at > 0 ? 'Change applied.' : 'Changes land at the next whole second.';
    }

    const sel = this.root.querySelector('.lab-sel') as HTMLElement;
    if (this.selected >= 0 && !m.on[this.selected]) this.selected = -1;
    if (this.selected < 0) {
      sel.hidden = true;
    } else {
      const i = this.selected;
      const side = (i < 11 ? 0 : 1) as Side;
      const slot = i % 11;
      const p = personOf(m.setup, m.who[i]) as SpatialPlayer;
      const label = m.teams[side].formation.slots[m.teams[side].spot[slot]]?.label ?? p.position;
      const booked = m.rules.yellow[i] ? ' · booked' : '';
      const speed = Math.sqrt(m.vx[i] * m.vx[i] + m.vy[i] * m.vy[i]) * 3.6;
      sel.hidden = false;
      sel.innerHTML = `<p class="lab-sel-name"><span class="lab-dot" style="background:${i % 11 === 0 ? KEEPER_FILL[side] : this.kit[side].fill};border-color:${this.kit[side].edge}"></span>#${p.jersey} ${esc(p.name)} <span class="muted">${esc(label)}</span></p>
        <p class="small">${ROLE_NAMES[m.role[i]] ?? 'Unknown'} · ${speed.toFixed(0)} km/h · ${(m.dist[i] / 1000).toFixed(2)} km run${booked}</p>
        <p class="small muted">Dashed line: where his shape wants him. Tap him again to stop following.</p>`;
    }
  }

  /** A player's name from his person code (as logs and events record him). */
  private playerName(w: number): string {
    return w >= 0 && w < PERSONS ? personOf(this.m.setup, w)?.name ?? '?' : '?';
  }

  /** "12' Name (assist Name), xG 0.23" for one goal, as HTML. */
  private goalLine(g: GoalRecord): string {
    const t = matchTime(this.m, g.ms);
    const minute = `${t.minute}${t.added > 0 ? `+${t.added}` : ''}'`;
    const how = g.ownGoal ? ' (own goal)' : g.assist >= 0 ? ` (assist ${esc(this.playerName(g.assist))})` : '';
    const extra = g.ownGoal ? '' : `${g.header ? ' header,' : ''} xG ${g.xg.toFixed(2)}`;
    return `${minute} ${esc(this.playerName(g.scorer))}${how}<span class="muted">${extra}</span>`;
  }

  private renderGoals(): void {
    const box = this.root.querySelector('.lab-goals-list') as HTMLElement;
    const log = this.m.goalLog;
    const rows = log.map((g) => `<li><span class="lab-dot" style="background:${this.kit[g.side].fill};border-color:${this.kit[g.side].edge}"></span>${this.goalLine(g)}</li>`).join('');
    box.innerHTML = `<h3 class="lab-h">Goals</h3>${log.length ? `<ul class="lab-goal-rows">${rows}</ul>` : '<p class="small muted">No goals yet.</p>'}`;
  }

  private renderEvents(): void {
    const box = this.root.querySelector('.lab-events') as HTMLElement;
    const rows: string[] = [];
    const ev = this.m.events;
    for (let k = ev.length - 1; k >= 0 && rows.length < EVENT_ROWS; k--) {
      const e = ev[k];
      const name = EVENT_NAMES[e.kind];
      if (!name) continue;
      const what = e.note === 'second' ? 'Second yellow, sent off' : e.note === 'dogso' ? 'Red card (denied a goal)' : name;
      rows.push(`<li><span class="lab-dot" style="background:${this.kit[e.side].fill};border-color:${this.kit[e.side].edge}"></span>${Math.floor(e.ms / 60_000) + 1}' ${esc(what)}: ${esc(this.playerName(e.player))}</li>`);
    }
    box.innerHTML = `<h3 class="lab-h">Referee</h3>${rows.length ? `<ul class="lab-goal-rows">${rows.join('')}</ul>` : '<p class="small muted">No cards, penalties or injuries yet.</p>'}<p class="small muted">Latest first.</p>`;
  }

  private checkEvents(): void {
    const ev = this.m.events;
    if (ev.length === this.eventsSeen) return;
    let listed = false;
    for (let k = this.eventsSeen; k < ev.length; k++) if (EVENT_NAMES[ev[k].kind]) listed = true;
    this.eventsSeen = ev.length;
    if (listed) this.renderEvents();
  }

  /** New goals since the last frame: list them and put the latest up in the banner. */
  private checkGoals(now: number): void {
    const log = this.m.goalLog;
    if (log.length === this.goalsSeen) return;
    this.goalsSeen = log.length;
    this.renderGoals();
    this.updateReadout();
    const g = log[log.length - 1];
    const s = this.m.setup;
    const banner = this.root.querySelector('.lab-banner') as HTMLElement;
    banner.innerHTML = `<strong>GOAL!</strong> ${esc(s.home.short)} ${this.m.score[0]}–${this.m.score[1]} ${esc(s.away.short)}<br><span class="small">${this.goalLine(g)}</span>`;
    banner.style.setProperty('--c', this.kit[g.side].line);
    banner.hidden = false;
    this.bannerUntil = now + BANNER_MS;
  }

  private hideBanner(): void {
    this.bannerUntil = 0;
    (this.root.querySelector('.lab-banner') as HTMLElement).hidden = true;
  }

  /** A narrow column heading: kit dot and the first three letters, full name for screen readers. */
  private statHead(side: Side): string {
    const name = side === 0 ? this.m.setup.home.short : this.m.setup.away.short;
    return `<th scope="col" aria-label="${esc(name)}"><span class="lab-dot" style="background:${this.kit[side].fill};border-color:${this.kit[side].edge}"></span>${esc(name.slice(0, 3).toUpperCase())}</th>`;
  }

}

/**
 * The career controller. It owns the view state, turns taps into calls to the
 * career API (src/sim/career) and the live match (src/game/matchday), saves
 * after every change, and re-renders from pure view functions. No game rules
 * live here: the sim decides everything.
 */
import {
  advanceDeadlineHour,
  answerDeadlineCall,
  closeDeadline,
  openDeadline,
  C,
  acceptBid,
  acceptSponsor,
  advanceCareer,
  bidForPlayer,
  borrow,
  cancelProject,
  continueToNextSeason,
  createCareer,
  defaultCrest,
  ensureUserSelection,
  fireStaff,
  hireStaff,
  injectCash,
  loanIn,
  offerToClubs,
  orderProject,
  rejectBid,
  releasePlayer,
  renewContract,
  repayDebt,
  resetToCoach,
  sellNamingRights,
  setFormation,
  setStadiumLook,
  setStarter,
  setTactics,
  setTicketPrice,
  signFreeAgent,
  startQueuedNow,
  startUserMatch,
  toggleBench,
  upgradeAcademy,
  liveOf,
  userTeam,
  type Career,
  type CrestIcon,
  type CrestPattern,
  type CrestShape,
  type MatchMode,
  type StadiumLook,
  type TierId,
  answerEvent,
  setStoryPace,
} from '../../sim/career';
import { CLUBS, MATCH_TUNING } from '../../sim/data';
import { seedNumber } from '../../sim/league';
import type { MatchResult, Position, StaffRole, Tactics } from '../../sim/types';
import { STAFF_ROLES } from '../../sim/types';
import { coachInCharge, isBreak, liveSubstitute, liveTactics, playToEnd, setCoachInCharge, stepLive, stepLiveView } from '../../game/matchday';
import { LiveHost } from './liveHost';
import { Match3D, type PlayerCard, type ThreeChoice } from './match3d';
import { ratingSoFar } from '../../sim/match/ratings';
import { personOf, type SpatialSetup } from '../../sim/spatial/types';
import { buildStadiumSnapshot } from './stadiumSnapshot';
import { findMatch } from '../model';
import { SaveError, decodeSave, encodeSave, loadCareer, saveCareer } from '../../game/save';
import { createMatchRunner, type MatchRunner } from '../../game/matchRunner';
import { WeekPlayer } from '../../game/week';
import { renderWeekRun, weekRunCount } from '../views/career/weekRun';
import { parseSeed, randomSeed } from '../app';
import { renderCareerTitle } from '../views/career/title';
import { MATCH_MODES, renderCrestPreview, renderNewCareer } from '../views/career/newCareer';
import { careerWeekLabel, renderHub } from '../views/career/hub';
import { renderLive } from '../views/career/live';
import { renderReplayScreen } from '../views/career/replay';
import { replayOf } from '../views/career/home';
import { renderReview } from '../views/career/review';
import { renderDeadline } from '../views/career/deadline';
import { renderGameOver, renderSaveCode } from '../views/career/saves';
import { renderHelp, renderTip } from '../views/career/help';
import { loadTips, markSeen, nextTip, onScreenOf, storeTips, tipCandidates, tipsPaused, type TipId } from './tips';
import { isQualitySetting, storeQuality, type QualityTier } from '../../render/quality';
import type { HotspotId, OfficePick } from '../../render/office/types';
import { OfficeHost } from './officeHost';
import { StadiumHost } from './stadiumHost';
import { ReplayHost } from './replayHost';
import { Atmosphere, nightMatch } from './atmosphere';
import atmosphereTuning from '../../data/tuning/atmosphere.json';
import type { StadiumPart } from '../../render/stadium/types';
import { HUB_TABS, LIVE_SPEEDS, MARKET_PAGE, PITCH_SPEEDS, STADIUM_PICKS, initialUi, storeHighlights, storeLiveFull, storeLivePitch, storeMatch3d, storeShowFps, storeSound, SOUND_SETTINGS, type SoundSetting, type HubTab, type LeagueTab, type LivePanel, type MarketView, type NewCareerDraft, type StadiumPick, type UiState, type WeekRun } from './state';

type Result = { ok: boolean; message: string };

const MARKET_VIEWS: readonly MarketView[] = ['scout', 'free', 'bids'];
const LEAGUE_TABS: readonly LeagueTab[] = ['table', 'results', 'playoffs'];
const LIVE_PANELS: readonly LivePanel[] = ['none', 'subs', 'tactics'];
/** A long gap between screen frames (tab hidden, phone locked) never plays the match on. */
const PITCH_MAX_FRAME_S = 0.1;
/** How long a break (half-time) lasts with the head coach in charge, in real ms. */
/** Taps closer together than this count as one (a double tap fires two clicks). */
const CONFIRM_GAP_MS = 450;
/** Taps that answer something or move the clock on, where the next thing to answer appears under the finger. */
const STEP_ACTIONS = new Set(['event-choice', 'deadline-hour', 'deadline-call']);
const BREAK_MS = atmosphereTuning.break.coachS * 1000;
const POSITIONS: readonly Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
const DIAL_KEYS = ['mentality', 'pressing', 'defensiveLine', 'width', 'tempo', 'directness', 'timeWasting'] as const;
const TAKER_KEYS = ['penalties', 'freeKicks', 'corners'] as const;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read through a call so TypeScript does not keep the phase narrowed across advanceCareer. */
function phaseOf(career: Career): Career['phase'] {
  return career.phase;
}

function isTier(value: string | undefined): value is TierId {
  return !!value && (C.tiers.order as string[]).includes(value);
}

function isMode(value: string | undefined): value is MatchMode {
  return MATCH_MODES.some((m) => m.id === value);
}

/** A whole number of thousands from a "$k" field, or NaN. */
function thousandsField(form: HTMLFormElement, name: string): number {
  const raw = (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
  const n = Number(raw);
  return raw.trim() === '' || !Number.isFinite(n) ? NaN : Math.round(n * 1000);
}

function numberField(form: HTMLFormElement, name: string): number {
  const raw = (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  const n = Number(raw);
  return raw.trim() === '' ? NaN : n;
}

function newDraft(): NewCareerDraft {
  const order = C.tiers.order as TierId[];
  const tier = order[Math.min(1, order.length - 1)];
  const colors = { primary: '#223355', secondary: '#ffffff' };
  return {
    step: 'club',
    tier,
    teamId: null,
    branding: { name: '', shortName: '', city: '', abbr: '', ...colors },
    crest: defaultCrest(colors, ''),
    homegrown: true,
    matchMode: 'full',
    seed: randomSeed(),
  };
}

/** The user's result in this week's results, for the flash line. */
function userResultText(career: Career, results: readonly MatchResult[]): string | null {
  const r = results.find((m) => m.homeId === career.userTeamId || m.awayId === career.userTeamId);
  if (!r) return null;
  const teams = career.season.league.teams;
  const name = (id: string): string => teams.find((t) => t.id === id)?.shortName ?? id;
  const pens = r.shootout ? ` (${r.shootout.home}-${r.shootout.away} pens)` : '';
  return `${name(r.homeId)} ${r.homeScore}-${r.awayScore} ${name(r.awayId)}${pens}`;
}

/** Where each object in the office leads. */
const HOTSPOT_TABS: Record<HotspotId, HubTab> = {
  laptop: 'money',
  phone: 'market',
  tv: 'news',
  window: 'stadium',
  cabinet: 'club',
  whiteboard: 'lineup',
  clipboard: 'squad',
  door: 'inbox',
};

export class CareerApp {
  private ui: UiState = initialUi();
  private career: Career | null = null;
  /** Bumped to stop a running sim or live loop. */
  private runToken = 0;
  private liveTimer: number | null = null;
  private liveRaf = 0;
  /** The engine's clock at a break (half-time) that play has not come back on from yet. */
  private breakAt: number | null = null;
  /** The 3D match, shared by the live screen and the replay so a match uses one WebGL context. */
  private readonly match3d = new Match3D((text) => {
    this.ui.match3dFailed = true;
    this.ui.flash = { kind: 'error', text };
    this.render();
  });
  /** The crowd's sound and the commentary ticker, shared like the 3D view. */
  private readonly atmosphere = new Atmosphere();
  private readonly pitch = new LiveHost(this.match3d, this.atmosphere);
  /** Set after one failed save so the warning shows once. */
  private saveWarned = false;
  /** When a confirm button was armed, and the last form sent: see CONFIRM_GAP_MS. */
  private armedAt = 0;
  private lastForm = { name: '', at: 0 };
  /** When a story answer or the deadline clock last moved: the second tap of a double tap must not answer what replaced it. */
  private lastStepAt = 0;
  /** When a tip card last closed: the rest of a double tap must not land on what was under it. */
  private tipClosedAt = 0;
  /** First-time tips seen on this device, and the one showing now. */
  private tips = loadTips();
  private tipShown: TipId | null = null;
  /** The 3D office sits behind the menus; the menus render into uiLayer. */
  private readonly uiLayer: HTMLElement;
  private readonly officeLayer: HTMLElement;
  private readonly office: OfficeHost;
  private readonly stadium: StadiumHost;
  private readonly replay = new ReplayHost(this.match3d, this.atmosphere);
  /** Set when a pick should also turn the 3D stadium's camera to face it. */
  private stadiumFocus = false;
  private runner: MatchRunner | null = null;
  /** Plays the weeks' matches in the background workers (17.8). */
  private readonly weeks = new WeekPlayer(() => (this.runner ??= createMatchRunner(2)));
  private warmTimer: number | null = null;

  constructor(private readonly root: HTMLElement) {
    this.atmosphere.onGoal = (side) => {
      if (side === 0) this.match3d.celebrate();
    };
    const officeLayer = document.createElement('div');
    officeLayer.id = 'office-layer';
    this.officeLayer = officeLayer;
    this.uiLayer = document.createElement('div');
    this.uiLayer.id = 'ui-layer';
    root.replaceChildren(officeLayer, this.uiLayer);
    this.office = new OfficeHost(
      officeLayer,
      (p) => this.onOfficePick(p),
      (text) => {
        this.ui.inOffice = false;
        this.ui.flash = { kind: 'error', text };
        this.render();
      },
    );
    this.stadium = new StadiumHost(
      (part) => this.onStadiumPick(part),
      (text) => {
        this.ui.stadium3dFailed = true;
        this.ui.flash = { kind: 'error', text };
        this.render();
      },
    );
    this.loadStored();
    root.addEventListener('click', (e) => this.onClick(e));
    // Turning the phone changes how tall the top bar is.
    window.addEventListener('resize', () => this.syncOffice());
    root.addEventListener('submit', (e) => this.onSubmit(e));
    root.addEventListener('input', (e) => this.onDraft(e));
    root.addEventListener('change', (e) => this.onChange(e));
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) this.save();
      this.atmosphere.sound.sleep(hidden);
    });
    this.atmosphere.sound.setLevel(atmosphereTuning.sound.levels[this.ui.sound]);
    this.render();
  }

  // -------------------------------------------------------------------------
  // Saving and rendering
  // -------------------------------------------------------------------------

  private loadStored(): void {
    try {
      this.career = loadCareer();
      this.ui.title.error = null;
    } catch (err) {
      this.career = null;
      this.ui.title.error = err instanceof SaveError ? err.message : `The saved career could not be read: ${errorText(err)}`;
    }
    this.refreshSummary();
  }

  private refreshSummary(): void {
    const c = this.career;
    this.ui.title.saved = c ? { club: userTeam(c).name, season: c.season.league.season, crest: c.crest } : null;
  }

  private save(): void {
    // Half way through a week the career is not in a state to keep; it saves once settled.
    if (!this.career || this.weeks.playing) return;
    const ok = saveCareer(this.career);
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.ui.flash = { kind: 'error', text: 'This browser would not save the game. Use Menu → Save code to keep your progress.' };
    }
  }

  private render(): void {
    this.ui.tipsOn = !this.tips.off;
    const html = this.view() + (this.ui.weekRun ? renderWeekRun(this.ui.weekRun) : '');
    const tip = this.pickTip(html);
    this.uiLayer.innerHTML = tip ? html + renderTip(tip) : html;
    this.measureTopBar();
    this.syncOffice();
    this.syncStadium();
    this.syncReplay();
    this.syncPitch();
    this.syncSound();
    this.syncFullscreen();
    this.scheduleWarm();
  }

  /** The first-time tip for what is on screen, if one is still unseen. */
  private pickTip(html: string): TipId | null {
    if (tipsPaused(this.ui)) return null;
    const next = nextTip(this.tips, tipCandidates(this.ui, !!this.career, onScreenOf(html)));
    // A tip that was showing and has gone (the owner moved on) counts as seen.
    if (this.tipShown && this.tipShown !== next) {
      markSeen(this.tips, this.tipShown);
      storeTips(this.tips);
    }
    this.tipShown = next;
    return next;
  }

  private closeTip(off: boolean): void {
    if (this.tipShown) markSeen(this.tips, this.tipShown);
    if (off) this.tips.off = true;
    storeTips(this.tips);
    this.tipShown = null;
    this.tipClosedAt = performance.now();
    this.render();
  }

  /** The browser's own full screen goes with the full-screen match and nothing else. */
  private syncFullscreen(): void {
    const { ui } = this;
    const want = ui.screen === 'live' && ui.live.full && ui.live.pitch && !!this.career?.liveMatch;
    if (!want && typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }

  /** Moves the live match's 2D pitch into the live screen (if it is showing). */
  private syncPitch(): void {
    const { ui, career } = this;
    let m = null;
    let three: ThreeChoice | null = null;
    if (career?.liveMatch && ui.screen === 'live' && ui.live.pitch) {
      try {
        m = liveOf(career)?.m ?? null;
      } catch {
        m = null;
      }
      const setup = career.liveMatch.setup;
      three = { ...this.matchChoice(setup.homeId, setup.attendanceShare, nightMatch(setup.matchId, setup.playoff)), side: setup.homeId === career.userTeamId ? 0 : 1, card: (who) => this.liveCard(who) };
      this.pitch.sync(this.uiLayer, m, setup.matchId, three);
      return;
    }
    this.pitch.sync(this.uiLayer, m);
  }

  /**
   * Sound plays on the live and replay screens only. The pitch and replay hosts start it for
   * their match; the text-only live screen has no host, so it is started here.
   */
  private syncSound(): void {
    const { ui, career } = this;
    const live = ui.screen === 'live' && !!career?.liveMatch;
    if (live && !ui.live.pitch) {
      const m = career ? liveOf(career)?.m : null;
      if (m) this.atmosphere.attach(null, m);
      return;
    }
    if (!live && ui.screen !== 'replay') this.atmosphere.stop();
  }

  /** The card for a player tapped in the live 3D match: how he is doing so far. */
  private liveCard(who: number): PlayerCard | null {
    const career = this.career;
    const state = career?.liveMatch;
    const live = career ? liveOf(career) : null;
    if (!career || !state || !live) return null;
    const id = personOf(live.m.setup, who)?.id;
    const p = id ? career.season.league.players[id] : undefined;
    if (!id || !p) return null;
    const home = state.home.playerStats[id] || state.home.onPitch.includes(id);
    const S = home ? state.home : state.away;
    const stats = S.playerStats[id];
    const notes: string[] = [];
    if (stats?.goals) notes.push(stats.goals === 1 ? 'Scored' : `${stats.goals} goals`);
    if (stats?.assists) notes.push(stats.assists === 1 ? 'An assist' : `${stats.assists} assists`);
    if (S.sentOff.includes(id)) notes.push('Sent off');
    else if ((S.yellows[id] ?? 0) > 0) notes.push('Booked');
    if (state.injuries.some((i) => i.playerId === id)) notes.push('Hurt');
    const mine = (home ? state.setup.homeId : state.setup.awayId) === career.userTeamId;
    const canSub = mine && !state.finished && state.period !== 'shootout' && S.subsUsed < MATCH_TUNING.squad.maxSubs && S.onPitch.includes(id);
    return {
      name: `${p.firstName} ${p.lastName}`,
      detail: `${p.position} · ${p.overall}`,
      energy: S.onPitch.includes(id) ? (S.fatigue[id] ?? 1) : null,
      rating: stats ? ratingSoFar(state, live.ctx, id) : null,
      notes: notes.join(' · '),
      subId: canSub ? id : undefined,
    };
  }

  /** The card for a player tapped in a replay: his rating for the whole match. */
  private replayCard(setup: SpatialSetup, matchId: string, who: number): PlayerCard | null {
    const career = this.career;
    const sp = personOf(setup, who);
    if (!career || !sp) return null;
    const p = career.season.league.players[sp.id];
    const stats = findMatch(career.season, matchId)?.result?.playerStats[sp.id] ?? (career.lastUserMatch?.matchId === matchId ? career.lastUserMatch.playerStats[sp.id] : undefined);
    const notes: string[] = [];
    if (stats?.goals) notes.push(stats.goals === 1 ? 'Scored' : `${stats.goals} goals`);
    if (stats?.assists) notes.push(stats.assists === 1 ? 'An assist' : `${stats.assists} assists`);
    if (stats?.redCards) notes.push('Sent off');
    else if (stats?.yellowCards) notes.push('Booked');
    return {
      name: p ? `${p.firstName} ${p.lastName}` : sp.name,
      detail: `${sp.position}${p ? ` · ${p.overall}` : ''}`,
      energy: null,
      rating: stats ? stats.rating : null,
      notes: notes.join(' · '),
    };
  }

  /** What the 3D match should show for a match at `homeId`'s ground. */
  private matchChoice(homeId: string, crowd: number | undefined, night: boolean): Omit<ThreeChoice, 'side'> {
    const { ui } = this;
    const career = this.career as Career;
    const ok = ui.quality !== 'off' && !ui.match3dFailed && !!career.stadiums[homeId];
    return {
      want: ok && ui.match3d,
      highlights: ui.highlights,
      tier: ok && ui.quality !== 'off' ? ui.quality : null,
      ground: () => buildStadiumSnapshot(career, undefined, homeId, crowd),
      night,
    };
  }

  /** Moves the 2D replay into its screen (if it is showing), or stops it. */
  private syncReplay(): void {
    const { ui, career } = this;
    const replay = career && ui.screen === 'replay' && ui.replayId ? replayOf(career, ui.replayId) : null;
    if (!career || !replay || !ui.replayId) return this.replay.sync(this.uiLayer, null);
    const fixture = findMatch(career.season, ui.replayId);
    const home = fixture?.homeId ?? career.season.league.teams.find((t) => t.name === replay.record.setup.home.name)?.id ?? '';
    const id = ui.replayId;
    const setup = replay.record.setup;
    const side = (fixture ? fixture.awayId === career.userTeamId : setup.away.name === userTeam(career).name) ? 1 : 0;
    this.replay.sync(this.uiLayer, replay, id, { ...this.matchChoice(home, fixture?.result?.attendanceShare ?? setup.crowd, nightMatch(id, !!setup.extraTime)), side, card: (who) => this.replayCard(setup, id, who) });
  }

  /** Once the screen is idle, start the coming week's matches in the workers. */
  private scheduleWarm(): void {
    const career = this.career;
    if (!career || career.phase !== 'season' || this.weeks.playing || this.warmTimer !== null) return;
    this.warmTimer = window.setTimeout(() => {
      this.warmTimer = null;
      if (this.career === career && !this.weeks.playing) this.weeks.warm(career);
    }, 400);
  }

  /** Moves the 3D stadium into the Stadium tab (if it is showing) and keeps it current. */
  private syncStadium(): void {
    const { ui } = this;
    const focus = this.stadiumFocus;
    this.stadiumFocus = false;
    this.stadium.sync(this.uiLayer, this.career, ui.quality === 'off' ? null : ui.quality, ui.stadiumPick, focus);
  }

  /**
   * The top bar's height changes with the screen and the club name. The
   * stadium's sticky ground and the message toast sit just under it.
   */
  private measureTopBar(): void {
    const bar = this.uiLayer.querySelector<HTMLElement>('.topbar');
    if (bar) document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  }

  /** A tap on the 3D stadium picks that part, like the chips do. */
  private onStadiumPick(part: StadiumPart): void {
    if (this.weeks.playing) return;
    this.ui.stadiumPick = part;
    this.render();
    this.revealPicked();
  }

  /**
   * The options for the part you tapped sit below the ground (one column) or
   * below its numbers (two columns), often off screen; bring them up so the tap
   * visibly does something. In two columns the ground stays pinned meanwhile.
   */
  private revealPicked(): void {
    const panel = this.uiLayer.querySelector<HTMLElement>('.st-picked');
    if (!panel) return;
    if (panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  }

  /** The tier the office runs at, or null when the plain menus are on. */
  private officeTier(): QualityTier | null {
    const q = this.ui.quality;
    return q === 'off' || this.office.failed ? null : q;
  }

  /** Where the hub lands: the office when 3D is on, else the Home tab. */
  private goHome(): void {
    this.ui.tab = 'home';
    this.ui.inOffice = this.officeTier() !== null;
  }

  private syncOffice(): void {
    const { ui, career } = this;
    if (ui.inOffice && !this.officeTier()) ui.inOffice = false;
    const on = !!career && ui.screen === 'hub' && ui.inOffice;
    if (on) {
      // The room starts below the top bar and tabs, so no label hides under them.
      const tabs = this.uiLayer.querySelector('.career-tabs');
      this.officeLayer.style.top = tabs ? `${Math.round(tabs.getBoundingClientRect().bottom)}px` : '0';
    }
    this.office.sync(on ? career : null, on ? this.officeTier() : null);
  }

  private onOfficePick(p: OfficePick): void {
    if (!this.career || this.ui.screen !== 'hub' || this.weeks.playing) return;
    // The tail of a double tap on a visitor's card or a tip that just closed.
    if (performance.now() - Math.max(this.lastStepAt, this.tipClosedAt) < CONFIRM_GAP_MS) return;
    this.ui.flash = null;
    if (p.kind === 'mail') {
      const mail = this.career.inbox.find((m) => m.id === p.id);
      const ev = mail?.eventRef ? this.career.story.events.find((e) => e.id === mail.eventRef && e.answer === null) : undefined;
      if (ev && mail) {
        // The visitor's scene opens over the office.
        mail.read = true;
        this.ui.sceneId = ev.id;
        this.save();
        return this.render();
      }
      return this.openMail(p.id);
    }
    // The TV is the paper; the phone is the fan feed unless a bid is waiting.
    if (p.id === 'tv') {
      this.ui.newsView = 'paper';
      this.ui.newsEdition = null;
    }
    // On deadline day the phone is the war room.
    if (p.id === 'phone' && this.career && openDeadline(this.career)) return this.show('deadline');
    if (p.id === 'phone' && this.career && this.career.incomingBids.length === 0) {
      this.ui.newsView = 'feed';
      return this.showTab('news');
    }
    this.showTab(HOTSPOT_TABS[p.id]);
  }

  private view(): string {
    const { ui, career } = this;
    switch (ui.screen) {
      case 'title':
        return renderCareerTitle(ui);
      case 'new':
        return ui.draft ? renderNewCareer(ui.draft) : renderCareerTitle(ui);
      case 'saveCode':
        return renderSaveCode(ui);
      case 'gameOver':
        return renderGameOver(career);
      case 'help':
        return renderHelp();
      default:
        break;
    }
    if (!career) return renderCareerTitle(ui);
    if (ui.screen === 'live') return renderLive(career, ui);
    if (ui.screen === 'replay') return renderReplayScreen(career, ui);
    if (ui.screen === 'review') return renderReview(career);
    if (ui.screen === 'deadline') return renderDeadline(career, ui);
    return renderHub(career, ui);
  }

  private show(screen: UiState['screen']): void {
    this.ui.screen = screen;
    this.ui.menuOpen = false;
    this.render();
    window.scrollTo(0, 0);
  }

  private flashResult(r: Result): void {
    this.ui.flash = { kind: r.ok ? 'ok' : 'error', text: r.message };
  }

  /** Sends the owner to the review or game-over screen when the career has moved on. */
  private followPhase(): boolean {
    const c = this.career;
    if (!c) return false;
    const phase = phaseOf(c);
    if (phase === 'review') {
      this.stopLoops();
      this.show('review');
      return true;
    }
    if (phase === 'gameOver') {
      this.stopLoops();
      this.show('gameOver');
      return true;
    }
    return false;
  }

  /** The Sound button turns the sound off and back on at the level it had. */
  private soundBack: SoundSetting | null = null;

  private toggleSound(): void {
    if (this.ui.sound !== 'off') return this.setSound('off');
    const fallback = atmosphereTuning.sound.defaultLevel as SoundSetting;
    this.setSound(this.soundBack ?? (fallback === 'off' ? 'medium' : fallback));
  }

  private setSound(level: SoundSetting): void {
    if (this.ui.sound !== 'off') this.soundBack = this.ui.sound;
    this.ui.sound = level;
    storeSound(level);
    this.atmosphere.sound.setLevel(atmosphereTuning.sound.levels[level]);
    // This runs inside the tap, so the sound can start now.
    this.atmosphere.sound.unlock();
  }

  private stopLoops(): void {
    this.runToken += 1;
    this.ui.simming = false;
    this.ui.live.running = false;
    if (this.liveTimer !== null) {
      window.clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
    cancelAnimationFrame(this.liveRaf);
    this.liveRaf = 0;
    this.atmosphere.pause();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(e: Event): void {
    // Phones only let sound start inside a tap.
    this.atmosphere.sound.unlock();
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-action]') : null;
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const action = target.dataset.action ?? '';
    const d = target.dataset;
    // While a week plays only "Stop" counts (it stops after this week).
    if (this.weeks.playing && action !== 'stop-sim') return;
    if (performance.now() - this.tipClosedAt < CONFIRM_GAP_MS) return;
    if (d.confirm === '1') {
      const key = `${action}:${d.id ?? ''}`;
      if (this.ui.pendingConfirm !== key) {
        this.ui.pendingConfirm = key;
        this.armedAt = performance.now();
        this.render();
        return;
      }
      // A quick double tap fires two clicks: the second must not confirm the first.
      if (performance.now() - this.armedAt < CONFIRM_GAP_MS) return;
    }
    if (STEP_ACTIONS.has(action)) {
      const now = performance.now();
      if (now - this.lastStepAt < CONFIRM_GAP_MS) return;
      this.lastStepAt = now;
    }
    this.ui.pendingConfirm = null;
    if (action !== 'dismiss-flash' && action !== 'menu') this.ui.flash = null;
    try {
      this.handleAction(action, d);
    } catch (err) {
      this.ui.flash = { kind: 'error', text: `Something went wrong: ${errorText(err)}` };
      this.render();
    }
  }

  private handleAction(action: string, d: DOMStringMap): void {
    const { ui } = this;
    // Screens without a career.
    switch (action) {
      case 'continue':
        if (!this.career) return;
        this.goHome();
        if (!this.followPhase()) this.show('hub');
        return;
      case 'new-career':
        this.stopLoops();
        ui.draft = newDraft();
        return this.show('new');
      case 'to-title':
        this.save();
        this.stopLoops();
        this.refreshSummary();
        return this.show('title');
      case 'pick-tier':
        if (ui.draft && isTier(d.tier)) ui.draft.tier = d.tier;
        return this.render();
      case 'pick-club':
        return this.pickClub(d.team);
      case 'back-to-clubs':
        if (ui.draft) ui.draft.step = 'club';
        return this.show('new');
      case 'pick-mode':
        if (ui.draft && isMode(d.mode)) ui.draft.matchMode = d.mode;
        return this.render();
      case 'copy-code':
        return this.copyCode();
      case 'download-code':
        return this.downloadCode();
      case 'back':
        return this.show(this.career ? ui.returnTo : 'title');
      case 'dismiss-flash':
        ui.flash = null;
        return this.render();
      case 'tip-ok':
        return this.closeTip(false);
      case 'tips-off':
        return this.closeTip(true);
      case 'tips-reset':
        this.tips = { off: false, seen: [] };
        storeTips(this.tips);
        this.tipShown = null;
        ui.menuOpen = false;
        ui.flash = { kind: 'ok', text: 'Tips will show again as you go.' };
        return this.render();
      case 'help':
        if (ui.screen !== 'help') ui.returnTo = ui.screen;
        return this.show('help');
    }

    const career = this.career;
    if (!career) return;
    switch (action) {
      // Hub frame
      case 'tab':
        return this.showTab(d.tab);
      case 'menu':
        ui.menuOpen = !ui.menuOpen;
        return this.render();
      case 'office':
        ui.inOffice = this.officeTier() !== null;
        ui.menuOpen = false;
        return this.render();
      case 'set-quality':
        if (!isQualitySetting(d.quality)) return;
        ui.quality = d.quality;
        storeQuality(d.quality);
        this.office.reset();
        this.stadium.reset();
        this.match3d.reset();
        ui.stadium3dFailed = false;
        ui.match3dFailed = false;
        // Turning 3D on (or changing tier) shows the office straight away.
        ui.inOffice = d.quality !== 'off';
        return this.render();
      case 'live-sound':
        this.toggleSound();
        return this.render();
      case 'set-sound': {
        const level = SOUND_SETTINGS.find((k) => k === d.sound);
        if (!level) return;
        this.setSound(level);
        return this.render();
      }
      case 'set-mode':
        if (isMode(d.mode)) career.delegation.matchMode = d.mode;
        break;
      case 'save-code':
        this.save();
        ui.saveCode = encodeSave(career);
        ui.returnTo = ui.screen === 'saveCode' ? 'hub' : ui.screen;
        return this.show('saveCode');
      case 'next-week':
        void this.nextWeek();
        return;
      case 'sim-end':
        void this.simToEnd();
        return;
      case 'stop-sim':
        this.stopLoops();
        if (ui.weekRun) ui.weekRun.toEnd = false;
        break;
      case 'review':
        return this.show('review');
      case 'game-over':
        return this.show('gameOver');
      case 'to-hub':
        this.goHome();
        return this.show('hub');
      case 'start-offseason':
        continueToNextSeason(career);
        this.goHome();
        ui.resultsWeek = null;
        ui.flash = { kind: 'ok', text: `Season ${career.season.league.season} pre-season. The transfer window is open.` };
        this.save();
        return this.show('hub');

      // Home and inbox
      case 'open-report':
        ui.reportOpen = true;
        ui.showAllEvents = false;
        this.render();
        return window.scrollTo(0, 0);
      case 'open-mail':
        return this.openMail(d.id);
      case 'event-choice': {
        if (!d.id || !d.choice) return;
        const res = answerEvent(career, d.id, d.choice === 'staff' ? null : d.choice);
        // A press conference stays on screen until the last question is answered.
        if (career.story.events.find((e) => e.id === d.id)?.answer !== null) {
          ui.sceneId = null;
          ui.flash = { kind: res.ok ? 'ok' : 'error', text: res.text };
        } else if (!res.ok) ui.flash = { kind: 'error', text: res.text };
        break;
      }
      case 'close-scene':
        ui.sceneId = null;
        break;

      // Deadline day
      case 'war-room':
        return this.show('deadline');
      case 'deadline-hour':
        advanceDeadlineHour(career);
        break;
      case 'deadline-call': {
        if (!d.id || (d.choice !== 'yes' && d.choice !== 'more' && d.choice !== 'no')) return;
        const res = answerDeadlineCall(career, d.id, d.choice);
        if (res.message) ui.flash = { kind: res.ok ? 'ok' : 'error', text: res.message };
        break;
      }
      case 'deadline-staff':
        closeDeadline(career);
        ui.flash = { kind: 'ok', text: 'The staff saw the day out. The window has shut.' };
        break;
      case 'set-pace':
        if (d.pace === 'calm' || d.pace === 'normal' || d.pace === 'busy') setStoryPace(career, d.pace);
        break;
      case 'read-all':
        for (const m of career.inbox) m.read = true;
        break;

      // Squad
      case 'player':
        ui.squadPlayerId = d.id || null;
        this.render();
        return window.scrollTo(0, 0);
      case 'release-player':
        if (d.id) this.flashResult(releasePlayer(career, d.id));
        ui.squadPlayerId = null;
        break;
      case 'offer-player':
        if (d.id) this.flashResult(offerToClubs(career, d.id));
        break;

      // Lineup and tactics (shared with the live screen)
      case 'set-formation':
        if (!d.id) return;
        if (ui.screen === 'live') this.flashLive(liveTactics(career, { formationId: d.id }));
        else setFormation(career, d.id);
        break;
      case 'set-dial':
        return this.setDial(d.key, Number(d.value));
      case 'slot': {
        const n = Number(d.slot);
        ui.lineupSlot = d.slot === '' || d.slot === undefined || !Number.isInteger(n) ? null : n;
        return this.render();
      }
      case 'pick-starter':
        if (ui.lineupSlot !== null && d.id) {
          career.delegation.autoLineup = false;
          setStarter(career, ui.lineupSlot, d.id);
        }
        ui.lineupSlot = null;
        break;
      case 'bench-toggle':
        if (d.id) {
          career.delegation.autoLineup = false;
          toggleBench(career, d.id);
        }
        break;
      case 'take-lineup':
        career.delegation.autoLineup = false;
        ensureUserSelection(career);
        ui.flash = { kind: 'ok', text: 'You pick the team now. The coach will only fill gaps for injuries and bans.' };
        break;
      case 'reset-lineup':
        resetToCoach(career);
        ui.flash = { kind: 'ok', text: 'The head coach has picked the lineup and tactics.' };
        break;

      // Market
      case 'market-view':
        if (MARKET_VIEWS.includes(d.view as MarketView)) ui.marketView = d.view as MarketView;
        ui.marketPlayerId = null;
        ui.marketLimit = MARKET_PAGE;
        return this.render();
      case 'market-pos':
        ui.marketPos = d.pos === 'all' ? 'all' : POSITIONS.includes(d.pos as Position) ? (d.pos as Position) : 'all';
        ui.marketLimit = MARKET_PAGE;
        return this.render();
      case 'market-more':
        ui.marketLimit += MARKET_PAGE;
        return this.render();
      case 'market-player':
        ui.marketPlayerId = d.id || null;
        this.render();
        return window.scrollTo(0, 0);
      case 'loan-in':
        if (d.id) this.flashResult(loanIn(career, d.id, Number(d.share)));
        break;
      case 'accept-bid':
        if (d.id) this.flashResult(acceptBid(career, d.id));
        break;
      case 'reject-bid':
        if (d.id) rejectBid(career, d.id);
        ui.flash = { kind: 'ok', text: 'Bid turned down.' };
        break;

      // Club
      case 'accept-sponsor':
        this.flashResult(acceptSponsor(career, Number(d.index)));
        break;
      case 'sell-naming':
        this.flashResult(sellNamingRights(career));
        break;
      case 'upgrade-academy':
        this.flashResult(upgradeAcademy(career));
        break;
      case 'hire-staff':
        if (d.id) this.flashResult(hireStaff(career, d.id));
        ui.staffRole = null;
        break;
      case 'fire-staff':
        if (d.id) this.flashResult(fireStaff(career, d.id));
        break;
      case 'staff-role':
        ui.staffRole = STAFF_ROLES.includes(d.role as StaffRole) ? (d.role as StaffRole) : null;
        return this.render();

      // Stadium
      case 'order-project': {
        const [key, when] = (d.id ?? '').split('|');
        if (key) this.flashResult(orderProject(career, key, when === 'summer' ? 'summer' : 'now'));
        break;
      }
      case 'cancel-project':
        if (d.id) this.flashResult(cancelProject(career, d.id));
        break;
      case 'start-project-now':
        if (d.id) this.flashResult(startQueuedNow(career, d.id));
        break;
      case 'stadium-pick':
        if (STADIUM_PICKS.includes(d.part as StadiumPick)) {
          ui.stadiumPick = d.part as StadiumPick;
          this.stadiumFocus = true;
        }
        return this.render();
      case 'stadium-view':
        if (d.view === 'model' || d.view === 'plan') ui.stadiumView = d.view;
        return this.render();
      case 'stadium-look':
        if (d.key) this.flashResult(setStadiumLook(career, { [d.key]: d.value } as Partial<StadiumLook>));
        break;

      // News
      case 'news-view':
        if (d.view === 'paper' || d.view === 'feed') ui.newsView = d.view;
        return this.render();
      case 'news-edition': {
        const n = Number(d.week);
        if (d.week && Number.isInteger(n)) ui.newsEdition = n;
        return this.render();
      }

      // League
      case 'league-tab':
        if (LEAGUE_TABS.includes(d.tab as LeagueTab)) ui.leagueTab = d.tab as LeagueTab;
        ui.openMatchId = null;
        return this.render();
      case 'week': {
        const n = Number(d.week);
        if (d.week && Number.isInteger(n)) ui.resultsWeek = n;
        return this.render();
      }
      case 'open-match':
        if (!d.match) return;
        ui.openMatchId = d.match;
        ui.showAllEvents = false;
        this.render();
        return window.scrollTo(0, 0);
      case 'watch-2d':
        if (!d.id || !replayOf(career, d.id)) return;
        ui.replayId = d.id;
        return this.show('replay');
      case 'close-replay':
        ui.replayId = null;
        return this.show('hub');
      case 'close-match':
        if (ui.tab === 'home') ui.reportOpen = false;
        else ui.openMatchId = null;
        return this.render();
      case 'toggle-events':
        ui.showAllEvents = !ui.showAllEvents;
        return this.render();

      // Match day
      case 'match-day':
        return this.matchDay();
      case 'live-play':
        return this.livePlay();
      case 'live-pause':
        this.livePause();
        break;
      case 'live-speed': {
        const ms = Number(d.ms);
        if (LIVE_SPEEDS.some((s) => s.ms === ms)) ui.live.speed = ms;
        return this.render();
      }
      case 'live-pitch-speed': {
        const x = Number(d.x);
        if (PITCH_SPEEDS.some((s) => s.x === x)) ui.live.pitchSpeed = x;
        return this.render();
      }
      case 'live-full': {
        ui.live.full = !ui.live.full;
        storeLiveFull(ui.live.full);
        // Phones that allow it also drop the browser's bars (iPhone Safari does not; the layout fills the page either way).
        if (ui.live.full && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
        return this.render();
      }
      case 'match-3d': {
        ui.match3d = !ui.match3d;
        storeMatch3d(ui.match3d);
        return this.render();
      }
      case 'match-highlights': {
        ui.highlights = !ui.highlights;
        storeHighlights(ui.highlights);
        return this.render();
      }
      case 'live-pitch': {
        const running = ui.live.running;
        this.livePause();
        ui.live.pitch = !ui.live.pitch;
        storeLivePitch(ui.live.pitch);
        this.save();
        this.render();
        if (running) this.livePlay();
        return;
      }
      case 'live-coach':
        setCoachInCharge(career, !coachInCharge(career));
        ui.flash = { kind: 'ok', text: coachInCharge(career) ? 'The head coach is making the calls.' : 'You are back in charge.' };
        break;
      case 'live-skip':
        this.livePause();
        playToEnd(career);
        this.pitch.jumped();
        ui.live.pause = null;
        ui.live.panel = 'none';
        break;
      case 'live-leave':
        this.livePause();
        ui.tab = 'home';
        this.save();
        return this.show('hub');
      case 'live-panel': {
        const panel = LIVE_PANELS.includes(d.panel as LivePanel) ? (d.panel as LivePanel) : 'none';
        ui.live.panel = panel;
        ui.live.subOut = null;
        if (panel !== 'none') this.livePause();
        return this.render();
      }
      case 'live-sub-out':
        ui.live.subOut = d.id || null;
        return this.render();
      case 'live-sub-pick':
        // "Take him off" on a player's card in the 3D view: straight to choosing who comes on.
        ui.live.panel = 'subs';
        ui.live.subOut = d.id || null;
        this.livePause();
        this.render();
        this.uiLayer.querySelector('.sub-grid')?.scrollIntoView({ block: 'nearest' });
        return;
      case 'live-sub-in':
        if (ui.live.subOut && d.id) {
          this.flashLive(liveSubstitute(career, ui.live.subOut, d.id));
          ui.live.subOut = null;
        }
        break;
      case 'live-toggle-events':
        ui.live.showAll = !ui.live.showAll;
        return this.render();
      case 'live-continue':
        void this.liveContinue();
        return;
      default:
        return;
    }
    this.save();
    this.render();
  }

  private onSubmit(e: Event): void {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    e.preventDefault();
    if (this.weeks.playing) return;
    // The forms stay on screen after a submit, so a double tap would send the same one twice.
    const now = performance.now();
    if (form.dataset.form === this.lastForm.name && now - this.lastForm.at < CONFIRM_GAP_MS) return;
    this.lastForm = { name: form.dataset.form, at: now };
    this.ui.pendingConfirm = null;
    this.ui.flash = null;
    try {
      this.handleForm(form.dataset.form, form);
    } catch (err) {
      this.ui.flash = { kind: 'error', text: `Something went wrong: ${errorText(err)}` };
      this.render();
    }
  }

  private handleForm(name: string, form: HTMLFormElement): void {
    if (name === 'import') return this.importCode(form);
    if (name === 'start-career') return this.startCareer();
    const career = this.career;
    if (!career) return;
    const id = form.dataset.id ?? '';
    switch (name) {
      case 'renew':
        this.flashResult(renewContract(career, id, numberField(form, 'years')));
        break;
      case 'bid': {
        const fee = thousandsField(form, 'fee');
        if (!Number.isFinite(fee) || fee < 0) {
          this.ui.flash = { kind: 'error', text: 'Enter a fee in thousands, such as 750.' };
          break;
        }
        const r = bidForPlayer(career, id, fee, numberField(form, 'years'));
        this.flashResult(r);
        if (r.ok) this.ui.marketPlayerId = null;
        break;
      }
      case 'sign-free': {
        const r = signFreeAgent(career, id, numberField(form, 'years'));
        this.flashResult(r);
        if (r.ok) this.ui.marketPlayerId = null;
        break;
      }
      case 'ticket': {
        const price = numberField(form, 'price');
        if (!Number.isFinite(price)) {
          this.ui.flash = { kind: 'error', text: 'Enter a ticket price, such as 25.' };
          break;
        }
        this.flashResult(setTicketPrice(career, price));
        break;
      }
      case 'inject':
      case 'repay':
      case 'borrow': {
        const amount = thousandsField(form, 'amount');
        if (!Number.isFinite(amount) || amount <= 0) {
          this.ui.flash = { kind: 'error', text: 'Enter an amount in thousands, such as 500.' };
          break;
        }
        const r = name === 'inject' ? injectCash(career, amount) : name === 'repay' ? repayDebt(career, id, amount) : borrow(career, id, amount);
        this.flashResult(r);
        break;
      }
      default:
        return;
    }
    this.save();
    this.render();
  }

  /** Select and checkbox changes on the lineup, tactics and menu. */
  private onChange(e: Event): void {
    const el = e.target;
    if (el instanceof HTMLElement && el.dataset.draft) return this.onDraft(e);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || this.weeks.playing) return;
    const kind = el.dataset.change;
    if (kind === 'tips-on') {
      // A device setting, like the frame rate.
      this.tips.off = !(el as HTMLInputElement).checked;
      storeTips(this.tips);
      return;
    }
    const career = this.career;
    if (!kind || !career) return;
    if (kind === 'show-fps') {
      // A device setting, not part of the career.
      this.ui.showFps = (el as HTMLInputElement).checked;
      storeShowFps(this.ui.showFps);
      this.match3d.showFps(this.ui.showFps);
      return;
    }
    const live = this.ui.screen === 'live';
    const apply = (patch: Partial<Tactics>): void => {
      if (live) this.flashLive(liveTactics(career, patch));
      else setTactics(career, patch);
    };
    switch (kind) {
      case 'auto-lineup':
        career.delegation.autoLineup = (el as HTMLInputElement).checked;
        if (career.delegation.autoLineup) resetToCoach(career);
        else ensureUserSelection(career);
        break;
      case 'counter':
        apply({ counterAttack: (el as HTMLInputElement).checked });
        break;
      case 'taker': {
        const key = el.dataset.key;
        if (!TAKER_KEYS.includes(key as (typeof TAKER_KEYS)[number])) return;
        apply({ setPieceTakers: { [key as string]: el.value || null } as unknown as Tactics['setPieceTakers'] });
        break;
      }
      case 'man-mark':
        apply({ manMarkTarget: el.value || null });
        break;
      default:
        return;
    }
    this.save();
    this.render();
  }

  /** New-career fields: update the draft and the crest preview without a full re-render, so the keyboard stays up. */
  private onDraft(e: Event): void {
    const el = e.target;
    const draft = this.ui.draft;
    if (!draft || !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    const key = el.dataset.draft;
    if (!key) return;
    const b = draft.branding;
    const c = draft.crest;
    const value = el.value;
    switch (key) {
      case 'name':
      case 'shortName':
      case 'city':
        b[key] = value;
        break;
      case 'abbr': {
        const abbr = value.toUpperCase().slice(0, 3);
        if (c.initials === b.abbr) c.initials = abbr;
        b.abbr = abbr;
        break;
      }
      case 'primary':
        b.primary = value;
        c.primary = value;
        break;
      case 'secondary':
        b.secondary = value;
        c.secondary = value;
        break;
      case 'shape':
        c.shape = value as CrestShape;
        break;
      case 'pattern':
        c.pattern = value as CrestPattern;
        break;
      case 'icon':
        c.icon = value as CrestIcon;
        break;
      case 'initials':
        c.initials = value.toUpperCase().slice(0, 3);
        break;
      case 'homegrown':
        draft.homegrown = (el as HTMLInputElement).checked;
        break;
      case 'seed':
        draft.seed = value;
        break;
      default:
        return;
    }
    const preview = this.root.querySelector('#crest-preview');
    if (preview) preview.innerHTML = renderCrestPreview(draft);
  }

  // -------------------------------------------------------------------------
  // New career and save codes
  // -------------------------------------------------------------------------

  private pickClub(teamId: string | undefined): void {
    const draft = this.ui.draft;
    const club = CLUBS.find((c) => c.id === teamId);
    if (!draft || !club) return;
    draft.teamId = club.id;
    draft.step = 'brand';
    draft.branding = {
      name: club.name,
      shortName: club.shortName,
      city: club.city,
      abbr: club.abbr,
      primary: club.colors.primary,
      secondary: club.colors.secondary,
    };
    draft.crest = defaultCrest(club.colors, club.abbr);
    this.show('new');
  }

  private startCareer(): void {
    const draft = this.ui.draft;
    if (!draft || !draft.teamId) return;
    const b = draft.branding;
    const seedText = draft.seed.trim() || randomSeed();
    let career: Career;
    try {
      career = createCareer({
        seed: seedNumber(parseSeed(seedText)),
        teamId: draft.teamId,
        tier: draft.tier,
        homegrownRule: draft.homegrown,
        branding: {
          name: b.name,
          shortName: b.shortName,
          city: b.city,
          abbr: b.abbr,
          colors: { primary: b.primary, secondary: b.secondary },
        },
        crest: { ...draft.crest, initials: draft.crest.initials.trim() || b.abbr },
        matchMode: draft.matchMode,
      });
    } catch (err) {
      this.ui.flash = null;
      this.ui.title.error = `Could not start the career: ${errorText(err)}`;
      return this.show('title');
    }
    this.stopLoops();
    this.career = career;
    this.saveWarned = false;
    this.ui = { ...initialUi(), screen: 'hub', title: this.ui.title };
    this.goHome();
    this.ui.title.error = null;
    this.ui.flash = { kind: 'ok', text: `Welcome to ${userTeam(career).name}. Pre-season starts now: the transfer window is open.` };
    this.save();
    this.refreshSummary();
    this.show('hub');
  }

  private importCode(form: HTMLFormElement): void {
    const code = (form.elements.namedItem('code') as HTMLTextAreaElement | null)?.value ?? '';
    this.ui.title.importText = code;
    let career: Career;
    try {
      career = decodeSave(code);
    } catch (err) {
      this.ui.title.error = err instanceof SaveError ? err.message : `That code did not load: ${errorText(err)}`;
      return this.render();
    }
    this.stopLoops();
    this.career = career;
    this.saveWarned = false;
    this.ui = { ...initialUi(), title: this.ui.title };
    this.goHome();
    this.ui.title.error = null;
    this.ui.title.importText = '';
    this.ui.flash = { kind: 'ok', text: 'Save code loaded.' };
    this.save();
    this.refreshSummary();
    if (!this.followPhase()) this.show('hub');
  }

  private copyCode(): void {
    const code = this.ui.saveCode;
    const done = (): void => {
      this.ui.flash = { kind: 'ok', text: 'Copied.' };
      this.flashOnly();
    };
    const fallback = (): void => {
      const area = this.root.querySelector<HTMLTextAreaElement>('#save-code');
      if (!area) return;
      area.focus();
      area.select();
      area.setSelectionRange(0, code.length);
      try {
        if (document.execCommand('copy')) return done();
      } catch {
        // Fall through: the text is selected, so the owner can copy it by hand.
      }
      this.ui.flash = { kind: 'error', text: 'Copy was blocked. The code is selected: use your phone’s Copy.' };
      this.flashOnly();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done, fallback);
    else fallback();
  }

  /** Shows the flash on the save-code screen without re-rendering (which would drop the text selection). */
  private flashOnly(): void {
    const flash = this.ui.flash;
    let el = this.root.querySelector<HTMLElement>('.code-flash');
    if (!el) {
      el = document.createElement('p');
      el.className = 'code-flash small';
      this.root.querySelector('#save-code')?.after(el);
    }
    el.textContent = flash?.text ?? '';
    el.classList.toggle('warn', flash?.kind === 'error');
  }

  private downloadCode(): void {
    const career = this.career;
    const name = career ? userTeam(career).shortName.replace(/[^A-Za-z0-9]+/g, '-') : 'career';
    const season = career ? career.season.league.season : 0;
    const blob = new Blob([this.ui.saveCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `season-ticket-${name}-s${season}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // -------------------------------------------------------------------------
  // Hub actions
  // -------------------------------------------------------------------------

  private showTab(tab: string | undefined): void {
    if (!HUB_TABS.some((t) => t.id === tab)) return;
    const ui = this.ui;
    ui.tab = tab as HubTab;
    ui.inOffice = false;
    ui.squadPlayerId = null;
    ui.marketPlayerId = null;
    ui.openMatchId = null;
    ui.reportOpen = false;
    ui.lineupSlot = null;
    ui.staffRole = null;
    ui.newsEdition = null;
    ui.menuOpen = false;
    this.render();
    window.scrollTo(0, 0);
  }

  private openMail(id: string | undefined): void {
    const career = this.career;
    if (!career) return;
    const ui = this.ui;
    ui.inboxOpen = id || null;
    ui.inOffice = false;
    const msg = id ? career.inbox.find((m) => m.id === id) : undefined;
    if (msg) msg.read = true;
    if (ui.tab !== 'inbox' && id) {
      ui.tab = 'inbox';
      this.save();
      this.render();
      return window.scrollTo(0, 0);
    }
    this.save();
    this.render();
  }

  /**
   * Plays one week in the background workers, with "Playing the week..." over the screen.
   * Returns the results, or null if the sim failed.
   */
  private async playWeek(toEnd = false): Promise<MatchResult[] | null> {
    const career = this.career;
    if (!career || this.weeks.playing) return null;
    const run = { done: 0, total: 0, toEnd, label: careerWeekLabel(career) };
    this.ui.weekRun = run;
    // Week after week the card stays put (so "Stop" can be tapped) and only its text changes.
    if (this.uiLayer.querySelector('.week-run')) this.showWeekProgress(run);
    else this.render();
    try {
      return await this.weeks.playWeek(career, (done, total) => {
        run.done = done;
        run.total = total;
        this.showWeekProgress(run);
      });
    } catch (err) {
      this.ui.flash = { kind: 'error', text: `The sim stopped: ${errorText(err)}` };
      return null;
    } finally {
      if (this.ui.weekRun === run) this.ui.weekRun = null;
    }
  }

  /** Moves the bar without drawing the whole screen again. */
  private showWeekProgress(run: WeekRun): void {
    const el = this.uiLayer.querySelector<HTMLElement>('.week-run');
    if (!el) return;
    const bar = el.querySelector<HTMLElement>('.week-run-bar > span');
    if (bar) bar.style.width = `${run.total ? Math.round((100 * run.done) / run.total) : 0}%`;
    const count = el.querySelector<HTMLElement>('.week-run-count');
    if (count) count.textContent = weekRunCount(run);
    const label = el.querySelector<HTMLElement>('.week-run-label');
    if (label) label.textContent = run.label;
  }

  private async nextWeek(): Promise<void> {
    const career = this.career;
    if (!career || this.ui.simming || this.weeks.playing) return;
    this.ui.live = { ...this.ui.live, running: false, panel: 'none', subOut: null, pause: null };
    const results = await this.playWeek();
    if (this.career !== career) return;
    // The week failed and the career is back where it was: nothing new to save.
    if (!results) return this.render();
    this.ui.newsEdition = null;
    const line = userResultText(career, results);
    if (line) this.ui.flash = { kind: 'ok', text: line };
    this.ui.resultsWeek = null;
    this.save();
    if (!this.followPhase()) this.render();
  }

  /** Week after week to the end of the season; "Stop" ends it after the week being played. */
  private async simToEnd(): Promise<void> {
    const career = this.career;
    if (!career || this.ui.simming || this.weeks.playing || career.phase !== 'season') return;
    const token = ++this.runToken;
    this.ui.simming = true;
    while (token === this.runToken && this.career === career) {
      const results = await this.playWeek(true);
      if (this.career !== career) return;
      if (!results) break;
      this.save();
      if (phaseOf(career) !== 'season') break;
    }
    if (this.career !== career) return;
    this.ui.simming = false;
    this.ui.newsEdition = null;
    if (!this.followPhase()) this.render();
  }

  // -------------------------------------------------------------------------
  // Match day
  // -------------------------------------------------------------------------

  private matchDay(): void {
    const career = this.career;
    if (!career) return;
    const fresh = !career.liveMatch;
    const state = startUserMatch(career);
    if (!state) {
      this.ui.flash = { kind: 'error', text: 'No match for you this week.' };
      return this.render();
    }
    if (fresh || this.ui.screen !== 'live') {
      this.ui.live = { ...this.ui.live, running: false, panel: 'none', subOut: null, pause: null, showAll: false };
    }
    this.save();
    this.show('live');
  }

  private flashLive(r: Result): void {
    this.ui.flash = r.ok ? null : { kind: 'error', text: r.message };
    if (!r.ok) this.ui.live.pause = r.message;
  }

  private livePlay(): void {
    const career = this.career;
    const state = career?.liveMatch;
    if (!career || !state || state.finished || this.ui.live.running) return;
    const token = ++this.runToken;
    const live = this.ui.live;
    live.running = true;
    live.pause = null;
    live.panel = 'none';
    live.subOut = null;
    this.render();
    this.resumeBreak(career);
    if (live.pitch) return this.livePitchLoop(career, token);
    const tick = (): void => {
      this.liveTimer = null;
      if (token !== this.runToken || this.career !== career || this.ui.screen !== 'live') return;
      this.resumeBreak(career);
      let pause: string | null = null;
      let brk = false;
      try {
        const step = stepLive(career);
        pause = step.pause;
        brk = isBreak(step.events);
      } catch (err) {
        live.running = false;
        this.ui.flash = { kind: 'error', text: `The match stopped: ${errorText(err)}` };
        this.save();
        return this.render();
      }
      const engine = liveOf(career);
      if (brk && engine) this.breakAt = engine.m.clockMs;
      // A minute at a time: the minute's sounds all fall due at once, and the biggest play.
      if (engine) this.atmosphere.show(engine.m, engine.m.clockMs, true, 60, performance.now());
      const finished = !career.liveMatch || career.liveMatch.finished;
      if (pause || finished) {
        live.running = false;
        live.pause = finished ? null : pause;
        this.save();
        return this.render();
      }
      this.render();
      // With the head coach in charge, a break waits a moment before play goes on.
      this.liveTimer = window.setTimeout(tick, brk ? Math.max(live.speed, BREAK_MS) : live.speed);
    };
    this.liveTimer = window.setTimeout(tick, live.speed);
  }

  /**
   * Play on the 2D pitch: each screen frame plays as many engine steps as the speed asks
   * (a long gap, like a locked phone, never jumps the match on), and redraws. The rest of
   * the screen is rebuilt once a minute, when the minute's events come in.
   */
  private livePitchLoop(career: Career, token: number): void {
    const live = this.ui.live;
    let last = 0;
    // A break with the head coach in charge: play waits until then (real time).
    let breakUntil = 0;
    const frame = (now: number): void => {
      this.liveRaf = 0;
      if (token !== this.runToken || this.career !== career || this.ui.screen !== 'live') return;
      const engine = liveOf(career);
      if (!engine) return;
      const dt = last ? Math.min((now - last) / 1000, PITCH_MAX_FRAME_S) : 0;
      last = now;
      if (breakUntil) {
        if (now < breakUntil) {
          this.pitch.show(this.pitch.at, now, live.pitchSpeed, false);
          this.liveRaf = requestAnimationFrame(frame);
          return;
        }
        breakUntil = 0;
        this.resumeBreak(career);
      }
      // A goal replay in 3D holds the match where it is.
      const target = this.pitch.at + (this.match3d.holding ? 0 : dt * 1000 * live.pitchSpeed);
      let minute = false;
      let pause: string | null = null;
      let brk = false;
      try {
        while (engine.m.clockMs < target && !engine.state.finished) {
          this.pitch.beforeStep();
          const step = stepLiveView(career);
          if (step) {
            minute = true;
            pause = step.pause;
            brk = isBreak(step.events);
            break;
          }
        }
      } catch (err) {
        live.running = false;
        this.ui.flash = { kind: 'error', text: `The match stopped: ${errorText(err)}` };
        this.save();
        return this.render();
      }
      this.pitch.show(target, now, live.pitchSpeed);
      if (brk) {
        this.breakAt = engine.m.clockMs;
        this.pitch.breakCard(pause ? 'owner' : 'coach');
        if (!pause) breakUntil = now + BREAK_MS;
      }
      const finished = !career.liveMatch || career.liveMatch.finished;
      if (pause || finished) {
        live.running = false;
        live.pause = finished ? null : pause;
        this.save();
        this.render();
        // Let the 3D view, the sound and the ticker catch up to the moment play stopped.
        this.pitch.settle();
        return;
      }
      if (minute) this.render();
      this.liveRaf = requestAnimationFrame(frame);
    };
    this.liveRaf = requestAnimationFrame(frame);
  }

  private livePause(): void {
    if (!this.ui.live.running) return;
    this.stopLoops();
    if (this.ui.live.pitch) this.pitch.settle();
  }

  /** Play is back on after a break: the referee's whistle (the engine kicked off at the break). */
  private resumeBreak(career: Career): void {
    const engine = liveOf(career);
    if (this.breakAt === null || !engine) return;
    if (engine.m.clockMs === this.breakAt) this.atmosphere.kickOff(engine.m);
    this.breakAt = null;
  }

  private async liveContinue(): Promise<void> {
    const career = this.career;
    if (!career) return;
    this.stopLoops();
    this.ui.live = { ...this.ui.live, panel: 'none', subOut: null, pause: null };
    if (career.liveMatch?.finished) {
      const results = await this.playWeek();
      if (this.career !== career) return;
      if (results) {
        const line = userResultText(career, results);
        if (line) this.ui.flash = { kind: 'ok', text: `Full time: ${line}` };
      }
    }
    this.goHome();
    this.ui.resultsWeek = null;
    this.save();
    if (!this.followPhase()) this.show('hub');
  }

  private setDial(key: string | undefined, value: number): void {
    const career = this.career;
    if (!career || !DIAL_KEYS.includes(key as (typeof DIAL_KEYS)[number]) || !Number.isInteger(value) || value < 1 || value > 5) return;
    const patch = { [key as string]: value } as Partial<Tactics>;
    if (this.ui.screen === 'live') this.flashLive(liveTactics(career, patch));
    else setTactics(career, patch);
    this.save();
    this.render();
  }
}

/**
 * The career controller. It owns the view state, turns taps into calls to the
 * career API (src/sim/career) and the live match (src/game/matchday), saves
 * after every change, and re-renders from pure view functions. No game rules
 * live here: the sim decides everything.
 */
import {
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
} from '../../sim/career';
import { CLUBS } from '../../sim/data';
import { seedNumber } from '../../sim/league';
import type { MatchResult, Position, StaffRole, Tactics } from '../../sim/types';
import { STAFF_ROLES } from '../../sim/types';
import { coachInCharge, liveSubstitute, liveTactics, playToEnd, setCoachInCharge, stepLive, stepLiveView } from '../../game/matchday';
import { LiveHost } from './liveHost';
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
import { renderGameOver, renderSaveCode } from '../views/career/saves';
import { isQualitySetting, storeQuality, type QualityTier } from '../../render/quality';
import type { HotspotId, OfficePick } from '../../render/office/types';
import { OfficeHost } from './officeHost';
import { StadiumHost } from './stadiumHost';
import { ReplayHost } from './replayHost';
import type { StadiumPart } from '../../render/stadium/types';
import { HUB_TABS, LIVE_SPEEDS, MARKET_PAGE, PITCH_SPEEDS, STADIUM_PICKS, initialUi, storeLivePitch, type HubTab, type LeagueTab, type LivePanel, type MarketView, type NewCareerDraft, type StadiumPick, type UiState, type WeekRun } from './state';

type Result = { ok: boolean; message: string };

const MARKET_VIEWS: readonly MarketView[] = ['scout', 'free', 'bids'];
const LEAGUE_TABS: readonly LeagueTab[] = ['table', 'results', 'playoffs'];
const LIVE_PANELS: readonly LivePanel[] = ['none', 'subs', 'tactics'];
/** A long gap between screen frames (tab hidden, phone locked) never plays the match on. */
const PITCH_MAX_FRAME_S = 0.1;
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
  tv: 'league',
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
  private readonly pitch = new LiveHost();
  /** Set after one failed save so the warning shows once. */
  private saveWarned = false;
  /** The 3D office sits behind the menus; the menus render into uiLayer. */
  private readonly uiLayer: HTMLElement;
  private readonly officeLayer: HTMLElement;
  private readonly office: OfficeHost;
  private readonly stadium: StadiumHost;
  private readonly replay = new ReplayHost();
  /** Set when a pick should also turn the 3D stadium's camera to face it. */
  private stadiumFocus = false;
  private runner: MatchRunner | null = null;
  /** Plays the weeks' matches in the background workers (17.8). */
  private readonly weeks = new WeekPlayer(() => (this.runner ??= createMatchRunner(2)));
  private warmTimer: number | null = null;

  constructor(private readonly root: HTMLElement) {
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
      if (document.visibilityState === 'hidden') this.save();
    });
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
    this.uiLayer.innerHTML = this.view() + (this.ui.weekRun ? renderWeekRun(this.ui.weekRun) : '');
    this.measureTopBar();
    this.syncOffice();
    this.syncStadium();
    this.syncReplay();
    this.syncPitch();
    this.scheduleWarm();
  }

  /** Moves the live match's 2D pitch into the live screen (if it is showing). */
  private syncPitch(): void {
    const { ui, career } = this;
    let m = null;
    if (career?.liveMatch && ui.screen === 'live' && ui.live.pitch) {
      try {
        m = liveOf(career)?.m ?? null;
      } catch {
        m = null;
      }
    }
    this.pitch.sync(this.uiLayer, m);
  }

  /** Moves the 2D replay into its screen (if it is showing), or stops it. */
  private syncReplay(): void {
    const { ui, career } = this;
    const replay = career && ui.screen === 'replay' && ui.replayId ? replayOf(career, ui.replayId) : null;
    this.replay.sync(this.uiLayer, replay);
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
    this.ui.flash = null;
    if (p.kind === 'mail') return this.openMail(p.id);
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
      default:
        break;
    }
    if (!career) return renderCareerTitle(ui);
    if (ui.screen === 'live') return renderLive(career, ui);
    if (ui.screen === 'replay') return renderReplayScreen(career, ui);
    if (ui.screen === 'review') return renderReview(career);
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
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onClick(e: Event): void {
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-action]') : null;
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const action = target.dataset.action ?? '';
    const d = target.dataset;
    // While a week plays only "Stop" counts (it stops after this week).
    if (this.weeks.playing && action !== 'stop-sim') return;
    if (d.confirm === '1') {
      const key = `${action}:${d.id ?? ''}`;
      if (this.ui.pendingConfirm !== key) {
        this.ui.pendingConfirm = key;
        this.render();
        return;
      }
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
        ui.stadium3dFailed = false;
        // Turning 3D on (or changing tier) shows the office straight away.
        ui.inOffice = d.quality !== 'off';
        return this.render();
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
      case 'ticket':
        this.flashResult(setTicketPrice(career, numberField(form, 'price')));
        break;
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
    const career = this.career;
    if (!kind || !career) return;
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
    if (results) {
      const line = userResultText(career, results);
      if (line) this.ui.flash = { kind: 'ok', text: line };
    }
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
      this.save();
      if (!results || phaseOf(career) !== 'season') break;
    }
    if (this.career !== career) return;
    this.ui.simming = false;
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
    if (live.pitch) return this.livePitchLoop(career, token);
    const tick = (): void => {
      this.liveTimer = null;
      if (token !== this.runToken || this.career !== career || this.ui.screen !== 'live') return;
      let pause: string | null = null;
      try {
        pause = stepLive(career).pause;
      } catch (err) {
        live.running = false;
        this.ui.flash = { kind: 'error', text: `The match stopped: ${errorText(err)}` };
        this.save();
        return this.render();
      }
      const finished = !career.liveMatch || career.liveMatch.finished;
      if (pause || finished) {
        live.running = false;
        live.pause = finished ? null : pause;
        this.save();
        return this.render();
      }
      this.render();
      this.liveTimer = window.setTimeout(tick, live.speed);
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
    const frame = (now: number): void => {
      this.liveRaf = 0;
      if (token !== this.runToken || this.career !== career || this.ui.screen !== 'live') return;
      const engine = liveOf(career);
      if (!engine) return;
      const dt = last ? Math.min((now - last) / 1000, PITCH_MAX_FRAME_S) : 0;
      last = now;
      const target = this.pitch.at + dt * 1000 * live.pitchSpeed;
      let minute = false;
      let pause: string | null = null;
      try {
        while (engine.m.clockMs < target && !engine.state.finished) {
          this.pitch.beforeStep();
          const step = stepLiveView(career);
          if (step) {
            minute = true;
            pause = step.pause;
            break;
          }
        }
      } catch (err) {
        live.running = false;
        this.ui.flash = { kind: 'error', text: `The match stopped: ${errorText(err)}` };
        this.save();
        return this.render();
      }
      this.pitch.show(target, now);
      const finished = !career.liveMatch || career.liveMatch.finished;
      if (pause || finished) {
        live.running = false;
        live.pause = finished ? null : pause;
        this.save();
        return this.render();
      }
      if (minute) this.render();
      this.liveRaf = requestAnimationFrame(frame);
    };
    this.liveRaf = requestAnimationFrame(frame);
  }

  private livePause(): void {
    if (!this.ui.live.running) return;
    this.stopLoops();
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

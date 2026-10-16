/**
 * The Stage 1 season page controller. It owns the view state, turns taps into
 * calls to the exported sim functions, and re-renders from pure view
 * functions. No game rules live here: the sim decides everything.
 */
import { createLeague } from '../sim/league';
import { advanceWeek, createSeason, type SeasonState } from '../sim/season';
import { type SeasonView, type Tab, type UiState, TABS } from './model';
import { renderSeason } from './views/season';
import { renderTitle } from './views/title';

/** Default seeds are four digits: easy to read out and type on a phone. */
const SEED_MIN = 1000;
const SEED_SPAN = 9000;
/** Nudges consecutive lucky rolls apart even within the same millisecond. */
const SEED_STEP = 7919;

let seedRolls = 0;

/** A fresh four-digit seed. The UI may read the clock; the sim never does. */
export function randomSeed(): string {
  seedRolls += 1;
  return String(SEED_MIN + ((Date.now() + seedRolls * SEED_STEP) % SEED_SPAN));
}

/** Digits become a numeric seed; any other text is hashed by the sim. */
export function parseSeed(text: string): number | string {
  const trimmed = text.trim();
  if (/^\d{1,15}$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read through a call so TypeScript does not keep a phase narrowed across advanceWeek. */
function isComplete(season: SeasonState): boolean {
  return season.phase === 'complete';
}

function isTab(value: string | undefined): value is Tab {
  return TABS.some((t) => t.id === value);
}

export class App {
  private state: UiState;
  /** Bumped whenever a new season starts, so a running "Sim to end" loop knows to stop. */
  private runToken = 0;
  /** Where the list was scrolled before a match feed opened, restored on Back. */
  private scrollBeforeFeed = 0;

  constructor(private readonly root: HTMLElement) {
    this.state = { screen: 'title', title: { seed: randomSeed(), error: null } };
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('submit', (e) => this.onSubmit(e));
    this.render();
  }

  private render(): void {
    this.root.innerHTML = this.state.screen === 'title' ? renderTitle(this.state.title) : renderSeason(this.state.view);
  }

  private get view(): SeasonView | null {
    return this.state.screen === 'season' ? this.state.view : null;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onSubmit(e: Event): void {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'start') return;
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input[name="seed"]');
    const text = input?.value.trim() ?? '';
    this.startSeason(text === '' ? randomSeed() : text);
  }

  private onClick(e: Event): void {
    const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-action]') : null;
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const { action } = target.dataset;
    switch (action) {
      case 'lucky':
        return this.startSeason(randomSeed());
      case 'sim-week':
        return this.simWeek();
      case 'sim-end':
        return this.simToEnd();
      case 'new-season':
        return this.newSeason();
      case 'tab':
        return this.showTab(target.dataset.tab);
      case 'week':
        return this.showWeek(target.dataset.week);
      case 'open-match':
        return this.openMatch(target.dataset.match);
      case 'close-match':
        return this.closeMatch();
      case 'toggle-events':
        return this.toggleEvents();
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  private startSeason(seedText: string): void {
    this.runToken += 1;
    let season: SeasonState;
    try {
      season = createSeason(createLeague(parseSeed(seedText)));
    } catch (err) {
      this.state = { screen: 'title', title: { seed: seedText, error: `Could not start the season: ${errorText(err)}` } };
      this.render();
      return;
    }
    this.state = {
      screen: 'season',
      view: { season, seed: seedText, tab: 'table', resultsWeek: null, openMatchId: null, showAllEvents: false, running: false, error: null },
    };
    this.render();
    window.scrollTo(0, 0);
  }

  private newSeason(): void {
    const view = this.view;
    if (view?.running) return;
    this.runToken += 1;
    this.state = { screen: 'title', title: { seed: randomSeed(), error: null } };
    this.render();
    window.scrollTo(0, 0);
  }

  /** Plays one calendar week. Returns false when the season is over or the sim failed. */
  private playWeek(view: SeasonView): boolean {
    if (isComplete(view.season)) return false;
    try {
      advanceWeek(view.season);
    } catch (err) {
      view.error = `The sim stopped in week ${view.season.week}: ${errorText(err)}`;
      return false;
    }
    view.error = null;
    view.resultsWeek = null;
    const over = isComplete(view.season);
    if (over) view.tab = 'playoffs';
    return !over;
  }

  private simWeek(): void {
    const view = this.view;
    if (!view || view.running) return;
    this.playWeek(view);
    this.render();
  }

  /** One week per macrotask so the page repaints and the progress bar moves. */
  private simToEnd(): void {
    const view = this.view;
    if (!view || view.running || isComplete(view.season)) return;
    const token = this.runToken;
    view.running = true;
    this.render();
    const step = (): void => {
      if (token !== this.runToken || this.view !== view) return;
      const more = this.playWeek(view);
      if (!more) view.running = false;
      this.render();
      if (more) window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  }

  private showTab(tab: string | undefined): void {
    const view = this.view;
    if (!view || !isTab(tab)) return;
    view.tab = tab;
    view.openMatchId = null;
    this.render();
  }

  private showWeek(week: string | undefined): void {
    const view = this.view;
    const n = Number(week);
    if (!view || !week || !Number.isInteger(n)) return;
    view.resultsWeek = n;
    this.render();
  }

  private openMatch(matchId: string | undefined): void {
    const view = this.view;
    if (!view || !matchId) return;
    this.scrollBeforeFeed = window.scrollY;
    view.openMatchId = matchId;
    view.showAllEvents = false;
    this.render();
    window.scrollTo(0, 0);
  }

  private closeMatch(): void {
    const view = this.view;
    if (!view) return;
    view.openMatchId = null;
    this.render();
    window.scrollTo(0, this.scrollBeforeFeed);
  }

  private toggleEvents(): void {
    const view = this.view;
    if (!view) return;
    view.showAllEvents = !view.showAllEvents;
    this.render();
  }
}

/**
 * View state for the career screens. None of this is saved: the career
 * itself (src/sim/career) is the save, and this only remembers which screen,
 * tab and panel the owner is looking at.
 */
import type { Crest, MatchMode, TierId } from '../../sim/career';
import type { Position, StaffRole } from '../../sim/types';

export type Screen = 'title' | 'new' | 'hub' | 'live' | 'review' | 'gameOver' | 'saveCode';

export type HubTab = 'home' | 'squad' | 'lineup' | 'market' | 'money' | 'club' | 'inbox' | 'league';

export const HUB_TABS: readonly { id: HubTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'squad', label: 'Squad' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'market', label: 'Market' },
  { id: 'money', label: 'Money' },
  { id: 'club', label: 'Club' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'league', label: 'League' },
];

export type MarketView = 'scout' | 'free' | 'bids';
export type LeagueTab = 'table' | 'results' | 'playoffs';
export type LivePanel = 'none' | 'subs' | 'tactics';

export interface BrandDraft {
  name: string;
  shortName: string;
  city: string;
  abbr: string;
  primary: string;
  secondary: string;
}

export interface NewCareerDraft {
  step: 'club' | 'brand';
  tier: TierId;
  teamId: string | null;
  branding: BrandDraft;
  crest: Crest;
  homegrown: boolean;
  matchMode: MatchMode;
  seed: string;
}

export interface Flash {
  kind: 'ok' | 'error';
  text: string;
}

/** A summary of the stored career for the title screen. */
export interface SavedSummary {
  club: string;
  season: number;
  crest: Crest;
}

export interface LiveView {
  running: boolean;
  /** Milliseconds per match minute. */
  speed: number;
  panel: LivePanel;
  /** Player picked to come off in the subs panel. */
  subOut: string | null;
  pause: string | null;
  showAll: boolean;
}

export const LIVE_SPEEDS: readonly { ms: number; label: string }[] = [
  { ms: 700, label: '1x' },
  { ms: 350, label: '2x' },
  { ms: 120, label: '5x' },
];

export interface UiState {
  screen: Screen;
  /** Where Back on the save-code screen goes. */
  returnTo: Screen;
  title: { saved: SavedSummary | null; error: string | null; importText: string };
  draft: NewCareerDraft | null;
  tab: HubTab;
  squadPlayerId: string | null;
  lineupSlot: number | null;
  marketView: MarketView;
  marketPos: Position | 'all';
  marketLimit: number;
  marketPlayerId: string | null;
  leagueTab: LeagueTab;
  resultsWeek: number | null;
  openMatchId: string | null;
  showAllEvents: boolean;
  staffRole: StaffRole | null;
  inboxOpen: string | null;
  reportOpen: boolean;
  flash: Flash | null;
  menuOpen: boolean;
  /** An action waiting for a second tap, such as "release:p123". */
  pendingConfirm: string | null;
  /** True while "Sim to season end" steps through weeks. */
  simming: boolean;
  live: LiveView;
  saveCode: string;
}

export const MARKET_PAGE = 40;

export function initialUi(): UiState {
  return {
    screen: 'title',
    returnTo: 'hub',
    title: { saved: null, error: null, importText: '' },
    draft: null,
    tab: 'home',
    squadPlayerId: null,
    lineupSlot: null,
    marketView: 'scout',
    marketPos: 'all',
    marketLimit: MARKET_PAGE,
    marketPlayerId: null,
    leagueTab: 'table',
    resultsWeek: null,
    openMatchId: null,
    showAllEvents: false,
    staffRole: null,
    inboxOpen: null,
    reportOpen: false,
    flash: null,
    menuOpen: false,
    pendingConfirm: null,
    simming: false,
    live: { running: false, speed: 350, panel: 'none', subOut: null, pause: null, showAll: false },
    saveCode: '',
  };
}

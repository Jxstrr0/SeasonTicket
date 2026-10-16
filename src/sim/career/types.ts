/**
 * The owner/GM career: one save file's worth of state. Everything here is
 * plain JSON so it can be saved, exported and diffed. The league and the
 * season inside it are the same objects the headless Stage 1 sim uses.
 */
import type { SeasonState } from '../season';
import type { MatchState } from '../match/state';
import type { MatchResult, TeamSelection } from '../types';

export type TierId = 'easy' | 'normal' | 'hard' | 'veryHard';
export type CareerPhase = 'preseason' | 'season' | 'review' | 'gameOver';
export type MatchMode = 'full' | 'bigCalls' | 'coach';

export const INCOME_KEYS = ['tickets', 'concessions', 'merchandise', 'sponsors', 'namingRights', 'tv', 'merit', 'playoffs', 'playerSales', 'loanFees', 'luxuryShare', 'hospitality'] as const;
export const SPENDING_KEYS = ['playerWages', 'staffWages', 'operations', 'matchday', 'transfers', 'loanFees', 'luxuryTax', 'interest', 'academy', 'severance', 'upgrades'] as const;
export const FINANCING_KEYS = ['ownerInjection', 'borrowed', 'repaid'] as const;

export type IncomeKey = (typeof INCOME_KEYS)[number];
export type SpendingKey = (typeof SPENDING_KEYS)[number];
export type FinancingKey = (typeof FINANCING_KEYS)[number];

/** One season's money, by line. Financing moves cash but is not profit. */
export interface Ledger {
  income: Record<IncomeKey, number>;
  spending: Record<SpendingKey, number>;
  financing: Record<FinancingKey, number>;
}

export interface Debt {
  id: string;
  lenderId: string;
  /** Principal still owed. */
  balance: number;
  /** Yearly rate. */
  rate: number;
  weeklyPayment: number;
  weeksLeft: number;
  /** Cash the club must keep while this loan is open; 0 for none. */
  minCash: number;
}

export interface SponsorDeal {
  brand: string;
  perSeason: number;
  yearsLeft: number;
}

export interface NamingRightsDeal {
  brand: string;
  yearsLeft: number;
  originalName: string;
}

export interface ClubBooks {
  teamId: string;
  cash: number;
  debts: Debt[];
  ledger: Ledger;
  lastLedger: Ledger | null;
  /** Sum of the yearly payroll rate taken once per week, for the wage-cap average. */
  payrollAccum: number;
  payrollWeeks: number;
  /** Consecutive seasons over the wage cap (repeat offenders pay more). */
  overCapSeasons: number;
  /** Youth academy level, 1 to 5. */
  academyLevel: number;
  ticketPrice: number;
  sponsor: SponsorDeal | null;
  namingRights: NamingRightsDeal | null;
  /** Fan mood drifts back toward this. */
  baseFanMood: number;
}

export type CrestShape = 'shield' | 'round' | 'diamond' | 'banner';
export type CrestPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'chevron';
export type CrestIcon = 'none' | 'star' | 'crown' | 'ball' | 'wave' | 'peak' | 'tower' | 'bird';

export interface Crest {
  shape: CrestShape;
  pattern: CrestPattern;
  primary: string;
  secondary: string;
  initials: string;
  icon: CrestIcon;
}

export interface LoanIn {
  playerId: string;
  fromTeamId: string;
  /** Share of the wage the user's club pays. */
  wageShare: number;
}

export interface IncomingBid {
  id: string;
  playerId: string;
  fromTeamId: string;
  fee: number;
  /** Global week index after which the bid lapses. */
  expiresWeek: number;
}

export interface SponsorOffer {
  brand: string;
  perSeason: number;
  years: number;
}

/**
 * The lender ladder. 0 fine, 1 warning letter, 2 lender CFO, 3 spending
 * lock, 4 forced sales, 5 receivership (game over).
 */
export interface LadderState {
  level: number;
  /** Global week index by which the club must be back in good standing. */
  deadlineWeek: number | null;
  goodWeeks: number;
  lastForcedSaleWeek: number | null;
}

export interface Delegation {
  matchMode: MatchMode;
  /** When true the head coach picks the eleven every match. */
  autoLineup: boolean;
}

export interface PlayerSeasonLine {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;
  yellows: number;
  reds: number;
}

export type InboxKind = 'info' | 'finance' | 'transfer' | 'bid' | 'staff' | 'youth' | 'ladder' | 'match' | 'season' | 'stadium';

export interface InboxMessage {
  id: string;
  weekIndex: number;
  season: number;
  kind: InboxKind;
  title: string;
  body: string;
  read: boolean;
}

export interface SeasonHistoryEntry {
  season: number;
  /** League position, 1-based. */
  position: number;
  points: number;
  championName: string | null;
  shieldName: string | null;
  /** How far the user's club got in the playoffs. */
  playoff: 'none' | 'quarterFinal' | 'semiFinal' | 'runnerUp' | 'champion' | 'bye';
  profit: number;
  cashAtEnd: number;
  topScorer: { name: string; goals: number } | null;
}

export type StandId = 'north' | 'east' | 'south' | 'west';
export type CornerId = 'ne' | 'se' | 'sw' | 'nw';
export type UpgradeId = 'floodlights' | 'videoBoard' | 'signage' | 'concourse' | 'shop' | 'pitch';
export type SeatScheme = 'primary' | 'secondary' | 'mixed' | 'initials';
export type MowPattern = 'stripes' | 'wide' | 'checks' | 'diagonal' | 'rings';
export type RoofColour = 'white' | 'primary' | 'secondary' | 'grey';

export const STAND_IDS: readonly StandId[] = ['west', 'north', 'east', 'south'];
export const CORNER_IDS: readonly CornerId[] = ['nw', 'ne', 'se', 'sw'];
export const UPGRADE_IDS: readonly UpgradeId[] = ['floodlights', 'videoBoard', 'signage', 'concourse', 'shop', 'pitch'];

export interface Stand {
  /** 0 grass bank, 1 small stand, 2 single tier, 3 two tiers, 4 three tiers. */
  level: number;
  /** 0 none, 1 part roof, 2 full roof. */
  roof: number;
  /** Rows of executive boxes, 0 to 2. */
  boxRows: number;
}

/** Free branding choices, applied instantly. */
export interface StadiumLook {
  seats: SeatScheme;
  mow: MowPattern;
  roof: RoofColour;
}

export type ProjectKind = 'stand' | 'roof' | 'boxes' | 'corner' | 'upgrade' | 'refurbish';

export interface StadiumProject {
  id: string;
  kind: ProjectKind;
  /** A stand, corner or upgrade id ('ground' for a refurbishment). */
  target: string;
  /** The level the work brings it to. */
  toLevel: number;
  weeks: number;
  weeksLeft: number;
  cost: number;
  /** Paid for, waiting for the summer to start. */
  queued: boolean;
}

export interface Stadium {
  stands: Record<StandId, Stand>;
  corners: Record<CornerId, number>;
  upgrades: Record<UpgradeId, number>;
  look: StadiumLook;
  projects: StadiumProject[];
  /** How many people want to come, in seats. */
  demand: number;
  /** Demand when the career began; growth is bounded relative to it. */
  startDemand: number;
}

export interface Owner {
  /** Personal money left to put into the club. */
  fortune: number;
  /** Total put in so far. */
  injected: number;
}

export interface Career {
  version: number;
  seed: number;
  userTeamId: string;
  tier: TierId;
  homegrownRule: boolean;
  crest: Crest;
  owner: Owner;
  phase: CareerPhase;
  /** 1-based pre-season week while phase is 'preseason'. */
  preseasonWeek: number;
  /** Weeks played since the career began; seeds every career random stream. */
  weekIndex: number;
  season: SeasonState;
  books: Record<string, ClubBooks>;
  /** Every club's ground, by team id. */
  stadiums: Record<string, Stadium>;
  ladder: LadderState;
  loansIn: LoanIn[];
  incomingBids: IncomingBid[];
  /** Asking price a club has countered with, by player id, valid until the window shuts. */
  counters: Record<string, number>;
  sponsorOffers: SponsorOffer[];
  /** Staff ids (teamId null) the user can hire. */
  staffPool: string[];
  userSelection: TeamSelection | null;
  delegation: Delegation;
  /** The user's match in progress, stepped by the match screen. */
  liveMatch: MatchState | null;
  lastUserMatch: MatchResult | null;
  playerSeason: Record<string, PlayerSeasonLine>;
  inbox: InboxMessage[];
  history: SeasonHistoryEntry[];
  /** Counter for career-side ids (bids, debts, messages). */
  counter: number;
  gameOverReason: string | null;
}

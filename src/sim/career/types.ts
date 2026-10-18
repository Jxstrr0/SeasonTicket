/**
 * The owner/GM career: one save file's worth of state. Everything here is
 * plain JSON so it can be saved, exported and diffed. The league and the
 * season inside it are the same objects the headless Stage 1 sim uses.
 */
import type { SeasonState } from '../season';
import type { MatchState } from '../match/state';
import type { MatchAction, MatchReplay, MatchResult, MatchSetup, Side, Tactics, TeamSelection } from '../types';

export type TierId = 'easy' | 'normal' | 'hard' | 'veryHard';
export type CareerPhase = 'preseason' | 'season' | 'review' | 'gameOver';
export type MatchMode = 'full' | 'bigCalls' | 'coach';

export const INCOME_KEYS = ['tickets', 'concessions', 'merchandise', 'sponsors', 'namingRights', 'tv', 'merit', 'playoffs', 'playerSales', 'loanFees', 'luxuryShare', 'hospitality', 'other'] as const;
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

export type InboxKind = 'info' | 'finance' | 'transfer' | 'bid' | 'staff' | 'youth' | 'ladder' | 'match' | 'season' | 'stadium' | 'decision';

export interface InboxMessage {
  id: string;
  weekIndex: number;
  season: number;
  kind: InboxKind;
  title: string;
  body: string;
  read: boolean;
  /** The story event this message brings (src/sim/career/story.ts), answered or not. */
  eventRef?: string;
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
  /** Paid for, waiting for the off-season to start. */
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

export type Temperament = 'calm' | 'showman' | 'pennyPincher' | 'gambler';

/** An AI club's owner (Stage 6.4): a light character who remembers how you have dealt with them. */
export interface RivalOwner {
  name: string;
  temperament: Temperament;
  /** How they feel about you, -1 to 1 (0 neutral). */
  memory: number;
}

export interface Owner {
  /** Personal money left to put into the club. */
  fortune: number;
  /** Total put in so far. */
  injected: number;
}

/**
 * One change the owner made during the live match, after `step` minutes and then `frame`
 * engine steps of the next minute had been played (the 2D view plays frame by frame; the
 * text feed a minute at a time, so its changes have no frame).
 */
export type LiveEntry =
  | { step: number; frame?: number; type: 'action'; action: MatchAction }
  | { step: number; frame?: number; type: 'plan'; side: Side; tactics: Tactics }
  | { step: number; frame?: number; type: 'control'; side: Side; ai: boolean };

/**
 * The user's live match as the engine can replay it: the setup at kick-off (or, for a match
 * restarted from a saved state, that state), the minutes played and the owner's changes.
 * A record only replays under the engine revision and tuning it was made with.
 */
export interface LiveRecord {
  matchId: string;
  rev: number;
  tuning: number;
  setup: MatchSetup;
  /** A match restarted from a saved state (restart-resume): that state. */
  base: MatchState | null;
  /** The base state came from the spatial engine (its minute is the one being played). */
  baseSpatial: boolean;
  steps: number;
  /** Engine steps played into the minute after `steps` (the 2D view stops mid-minute). */
  frames?: number;
  log: LiveEntry[];
}

/**
 * Replays kept by match id: every match the user's club has played this season, and the
 * latest round of everyone else's. Each is a recipe (about 14 KB before the save is
 * compressed), never position frames.
 */
export interface CareerReplays {
  club: Record<string, MatchReplay>;
  round: Record<string, MatchReplay>;
}

export type StoryPace = 'calm' | 'normal' | 'busy';

/** Who brings an event to the office. */
export type VisitorRole = 'lender' | 'agent' | 'sponsor' | 'coach' | 'reporter' | 'player' | 'fans' | 'councillor' | 'vip' | 'staffer' | 'owner';

/** An event waiting for the owner's answer (or answered, while its message is still kept). */
export interface StoryEvent {
  /** Instance id, also the inbox message's eventRef. */
  id: string;
  /** The event's id in src/data/events. */
  eventId: string;
  role: VisitorRole;
  weekIndex: number;
  /** Global week index at which the staff answer if the owner has not. */
  deadlineWeek: number;
  /** The player it is about, if any. */
  playerId: string | null;
  /** A made-up person in the story (a fan, a councillor), by name. */
  person: string | null;
  /** Money in the story, already scaled to the club. */
  amount: number;
  /** The choice made, once answered; 'staff' when the staff answered. */
  answer: string | null;
  mailId: string;
  /** The rival club the event is about, fixed when it starts (Stage 6.4 rivalry events). */
  teamId?: string | null;
  /** Set when the event is a press conference (Stage 6.3). */
  press?: PressConference;
}

export type PressTone = 'calm' | 'bold' | 'deflect';

/** A press conference: two or three questions, answered one at a time. */
export interface PressConference {
  /** The next match's opponent and fixture, for the questions before it. */
  nextId: string | null;
  nextMatchId: string | null;
  /** This week's opponent, for the questions about the result. */
  lastId: string | null;
  tags: string[];
  /** Text fills fixed when it was called: score, stage, run length, table position. */
  vars: Record<string, string>;
  questions: { id: string; playerId: string | null; tone: PressTone | null; staff: boolean }[];
}

/** A bold promise to win a match, judged once it is played. */
export interface PressClaim {
  matchId: string;
  opponentId: string;
  weekIndex: number;
}

/** A promise or a delayed consequence, checked when its week comes. */
export interface StoryTimer {
  id: string;
  /** Global week index it comes due. */
  week: number;
  /** 'next' starts a follow-up event (Stage 6.5 story chains); 'wins' and 'price' are promises to win games or hold ticket prices. */
  kind: 'starts' | 'signing' | 'later' | 'next' | 'wins' | 'price';
  /** For 'next': the event to start. */
  next?: string;
  /** Carried into a follow-up event, so the chain stays about the same club and people. */
  teamId?: string | null;
  person?: string | null;
  /** The event and choice that set it, for its effects and text. */
  eventId: string;
  choiceId: string;
  playerId: string | null;
  amount: number;
  /** For 'starts': apps the player had when promised. For 'signing': squad size then. */
  baseline: number;
  /** For 'starts': the apps he was promised. */
  target: number;
}

export interface StoryDecision {
  season: number;
  weekIndex: number;
  eventId: string;
  choiceId: string;
  /** Answered by the staff (the owner waved it off or let the deadline pass). */
  staff: boolean;
}

/**
 * The events and story layer (Stage 6): moods, the press, open events, promises and what
 * the owner chose. All of it is seeded and headless like the rest of the career.
 */
export interface StoryState {
  pace: StoryPace;
  /** How the press sees the owner, 0-1 (0.5 neutral). */
  press: number;
  /** Sponsors' goodwill, 0-1 (0.5 neutral). Scales the next shirt offers. */
  goodwill: number;
  /** Mood of each player in the user's squad, 0-1; missing means neutral. */
  mood: Record<string, number>;
  events: StoryEvent[];
  timers: StoryTimer[];
  /** Flags set by choices, by name: the global week they were set. */
  flags: Record<string, number>;
  /** When each event last happened (global week), for cooldowns. */
  last: Record<string, number>;
  /** How many times each event happened this season. */
  seasonCount: Record<string, number>;
  /** Decisions this season and last (older ones are dropped at the rollover). */
  decisions: StoryDecision[];
  /** Rivalry heat with each club by id, 0-1 (Stage 6.3; missing is 0). */
  heat: Record<string, number>;
  /** Promises to win, from press conferences. */
  claims: PressClaim[];
  /** Global week of the last press conference, or -1. */
  lastPress: number;
  /** A change to the crowd at your next home match (Stage 6.5: a protest, a floodlight fault), for that season week. */
  gate: { share: number; week: number } | null;
}

export type NewsKind = 'result' | 'league' | 'streak' | 'record' | 'transfer' | 'table' | 'club' | 'money' | 'stadium' | 'season' | 'preview';

/** A newspaper story (Stage 6.2). Text is stored as printed, so it stays right after players move on. */
export interface NewsItem {
  /** `n{weekIndex}_{k}`; never uses career.counter. */
  id: string;
  season: number;
  /** The edition it ran in (global week index). */
  weekIndex: number;
  /** "Round 12", "Semi-finals", "Pre-season week 2". */
  label: string;
  kind: NewsKind;
  headline: string;
  body: string;
  /** Front-page rank; the highest in an edition is the lead. */
  weight: number;
  /** About the user's club. */
  mine: boolean;
}

export type PostKind = 'fan' | 'rival' | 'rumour' | 'odd';

/** A post on the social feed (Stage 6.2), from a made-up handle. */
export interface SocialPost {
  id: string;
  weekIndex: number;
  handle: string;
  text: string;
  kind: PostKind;
  tone: 'up' | 'down' | 'flat';
  likes: number;
}

/** Something that happened between editions, waiting for the paper. */
export type NewsWire =
  | { kind: 'transfer'; playerId: string; name: string; fromId: string | null; toId: string; fee: number; how: 'fee' | 'free' | 'loan' | 'forced' }
  | { kind: 'story'; headline: string; body: string; weight: number; newsKind: NewsKind };

export interface NewsState {
  items: NewsItem[];
  posts: SocialPost[];
  wire: NewsWire[];
  /** The table as the paper last printed it. */
  leaderId: string | null;
  userPos: number;
  /** Biggest winning margin in the league this season. */
  bestMargin: number;
  /** Lender ladder level the paper last knew about. */
  ladder: number;
  shieldDone: boolean;
}

/** Deadline day (Stage 6.6): a call to the war room. */
export type DeadlineKind = 'lateBid' | 'panicSale' | 'freeAgent' | 'hijack' | 'flavour';
export type DeadlineStatus = 'open' | 'accepted' | 'declined' | 'lapsed';

export interface DeadlineCall {
  id: string;
  kind: DeadlineKind;
  /** The hour it came in, and the hour the clock lapses it. */
  hour: number;
  expires: number;
  playerId: string | null;
  /** The other club: the bidder, the seller, or the club being hijacked from. */
  teamId: string | null;
  /** The club about to sign the player (hijacks). */
  rivalId: string | null;
  /** What you'd pay or receive. */
  fee: number;
  /** The fee the rival agreed (hijacks). */
  rivalFee: number;
  person: string;
  /** Which text variant (or which flavour call) to show. */
  variant: number;
  status: DeadlineStatus;
  /** A late bid the owner has already pushed up once. */
  raised: boolean;
  /** One line on how it ended. */
  result: string | null;
  byStaff: boolean;
}

export interface DeadlineDeal {
  dir: 'in' | 'out';
  playerId: string;
  name: string;
  teamId: string | null;
  fee: number;
  hour: number;
}

export interface DeadlineDay {
  /** "<season>-pre" or "<season>-mid": one war room per window. */
  key: string;
  hour: number;
  calls: DeadlineCall[];
  deals: DeadlineDeal[];
  log: { hour: number; text: string }[];
  /** The biggest deal between other clubs today, for the front page. */
  elsewhere: { name: string; fromId: string | null; toId: string; fee: number } | null;
  /** The staff finished the day (the owner left it to them, or never came in). */
  byStaff: boolean;
  closed: boolean;
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
  /** The user's match in progress, stepped by the match screen (as it stands; see live.ts). */
  liveMatch: MatchState | null;
  /** What rebuilds the engine behind liveMatch exactly after a load (live.ts). */
  liveRecord: LiveRecord | null;
  lastUserMatch: MatchResult | null;
  /** Matches the 2D viewer can replay (docs/DESIGN.md 17.9). */
  replays: CareerReplays;
  playerSeason: Record<string, PlayerSeasonLine>;
  inbox: InboxMessage[];
  history: SeasonHistoryEntry[];
  story: StoryState;
  /** The other clubs' owners, by team id (Stage 6.4). */
  owners: Record<string, RivalOwner>;
  /** The newspaper and social feed (Stage 6.2). */
  news: NewsState;
  /** The war room for the last week of a transfer window (Stage 6.6), or the last one, closed. */
  deadline: DeadlineDay | null;
  /** Counter for career-side ids (bids, debts, messages). */
  counter: number;
  gameOverReason: string | null;
}

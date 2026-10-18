/**
 * The events and story layer (Stage 6, docs/STAGE_6_EVENTS.md). Each week a seeded draw
 * brings a few events from src/data/events: someone walks into the office with a problem
 * and two or three choices. Choices move money, fan mood, player mood, the press and
 * sponsor goodwill, set flags, make promises that are checked later, and schedule
 * consequences. An event the owner does not answer by its deadline is answered by the
 * staff, so a season simulated to the end plays the same story layer.
 */
import { EVENT_FILES, NEWS_TUNING, STORY_TUNING } from '../data';
import { defaultNames, homeNationId } from '../names';
import type { Rng } from '../rng';
import type { Player, StaffRole } from '../types';
import { fairPrice } from './books';
import { ensureHeadCoach, makeSponsorOffers } from './club';
import { bidForListed, squadRole } from './market';
import { reportPromise, reportStory } from './news';
import { PRESS_DEF, addClaim, answerPress, pressView } from './press';
import { addHeat, ownerMemory, ownerOf, rivalLevel } from './rivalry';
import { INCOME_KEYS, SPENDING_KEYS } from './types';
import type { Career, IncomeKey, SpendingKey, StadiumProject, StoryDecision, StoryEvent, StoryPace, StoryState, StoryTimer, VisitorRole } from './types';
import { C, addInbox, careerRng, clamp, earn, money, nextId, roundMoney, spend, squadOf, transferWindowOpen, userBooks, userTeam } from './util';

const T = STORY_TUNING;
const M = T.mood;

export const STORY_PACES: readonly StoryPace[] = ['calm', 'normal', 'busy'];

// ---------------------------------------------------------------------------
// Event data
// ---------------------------------------------------------------------------

export type Subject = 'any' | 'benched' | 'starExpiring' | 'unhappy' | 'young' | 'captain' | 'star';

export interface EventConditions {
  phase?: ('preseason' | 'season')[];
  /** Season weeks (1-based) the event can come in. */
  weekMin?: number;
  weekMax?: number;
  window?: boolean;
  subject?: Subject;
  hasSponsor?: boolean;
  /** Ticket price at least this share of the fair price. */
  priceOverFair?: number;
  homeNext?: boolean;
  /** The next match is away (Stage 6.7). */
  awayNext?: boolean;
  lostRun?: number;
  wonRun?: number;
  fansBelow?: number;
  fansAbove?: number;
  pressBelow?: number;
  pressAbove?: number;
  flag?: string;
  noFlag?: string;
  /** The next match is a derby (Stage 6.4). */
  derbyNext?: boolean;
  /** The next match is a derby or against a rival. */
  rivalNext?: boolean;
  /** Stage 6.5 crises. At least this many of your players injured. */
  injuredAtLeast?: number;
  /** The lenders' ladder at least this level (1-4). */
  ladderAtLeast?: number;
  /** Stadium work under way. */
  building?: boolean;
  /** The stadium carries a sponsor's name. */
  namingRights?: boolean;
  /** Your head coach is rated at least this. */
  coachAbove?: number;
  /** The event is about another club, picked when it starts: {rival} and {owner}. */
  otherClub?: boolean;
  /** Only ever started by an earlier event in a chain, never drawn. */
  chainOnly?: boolean;
}

export type Effect =
  | { cash: number; line: string }
  | { fans: number }
  | { mood: number }
  | { squad: number }
  | { press: number }
  | { goodwill: number }
  | { flag: string }
  | { price: number }
  | { promise: 'starts' | 'signing' | 'wins' | 'price'; weeks: number; target?: number; kept?: string; broken?: string; news?: string }
  | { later: number; title: string; text: string; effects: Effect[] }
  /** Stage 6.4, about the event's rival club: rivalry heat, its owner's memory of you, a public promise to win the next match against it. */
  | { heat: number }
  | { owner: number }
  | { claim: boolean }
  /** Stage 6.5. Start a follow-up event in `weeks` weeks, about the same player, person and club. */
  | { next: string; weeks: number; note?: string }
  /** The player misses this many matches. */
  | { suspend: number }
  /** A club bids for the player at this share of his value. */
  | { listPlayer: number }
  /** The head coach leaves; an interim takes over. */
  | { coachLeaves: boolean }
  /** The crowd at your next home match changes by this share of capacity. */
  | { gate: number }
  /** The shirt sponsor walks (or is dropped). */
  | { dropSponsor: boolean }
  /** Stadium work takes this many weeks longer. */
  | { delayBuild: number }
  /** The lenders give this many more weeks before their next step. */
  | { grace: number }
  /** Every injured player is back this many weeks sooner. */
  | { heal: number };

export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  result: string;
  effects: Effect[];
  /** A public decision makes the paper: "Headline|Body", with the event's fills. */
  news?: string;
}

export interface EventDef {
  id: string;
  role: VisitorRole;
  when: EventConditions;
  title: string;
  text: string;
  /** The choice the staff make. */
  staff: string;
  choices: EventChoice[];
  amount?: number;
  weight?: number;
  cooldown?: number;
  maxPerSeason?: number;
  deadline?: number;
}

const D = T.defaults;
const ROLES: readonly VisitorRole[] = ['lender', 'agent', 'sponsor', 'coach', 'reporter', 'player', 'fans', 'councillor', 'vip', 'staffer', 'owner'];

/** Every event in src/data/events, checked once at load. */
export const EVENTS: readonly EventDef[] = loadEvents(EVENT_FILES);
const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

function loadEvents(files: readonly unknown[]): EventDef[] {
  const out: EventDef[] = [];
  for (const file of files) {
    for (const e of (file as { events: EventDef[] }).events) {
      if (!ROLES.includes(e.role)) throw new Error(`Event ${e.id}: unknown role ${e.role}`);
      if (!e.choices.some((c) => c.id === e.staff)) throw new Error(`Event ${e.id}: staff choice ${e.staff} missing`);
      if (out.some((o) => o.id === e.id)) throw new Error(`Event ${e.id} twice`);
      for (const c of e.choices) for (const fx of allEffects(c.effects)) {
        if (!('cash' in fx)) continue;
        const keys: readonly string[] = fx.cash >= 0 ? INCOME_KEYS : SPENDING_KEYS;
        if (!keys.includes(fx.line)) throw new Error(`Event ${e.id}/${c.id}: ${fx.line} is not a${fx.cash >= 0 ? 'n income' : ' spending'} line`);
      }
      out.push(e);
    }
  }
  return out;
}

function allEffects(effects: readonly Effect[]): Effect[] {
  return effects.flatMap((e) => ('later' in e ? [e, ...allEffects(e.effects)] : [e]));
}

export function eventDef(id: string): EventDef | undefined {
  return id === PRESS_DEF.id ? PRESS_DEF : BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function newStory(pace: StoryPace = 'normal'): StoryState {
  return {
    pace,
    press: T.press.neutral,
    goodwill: T.goodwill.neutral,
    mood: {},
    events: [],
    timers: [],
    flags: {},
    last: {},
    seasonCount: {},
    decisions: [],
    heat: {},
    claims: [],
    lastPress: -1,
    gate: null,
  };
}

export function playerMood(career: Career, playerId: string): number {
  return career.story.mood[playerId] ?? M.neutral;
}

export function setMood(career: Career, playerId: string, value: number): void {
  career.story.mood[playerId] = round3(clamp(value, M.min, M.max));
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export type MoodBand = 'unhappy' | 'settled' | 'happy';

export function moodBand(mood: number): MoodBand {
  if (mood < M.unhappyBelow) return 'unhappy';
  if (mood > M.happyAbove) return 'happy';
  return 'settled';
}

/** The squad's average mood. */
export function squadMood(career: Career): number {
  const squad = userTeam(career).playerIds;
  if (!squad.length) return M.neutral;
  return squad.reduce((a, id) => a + playerMood(career, id), 0) / squad.length;
}

/**
 * Match-day form from the eleven's average mood: a share every attribute moves by, at most
 * matchForm either way (owner decision 2026-10-18: up to about 3%).
 */
export function moodForm(career: Career, starters: readonly string[]): number {
  if (!starters.length) return 0;
  const avg = starters.reduce((a, id) => a + playerMood(career, id), 0) / starters.length;
  const span = avg >= M.neutral ? 1 - M.neutral : M.neutral;
  return round3(clamp(((avg - M.neutral) / span) * M.matchForm, -M.matchForm, M.matchForm)) || 0;
}

/** Open events, oldest first. */
export function openEvents(career: Career): StoryEvent[] {
  return career.story.events.filter((e) => e.answer === null);
}

// ---------------------------------------------------------------------------
// The weekly step
// ---------------------------------------------------------------------------

/**
 * Called once a week before the calendar moves on: late answers by the staff, promises
 * and delayed consequences that come due, mood and press drift, then new events.
 */
export function weeklyStory(career: Career): void {
  if (career.phase !== 'preseason' && career.phase !== 'season') return;
  const story = career.story;
  for (const ev of openEvents(career)) if (ev.deadlineWeek <= career.weekIndex) answerEvent(career, ev.id, null);
  runTimers(career);
  if (story.gate && (career.phase !== 'season' || story.gate.week < career.season.week)) story.gate = null;
  driftMoods(career);
  story.press = round3(story.press + (T.press.neutral - story.press) * T.press.drift);
  story.goodwill = round3(story.goodwill + (T.goodwill.neutral - story.goodwill) * T.goodwill.drift);
  const team = userTeam(career);
  team.fanMood = clamp(team.fanMood + (story.press - T.press.neutral) * T.press.fanLift, C.fans.min, C.fans.max);
  drawEvents(career);
  const keepAfter = career.weekIndex - T.keep.answeredWeeks;
  story.events = story.events.filter((e) => e.answer === null || e.weekIndex > keepAfter);
}

/** The season is over: counts reset, departed players' moods and old decisions go. */
export function rolloverStory(career: Career): void {
  const story = career.story;
  const squad = new Set(userTeam(career).playerIds);
  for (const id of Object.keys(story.mood)) if (!squad.has(id)) delete story.mood[id];
  story.seasonCount = {};
  const season = career.season.league.season;
  story.decisions = story.decisions.filter((d) => d.season >= season - 1);
}

function weights(career: Career): number[] {
  const pace = career.story.pace;
  return transferWindowOpen(career) ? T.pace.windowExtra[pace] : T.pace[pace];
}

function drawEvents(career: Career): void {
  const rng = careerRng(career, 'story');
  const w = weights(career);
  let n = rng.weighted([0, 1, 2, 3], (k) => w[k] ?? 0);
  const room = T.pace.maxOpen - openEvents(career).length;
  n = Math.min(n, Math.max(0, room));
  for (let i = 0; i < n; i++) {
    const pool = EVENTS.filter((e) => eligible(career, e));
    if (!pool.length) return;
    const def = rng.weighted(pool, (e) => e.weight ?? D.weight);
    const subject = pickSubject(career, rng, def.when.subject);
    if (def.when.subject && !subject) continue;
    startEvent(career, def, rng, subject);
  }
}

function eligible(career: Career, e: EventDef): boolean {
  if (e.when.chainOnly) return false;
  const story = career.story;
  const last = story.last[e.id];
  if (last !== undefined && career.weekIndex - last < (e.cooldown ?? D.cooldown)) return false;
  if ((story.seasonCount[e.id] ?? 0) >= (e.maxPerSeason ?? D.maxPerSeason)) return false;
  if (story.events.some((o) => o.eventId === e.id && o.answer === null)) return false;
  return conditionsMet(career, e.when);
}

export function conditionsMet(career: Career, w: EventConditions): boolean {
  const phase = career.phase === 'preseason' ? 'preseason' : 'season';
  if (w.phase && !w.phase.includes(phase)) return false;
  const week = career.phase === 'season' ? career.season.week : 0;
  if (w.weekMin !== undefined && (phase !== 'season' || week < w.weekMin)) return false;
  if (w.weekMax !== undefined && phase === 'season' && week > w.weekMax) return false;
  if (w.window !== undefined && transferWindowOpen(career) !== w.window) return false;
  const books = userBooks(career);
  const team = userTeam(career);
  if (w.hasSponsor !== undefined && !!books.sponsor !== w.hasSponsor) return false;
  if (w.priceOverFair !== undefined && books.ticketPrice < fairPriceOf(career) * w.priceOverFair) return false;
  if (w.homeNext && nextOpponent(career)?.home !== true) return false;
  if (w.awayNext && nextOpponent(career)?.home !== false) return false;
  const form = formOf(career);
  if (w.lostRun !== undefined && !endsWith(form, 'L', w.lostRun)) return false;
  if (w.wonRun !== undefined && !endsWith(form, 'W', w.wonRun)) return false;
  if (w.fansBelow !== undefined && team.fanMood >= w.fansBelow) return false;
  if (w.fansAbove !== undefined && team.fanMood <= w.fansAbove) return false;
  if (w.pressBelow !== undefined && career.story.press >= w.pressBelow) return false;
  if (w.pressAbove !== undefined && career.story.press <= w.pressAbove) return false;
  if (w.flag !== undefined && career.story.flags[w.flag] === undefined) return false;
  if (w.noFlag !== undefined && career.story.flags[w.noFlag] !== undefined) return false;
  if (w.injuredAtLeast !== undefined && squadOf(career, team.id).filter((p) => p.injuryWeeks > 0).length < w.injuredAtLeast) return false;
  if (w.ladderAtLeast !== undefined && career.ladder.level < w.ladderAtLeast) return false;
  if (w.building !== undefined && activeBuilds(career).length > 0 !== w.building) return false;
  if (w.namingRights !== undefined && !!books.namingRights !== w.namingRights) return false;
  if (w.coachAbove !== undefined && headCoachRating(career) < w.coachAbove) return false;
  if (w.derbyNext || w.rivalNext) {
    const next = nextOpponent(career);
    const level = next ? rivalLevel(career, next.id) : null;
    if (w.derbyNext && level !== 'derby') return false;
    if (w.rivalNext && !level) return false;
  }
  return true;
}

function activeBuilds(career: Career): StadiumProject[] {
  return (career.stadiums[career.userTeamId]?.projects ?? []).filter((p) => !p.queued && p.weeksLeft > 0);
}

function headCoachRating(career: Career): number {
  const league = career.season.league;
  for (const id of userTeam(career).staffIds) {
    const s = league.staff[id];
    if (s && s.role === 'headCoach') return s.rating;
  }
  return 0;
}

/** The season week of your next home match, or null. */
function nextHomeWeek(career: Career): number | null {
  if (career.phase !== 'season') return null;
  const state = career.season;
  const m = state.schedule.matches.find((x) => !x.result && x.week > state.week - 1 && x.homeId === career.userTeamId);
  return m ? m.week : null;
}

/** Share of capacity added to (or taken from) the crowd for a match: a story effect on your next home game. */
export function storyGate(career: Career, homeId: string, week: number): number {
  const g = career.story.gate;
  return g && homeId === career.userTeamId && g.week === week ? g.share : 0;
}

function endsWith(form: string[], r: string, n: number): boolean {
  if (form.length < n) return false;
  return form.slice(-n).every((x) => x === r);
}

function formOf(career: Career): string[] {
  return career.season.standings.find((r) => r.teamId === career.userTeamId)?.form ?? [];
}

function playedOf(career: Career): number {
  return career.season.standings.find((r) => r.teamId === career.userTeamId)?.played ?? 0;
}

function fairPriceOf(career: Career): number {
  return fairPrice(userTeam(career));
}

function nextOpponent(career: Career): { id: string; name: string; home: boolean } | null {
  if (career.phase !== 'season') return null;
  const state = career.season;
  const me = career.userTeamId;
  // The draw runs after this week's matches, so the next match is next week's.
  const m = state.schedule.matches.find((x) => !x.result && x.week > state.week - 1 && (x.homeId === me || x.awayId === me));
  if (!m) return null;
  const home = m.homeId === me;
  const opp = state.league.teams.find((t) => t.id === (home ? m.awayId : m.homeId));
  return { id: opp?.id ?? '', name: opp?.shortName ?? 'them', home };
}

function shareOf(career: Career, p: Player): number {
  const played = playedOf(career);
  if (played <= 0) return 0;
  return (career.playerSeason[p.id]?.apps ?? 0) / played;
}

function pickSubject(career: Career, rng: Rng, subject: Subject | undefined): Player | null {
  if (!subject) return null;
  const squad = squadOf(career, career.userTeamId).filter((p) => p.injuryWeeks <= 0);
  const byOverall = [...squad].sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
  let pool: Player[];
  switch (subject) {
    case 'any':
      pool = squad;
      break;
    case 'benched':
      pool = squad.filter((p) => {
        if (p.age < 19 || playedOf(career) < 3) return false;
        const role = squadRole(career, p);
        return role !== 'fringe' && shareOf(career, p) < M.expectedShare[role] - 0.3;
      });
      if (!pool.length) pool = squad.filter((p) => p.age >= 20 && squadRole(career, p) === 'fringe' && shareOf(career, p) < 0.1 && playedOf(career) >= 3);
      break;
    case 'starExpiring':
      pool = byOverall.slice(0, 5).filter((p) => p.contract.years <= 1);
      break;
    case 'unhappy':
      pool = squad.filter((p) => playerMood(career, p.id) < M.unhappyBelow);
      break;
    case 'young':
      pool = squad.filter((p) => p.age <= 21);
      break;
    case 'star':
      pool = byOverall.slice(0, 3);
      break;
    case 'captain': {
      const senior = byOverall.slice(0, 11).sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
      pool = senior.slice(0, 1);
      break;
    }
  }
  return pool.length ? rng.pick(pool) : null;
}

function moneyScale(career: Career): number {
  return T.money.base + T.money.perMarket * userTeam(career).marketSize;
}

/** Starts an event by id now, skipping its conditions (follow-up chains and tests). Returns the event, or null if unknown. */
export function startStoryEvent(career: Career, eventId: string, playerId: string | null = null): StoryEvent | null {
  const def = BY_ID.get(eventId);
  if (!def) return null;
  const p = playerId ? (career.season.league.players[playerId] ?? null) : null;
  return startEvent(career, def, careerRng(career, `story:${eventId}`), p);
}

interface ChainInit {
  person: string | null;
  amount: number;
  teamId: string | null;
}

function startEvent(career: Career, def: EventDef, rng: Rng, subject: Player | null, from?: ChainInit): StoryEvent {
  const story = career.story;
  const nation = homeNationId();
  const person = from?.person ?? `${defaultNames.firstName(rng, nation)} ${defaultNames.lastName(rng, nation)}`;
  const own = def.amount ? Math.max(T.money.round, roundMoney(def.amount * moneyScale(career), T.money.round)) : 0;
  // A follow-up keeps the story's money unless it names its own.
  const amount = def.amount || !from ? own : from.amount;
  const ev: StoryEvent = {
    id: nextId(career, 'ev'),
    eventId: def.id,
    role: def.role,
    weekIndex: career.weekIndex,
    deadlineWeek: career.weekIndex + (def.deadline ?? D.deadline),
    playerId: subject?.id ?? null,
    person,
    amount,
    answer: null,
    mailId: '',
  };
  if (from?.teamId) ev.teamId = from.teamId;
  else if (def.when.derbyNext || def.when.rivalNext) ev.teamId = nextOpponent(career)?.id || null;
  else if (def.when.otherClub) ev.teamId = rng.pick(career.season.league.teams.filter((t) => t.id !== career.userTeamId)).id;
  addInbox(career, 'decision', fill(career, ev, def.title), fill(career, ev, def.text));
  const mail = career.inbox[0];
  mail.eventRef = ev.id;
  ev.mailId = mail.id;
  story.events.push(ev);
  story.last[def.id] = career.weekIndex;
  story.seasonCount[def.id] = (story.seasonCount[def.id] ?? 0) + 1;
  return ev;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function staffName(career: Career, role: StaffRole): string | null {
  const league = career.season.league;
  for (const id of userTeam(career).staffIds) {
    const s = league.staff[id];
    if (s && s.role === role) return `${s.firstName} ${s.lastName}`;
  }
  return null;
}

/** Fills an event's text: {player}, {coach}, {amount} and the rest (see src/data/events). */
export function fill(career: Career, ev: Pick<StoryEvent, 'playerId' | 'person' | 'amount' | 'teamId'>, text: string): string {
  const team = userTeam(career);
  const p = ev.playerId ? career.season.league.players[ev.playerId] : undefined;
  const books = userBooks(career);
  const vars: Record<string, string> = {
    player: p ? `${p.firstName} ${p.lastName}` : 'One of the players',
    first: p ? p.firstName : 'He',
    club: team.name,
    short: team.shortName,
    city: team.city,
    stadium: team.stadiumName,
    coach: staffName(career, 'headCoach') ?? 'The head coach',
    assistant: staffName(career, 'assistantCoach') ?? 'The assistant',
    person: ev.person ?? 'A visitor',
    amount: money(ev.amount),
    half: money(ev.amount / 2),
    double: money(ev.amount * 2),
    sponsor: books.sponsor?.brand ?? 'The shirt sponsor',
    opponent: nextOpponent(career)?.name ?? 'next',
  };
  if (ev.teamId) {
    vars.rival = career.season.league.teams.find((t) => t.id === ev.teamId)?.shortName ?? vars.opponent;
    vars.owner = ownerOf(career, ev.teamId)?.name ?? 'their owner';
  }
  return text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

export interface EventView {
  id: string;
  role: VisitorRole;
  title: string;
  text: string;
  /** Global week index the staff answer by. */
  deadlineWeek: number;
  choices: { id: string; label: string; hint: string }[];
  /** The choice made, if any ('staff' never shows: the staff's pick is named). */
  answer: string | null;
  /** Who answers if the owner waves it off. */
  staffName: string;
  /** A press conference: which question this is, and how the room took the last answer. */
  press?: { index: number; total: number; reply: string | null };
}

/** What the screens show for an event. */
export function eventView(career: Career, ev: StoryEvent): EventView | null {
  if (ev.press) return pressView(career, ev);
  const def = BY_ID.get(ev.eventId);
  if (!def) return null;
  return {
    id: ev.id,
    role: ev.role,
    title: fill(career, ev, def.title),
    text: fill(career, ev, def.text),
    deadlineWeek: ev.deadlineWeek,
    choices: def.choices.map((c) => ({ id: c.id, label: fill(career, ev, c.label), hint: fill(career, ev, c.hint) })),
    answer: ev.answer,
    staffName: staffName(career, staffRoleFor(ev.role)) ?? 'The staff',
  };
}

// ---------------------------------------------------------------------------
// Answers and effects
// ---------------------------------------------------------------------------

export interface AnswerResult {
  ok: boolean;
  text: string;
}

function staffRoleFor(role: VisitorRole): StaffRole {
  return (T.staff.byRole as Record<string, StaffRole>)[role] ?? 'assistantCoach';
}

export function staffQuality(career: Career, role: VisitorRole): number {
  const want = staffRoleFor(role);
  const league = career.season.league;
  for (const id of userTeam(career).staffIds) {
    const s = league.staff[id];
    if (s && s.role === want) return clamp(s.rating / 99, 0, 1);
  }
  return T.staff.missingQuality;
}

/**
 * Answers an open event with a choice id, or null to let the staff handle it. The
 * inbox message gets the outcome added.
 */
export function answerEvent(career: Career, eventRef: string, choiceId: string | null): AnswerResult {
  const story = career.story;
  const ev = story.events.find((e) => e.id === eventRef);
  if (!ev || ev.answer !== null) return { ok: false, text: 'That has already been dealt with.' };
  if (ev.press) return answerPress(career, ev, choiceId);
  const def = BY_ID.get(ev.eventId);
  if (!def) return { ok: false, text: 'That has already been dealt with.' };
  const staff = choiceId === null;
  const choice = def.choices.find((c) => c.id === (staff ? def.staff : choiceId));
  if (!choice) return { ok: false, text: 'That is not one of the choices.' };
  const scale = staff ? staffScale(staffQuality(career, ev.role)) : NO_SCALE;
  applyEffects(career, ev, def, choice, choice.effects, scale);
  ev.answer = staff ? 'staff' : choice.id;
  const decision: StoryDecision = { season: career.season.league.season, weekIndex: career.weekIndex, eventId: def.id, choiceId: choice.id, staff };
  story.decisions.push(decision);
  const result = fill(career, ev, choice.result);
  if (choice.news) reportStory(career, fill(career, ev, choice.news), NEWS_TUNING.weights.decision);
  const who = staffName(career, staffRoleFor(ev.role)) ?? 'The staff';
  const line = staff ? `${who} dealt with it: ${fill(career, ev, choice.label).toLowerCase()}. ${result}` : `You chose: ${fill(career, ev, choice.label)}. ${result}`;
  const mail = career.inbox.find((m) => m.id === ev.mailId);
  if (mail) {
    mail.body = `${mail.body}\n${line}`;
    // A staff answer the owner never saw stays unread so they find out what happened.
    if (!staff) mail.read = true;
  }
  return { ok: true, text: staff ? `${who} will deal with it.` : result };
}

export interface Scale {
  good: number;
  bad: number;
}
export const NO_SCALE: Scale = { good: 1, bad: 1 };

export function staffScale(q: number): Scale {
  const s = T.staff;
  return { good: s.goodBase + s.goodGain * q, bad: Math.max(0, s.badBase - s.badGain * q) };
}

export function scaled(delta: number, s: Scale): number {
  return delta >= 0 ? delta * s.good : delta * s.bad;
}

function applyEffects(career: Career, ev: StoryEvent, def: EventDef, choice: EventChoice, effects: readonly Effect[], s: Scale): void {
  const story = career.story;
  const books = userBooks(career);
  const team = userTeam(career);
  for (const e of effects) {
    if ('cash' in e) {
      const amount = roundMoney(Math.abs(e.cash) * ev.amount);
      if (e.cash >= 0) earn(books, e.line as IncomeKey, amount);
      else spend(books, e.line as SpendingKey, amount);
    } else if ('fans' in e) {
      team.fanMood = clamp(team.fanMood + scaled(e.fans, s), C.fans.min, C.fans.max);
    } else if ('mood' in e) {
      if (ev.playerId) setMood(career, ev.playerId, playerMood(career, ev.playerId) + scaled(e.mood, s));
    } else if ('squad' in e) {
      for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + scaled(e.squad, s));
    } else if ('press' in e) {
      story.press = round3(clamp(story.press + scaled(e.press, s), 0, 1));
    } else if ('goodwill' in e) {
      story.goodwill = round3(clamp(story.goodwill + scaled(e.goodwill, s), 0, 1));
    } else if ('flag' in e) {
      story.flags[e.flag] = career.weekIndex;
    } else if ('price' in e) {
      books.ticketPrice = Math.max(1, Math.round(books.ticketPrice * (1 + e.price)));
    } else if ('promise' in e) {
      const p = ev.playerId;
      addTimer(career, {
        week: career.weekIndex + e.weeks,
        kind: e.promise,
        eventId: def.id,
        choiceId: choice.id,
        playerId: e.promise === 'starts' ? p : null,
        amount: ev.amount,
        baseline: promiseBaseline(career, e.promise, p),
        target: e.target ?? 0,
        teamId: ev.teamId ?? null,
        person: ev.person,
      });
    } else if ('heat' in e) {
      addHeat(career, ev.teamId, e.heat);
    } else if ('owner' in e) {
      ownerMemory(career, ev.teamId, scaled(e.owner, s));
    } else if ('claim' in e) {
      if (e.claim && ev.teamId) addClaim(career, ev.teamId);
    } else if ('later' in e) {
      addTimer(career, { week: career.weekIndex + e.later, kind: 'later', eventId: def.id, choiceId: choice.id, playerId: ev.playerId, amount: ev.amount, baseline: 0, target: 0, teamId: ev.teamId ?? null, person: ev.person });
    } else if ('next' in e) {
      addTimer(career, { week: career.weekIndex + e.weeks, kind: 'next', next: e.next, eventId: def.id, choiceId: choice.id, playerId: ev.playerId, amount: ev.amount, baseline: 0, target: 0, teamId: ev.teamId ?? null, person: ev.person });
    } else if ('suspend' in e) {
      const p = ev.playerId ? career.season.league.players[ev.playerId] : undefined;
      if (p && p.teamId === team.id) p.suspensionMatches += e.suspend;
    } else if ('listPlayer' in e) {
      const p = ev.playerId ? career.season.league.players[ev.playerId] : undefined;
      if (p && p.teamId === team.id) bidForListed(career, p, e.listPlayer, careerRng(career, `story-list:${ev.id}`));
    } else if ('coachLeaves' in e) {
      if (e.coachLeaves) coachLeaves(career, ev.teamId);
    } else if ('gate' in e) {
      const week = nextHomeWeek(career);
      if (week !== null) {
        const share = scaled(e.gate, s) + (story.gate?.week === week ? story.gate.share : 0);
        story.gate = { share: round3(clamp(share, -0.6, 0.3)), week };
      }
    } else if ('dropSponsor' in e) {
      if (e.dropSponsor && books.sponsor) {
        addInbox(career, 'finance', 'Shirt sponsor gone', `${books.sponsor.brand} and the club have parted ways. Pick a new shirt sponsor from the Club screen.`);
        books.sponsor = null;
        career.sponsorOffers = makeSponsorOffers(career);
      }
    } else if ('delayBuild' in e) {
      for (const pr of activeBuilds(career)) {
        pr.weeksLeft += e.delayBuild;
        pr.weeks += e.delayBuild;
      }
    } else if ('grace' in e) {
      if (career.ladder.deadlineWeek !== null) career.ladder.deadlineWeek += e.grace;
    } else if ('heal' in e) {
      for (const p of squadOf(career, team.id)) if (p.injuryWeeks > 0) p.injuryWeeks = Math.max(1, p.injuryWeeks - e.heal);
    }
  }
}

function promiseBaseline(career: Career, kind: 'starts' | 'signing' | 'wins' | 'price', playerId: string | null): number {
  switch (kind) {
    case 'starts':
      return playerId ? (career.playerSeason[playerId]?.apps ?? 0) : 0;
    case 'signing':
      return career.counter;
    case 'wins':
      return career.season.standings.find((r) => r.teamId === career.userTeamId)?.won ?? 0;
    case 'price':
      return userBooks(career).ticketPrice;
  }
}

/** The head coach walks out (poached, or let go to a rival); the best free coach steps in as interim. */
function coachLeaves(career: Career, toTeamId: string | null | undefined): void {
  const team = userTeam(career);
  const league = career.season.league;
  const id = team.staffIds.find((x) => league.staff[x]?.role === 'headCoach');
  if (!id) return;
  const coach = league.staff[id];
  team.staffIds = team.staffIds.filter((x) => x !== id);
  coach.teamId = null;
  const dest = toTeamId ? league.teams.find((t) => t.id === toTeamId)?.shortName : null;
  addInbox(career, 'staff', `${coach.firstName} ${coach.lastName} has gone`, `Your head coach has left${dest ? ` for ${dest}` : ''}.`);
  ensureHeadCoach(career);
}

function addTimer(career: Career, t: Omit<StoryTimer, 'id'>): void {
  career.story.timers.push({ id: nextId(career, 'tm'), ...t });
}

function runTimers(career: Career): void {
  const story = career.story;
  const due = story.timers.filter((t) => t.week <= career.weekIndex);
  if (!due.length) return;
  story.timers = story.timers.filter((t) => t.week > career.weekIndex);
  for (const t of due) {
    if (t.kind === 'later') runLater(career, t);
    else if (t.kind === 'next') runNext(career, t);
    else checkPromise(career, t);
  }
}

function runLater(career: Career, t: StoryTimer): void {
  const def = BY_ID.get(t.eventId);
  const choice = def?.choices.find((c) => c.id === t.choiceId);
  const later = choice?.effects.find((e): e is Extract<Effect, { later: number }> => 'later' in e);
  if (!def || !choice || !later) return;
  const ev = { playerId: t.playerId, person: t.person ?? null, amount: t.amount, teamId: t.teamId ?? null } as StoryEvent;
  applyEffects(career, ev, def, choice, later.effects, NO_SCALE);
  addInbox(career, 'info', fill(career, ev, later.title), fill(career, ev, later.text));
}

/** The next step of a story chain. It needs its player still at the club, if it is about one. */
function runNext(career: Career, t: StoryTimer): void {
  const def = t.next ? BY_ID.get(t.next) : undefined;
  if (!def || (career.phase !== 'season' && career.phase !== 'preseason')) return;
  const p = t.playerId ? career.season.league.players[t.playerId] : null;
  if (t.playerId && (!p || p.teamId !== career.userTeamId)) return;
  if (career.story.events.some((o) => o.eventId === def.id && o.answer === null)) return;
  const rng = careerRng(career, `story-next:${t.id}`);
  // A step about a player the chain didn't have picks its own (the lenders' star sale).
  const subject = p ?? pickSubject(career, rng, def.when.subject);
  if (def.when.subject && !subject) return;
  startEvent(career, def, rng, subject, { person: t.person ?? null, amount: t.amount, teamId: t.teamId ?? null });
}


function checkPromise(career: Career, t: StoryTimer): void {
  const team = userTeam(career);
  let kept: boolean;
  let who = 'the head coach';
  if (t.kind === 'starts') {
    const p = t.playerId ? career.season.league.players[t.playerId] : undefined;
    // He left the club: nothing to keep.
    if (!p || p.teamId !== team.id) return;
    who = `${p.firstName} ${p.lastName}`;
    kept = (career.playerSeason[p.id]?.apps ?? 0) - t.baseline >= t.target || (career.playerSeason[p.id]?.apps ?? 0) < t.baseline;
  } else if (t.kind === 'wins') {
    const won = career.season.standings.find((r) => r.teamId === team.id)?.won ?? 0;
    kept = won - t.baseline >= t.target;
  } else if (t.kind === 'price') {
    kept = userBooks(career).ticketPrice <= t.baseline;
  } else {
    // Anyone in the squad with an id newer than the promise is a new signing.
    kept = signedSince(career, t.baseline);
  }
  if (t.kind === 'wins' || t.kind === 'price') {
    settleDataPromise(career, t, kept);
    return;
  }
  const fx = kept ? T.promises.kept : T.promises.broken;
  if (t.playerId) setMood(career, t.playerId, playerMood(career, t.playerId) + fx.mood);
  for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + fx.squad);
  career.story.press = round3(clamp(career.story.press + fx.press, 0, 1));
  if (!kept && (t.kind === 'starts' || t.kind === 'signing')) reportPromise(career, t.kind, who);
  if (t.kind === 'starts') {
    addInbox(career, 'decision', kept ? `Promise kept: ${who}` : `Promise broken: ${who}`, kept ? `${who} got the games you promised and is playing with a smile.` : `You promised ${who} more football and he didn't get it. He's told his team-mates, and the press have heard.`);
  } else {
    addInbox(career, 'decision', kept ? 'The coach got his signing' : 'No signing for the coach', kept ? 'You promised a signing and delivered. The dressing room noticed.' : 'You promised the head coach a signing and none came. The dressing room noticed that too.');
  }
}

/** A promise whose words come from the event data (Stage 6.5): "Title|Body" for kept and broken, and the paper's take on a broken one. */
function settleDataPromise(career: Career, t: StoryTimer, kept: boolean): void {
  const def = BY_ID.get(t.eventId);
  const choice = def?.choices.find((c) => c.id === t.choiceId);
  const fx = choice?.effects.find((e): e is Extract<Effect, { promise: string }> => 'promise' in e && e.promise === t.kind);
  const P = kept ? T.promises.kept : T.promises.broken;
  const team = userTeam(career);
  for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + P.squad);
  career.story.press = round3(clamp(career.story.press + P.press, 0, 1));
  team.fanMood = clamp(team.fanMood + (kept ? T.promises.fansKept : T.promises.fansBroken), C.fans.min, C.fans.max);
  const ev = { playerId: t.playerId, person: t.person ?? null, amount: t.amount, teamId: t.teamId ?? null };
  const text = (kept ? fx?.kept : fx?.broken) ?? (kept ? 'Promise kept|You did what you said.' : 'Promise broken|You said it, and it did not happen.');
  const [title, body] = fill(career, ev, text).split('|');
  addInbox(career, 'decision', title, body ?? '');
  if (!kept && fx?.news) reportStory(career, fill(career, ev, fx.news), NEWS_TUNING.weights.promise);
}

function signedSince(career: Career, counterMark: number): boolean {
  // Signings are logged as transfer messages; a newer one means a player arrived.
  return career.inbox.some((m) => m.kind === 'transfer' && idNumber(m.id) > counterMark && (m.title.startsWith('Signed ') || m.title.endsWith(' on loan')));
}

function idNumber(id: string): number {
  const n = Number(id.slice(id.lastIndexOf('_') + 1));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------

function driftMoods(career: Career): void {
  const squad = squadOf(career, career.userTeamId);
  const form = formOf(career).slice(-5);
  const formLift = form.reduce((a, r) => a + (r === 'W' ? M.perResult : r === 'L' ? -M.perResult : 0), 0);
  const inSeason = career.phase === 'season' && playedOf(career) > 0;
  for (const p of squad) {
    let target = M.neutral;
    if (inSeason) {
      const role = squadRole(career, p);
      target += M.playTime * (shareOf(career, p) - M.expectedShare[role]) + formLift;
    }
    const mood = playerMood(career, p.id);
    setMood(career, p.id, mood + (clamp(target, M.min, M.max) - mood) * M.drift);
  }
}

/** For tests: all decisions this season. */
export function decisionsThisSeason(career: Career): StoryDecision[] {
  const s = career.season.league.season;
  return career.story.decisions.filter((d) => d.season === s);
}

export function setStoryPace(career: Career, pace: StoryPace): void {
  if (STORY_PACES.includes(pace)) career.story.pace = pace;
}

// ---------------------------------------------------------------------------
// Ongoing: promises and unfinished stories, for the Club screen
// ---------------------------------------------------------------------------

export interface OngoingStory {
  kind: 'promise' | 'story' | 'gate';
  title: string;
  detail: string;
  /** Weeks until it is settled, or null when it waits on a match. */
  weeks: number | null;
}

/** Promises you have made and stories that are not over yet. Surprises ('later' consequences) stay hidden. */
export function ongoingStories(career: Career): OngoingStory[] {
  const out: OngoingStory[] = [];
  const league = career.season.league;
  const team = userTeam(career);
  const coach = staffName(career, 'headCoach') ?? 'the head coach';
  for (const t of [...career.story.timers].sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))) {
    const weeks = Math.max(1, t.week - career.weekIndex);
    const p = t.playerId ? league.players[t.playerId] : undefined;
    const name = p ? `${p.firstName} ${p.lastName}` : '';
    switch (t.kind) {
      case 'starts': {
        if (!p || p.teamId !== team.id) break;
        const done = Math.max(0, (career.playerSeason[p.id]?.apps ?? 0) - t.baseline);
        out.push({ kind: 'promise', title: `Games for ${name}`, detail: `You promised ${t.target}. ${Math.min(done, t.target)} so far.`, weeks });
        break;
      }
      case 'signing':
        out.push({ kind: 'promise', title: `A signing for ${coach}`, detail: signedSince(career, t.baseline) ? 'Done: you have signed someone.' : 'Any new player counts.', weeks });
        break;
      case 'wins': {
        const won = career.season.standings.find((r) => r.teamId === team.id)?.won ?? 0;
        out.push({ kind: 'promise', title: 'Wins for the fans', detail: `You promised ${t.target}. ${Math.min(Math.max(0, won - t.baseline), t.target)} so far.`, weeks });
        break;
      }
      case 'price': {
        const now = userBooks(career).ticketPrice;
        out.push({ kind: 'promise', title: 'No ticket price rise', detail: now > t.baseline ? `Prices are above the ${money(t.baseline)} you promised. Put them back before the time is up.` : `Keep tickets at ${money(t.baseline)} or less.`, weeks });
        break;
      }
      case 'next': {
        const def = BY_ID.get(t.eventId);
        if (!def) break;
        if (t.playerId && (!p || p.teamId !== team.id)) break;
        const ev = { playerId: t.playerId, person: t.person ?? null, amount: t.amount, teamId: t.teamId ?? null };
        const fx = def.choices.find((c) => c.id === t.choiceId)?.effects.find((e): e is Extract<Effect, { next: string }> => 'next' in e && e.next === t.next);
        out.push({ kind: 'story', title: fill(career, ev, def.title), detail: fill(career, ev, fx?.note ?? "This isn't over yet."), weeks });
        break;
      }
      default:
        break;
    }
  }
  for (const c of career.story.claims) {
    const opp = league.teams.find((x) => x.id === c.opponentId);
    if (opp) out.push({ kind: 'promise', title: `Beat ${opp.shortName}`, detail: 'You said so in public. The next meeting decides it.', weeks: null });
  }
  const g = career.story.gate;
  if (g && career.phase === 'season' && g.week >= career.season.week) {
    const pct = Math.round(Math.abs(g.share) * 100);
    out.push({ kind: 'gate', title: g.share < 0 ? 'A smaller crowd next home game' : 'A bigger crowd next home game', detail: g.share < 0 ? `Expect about ${pct}% of the ground to be empty, on top of the usual.` : `About ${pct}% more of the ground will be full.`, weeks: null });
  }
  return out;
}

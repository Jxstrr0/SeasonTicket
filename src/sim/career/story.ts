/**
 * The events and story layer (Stage 6, docs/STAGE_6_EVENTS.md). Each week a seeded draw
 * brings a few events from src/data/events: someone walks into the office with a problem
 * and two or three choices. Choices move money, fan mood, player mood, the press and
 * sponsor goodwill, set flags, make promises that are checked later, and schedule
 * consequences. An event the owner does not answer by its deadline is answered by the
 * staff, so a season simulated to the end plays the same story layer.
 */
import { EVENT_FILES, STORY_TUNING } from '../data';
import { defaultNames, homeNationId } from '../names';
import type { Rng } from '../rng';
import type { Player, StaffRole } from '../types';
import { fairPrice } from './books';
import { squadRole } from './market';
import { INCOME_KEYS, SPENDING_KEYS } from './types';
import type { Career, IncomeKey, SpendingKey, StoryDecision, StoryEvent, StoryPace, StoryState, StoryTimer, VisitorRole } from './types';
import { C, addInbox, careerRng, clamp, earn, money, nextId, roundMoney, spend, squadOf, transferWindowOpen, userBooks, userTeam } from './util';

const T = STORY_TUNING;
const M = T.mood;

export const STORY_PACES: readonly StoryPace[] = ['calm', 'normal', 'busy'];

// ---------------------------------------------------------------------------
// Event data
// ---------------------------------------------------------------------------

export type Subject = 'any' | 'benched' | 'starExpiring' | 'unhappy' | 'young' | 'captain';

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
  lostRun?: number;
  wonRun?: number;
  fansBelow?: number;
  fansAbove?: number;
  pressBelow?: number;
  pressAbove?: number;
  flag?: string;
  noFlag?: string;
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
  | { promise: 'starts' | 'signing'; weeks: number; target?: number }
  | { later: number; title: string; text: string; effects: Effect[] };

export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  result: string;
  effects: Effect[];
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
const ROLES: readonly VisitorRole[] = ['lender', 'agent', 'sponsor', 'coach', 'reporter', 'player', 'fans', 'councillor', 'vip', 'staffer'];

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
  return BY_ID.get(id);
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
  };
}

export function playerMood(career: Career, playerId: string): number {
  return career.story.mood[playerId] ?? M.neutral;
}

function setMood(career: Career, playerId: string, value: number): void {
  career.story.mood[playerId] = round3(clamp(value, M.min, M.max));
}

function round3(x: number): number {
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
  const form = formOf(career);
  if (w.lostRun !== undefined && !endsWith(form, 'L', w.lostRun)) return false;
  if (w.wonRun !== undefined && !endsWith(form, 'W', w.wonRun)) return false;
  if (w.fansBelow !== undefined && team.fanMood >= w.fansBelow) return false;
  if (w.fansAbove !== undefined && team.fanMood <= w.fansAbove) return false;
  if (w.pressBelow !== undefined && career.story.press >= w.pressBelow) return false;
  if (w.pressAbove !== undefined && career.story.press <= w.pressAbove) return false;
  if (w.flag !== undefined && career.story.flags[w.flag] === undefined) return false;
  if (w.noFlag !== undefined && career.story.flags[w.noFlag] !== undefined) return false;
  return true;
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

function nextOpponent(career: Career): { name: string; home: boolean } | null {
  if (career.phase !== 'season') return null;
  const state = career.season;
  const me = career.userTeamId;
  // The draw runs after this week's matches, so the next match is next week's.
  const m = state.schedule.matches.find((x) => !x.result && x.week > state.week - 1 && (x.homeId === me || x.awayId === me));
  if (!m) return null;
  const home = m.homeId === me;
  const opp = state.league.teams.find((t) => t.id === (home ? m.awayId : m.homeId));
  return { name: opp?.shortName ?? 'them', home };
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

function startEvent(career: Career, def: EventDef, rng: Rng, subject: Player | null): StoryEvent {
  const story = career.story;
  const nation = homeNationId();
  const person = `${defaultNames.firstName(rng, nation)} ${defaultNames.lastName(rng, nation)}`;
  const amount = def.amount ? Math.max(T.money.round, roundMoney(def.amount * moneyScale(career), T.money.round)) : 0;
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

function staffName(career: Career, role: StaffRole): string | null {
  const league = career.season.league;
  for (const id of userTeam(career).staffIds) {
    const s = league.staff[id];
    if (s && s.role === role) return `${s.firstName} ${s.lastName}`;
  }
  return null;
}

/** Fills an event's text: {player}, {coach}, {amount} and the rest (see src/data/events). */
export function fill(career: Career, ev: Pick<StoryEvent, 'playerId' | 'person' | 'amount'>, text: string): string {
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
}

/** What the screens show for an event. */
export function eventView(career: Career, ev: StoryEvent): EventView | null {
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

function staffQuality(career: Career, role: VisitorRole): number {
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

interface Scale {
  good: number;
  bad: number;
}
const NO_SCALE: Scale = { good: 1, bad: 1 };

function staffScale(q: number): Scale {
  const s = T.staff;
  return { good: s.goodBase + s.goodGain * q, bad: Math.max(0, s.badBase - s.badGain * q) };
}

function scaled(delta: number, s: Scale): number {
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
        baseline: e.promise === 'starts' ? (p ? (career.playerSeason[p]?.apps ?? 0) : 0) : career.counter,
        target: e.target ?? 0,
      });
    } else if ('later' in e) {
      addTimer(career, { week: career.weekIndex + e.later, kind: 'later', eventId: def.id, choiceId: choice.id, playerId: ev.playerId, amount: ev.amount, baseline: 0, target: 0 });
    }
  }
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
    else checkPromise(career, t);
  }
}

function runLater(career: Career, t: StoryTimer): void {
  const def = BY_ID.get(t.eventId);
  const choice = def?.choices.find((c) => c.id === t.choiceId);
  const later = choice?.effects.find((e): e is Extract<Effect, { later: number }> => 'later' in e);
  if (!def || !choice || !later) return;
  const ev = { playerId: t.playerId, person: null, amount: t.amount } as StoryEvent;
  applyEffects(career, ev, def, choice, later.effects, NO_SCALE);
  addInbox(career, 'info', fill(career, ev, later.title), fill(career, ev, later.text));
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
  } else {
    // Anyone in the squad with an id newer than the promise is a new signing.
    kept = signedSince(career, t.baseline);
  }
  const fx = kept ? T.promises.kept : T.promises.broken;
  if (t.playerId) setMood(career, t.playerId, playerMood(career, t.playerId) + fx.mood);
  for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + fx.squad);
  career.story.press = round3(clamp(career.story.press + fx.press, 0, 1));
  if (t.kind === 'starts') {
    addInbox(career, 'decision', kept ? `Promise kept: ${who}` : `Promise broken: ${who}`, kept ? `${who} got the games you promised and is playing with a smile.` : `You promised ${who} more football and he didn't get it. He's told his team-mates, and the press have heard.`);
  } else {
    addInbox(career, 'decision', kept ? 'The coach got his signing' : 'No signing for the coach', kept ? 'You promised a signing and delivered. The dressing room noticed.' : 'You promised the head coach a signing and none came. The dressing room noticed that too.');
  }
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

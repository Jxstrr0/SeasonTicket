/**
 * Deadline day (Stage 6.6, docs/STAGE_6_EVENTS.md). The last week of each transfer window
 * opens a war room: a clock from 09:00 to 23:00 that the owner moves on an hour at a time.
 * Calls come in (late bids for your players, clubs selling cheap, agents with free agents,
 * a rival about to sign someone you could take, and the odd silly one), each with a short
 * deadline. When the window shuts the paper prints the ins and outs.
 *
 * The owner never has to come in: when the week's match is played, the staff play out any
 * hours left with a careful policy (sell only for a good price outside the starting eleven,
 * never spend the owner's money). So "sim to end" and the tests run the same day.
 * Tuning is src/data/tuning/deadline.json, text src/data/deadline.json; every draw has a
 * seeded stream named for the window and the hour.
 */
import { DEADLINE_TEXT, DEADLINE_TUNING } from '../data';
import { teamById } from '../league';
import { defaultNames, homeNationId } from '../names';
import type { Rng } from '../rng';
import type { Player, Position, Team } from '../types';
import { playerPayroll, spendingLimits } from './books';
import { aiDealsRound, aiTransfer, buyAtFee, buyers, canLose, generateFreeAgent, sellAtFee, signFreeAgent, squadRole, wageDemand } from './market';
import { reportStory } from './news';
import { rivalsOf } from './rivalry';
import { staffName } from './story';
import type { Career, DeadlineCall, DeadlineDay, DeadlineKind } from './types';
import { C, addInbox, careerRng, money, nextId, playerName, roundMoney, squadOf, userBooks, userTeam } from './util';

const T = DEADLINE_TUNING;
const X = DEADLINE_TEXT;
const KINDS: DeadlineKind[] = ['lateBid', 'panicSale', 'freeAgent', 'hijack', 'flavour'];
const POSITIONS: Position[] = ['CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

export type DeadlineChoice = 'yes' | 'more' | 'no';

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

/** The window whose last week this is ("<season>-pre" or "<season>-mid"), or null. */
export function deadlineKey(career: Career): string | null {
  const season = career.season.league.season;
  if (career.phase === 'preseason') return career.preseasonWeek === C.calendar.preseasonWeeks ? `${season}-pre` : null;
  const window = C.calendar.midSeasonWindow;
  if (career.phase === 'season' && career.season.phase !== 'complete' && career.season.week === window[window.length - 1]) return `${season}-mid`;
  return null;
}

/** Opens the war room when the calendar reaches a window's last week (once per window). */
export function openDeadlineIfDue(career: Career): void {
  const key = deadlineKey(career);
  if (!key || career.deadline?.key === key) return;
  const day: DeadlineDay = { key, hour: T.startHour, calls: [], deals: [], log: [], elsewhere: null, byStaff: false, closed: false };
  career.deadline = day;
  ring(career, day, true);
  addInbox(career, 'transfer', 'Deadline day', key.endsWith('-pre') ? X.open.pre : X.open.mid);
}

/** Today's war room, while it is open. */
export function openDeadline(career: Career): DeadlineDay | null {
  const day = career.deadline;
  return day && !day.closed && day.key === deadlineKey(career) ? day : null;
}

/** True once this window's deadline has passed (the market is shut until the next one). */
export function deadlinePassed(career: Career): boolean {
  const day = career.deadline;
  return !!day && day.closed && day.key === deadlineKey(career);
}

/**
 * The staff see the day out: they answer every call as it comes in, hour by hour, until the
 * window shuts. Called before the week's match (and by the owner's "leave it to the staff").
 */
export function closeDeadline(career: Career): void {
  const day = openDeadline(career);
  if (!day) return;
  day.byStaff = true;
  while (!day.closed) {
    for (const call of day.calls) if (call.status === 'open') staffAnswer(career, day, call);
    advanceDeadlineHour(career);
  }
}

/** The clock moves on an hour: calls past their time lapse, new ones may come in, and 23:00 shuts the window. */
export function advanceDeadlineHour(career: Career): void {
  const day = openDeadline(career);
  if (!day) return;
  day.hour += 1;
  for (const call of day.calls) if (call.status === 'open' && call.expires <= day.hour) lapse(career, day, call);
  if (day.hour >= T.endHour) shutWindow(career, day);
  else ring(career, day, false);
}

function shutWindow(career: Career, day: DeadlineDay): void {
  for (const call of day.calls) if (call.status === 'open') lapse(career, day, call);
  const wire = career.news.wire;
  const before = new Set(wire);
  for (let r = 0; r < T.flurry.rounds; r++) aiDealsRound(career, careerRng(career, `deadline-flurry:${day.key}:${r}`));
  for (const w of wire) {
    if (before.has(w) || w.kind !== 'transfer' || w.toId === career.userTeamId || w.fromId === career.userTeamId) continue;
    noteElsewhere(day, { name: w.name, fromId: w.fromId, toId: w.toId, fee: w.fee });
  }
  day.closed = true;
  frontPage(career, day);
  const ins = dealList(day, 'in');
  const outs = dealList(day, 'out');
  const body = ins || outs ? fillVars(X.closed.busy, { ins: ins || 'nobody', outs: outs || 'nobody' }) : X.closed.quiet;
  addInbox(career, 'transfer', X.closed.title, day.byStaff ? `${body} ${X.closed.staff}` : body);
}

function noteElsewhere(day: DeadlineDay, deal: NonNullable<DeadlineDay['elsewhere']>): void {
  if (deal.fee > 0 && (!day.elsewhere || deal.fee > day.elsewhere.fee)) day.elsewhere = deal;
}

function dealList(day: DeadlineDay, dir: 'in' | 'out'): string {
  return day.deals
    .filter((d) => d.dir === dir)
    .map((d) => (d.fee > 0 ? `${d.name} (${money(d.fee)})` : `${d.name} (free)`))
    .join(', ');
}

function frontPage(career: Career, day: DeadlineDay): void {
  const league = career.season.league;
  const ins = dealList(day, 'in');
  const outs = dealList(day, 'out');
  const e = day.elsewhere;
  const short = (id: string | null) => (id ? (league.teams.find((t) => t.id === id)?.shortName ?? 'a club') : 'free agency');
  const elsewhere = e ? fillVars(X.frontPage.elsewhere, { player: e.name, from: short(e.fromId), to: short(e.toId), fee: money(e.fee) }) : X.frontPage.nothingElsewhere;
  const list = ins && outs ? X.frontPage.busy : ins ? X.frontPage.ins : outs ? X.frontPage.outs : X.frontPage.quiet;
  const rng = careerRng(career, `deadline-paper:${day.key}`);
  reportStory(career, fillVars(rng.pick(list), { short: userTeam(career).shortName, ins, outs, elsewhere }), T.frontPageWeight);
}

// ---------------------------------------------------------------------------
// Calls coming in
// ---------------------------------------------------------------------------

function hourChance(hour: number): number {
  let p = 0;
  for (const [from, chance] of T.calls.perHour) if (hour >= from) p = chance;
  return p;
}

function ring(career: Career, day: DeadlineDay, first: boolean): void {
  const rng = careerRng(career, `deadline:${day.key}:${day.hour}`);
  let count = first || rng.chance(hourChance(day.hour)) ? 1 : 0;
  if (count && rng.chance(T.calls.second)) count += 1;
  for (let i = 0; i < count; i++) {
    if (day.calls.length >= T.calls.maxTotal) return;
    if (day.calls.filter((c) => c.status === 'open').length >= T.calls.maxOpen) return;
    const call = makeCall(career, day, rng);
    if (call) day.calls.push(call);
  }
}

function makeCall(career: Career, day: DeadlineDay, rng: Rng): DeadlineCall | null {
  // A kind that finds nobody suitable gives way to another; a silly call always works.
  let kinds = KINDS.slice();
  while (kinds.length > 0) {
    const kind = rng.weighted(kinds, (k) => T.kinds[k].weight);
    const base: DeadlineCall = {
      id: nextId(career, 'dl'),
      kind,
      hour: day.hour,
      expires: day.hour + T.kinds[kind].expires,
      playerId: null,
      teamId: null,
      rivalId: null,
      fee: 0,
      rivalFee: 0,
      person: `${defaultNames.firstName(rng, homeNationId())} ${defaultNames.lastName(rng, homeNationId())}`,
      variant: rng.int(0, 99),
      status: 'open',
      raised: false,
      result: null,
      byStaff: false,
    };
    const made = BUILD[kind](career, day, rng, base);
    if (made) return made;
    kinds = kinds.filter((k) => k !== kind);
  }
  return null;
}

/** Players already in a call today: nobody comes up twice. */
function busy(day: DeadlineDay): Set<string> {
  return new Set(day.calls.map((c) => c.playerId).filter((id): id is string => !!id));
}

/** The user's starting-eleven average, to judge who is worth buying. */
function starterLevel(career: Career): number {
  const top = squadOf(career, career.userTeamId)
    .map((p) => p.overall)
    .sort((a, b) => b - a)
    .slice(0, 11);
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
}

/** Most the user could pay in a fee right now. */
function canPay(career: Career): number {
  const limits = spendingLimits(career);
  return limits.locked ? 0 : Math.min(limits.maxFee, userBooks(career).cash);
}

function sellable(career: Career, team: Team, level: number, min: number, taken: Set<string>): Player[] {
  if (team.id === career.userTeamId || team.playerIds.length <= C.transfers.minSquad) return [];
  return squadOf(career, team.id).filter((p) => p.position !== 'GK' && p.overall >= level + min && !taken.has(p.id));
}

type Builder = (career: Career, day: DeadlineDay, rng: Rng, call: DeadlineCall) => DeadlineCall | null;

const BUILD: Record<DeadlineKind, Builder> = {
  lateBid: (career, day, rng, call) => {
    const taken = busy(day);
    const squad = squadOf(career, career.userTeamId).filter((p) => !taken.has(p.id) && !canLose(career, p) && !career.incomingBids.some((b) => b.playerId === p.id));
    if (squad.length === 0) return null;
    const player = rng.weighted(squad, (p) => Math.pow(Math.max(1, p.overall - 35), 2));
    const fee = roundMoney(player.value * rng.float(T.lateBid.share.min, T.lateBid.share.max), 5000);
    const options = buyers(career, career.userTeamId, fee);
    if (options.length === 0) return null;
    return { ...call, playerId: player.id, teamId: rng.pick(options.slice(0, 4)).id, fee };
  },
  panicSale: (career, day, rng, call) => {
    const taken = busy(day);
    const level = starterLevel(career);
    const max = canPay(career);
    const league = career.season.league;
    const poorest = league.teams.filter((t) => t.id !== career.userTeamId).sort((a, b) => career.books[a.id].cash - career.books[b.id].cash || (a.id < b.id ? -1 : 1));
    const offers = poorest
      .slice(0, 6)
      .flatMap((t) => sellable(career, t, level, T.panicSale.minOverall, taken))
      .map((p) => ({ p, fee: roundMoney(p.value * rng.float(T.panicSale.share.min, T.panicSale.share.max), 5000) }))
      .filter((o) => o.fee > 0 && o.fee <= max);
    if (offers.length === 0) return null;
    const pick = rng.weighted(offers, (o) => o.p.overall - level + 10);
    return { ...call, playerId: pick.p.id, teamId: pick.p.teamId, fee: pick.fee };
  },
  freeAgent: (career, _day, rng, call) => {
    if (squadOf(career, career.userTeamId).length >= C.transfers.maxSquad) return null;
    const squad = squadOf(career, career.userTeamId);
    const best = (pos: Position) => Math.max(0, ...squad.filter((p) => p.position === pos).map((p) => p.overall));
    const weakest = POSITIONS.slice().sort((a, b) => best(a) - best(b))[0];
    const player = generateFreeAgent(career, weakest, rng.float(T.freeAgent.quality.min, T.freeAgent.quality.max));
    return { ...call, playerId: player.id };
  },
  hijack: (career, day, rng, call) => {
    const taken = busy(day);
    const level = starterLevel(career);
    const max = canPay(career);
    const league = career.season.league;
    const targets = league.teams
      .flatMap((t) => sellable(career, t, level, T.hijack.minOverall, taken))
      .map((p) => {
        const fee = roundMoney(p.value * rng.float(T.hijack.share.min, T.hijack.share.max), 5000);
        return { p, fee, beat: roundMoney(fee * T.hijack.beat, 5000) };
      })
      .filter((o) => o.fee > 0 && o.beat <= max);
    if (targets.length === 0) return null;
    const pick = rng.weighted(targets, (o) => o.p.overall - level + 10);
    // Your rivals are the ones who'd most enjoy it.
    const rivals = new Set(rivalsOf(career).map((r) => r.teamId));
    const able = buyers(career, career.userTeamId, pick.fee).filter((t) => t.id !== pick.p.teamId);
    if (able.length === 0) return null;
    const rival = able.find((t) => rivals.has(t.id)) ?? rng.pick(able.slice(0, 5));
    return { ...call, playerId: pick.p.id, teamId: pick.p.teamId, rivalId: rival.id, fee: pick.beat, rivalFee: pick.fee };
  },
  flavour: (_career, day, _rng, call) => {
    const used = new Set(day.calls.filter((c) => c.kind === 'flavour').map((c) => c.variant % X.flavour.length));
    if (used.size >= X.flavour.length) return null;
    let v = call.variant % X.flavour.length;
    while (used.has(v)) v = (v + 1) % X.flavour.length;
    return { ...call, variant: v };
  },
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface DeadlineAnswer {
  ok: boolean;
  message: string;
}

/** The owner answers a call. 'more' only applies to a late bid not already pushed up. */
export function answerDeadlineCall(career: Career, callId: string, choice: DeadlineChoice): DeadlineAnswer {
  const day = openDeadline(career);
  const call = day?.calls.find((c) => c.id === callId);
  if (!day || !call) return { ok: false, message: 'That call has gone.' };
  if (call.status !== 'open') return { ok: false, message: 'That call is over.' };
  if (choice === 'more' && (call.kind !== 'lateBid' || call.raised)) return { ok: false, message: 'There is no more to ask for.' };
  resolve(career, day, call, choice);
  return { ok: true, message: call.result ?? '' };
}

/** The staff's careful answer to a call. */
function staffChoice(career: Career, call: DeadlineCall): DeadlineChoice {
  if (call.kind !== 'lateBid') return 'no';
  const player = call.playerId ? career.season.league.players[call.playerId] : undefined;
  if (!player || player.teamId !== career.userTeamId) return 'no';
  if (squadOf(career, career.userTeamId).length <= T.staff.keepSquad) return 'no';
  return call.fee >= player.value * T.staff.acceptShare && squadRole(career, player) !== 'starter' ? 'yes' : 'no';
}

function staffAnswer(career: Career, day: DeadlineDay, call: DeadlineCall): void {
  call.byStaff = true;
  resolve(career, day, call, staffChoice(career, call));
}

function resolve(career: Career, day: DeadlineDay, call: DeadlineCall, choice: DeadlineChoice): void {
  const league = career.season.league;
  const player = call.playerId ? league.players[call.playerId] : undefined;
  const text = textOf(call.kind);
  const done = (status: 'accepted' | 'declined', line: string) => {
    call.status = status;
    call.result = line;
    day.log.push({ hour: day.hour, text: line });
  };
  if (call.kind === 'flavour') {
    const f = X.flavour[call.variant % X.flavour.length];
    done('declined', callFill(career, call, choice === 'yes' ? f.yesResult : f.noResult));
    return;
  }
  if (!player || !text) return done('declined', callFill(career, call, text?.lapsed ?? ''));
  if (choice === 'no') {
    if (call.kind === 'hijack') rivalSigns(career, day, call, player);
    else done('declined', callFill(career, call, text.declined));
    return;
  }
  if (choice === 'more') {
    const rng = careerRng(career, `deadline-more:${call.id}`);
    if (rng.chance(T.lateBid.more.chance)) {
      call.fee = roundMoney(call.fee * (1 + rng.float(T.lateBid.more.raise.min, T.lateBid.more.raise.max)), 5000);
      call.raised = true;
      call.expires = Math.max(call.expires, day.hour + 2);
      call.result = callFill(career, call, X.lateBid.raised);
      day.log.push({ hour: day.hour, text: call.result });
    } else {
      done('declined', callFill(career, call, X.lateBid.walked));
    }
    return;
  }
  const years = call.kind === 'freeAgent' ? T.freeAgent.years : call.kind === 'hijack' ? T.hijack.years : T.panicSale.years;
  const r =
    call.kind === 'lateBid'
      ? sellAtFee(career, player.id, call.teamId!, call.fee)
      : call.kind === 'freeAgent'
        ? signFreeAgent(career, player.id, years)
        : buyAtFee(career, player.id, call.fee, years);
  if (!r.ok) return done('declined', callFill(career, call, text.failed).replace('{reason}', r.message));
  day.deals.push({ dir: call.kind === 'lateBid' ? 'out' : 'in', playerId: player.id, name: playerName(player), teamId: call.teamId, fee: call.fee, hour: day.hour });
  done('accepted', callFill(career, call, text.accepted));
}

function lapse(career: Career, day: DeadlineDay, call: DeadlineCall): void {
  const player = call.playerId ? career.season.league.players[call.playerId] : undefined;
  if (call.kind === 'hijack' && player) {
    rivalSigns(career, day, call, player, true);
    return;
  }
  call.status = 'lapsed';
  if (call.kind === 'flavour') {
    call.result = callFill(career, call, X.flavour[call.variant % X.flavour.length].noResult);
  } else {
    call.result = callFill(career, call, textOf(call.kind)?.lapsed ?? '');
  }
  day.log.push({ hour: day.hour, text: call.result });
}

/** A hijack the owner let go: the rival signs him, if the deal still stands. */
function rivalSigns(career: Career, day: DeadlineDay, call: DeadlineCall, player: Player, lapsed = false): void {
  const league = career.season.league;
  const rival = call.rivalId ? teamById(league, call.rivalId) : null;
  const seller = call.teamId ? teamById(league, call.teamId) : null;
  const stands =
    rival &&
    seller &&
    player.teamId === seller.id &&
    seller.playerIds.length > C.transfers.minSquad &&
    rival.playerIds.length < C.transfers.maxSquad &&
    career.books[rival.id].cash >= call.rivalFee;
  call.status = lapsed ? 'lapsed' : 'declined';
  if (stands) {
    aiTransfer(career, player, rival, call.rivalFee, careerRng(career, `deadline-hijack:${call.id}`));
    noteElsewhere(day, { name: playerName(player), fromId: seller.id, toId: rival.id, fee: call.rivalFee });
    call.result = callFill(career, call, lapsed ? X.hijack.lapsed : X.hijack.declined);
  } else {
    call.result = callFill(career, call, X.hijack.gone);
  }
  day.log.push({ hour: day.hour, text: call.result });
}

// ---------------------------------------------------------------------------
// Text and the war room view
// ---------------------------------------------------------------------------

type CallText = { title: string[]; text: string[]; yes: string; no: string; more?: string; accepted: string; declined: string; lapsed: string; failed: string };

function textOf(kind: DeadlineKind): CallText | null {
  return kind === 'flavour' ? null : (X[kind] as CallText);
}

function fillVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function callFill(career: Career, call: DeadlineCall, text: string): string {
  const league = career.season.league;
  const p = call.playerId ? league.players[call.playerId] : undefined;
  const team = (id: string | null) => (id ? (league.teams.find((t) => t.id === id)?.shortName ?? 'A club') : 'A club');
  return fillVars(text, {
    player: p ? playerName(p) : 'the player',
    first: p ? p.firstName : 'He',
    pos: p ? p.position : '',
    club: team(call.teamId),
    rival: team(call.rivalId),
    fee: money(call.kind === 'hijack' ? call.rivalFee : call.fee),
    beat: money(call.fee),
    wage: p ? money(wageDemand(career, p, career.userTeamId)) : '',
    person: call.person,
    short: userTeam(career).shortName,
    coach: staffName(career, 'headCoach') ?? 'The head coach',
    hour: hourLabel(call.hour),
  });
}

export interface DeadlineCallView {
  id: string;
  kind: DeadlineKind;
  title: string;
  text: string;
  /** "09:00". */
  time: string;
  /** Hours left before it lapses (open calls). */
  hoursLeft: number;
  choices: { id: DeadlineChoice; label: string }[];
  status: DeadlineCall['status'];
  result: string | null;
  byStaff: boolean;
}

export interface DeadlineBoard {
  cash: number;
  /** Most you can pay in fees (cash, or the lenders' cap). */
  maxFee: number;
  /** Payroll room under the wage cap (negative when over). */
  wageRoom: number;
  squad: number;
  maxSquad: number;
  minSquad: number;
  ins: string[];
  outs: string[];
  /** Players on offer in open calls. */
  targets: { name: string; pos: string; club: string; fee: number; overall: number }[];
}

export interface DeadlineView {
  key: string;
  time: string;
  hour: number;
  endHour: number;
  hoursLeft: number;
  closed: boolean;
  calls: DeadlineCallView[];
  log: { time: string; text: string }[];
  board: DeadlineBoard;
}

function callView(career: Career, day: DeadlineDay, call: DeadlineCall): DeadlineCallView {
  let title: string;
  let text: string;
  let choices: DeadlineCallView['choices'];
  if (call.kind === 'flavour') {
    const f = X.flavour[call.variant % X.flavour.length];
    title = f.title;
    text = f.text;
    choices = [
      { id: 'yes', label: f.yes },
      { id: 'no', label: f.no },
    ];
  } else {
    const t = textOf(call.kind)!;
    title = t.title[call.variant % t.title.length];
    text = t.text[call.variant % t.text.length];
    choices = [{ id: 'yes', label: t.yes }];
    if (t.more && !call.raised) choices.push({ id: 'more', label: t.more });
    choices.push({ id: 'no', label: t.no });
  }
  return {
    id: call.id,
    kind: call.kind,
    title: callFill(career, call, title),
    text: callFill(career, call, text),
    time: hourLabel(call.hour),
    hoursLeft: Math.max(0, call.expires - day.hour),
    choices: choices.map((c) => ({ id: c.id, label: callFill(career, call, c.label) })),
    status: call.status,
    result: call.result,
    byStaff: call.byStaff,
  };
}

/** The whiteboard: money, wage room, squad size, today's business and who is on offer. */
export function deadlineBoard(career: Career): DeadlineBoard {
  const day = career.deadline;
  const league = career.season.league;
  const squad = squadOf(career, career.userTeamId).length;
  const deals = day?.deals ?? [];
  const label = (d: (typeof deals)[number]) => `${d.name} (${d.fee > 0 ? money(d.fee) : 'free'})`;
  const targets = (day && !day.closed ? day.calls : [])
    .filter((c) => c.status === 'open' && c.kind !== 'lateBid' && c.kind !== 'flavour' && c.playerId)
    .map((c) => {
      const p = league.players[c.playerId!];
      return { name: playerName(p), pos: p.position, club: c.teamId ? teamById(league, c.teamId).shortName : 'Free agent', fee: c.fee, overall: p.overall };
    });
  return {
    cash: userBooks(career).cash,
    maxFee: canPay(career),
    wageRoom: C.wageCap.cap - playerPayroll(career, career.userTeamId),
    squad,
    maxSquad: C.transfers.maxSquad,
    minSquad: C.transfers.userMinSquad,
    ins: deals.filter((d) => d.dir === 'in').map(label),
    outs: deals.filter((d) => d.dir === 'out').map(label),
    targets,
  };
}

/** What the war room shows: the clock, the calls (waiting ones first) and the whiteboard. */
export function deadlineView(career: Career): DeadlineView | null {
  const day = career.deadline;
  if (!day || day.key !== deadlineKey(career)) return null;
  const order = (s: DeadlineCall['status']) => (s === 'open' ? 0 : 1);
  const calls = day.calls
    .map((c, i) => ({ c, i }))
    .sort((a, b) => order(a.c.status) - order(b.c.status) || b.i - a.i)
    .map(({ c }) => callView(career, day, c));
  return {
    key: day.key,
    time: hourLabel(day.hour),
    hour: day.hour,
    endHour: T.endHour,
    hoursLeft: Math.max(0, T.endHour - day.hour),
    closed: day.closed,
    calls,
    log: day.log.slice().reverse().map((l) => ({ time: hourLabel(l.hour), text: l.text })),
    board: deadlineBoard(career),
  };
}

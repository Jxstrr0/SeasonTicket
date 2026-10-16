/**
 * The stadium builder. Every club owns a ground made of four stands, four
 * corners and a handful of club-wide upgrades. Building is paid for up front
 * and takes weeks; work on a stand during the season closes some of its
 * seats, so the smart time to build is the summer. Capacity, gate money,
 * hospitality, TV, sponsor and merchandise money, crowds and the stadium's
 * condition all read from here.
 *
 * Crowds come from demand, not from capacity: a bigger ground only fills if
 * enough people want to come, and demand grows with happy fans and trophies.
 */
import { STADIUM_TUNING } from '../data';
import { teamById } from '../league';
import { hashString } from '../rng';
import type { Team } from '../types';
import {
  CORNER_IDS,
  STAND_IDS,
  UPGRADE_IDS,
  type Career,
  type CornerId,
  type ProjectKind,
  type Stadium,
  type StadiumLook,
  type StadiumProject,
  type StandId,
  type UpgradeId,
} from './types';
import { C, addInbox, clamp, money, nextId, spend } from './util';

export const S = STADIUM_TUNING;

type Result = { ok: boolean; message: string };
const ok = (message: string): Result => ({ ok: true, message });
const fail = (message: string): Result => ({ ok: false, message });

/** The two stands each corner joins. */
export const CORNER_STANDS: Record<CornerId, [StandId, StandId]> = {
  ne: ['north', 'east'],
  se: ['south', 'east'],
  sw: ['south', 'west'],
  nw: ['north', 'west'],
};

export const CORNER_NAMES: Record<CornerId, string> = {
  ne: 'North-east corner',
  se: 'South-east corner',
  sw: 'South-west corner',
  nw: 'North-west corner',
};

export const MAX_STAND_LEVEL = S.stands.levels.length - 1;
export const MAX_CORNER_LEVEL = S.corners.levels.length - 1;
export const MAX_ROOF_LEVEL = S.roof.levels.length - 1;

export function isEnd(id: StandId): boolean {
  return id === 'north' || id === 'south';
}

export function standName(id: StandId): string {
  return S.stands.names[id];
}

export function standLevelName(level: number): string {
  return S.stands.levels[clamp(level, 0, MAX_STAND_LEVEL)].name;
}

export function upgradeDef(id: UpgradeId) {
  return S.upgrades[id];
}

export function maxUpgradeLevel(id: UpgradeId): number {
  return S.upgrades[id].cost.length;
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export function standSeatsAt(id: StandId, level: number): number {
  const base = S.stands.levels[clamp(level, 0, MAX_STAND_LEVEL)].seats;
  return Math.round((isEnd(id) ? base * S.stands.endScale : base) / 100) * 100;
}

export function cornerSeatsAt(level: number): number {
  return S.corners.levels[clamp(level, 0, MAX_CORNER_LEVEL)].seats;
}

export function boxesPerRow(id: StandId): number {
  return isEnd(id) ? S.boxes.perRowEnd : S.boxes.perRowSide;
}

export function standSeats(stadium: Stadium, id: StandId): number {
  return standSeatsAt(id, stadium.stands[id].level);
}

export function totalBoxes(stadium: Stadium): number {
  return STAND_IDS.reduce((n, id) => n + stadium.stands[id].boxRows * boxesPerRow(id), 0);
}

/** Every seat in the ground, ignoring building work. */
export function fullCapacity(stadium: Stadium): number {
  let seats = 0;
  for (const id of STAND_IDS) seats += standSeats(stadium, id);
  for (const id of CORNER_IDS) seats += cornerSeatsAt(stadium.corners[id]);
  return seats;
}

function activeProjects(stadium: Stadium): StadiumProject[] {
  return stadium.projects.filter((p) => !p.queued);
}

/** Seats a project shuts on its stand while it runs in the season. Corners and club-wide work shut none. */
export function seatsClosedBy(stadium: Stadium, kind: ProjectKind, target: string): number {
  if (kind !== 'stand' && kind !== 'roof' && kind !== 'boxes') return 0;
  const share = kind === 'roof' ? S.stands.roofClosedShare : S.stands.closedShare;
  return Math.round((standSeats(stadium, target as StandId) * share) / 100) * 100;
}

/** Seats shut by work on a stand, by stand. Only during the season: there are no home matches otherwise. */
export function closedSeatsByStand(stadium: Stadium, inSeason: boolean): Partial<Record<StandId, number>> {
  const out: Partial<Record<StandId, number>> = {};
  if (!inSeason) return out;
  for (const p of activeProjects(stadium)) {
    const seats = seatsClosedBy(stadium, p.kind, p.target);
    if (seats <= 0) continue;
    const id = p.target as StandId;
    out[id] = Math.max(out[id] ?? 0, seats);
  }
  return out;
}

export function closedSeats(stadium: Stadium, inSeason: boolean): number {
  return Object.values(closedSeatsByStand(stadium, inSeason)).reduce((a, b) => a + (b ?? 0), 0);
}

/** Seats on sale right now. */
export function openCapacity(career: Career, teamId: string): number {
  const stadium = career.stadiums[teamId];
  return fullCapacity(stadium) - closedSeats(stadium, career.phase === 'season');
}

/** Copies the ground's open seats onto the team, where the match day and the books read it. */
export function syncCapacity(career: Career, teamId: string): void {
  teamById(career.season.league, teamId).stadiumCapacity = openCapacity(career, teamId);
}

/** Share of all seats under a roof. A corner counts as covered as far as both its neighbours are. */
export function coveredShare(stadium: Stadium): number {
  const cover = (id: StandId) => S.roof.levels[stadium.stands[id].roof].cover;
  let covered = 0;
  for (const id of STAND_IDS) covered += standSeats(stadium, id) * cover(id);
  for (const id of CORNER_IDS) {
    const [a, b] = CORNER_STANDS[id];
    covered += cornerSeatsAt(stadium.corners[id]) * Math.min(cover(a), cover(b));
  }
  const total = fullCapacity(stadium);
  return total > 0 ? covered / total : 0;
}

// ---------------------------------------------------------------------------
// What the ground earns
// ---------------------------------------------------------------------------

export function tvBonus(stadium: Stadium): number {
  return stadium.upgrades.floodlights * S.upgrades.floodlights.tvPerLevel;
}

export function sponsorMultiplier(stadium: Stadium): number {
  const u = stadium.upgrades;
  return 1 + u.videoBoard * S.upgrades.videoBoard.sponsorPerLevel + u.signage * S.upgrades.signage.sponsorPerLevel;
}

export function merchandiseMultiplier(stadium: Stadium): number {
  return 1 + stadium.upgrades.shop * S.upgrades.shop.merchandisePerLevel;
}

/** Extra food-and-drink money per fan from better concourses. */
export function concessionsBonus(stadium: Stadium): number {
  return stadium.upgrades.concourse * S.upgrades.concourse.concessionsPerLevel;
}

export function boxOccupancy(team: Team): number {
  const o = S.boxes.occupancy;
  return clamp(o.base + o.perMarket * team.marketSize + o.perMood * team.fanMood, o.min, o.max);
}

/** Hospitality money from the boxes for one home match. */
export function hospitalityPerMatch(team: Team, stadium: Stadium): number {
  return totalBoxes(stadium) * S.boxes.pricePerMatch * (0.5 + team.marketSize) * boxOccupancy(team);
}

export function boxUpkeep(stadium: Stadium): number {
  return totalBoxes(stadium) * S.boxes.upkeepPerBox;
}

/**
 * The share of open seats filled. The engine's share (fans, market,
 * condition, opponent) is scaled by demand over capacity, then the roof and
 * the video board add a little.
 */
export function stadiumAttendance(career: Career, home: Team, engineShare: number): number {
  const stadium = career.stadiums[home.id];
  if (!stadium) return engineShare;
  const capacity = Math.max(1, home.stadiumCapacity);
  const share =
    engineShare * (stadium.demand / capacity) +
    S.roof.attendanceBonus * coveredShare(stadium) +
    S.demand.videoBoardAttendance * stadium.upgrades.videoBoard;
  return clamp(share, C.tickets.minShare, 1);
}

// ---------------------------------------------------------------------------
// A new ground
// ---------------------------------------------------------------------------

function emptyStadium(demand: number): Stadium {
  const stand = () => ({ level: 0, roof: 0, boxRows: 0 });
  return {
    stands: { west: stand(), north: stand(), east: stand(), south: stand() },
    corners: { nw: 0, ne: 0, se: 0, sw: 0 },
    upgrades: { floodlights: 0, videoBoard: 0, signage: 0, concourse: 0, shop: 0, pitch: 0 },
    look: { seats: 'primary', mow: 'stripes', roof: 'white' },
    projects: [],
    demand,
    startDemand: demand,
  };
}

/**
 * The ground a club starts with: stands raised one level at a time, lowest
 * first, as close to its listed capacity as the stand sizes allow. Roofs,
 * boxes and upgrades follow the club's money. Same club, same ground.
 */
export function initialStadium(team: Team): Stadium {
  const target = team.stadiumCapacity;
  const stadium = emptyStadium(target);
  const overshoot = 600;
  type Move = { rank: number; apply: () => void; undo: () => void };
  for (;;) {
    const moves: Move[] = [];
    STAND_IDS.forEach((id, order) => {
      const s = stadium.stands[id];
      if (s.level >= MAX_STAND_LEVEL) return;
      moves.push({ rank: s.level * 10 + order, apply: () => (s.level += 1), undo: () => (s.level -= 1) });
    });
    CORNER_IDS.forEach((id, order) => {
      const level = stadium.corners[id];
      if (level >= MAX_CORNER_LEVEL || !cornerAllowed(stadium, id, level + 1)) return;
      moves.push({ rank: (level + 2) * 10 + 5 + order, apply: () => (stadium.corners[id] += 1), undo: () => (stadium.corners[id] -= 1) });
    });
    moves.sort((a, b) => a.rank - b.rank);
    let moved = false;
    for (const m of moves) {
      m.apply();
      if (fullCapacity(stadium) <= target + overshoot) {
        moved = true;
        break;
      }
      m.undo();
    }
    if (!moved) break;
  }

  const f = team.finances;
  for (const id of STAND_IDS) {
    const s = stadium.stands[id];
    if (s.level < S.roof.needsStand) continue;
    if (id === 'west') s.roof = f > 0.45 || s.level >= 3 ? 2 : 1;
    else if (s.level >= 2) s.roof = f > 0.65 ? 2 : 1;
    else s.roof = f > 0.5 ? 1 : 0;
  }
  const west = stadium.stands.west;
  if (west.level >= S.boxes.rowNeedsStand[0]) west.boxRows = f > 0.6 && west.level >= S.boxes.rowNeedsStand[1] ? 2 : 1;
  const east = stadium.stands.east;
  if (east.level >= S.boxes.rowNeedsStand[1] && f > 0.7) east.boxRows = 1;

  const u = stadium.upgrades;
  u.floodlights = f > 0.6 ? 1 : 0;
  u.videoBoard = f > 0.5 ? 1 : 0;
  u.concourse = f > 0.7 ? 1 : 0;
  u.shop = team.marketSize > 0.6 ? 1 : 0;
  u.pitch = team.stadiumCondition > 0.6 ? 1 : 0;

  const h = hashString(team.id);
  const L = S.look;
  stadium.look = {
    seats: L.seatSchemes[h % 3] as StadiumLook['seats'],
    mow: L.mowPatterns[(h >>> 4) % L.mowPatterns.length] as StadiumLook['mow'],
    roof: L.roofColours[(h >>> 8) % L.roofColours.length] as StadiumLook['roof'],
  };
  return stadium;
}

/** A ground for every club, with capacities synced onto the teams. */
export function createStadiums(career: Career): void {
  career.stadiums = {};
  for (const team of career.season.league.teams) {
    career.stadiums[team.id] = initialStadium(team);
    syncCapacity(career, team.id);
  }
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export interface StadiumOption {
  /** `${kind}:${target}`, what the UI sends back to order it. */
  key: string;
  kind: ProjectKind;
  target: string;
  toLevel: number;
  title: string;
  detail: string;
  cost: number;
  weeks: number;
  seatsAdded: number;
  boxesAdded: number;
  available: boolean;
  reason: string | null;
}

function cornerAllowed(stadium: Stadium, id: CornerId, level: number): boolean {
  const need = S.corners.levels[level].needsStands;
  return CORNER_STANDS[id].every((s) => stadium.stands[s].level >= need);
}

function busyWith(stadium: Stadium, target: string): boolean {
  return stadium.projects.some((p) => p.target === target);
}

function seatsText(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toLocaleString('en-US')} seats`;
}

export function refurbishCost(stadium: Stadium): number {
  const c = S.condition;
  return Math.max(c.refurbishMinCost, Math.round((fullCapacity(stadium) * c.refurbishPerSeat) / 10_000) * 10_000);
}

/** Everything a club could build next, with the reason when it can't. */
export function stadiumOptions(career: Career, teamId = career.userTeamId): StadiumOption[] {
  const stadium = career.stadiums[teamId];
  const team = teamById(career.season.league, teamId);
  const books = career.books[teamId];
  const out: StadiumOption[] = [];
  const add = (o: Omit<StadiumOption, 'key' | 'available' | 'reason'>, blocked: string | null) => {
    let reason = blocked;
    if (!reason && busyWith(stadium, o.target)) reason = 'Work is already under way here.';
    if (!reason && activeOrQueued(stadium) >= S.projects.maxActive) reason = `The builders are busy: at most ${S.projects.maxActive} projects at once.`;
    if (!reason && teamId === career.userTeamId && career.ladder.level >= 3) reason = 'The spending lock forbids building.';
    if (!reason && books.cash < o.cost) reason = `Costs ${money(o.cost)}; you have ${money(Math.max(0, books.cash))}.`;
    out.push({ ...o, key: `${o.kind}:${o.target}`, available: reason === null, reason });
  };

  for (const id of STAND_IDS) {
    const s = stadium.stands[id];
    if (s.level < MAX_STAND_LEVEL) {
      const next = s.level + 1;
      const L = S.stands.levels[next];
      const seats = standSeatsAt(id, next) - standSeatsAt(id, s.level);
      add(
        { kind: 'stand', target: id, toLevel: next, title: `Rebuild as ${L.name.toLowerCase()}`, detail: seatsText(seats), cost: seats * L.costPerSeat + L.flat, weeks: L.weeks, seatsAdded: seats, boxesAdded: 0 },
        null,
      );
    }
    if (s.roof < MAX_ROOF_LEVEL) {
      const next = s.roof + 1;
      const R = S.roof.levels[next];
      add(
        { kind: 'roof', target: id, toLevel: next, title: R.name, detail: next === 1 ? 'Covers the back rows' : 'Covers every seat', cost: Math.round((standSeats(stadium, id) * R.costPerSeat + R.flat) / 10_000) * 10_000, weeks: R.weeks, seatsAdded: 0, boxesAdded: 0 },
        s.level < S.roof.needsStand ? `Needs a ${standLevelName(S.roof.needsStand).toLowerCase()} first.` : null,
      );
    }
    if (s.boxRows < S.boxes.maxRows) {
      const need = S.boxes.rowNeedsStand[s.boxRows];
      const n = boxesPerRow(id);
      add(
        { kind: 'boxes', target: id, toLevel: s.boxRows + 1, title: s.boxRows === 0 ? 'Executive boxes' : 'Second row of boxes', detail: `+${n} boxes`, cost: n * S.boxes.costPerBox, weeks: S.boxes.weeks, seatsAdded: 0, boxesAdded: n },
        s.level < need ? `Needs ${standLevelName(need).toLowerCase()} first.` : null,
      );
    }
  }

  for (const id of CORNER_IDS) {
    const level = stadium.corners[id];
    if (level >= MAX_CORNER_LEVEL) continue;
    const L = S.corners.levels[level + 1];
    const seats = L.seats - cornerSeatsAt(level);
    const [a, b] = CORNER_STANDS[id];
    add(
      { kind: 'corner', target: id, toLevel: level + 1, title: L.name, detail: seatsText(seats), cost: L.cost, weeks: L.weeks, seatsAdded: seats, boxesAdded: 0 },
      cornerAllowed(stadium, id, level + 1) ? null : `Needs the ${standName(a)} and ${standName(b)} at ${standLevelName(L.needsStands).toLowerCase()} or bigger.`,
    );
  }

  for (const id of UPGRADE_IDS) {
    const level = stadium.upgrades[id];
    const def = S.upgrades[id];
    if (level >= def.cost.length) continue;
    add({ kind: 'upgrade', target: id, toLevel: level + 1, title: `${def.name} level ${level + 1}`, detail: def.about, cost: def.cost[level], weeks: def.weeks[level], seatsAdded: 0, boxesAdded: 0 }, null);
  }

  if (team.stadiumCondition < S.condition.max - 0.05) {
    add(
      { kind: 'refurbish', target: 'ground', toLevel: 1, title: 'Refurbish the ground', detail: `Condition +${Math.round(S.condition.restore * 100)}`, cost: refurbishCost(stadium), weeks: S.condition.refurbishWeeks, seatsAdded: 0, boxesAdded: 0 },
      null,
    );
  }
  return out;
}

function activeOrQueued(stadium: Stadium): number {
  return stadium.projects.length;
}

/** Weeks of building left before the next home league match, so the UI can warn about closed seats. */
export function freeWeeksBeforeSeason(career: Career): number {
  if (career.phase === 'preseason') return C.calendar.preseasonWeeks - career.preseasonWeek + 1;
  return 0;
}

function startProject(career: Career, teamId: string, option: StadiumOption, queued: boolean): StadiumProject {
  const project: StadiumProject = {
    id: nextId(career, 'sp'),
    kind: option.kind,
    target: option.target,
    toLevel: option.toLevel,
    weeks: option.weeks,
    weeksLeft: option.weeks,
    cost: option.cost,
    queued,
  };
  career.stadiums[teamId].projects.push(project);
  spend(career.books[teamId], 'upgrades', option.cost);
  syncCapacity(career, teamId);
  return project;
}

/**
 * Pays for a project on the user's ground. During the season it can start
 * now (closing seats on that stand while the work goes on) or wait for the
 * summer; in the pre-season it always starts now.
 */
export function orderProject(career: Career, key: string, when: 'now' | 'summer' = 'now'): Result {
  if (career.phase !== 'preseason' && career.phase !== 'season') return fail('Building opens again in the pre-season.');
  const option = stadiumOptions(career).find((o) => o.key === key);
  if (!option) return fail('That is not on the plans.');
  if (!option.available) return fail(option.reason ?? 'Not available.');
  const queued = career.phase === 'season' && when === 'summer';
  startProject(career, career.userTeamId, option, queued);
  const what = projectLabel(option.kind, option.target, option.toLevel);
  return ok(queued ? `${what}: paid ${money(option.cost)}. Work starts in the off-season.` : `${what}: work starts now, ${option.weeks} weeks.`);
}

/** A project waiting for the summer can be called off for a full refund. */
export function cancelProject(career: Career, projectId: string): Result {
  const stadium = career.stadiums[career.userTeamId];
  const project = stadium.projects.find((p) => p.id === projectId);
  if (!project) return fail('No such project.');
  if (!project.queued) return fail('The builders have started; it can no longer be called off.');
  stadium.projects = stadium.projects.filter((p) => p !== project);
  spend(career.books[career.userTeamId], 'upgrades', -project.cost);
  return ok(`${projectLabel(project.kind, project.target, project.toLevel)} called off. ${money(project.cost)} refunded.`);
}

/** Moves a summer project forward to start now. */
export function startQueuedNow(career: Career, projectId: string): Result {
  const stadium = career.stadiums[career.userTeamId];
  const project = stadium.projects.find((p) => p.id === projectId);
  if (!project || !project.queued) return fail('Nothing waiting to start.');
  project.queued = false;
  syncCapacity(career, career.userTeamId);
  return ok(`${projectLabel(project.kind, project.target, project.toLevel)}: work starts now.`);
}

export function projectLabel(kind: ProjectKind, target: string, toLevel: number): string {
  switch (kind) {
    case 'stand':
      return `${standName(target as StandId)} as ${standLevelName(toLevel).toLowerCase()}`;
    case 'roof':
      return `${S.roof.levels[toLevel].name} on the ${standName(target as StandId)}`;
    case 'boxes':
      return `${toLevel === 1 ? 'Boxes' : 'Second box row'} in the ${standName(target as StandId)}`;
    case 'corner':
      return `${CORNER_NAMES[target as CornerId]}: ${S.corners.levels[toLevel].name.toLowerCase()}`;
    case 'upgrade':
      return `${S.upgrades[target as UpgradeId].name} level ${toLevel}`;
    case 'refurbish':
      return 'Refurbishment';
  }
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function complete(career: Career, teamId: string, project: StadiumProject): void {
  const stadium = career.stadiums[teamId];
  const team = teamById(career.season.league, teamId);
  const books = career.books[teamId];
  const cond = S.condition;
  const bumpCondition = (amount: number) => (team.stadiumCondition = clamp(team.stadiumCondition + amount, 0, cond.max));
  const before = fullCapacity(stadium);
  switch (project.kind) {
    case 'stand': {
      const s = stadium.stands[project.target as StandId];
      s.level = Math.max(s.level, project.toLevel);
      bumpCondition(S.stands.conditionOnComplete);
      break;
    }
    case 'roof':
      stadium.stands[project.target as StandId].roof = Math.max(stadium.stands[project.target as StandId].roof, project.toLevel);
      break;
    case 'boxes':
      stadium.stands[project.target as StandId].boxRows = Math.max(stadium.stands[project.target as StandId].boxRows, project.toLevel);
      break;
    case 'corner':
      stadium.corners[project.target as CornerId] = Math.max(stadium.corners[project.target as CornerId], project.toLevel);
      bumpCondition(S.stands.conditionOnComplete);
      break;
    case 'upgrade': {
      const id = project.target as UpgradeId;
      stadium.upgrades[id] = Math.max(stadium.upgrades[id], project.toLevel);
      if (id === 'concourse') bumpCondition(S.upgrades.concourse.conditionPerLevel);
      if (id === 'pitch') bumpCondition(S.upgrades.pitch.conditionPerLevel);
      if (id === 'videoBoard') {
        const lift = S.upgrades.videoBoard.fanMoodPerLevel;
        books.baseFanMood = clamp(books.baseFanMood + lift, C.fans.min, C.fans.max);
        team.fanMood = clamp(team.fanMood + lift, C.fans.min, C.fans.max);
      }
      break;
    }
    case 'refurbish':
      bumpCondition(cond.restore);
      break;
  }
  stadium.projects = stadium.projects.filter((p) => p !== project);
  if (teamId === career.userTeamId) {
    const added = fullCapacity(stadium) - before;
    const seats = added > 0 ? ` The ground now holds ${fullCapacity(stadium).toLocaleString('en-US')} (${seatsText(added)}).` : '';
    addInbox(career, 'stadium', 'Building work finished', `${projectLabel(project.kind, project.target, project.toLevel)} is done.${seats}`);
  }
}

function progress(career: Career, teamId: string, weeks: number): void {
  const stadium = career.stadiums[teamId];
  for (const project of activeProjects(stadium)) {
    project.weeksLeft -= weeks;
    if (project.weeksLeft <= 0) complete(career, teamId, project);
  }
  syncCapacity(career, teamId);
}

/** One week of building at every ground. Call after the week's matches and any phase change. */
export function weeklyStadium(career: Career): void {
  for (const team of career.season.league.teams) progress(career, team.id, 1);
}

/** The average share of seats filled at a club's home league matches this season. */
export function averageHomeCrowd(career: Career, teamId: string): number {
  let sum = 0;
  let n = 0;
  for (const m of career.season.schedule.matches) {
    if (m.homeId !== teamId || !m.result) continue;
    sum += m.result.attendanceShare;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

function updateDemand(career: Career, team: Team, stadium: Stadium): void {
  const D = S.demand;
  const state = career.season;
  let growth = D.moodGrowth * (team.fanMood - D.moodPivot);
  if (state.championId === team.id) growth += D.titleGrowth;
  if (state.shieldWinnerId === team.id) growth += D.titleGrowth;
  stadium.demand = Math.round(clamp(stadium.demand * (1 + growth), stadium.startDemand * D.minOfStart, stadium.startDemand * D.maxOfStart));
}

/** An AI club's summer project: refurbish a tired ground, else build where the crowds are turned away, else add a roof. */
function aiPlan(career: Career, team: Team): StadiumOption | null {
  const A = S.ai;
  const cash = career.books[team.id].cash;
  const options = stadiumOptions(career, team.id).filter((o) => o.available);
  const affordable = (o: StadiumOption, times: number) => cash >= o.cost * times;
  if (team.stadiumCondition < A.refurbishBelow) {
    const refurb = options.find((o) => o.kind === 'refurbish' && affordable(o, 1.5));
    if (refurb) return refurb;
  }
  if (averageHomeCrowd(career, team.id) >= A.fullShare) {
    const build = options
      .filter((o) => (o.kind === 'stand' || o.kind === 'corner') && affordable(o, A.cashMultiple))
      .sort((a, b) => a.cost / a.seatsAdded - b.cost / b.seatsAdded)[0];
    if (build) return build;
  }
  const roof = options.filter((o) => o.kind === 'roof' && affordable(o, A.cashMultiple * 2)).sort((a, b) => a.cost - b.cost)[0];
  return roof ?? null;
}

/**
 * The summer, run once between seasons: grounds wear, demand moves with the
 * fans, AI clubs pick a project, and every project gets the summer's weeks.
 */
export function summerStadium(career: Career): void {
  const S_ = S;
  for (const team of career.season.league.teams) {
    const stadium = career.stadiums[team.id];
    team.stadiumCondition = clamp(team.stadiumCondition - S_.condition.decayPerSeason, 0, S_.condition.max);
    updateDemand(career, team, stadium);
    if (team.id !== career.userTeamId) {
      const plan = aiPlan(career, team);
      if (plan) startProject(career, team.id, plan, false);
    }
    for (const p of stadium.projects) p.queued = false;
    progress(career, team.id, S_.projects.summerWeeks);
  }
}

/** Free, instant branding choices for the user's ground. */
export function setStadiumLook(career: Career, patch: Partial<StadiumLook>): Result {
  const look = career.stadiums[career.userTeamId].look;
  const L = S.look;
  if (patch.seats && (L.seatSchemes as string[]).includes(patch.seats)) look.seats = patch.seats;
  if (patch.mow && (L.mowPatterns as string[]).includes(patch.mow)) look.mow = patch.mow;
  if (patch.roof && (L.roofColours as string[]).includes(patch.roof)) look.roof = patch.roof;
  return ok('The ground crew are on it.');
}

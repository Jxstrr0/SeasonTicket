/**
 * The offseason, run once when the owner leaves the season review: history,
 * contracts, retirements, player development, staff, youth intake, AI squad
 * upkeep, the free-agent pool, and then a fresh season.
 */
import { SEASON_TUNING } from '../data';
import { teamById } from '../league';
import { defaultNames, homeNationId, makeIdFactory } from '../names';
import { developPlayer, generatePlayer, recomputeDerived, wageFor } from '../players';
import { createSeason } from '../season';
import { generateStaffMember } from '../staff';
import type { Player, Position, StaffMember } from '../types';
import { STAFF_ROLES } from '../types';
import { ensureHeadCoach, makeSponsorOffers, refillStaffPool, staffInRole, tickNamingRights } from './club';
import { endLoans, generateFreeAgent, movePlayer } from './market';
import { repairSelection } from './selection';
import { summerStadium } from './stadium';
import type { Career, SeasonHistoryEntry } from './types';
import { C, addInbox, careerRng, clamp, emptyLedger, ledgerTotals, playerName, squadOf, userBooks, userTeam } from './util';

/** Coaching quality used when a club has nobody in a coaching role. */
const DEFAULT_COACHING = 0.4;
/** Free agents train on their own. */
const FREE_AGENT_COACHING = 0.3;

const FILL_POSITIONS: Position[] = ['GK', 'CB', 'CB', 'FB', 'DM', 'CM', 'CM', 'AM', 'W', 'ST'];

export function continueToNextSeason(career: Career): void {
  if (career.phase !== 'review') return;
  career.history.push(historyEntry(career));
  endLoans(career);
  tickNamingRights(career);
  tickSponsor(career);
  runContracts(career);
  retirePlayers(career);
  developAll(career);
  runStaffYear(career);
  youthIntake(career);
  upkeepAiSquads(career);
  refreshFreeAgentPool(career);
  refillStaffPool(career);
  recomputeSquadQuality(career);
  summerStadium(career);
  startNewSeason(career);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function historyEntry(career: Career): SeasonHistoryEntry {
  const state = career.season;
  const league = state.league;
  const id = career.userTeamId;
  const index = state.standings.findIndex((r) => r.teamId === id);
  const books = userBooks(career);
  const nameOf = (teamId: string | null) => (teamId ? teamById(league, teamId).shortName : null);

  let best: { name: string; goals: number } | null = null;
  for (const [playerId, line] of Object.entries(career.playerSeason)) {
    const p = league.players[playerId];
    if (!p || line.goals === 0) continue;
    if (!best || line.goals > best.goals) best = { name: playerName(p), goals: line.goals };
  }

  return {
    season: league.season,
    position: index + 1,
    points: state.standings[index]?.points ?? 0,
    championName: nameOf(state.championId),
    shieldName: nameOf(state.shieldWinnerId),
    playoff: playoffStage(career),
    profit: ledgerTotals(books.ledger).profit,
    cashAtEnd: books.cash,
    topScorer: best,
  };
}

function playoffStage(career: Career): SeasonHistoryEntry['playoff'] {
  const bracket = career.season.bracket;
  const id = career.userTeamId;
  if (!bracket) return 'none';
  const inMatch = (m: { homeId: string; awayId: string }) => m.homeId === id || m.awayId === id;
  if (bracket.championId === id) return 'champion';
  if (bracket.final && inMatch(bracket.final)) return 'runnerUp';
  if (bracket.semiFinals.some(inMatch)) return 'semiFinal';
  if (bracket.quarterFinals.some(inMatch)) return 'quarterFinal';
  if (bracket.seeds.slice(0, 2).includes(id)) return 'bye';
  return 'none';
}

// ---------------------------------------------------------------------------
// Deals running down
// ---------------------------------------------------------------------------

function tickSponsor(career: Career): void {
  const books = userBooks(career);
  const deal = books.sponsor;
  if (!deal) return;
  deal.yearsLeft -= 1;
  if (deal.yearsLeft <= 0) {
    books.sponsor = null;
    addInbox(career, 'finance', 'Shirt deal over', `${deal.brand} have come to the end of their deal. New offers are waiting in Club.`);
  }
}

/** A year off every contract. AI clubs keep their useful players; everyone else at zero becomes a free agent. */
function runContracts(career: Career): void {
  const league = career.season.league;
  const A = C.aiSquads;
  const rng = careerRng(career, 'renewals');
  const leaving: string[] = [];
  for (const team of league.teams) {
    const squad = squadOf(career, team.id);
    const ranked = squad.slice().sort((a, b) => b.overall - a.overall);
    for (const p of squad) p.contract.years -= 1;
    for (const p of squad) {
      if (p.contract.years > 0) continue;
      if (team.id === career.userTeamId) {
        leaving.push(playerName(p));
        movePlayer(career, p, null);
        p.contract.years = 0;
        continue;
      }
      if (ranked.indexOf(p) < A.renewIfRank && p.age <= A.renewMaxAge) {
        p.contract = { wage: wageFor(p), years: rng.int(1, 3) };
      } else {
        movePlayer(career, p, null);
        p.contract.years = 0;
      }
    }
  }
  if (leaving.length > 0) {
    addInbox(career, 'transfer', 'Contracts expired', `${leaving.join(', ')} ${leaving.length === 1 ? 'has' : 'have'} left as a free agent. Renew deals in their last year to keep players.`);
  }
}

function retirePlayers(career: Career): void {
  const league = career.season.league;
  const G = C.aging;
  const rng = careerRng(career, 'retire');
  const retired: string[] = [];
  for (const p of Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (p.age < G.startAge) continue;
    const chance = G.chanceAtStart + G.chancePerYear * (p.age - G.startAge);
    if (p.age < G.forcedAge && !rng.chance(chance)) continue;
    if (p.teamId === career.userTeamId) retired.push(playerName(p));
    if (p.teamId) movePlayer(career, p, null);
    league.freeAgentIds = league.freeAgentIds.filter((id) => id !== p.id);
    delete league.players[p.id];
    delete career.playerSeason[p.id];
  }
  if (retired.length > 0) {
    addInbox(career, 'season', 'Retirements', `${retired.join(', ')} ${retired.length === 1 ? 'has' : 'have'} hung up the boots.`);
  }
}

// ---------------------------------------------------------------------------
// Players and staff get a year older
// ---------------------------------------------------------------------------

function coachingQuality(career: Career, teamId: string): number {
  const head = staffInRole(career, teamId, 'headCoach');
  const assistant = staffInRole(career, teamId, 'assistantCoach');
  const S = C.staff;
  const h = head ? head.rating / 100 : DEFAULT_COACHING;
  const a = assistant ? assistant.rating / 100 : DEFAULT_COACHING;
  return S.headCoachWeight * h + S.assistantWeight * a;
}

function developAll(career: Career): void {
  const league = career.season.league;
  const rng = careerRng(career, 'develop');
  const quality = new Map(league.teams.map((t) => [t.id, coachingQuality(career, t.id)]));
  const maxCondition = SEASON_TUNING.condition.max;
  for (const p of Object.values(league.players).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    developPlayer(rng, p, p.teamId ? quality.get(p.teamId) ?? DEFAULT_COACHING : FREE_AGENT_COACHING);
    p.age += 1;
    p.condition = maxCondition;
    p.form = [];
    recomputeDerived(p);
  }
}

function runStaffYear(career: Career): void {
  const league = career.season.league;
  const S = C.staff;
  const ids = makeIdFactory(league.nextId);
  const rng = careerRng(career, 'staff-year');
  for (const member of Object.values(league.staff).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    member.age += 1;
    if (member.age >= C.aging.staffRetireAge) {
      retireStaff(career, member);
      continue;
    }
    if (!member.teamId) continue;
    member.contract.years -= 1;
    if (member.contract.years <= 0) member.contract.years = S.autoRenewYears;
  }
  // AI clubs fill any role left empty.
  for (const team of league.teams) {
    if (team.id === career.userTeamId) continue;
    for (const role of STAFF_ROLES) {
      if (staffInRole(career, team.id, role)) continue;
      const member = generateStaffMember(rng, role, team.id, team.staffQuality, ids, defaultNames);
      league.staff[member.id] = member;
      team.staffIds.push(member.id);
    }
  }
  league.nextId = ids.current();
  ensureHeadCoach(career);
}

function retireStaff(career: Career, member: StaffMember): void {
  const league = career.season.league;
  if (member.teamId) {
    const team = teamById(league, member.teamId);
    team.staffIds = team.staffIds.filter((id) => id !== member.id);
    if (team.id === career.userTeamId) {
      addInbox(career, 'staff', 'Staff retirement', `${playerName(member)} has retired. Hire a replacement in Staff.`);
    }
  }
  career.staffPool = career.staffPool.filter((id) => id !== member.id);
  delete league.staff[member.id];
}

// ---------------------------------------------------------------------------
// Youth intake
// ---------------------------------------------------------------------------

function youthIntake(career: Career): void {
  const league = career.season.league;
  const Y = C.youth;
  const ids = makeIdFactory(league.nextId);
  for (const team of league.teams) {
    const rng = careerRng(career, `youth:${team.id}`);
    const level = clamp(career.books[team.id].academyLevel, 1, Y.intakeByLevel.length);
    const director = staffInRole(career, team.id, 'academyDirector');
    const directorShift = Y.directorQualityWeight * ((director ? director.rating / 100 : 0.5) - 0.5);
    const quality = clamp(Y.qualityByLevel[level - 1] + directorShift, 0.05, 0.95);
    const count = Y.intakeByLevel[level - 1];
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const position = rng.pick(FILL_POSITIONS);
      const age = rng.int(Y.age.min, Y.age.max);
      const p: Player = generatePlayer(rng, { position, nationality: homeNationId(), quality, age, tier: 'youth' }, ids, defaultNames);
      p.potential = Math.min(99, p.potential + Y.potentialBonus);
      p.contract = { wage: wageFor(p), years: Y.contractYears };
      recomputeDerived(p);
      league.players[p.id] = p;
      movePlayer(career, p, team.id);
      names.push(`${playerName(p)} (${p.position}, ${p.age})`);
    }
    if (team.id === career.userTeamId && names.length > 0) {
      addInbox(career, 'youth', 'Youth intake', `The academy has promoted ${names.join(', ')}. Check their potential in Squad.`);
    }
  }
  league.nextId = ids.current();
}

// ---------------------------------------------------------------------------
// AI squads and the free-agent pool
// ---------------------------------------------------------------------------

function goalkeeperCount(players: Player[]): number {
  return players.filter((p) => p.position === 'GK').length;
}

function upkeepAiSquads(career: Career): void {
  const league = career.season.league;
  const T = C.transfers;
  for (const team of league.teams) {
    if (team.id === career.userTeamId) continue;
    // Trim the weakest (never below two keepers).
    while (team.playerIds.length > T.maxSquad) {
      const squad = squadOf(career, team.id);
      const keepers = goalkeeperCount(squad);
      const cut = squad
        .filter((p) => p.position !== 'GK' || keepers > T.minGoalkeepers)
        .sort((a, b) => a.overall - b.overall || (a.id < b.id ? -1 : 1))[0];
      if (!cut) break;
      movePlayer(career, cut, null);
      cut.contract.years = 0;
    }
    // Fill from free agents, keepers first.
    for (let guard = 0; guard < 40 && team.playerIds.length < C.aiSquads.targetSize; guard++) {
      const squad = squadOf(career, team.id);
      const needGk = goalkeeperCount(squad) < T.minGoalkeepers;
      const pool = league.freeAgentIds
        .map((id) => league.players[id])
        .filter((p): p is Player => !!p && (!needGk || p.position === 'GK'))
        .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
      const pick = pool[0] ?? generateFreeAgent(career, needGk ? 'GK' : FILL_POSITIONS[guard % FILL_POSITIONS.length]);
      movePlayer(career, pick, team.id);
      pick.contract = { wage: wageFor(pick), years: pick.age < 30 ? 2 : 1 };
    }
  }
}

function refreshFreeAgentPool(career: Career): void {
  const league = career.season.league;
  const F = C.freeAgentPool;
  for (const id of league.freeAgentIds.slice()) {
    const p = league.players[id];
    if (p && p.age <= F.maxAge) continue;
    league.freeAgentIds = league.freeAgentIds.filter((x) => x !== id);
    delete league.players[id];
  }
  const rng = careerRng(career, 'fa-pool');
  while (league.freeAgentIds.length < F.target) {
    const quality = rng.float(0.15, 0.45);
    const p = generateFreeAgent(career, rng.pick(FILL_POSITIONS), quality);
    p.contract.years = 0;
  }
}

function recomputeSquadQuality(career: Career): void {
  const Q = C.squadQuality;
  for (const team of career.season.league.teams) {
    const best = squadOf(career, team.id)
      .map((p) => p.overall)
      .sort((a, b) => b - a)
      .slice(0, 11);
    if (best.length === 0) continue;
    const avg = best.reduce((a, b) => a + b, 0) / best.length;
    team.squadQuality = clamp(Q.baseQuality + Q.perPoint * (avg - Q.baseOverall), Q.min, Q.max);
  }
}

// ---------------------------------------------------------------------------
// The new season
// ---------------------------------------------------------------------------

function startNewSeason(career: Career): void {
  const league = career.season.league;
  league.season += 1;
  career.owner.fortune = Math.round(career.owner.fortune * (1 + C.owner.fortuneGrowth));
  for (const team of league.teams) {
    const books = career.books[team.id];
    books.lastLedger = books.ledger;
    books.ledger = emptyLedger();
    team.fanMood = clamp(team.fanMood + (books.baseFanMood - team.fanMood) * 0.5, C.fans.min, C.fans.max);
  }
  career.season = createSeason(league, undefined, { homegrownRule: career.homegrownRule });
  career.playerSeason = {};
  career.lastUserMatch = null;
  career.replays = { club: {}, round: {} };
  career.liveMatch = null;
  career.liveRecord = null;
  career.incomingBids = [];
  career.counters = {};
  career.phase = 'preseason';
  career.preseasonWeek = 1;
  if (career.userSelection) repairSelection(career, career.userSelection);
  if (!userBooks(career).sponsor) career.sponsorOffers = makeSponsorOffers(career);
  addInbox(career, 'season', `Season ${league.season} pre-season`, `Four weeks to sort the squad before ${userTeam(career).shortName} kick off. The transfer window is open.`);
}

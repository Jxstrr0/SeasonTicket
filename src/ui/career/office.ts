/**
 * Builds the plain snapshot the 3D office draws from. This is the only place
 * that reads the career for the office, so the render code never touches the
 * sim.
 */
import { C, LADDER_NAMES, coachSelection, money, playerPayroll, userBooks, userFixture, userTeam, type Career, type InboxKind } from '../../sim/career';
import { WORLD, formation as formationOf } from '../../sim/data';
import officeTuning from '../../data/tuning/office.json';
import type { OfficeSnapshot, OfficeTrophy, OfficeVisitorCall } from '../../render/office/types';
import { renderCrest } from '../views/career/crest';
import { careerWeekLabel, unreadCount } from '../views/career/hub';

interface GrowthLevel {
  level: number;
  seasons?: number;
  trophies?: number;
}

const GROWTH = officeTuning.growth.levels as GrowthLevel[];
const VISITOR_BY_KIND = officeTuning.visitors.byKind as Partial<Record<InboxKind, string>>;

/** Office level 0-3 from seasons completed and trophies won. */
export function officeLevel(seasons: number, trophies: number): number {
  let level = 0;
  for (const g of GROWTH) {
    if (seasons >= (g.seasons ?? 0) && trophies >= (g.trophies ?? 0)) level = Math.max(level, g.level);
  }
  return level;
}

export function officeTrophies(career: Career): OfficeTrophy[] {
  const out: OfficeTrophy[] = [];
  for (const h of career.history) {
    if (h.playoff === 'champion') out.push({ kind: 'cup', season: h.season });
    else if (h.playoff === 'runnerUp') out.push({ kind: 'runnerUp', season: h.season });
    if (h.position === 1) out.push({ kind: 'shield', season: h.season });
  }
  return out;
}

/** The newest unread message that brings someone to the office, if any. */
export function officeVisitor(career: Career): OfficeVisitorCall | null {
  for (let i = career.inbox.length - 1; i >= 0; i--) {
    const m = career.inbox[i];
    const role = VISITOR_BY_KIND[m.kind];
    if (!m.read && role) return { mailId: m.id, role, title: m.title };
  }
  return null;
}

function nextFixtureText(career: Career): string | null {
  if (career.phase === 'preseason') return 'Pre-season';
  const f = userFixture(career);
  if (!f) return null;
  const home = f.homeId === career.userTeamId;
  const opp = career.season.league.teams.find((t) => t.id === (home ? f.awayId : f.homeId));
  return `Next: ${home ? 'vs' : 'at'} ${opp?.shortName ?? '?'}`;
}

function selectionSlots(career: Career): { formation: string; slots: OfficeSnapshot['slots'] } {
  // With no saved pick (or the coach picking), the board shows the coach's plan.
  const sel = career.delegation.autoLineup || !career.userSelection ? coachSelection(career) : career.userSelection;
  const players = career.season.league.players;
  const f = formationOf(sel.tactics.formationId);
  return {
    formation: f.id,
    slots: f.slots.map((s, i) => {
      const p = players[sel.lineup.starters[i] ?? ''];
      return { x: s.x, y: s.y, label: s.label, name: p ? p.lastName : '' };
    }),
  };
}

export function buildOfficeSnapshot(career: Career): OfficeSnapshot {
  const team = userTeam(career);
  const books = userBooks(career);
  const standings = career.season.standings;
  const trophies = officeTrophies(career);
  const { formation, slots } = selectionSlots(career);
  const last = career.lastUserMatch;
  const attendance = last && last.homeId === career.userTeamId ? last.attendanceShare : 0.6;
  return {
    clubName: team.name,
    shortName: team.shortName,
    abbr: team.abbr,
    primary: team.colors.primary,
    secondary: team.colors.secondary,
    crestSvg: renderCrest(career.crest, 200).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '),
    leagueName: WORLD.league.name,
    weekLabel: careerWeekLabel(career),
    cash: money(books.cash),
    cashNegative: books.cash < 0,
    payroll: money(playerPayroll(career, career.userTeamId)),
    wageCap: money(C.wageCap.cap),
    ladderLabel: career.ladder.level > 0 ? LADDER_NAMES[career.ladder.level] : null,
    table: standings.map((r, i) => {
      const t = career.season.league.teams.find((x) => x.id === r.teamId);
      return { pos: i + 1, abbr: t?.abbr ?? '?', played: r.played, points: r.points, user: r.teamId === career.userTeamId };
    }),
    nextFixture: nextFixtureText(career),
    formation,
    slots,
    bids: career.incomingBids.length,
    sponsorOffers: career.sponsorOffers.length,
    unread: unreadCount(career),
    trophies,
    level: officeLevel(career.history.length, trophies.filter((t) => t.kind !== 'runnerUp').length),
    attendance,
    stadiumName: team.stadiumName,
    visitor: officeVisitor(career),
  };
}

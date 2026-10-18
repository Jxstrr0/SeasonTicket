/**
 * Builds the plain snapshot the 3D office draws from. This is the only place
 * that reads the career for the office, so the render code never touches the
 * sim.
 */
import { C, LADDER_NAMES, coachSelection, deadlineView, openDeadline, eventView, frontPage, openEvents, paperName, lastHomeCrowd, money, playerPayroll, userBooks, userFixture, userTeam, type Career, type InboxKind } from '../../sim/career';
import { WORLD, formation as formationOf } from '../../sim/data';
import officeTuning from '../../data/tuning/office.json';
import type { OfficeFrontPage, OfficeSnapshot, OfficeTrophy, OfficeVisitorCall } from '../../render/office/types';
import { careerWeekLabel, unreadCount } from '../views/career/hub';
import { buildStadiumSnapshot, crestDocument } from './stadiumSnapshot';

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
  // An event waiting on the owner brings its visitor first, and they wait until it is answered.
  for (const ev of openEvents(career)) {
    const v = eventView(career, ev);
    if (v) return { mailId: ev.mailId, role: v.role, title: v.title };
  }
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


/** The latest edition's front page for the TV. */
function frontPageSnapshot(career: Career): OfficeFrontPage | null {
  const page = frontPage(career);
  if (!page) return null;
  const [lead, ...rest] = page.items;
  return { paper: paperName(), edition: page.label, lead: lead.headline, more: rest.slice(0, 2).map((x) => x.headline) };
}
export function buildOfficeSnapshot(career: Career): OfficeSnapshot {
  const team = userTeam(career);
  const books = userBooks(career);
  const standings = career.season.standings;
  const trophies = officeTrophies(career);
  const { formation, slots } = selectionSlots(career);
  const attendance = lastHomeCrowd(career, career.userTeamId);
  const crestSvg = crestDocument(career);
  return {
    clubName: team.name,
    shortName: team.shortName,
    abbr: team.abbr,
    primary: team.colors.primary,
    secondary: team.colors.secondary,
    crestSvg,
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
    deadline: openDeadline(career) ? { time: deadlineView(career)!.time, calls: openDeadline(career)!.calls.filter((c) => c.status === 'open').length } : null,
    sponsorOffers: career.sponsorOffers.length,
    unread: unreadCount(career),
    trophies,
    level: officeLevel(career.history.length, trophies.filter((t) => t.kind !== 'runnerUp').length),
    attendance,
    stadiumName: team.stadiumName,
    stadium: buildStadiumSnapshot(career, crestSvg),
    visitor: officeVisitor(career),
    // The radio is this device's, not the career's: the office host sets it.
    radio: false,
    news: frontPageSnapshot(career),
    posts: career.news.posts.filter((p) => p.weekIndex === career.weekIndex - 1).length,
  };
}

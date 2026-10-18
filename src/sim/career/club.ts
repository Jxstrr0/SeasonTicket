/**
 * Running the club off the pitch: ticket prices, the shirt sponsor, stadium
 * naming rights, the youth academy and the coaching staff.
 */
import { teamById } from '../league';
import { makeIdFactory, defaultNames } from '../names';
import { generateStaffMember } from '../staff';
import type { StaffMember, StaffRole } from '../types';
import { STAFF_ROLES } from '../types';
import { spendingLimits } from './books';
import type { Career, SponsorOffer } from './types';
import { C, addInbox, careerRng, clamp, earn, money, playerName, roundMoney, spend, userBooks, userTeam } from './util';

export interface ClubResult {
  ok: boolean;
  message: string;
}

const ok = (message: string): ClubResult => ({ ok: true, message });
const fail = (message: string): ClubResult => ({ ok: false, message });

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export function setTicketPrice(career: Career, price: number): ClubResult {
  if (!Number.isFinite(price)) return fail('Enter a ticket price.');
  const value = Math.round(clamp(price, C.tickets.minPrice, C.tickets.maxPrice) * 2) / 2;
  userBooks(career).ticketPrice = value;
  return ok(`Tickets now cost $${value.toFixed(2)}.`);
}

// ---------------------------------------------------------------------------
// Shirt sponsor
// ---------------------------------------------------------------------------

/** Fresh sponsor offers for a club with no running deal. Longer deals pay a little less per season. */
export function makeSponsorOffers(career: Career): SponsorOffer[] {
  const s = C.sponsors;
  const team = userTeam(career);
  const rng = careerRng(career, 'sponsor-offers');
  const middle = s.base + s.perMarket * Math.pow(team.marketSize, s.exponent) * (0.85 + 0.3 * team.squadQuality);
  const brands = rng.shuffle(s.brands).slice(0, s.offers);
  return brands
    .map((brand) => {
      const years = rng.int(s.years.min, s.years.max);
      const swing = rng.float(-s.spread, s.spread);
      const perSeason = roundMoney(middle * (1 + swing) * (1 - s.longDealDiscount * (years - 1)), 10_000);
      return { brand, perSeason, years };
    })
    .sort((a, b) => b.perSeason - a.perSeason);
}

export function acceptSponsor(career: Career, index: number): ClubResult {
  const offer = career.sponsorOffers[index];
  if (!offer) return fail('That offer is gone.');
  const books = userBooks(career);
  if (books.sponsor) return fail(`You are still with ${books.sponsor.brand}.`);
  books.sponsor = { brand: offer.brand, perSeason: offer.perSeason, yearsLeft: offer.years };
  career.sponsorOffers = [];
  addInbox(career, 'finance', `${offer.brand} on the shirt`, `${offer.brand} will pay ${money(offer.perSeason)} a season for ${offer.years} season${offer.years > 1 ? 's' : ''}.`);
  return ok(`${offer.brand} signed.`);
}

/** At kick-off of the season a club without a sponsor takes the best offer on the table. */
export function autoSignSponsor(career: Career): void {
  if (userBooks(career).sponsor) return;
  if (career.sponsorOffers.length === 0) career.sponsorOffers = makeSponsorOffers(career);
  acceptSponsor(career, 0);
}

// ---------------------------------------------------------------------------
// Naming rights
// ---------------------------------------------------------------------------

export function namingRightsOffer(career: Career): { brand: string; fee: number; years: number } | null {
  if (userBooks(career).namingRights) return null;
  const n = C.namingRights;
  const team = userTeam(career);
  const rng = careerRng(career, 'naming-brand');
  const brand = rng.pick(C.sponsors.brands.filter((b) => b !== userBooks(career).sponsor?.brand));
  return { brand, fee: roundMoney(n.base + n.perMarket * team.marketSize, 50_000), years: n.years };
}

export function sellNamingRights(career: Career): ClubResult {
  const offer = namingRightsOffer(career);
  if (!offer) return fail('The stadium name is already sold.');
  // A deal signed in the review would lose its first year to the rollover straight away.
  if (career.phase === 'review') return fail('Naming deals are signed once the new season starts.');
  const team = userTeam(career);
  const books = userBooks(career);
  const firstWord = offer.brand.split(' ')[0];
  books.namingRights = { brand: offer.brand, yearsLeft: offer.years, originalName: team.stadiumName };
  team.stadiumName = `${firstWord} Arena`;
  earn(books, 'namingRights', offer.fee);
  team.fanMood = clamp(team.fanMood - C.namingRights.fanMoodHit, C.fans.min, C.fans.max);
  addInbox(career, 'finance', 'Naming rights sold', `The ground is now the ${team.stadiumName} for ${offer.years} seasons. ${money(offer.fee)} paid up front. Some fans are not happy.`);
  return ok(`Sold for ${money(offer.fee)}.`);
}

/** Runs the naming deal down a season; the old name returns when it expires. */
export function tickNamingRights(career: Career): void {
  const books = userBooks(career);
  const deal = books.namingRights;
  if (!deal) return;
  deal.yearsLeft -= 1;
  if (deal.yearsLeft <= 0) {
    userTeam(career).stadiumName = deal.originalName;
    books.namingRights = null;
    addInbox(career, 'finance', 'Naming deal over', `The ground is the ${deal.originalName} again. You can sell the name once more.`);
  }
}

// ---------------------------------------------------------------------------
// Youth academy
// ---------------------------------------------------------------------------

export function academyUpgradeCost(career: Career): number | null {
  const level = userBooks(career).academyLevel;
  return C.youth.upgradeCost[level - 1] ?? null;
}

export function upgradeAcademy(career: Career): ClubResult {
  const cost = academyUpgradeCost(career);
  if (cost === null) return fail('The academy is already at the top level.');
  if (spendingLimits(career).locked) return fail('The spending lock forbids upgrades.');
  const books = userBooks(career);
  if (books.cash < cost) return fail(`You need ${money(cost)}; you have ${money(books.cash)}.`);
  spend(books, 'upgrades', cost);
  books.academyLevel += 1;
  return ok(`The academy is now level ${books.academyLevel}.`);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<StaffRole, string> = {
  headCoach: 'Head coach',
  assistantCoach: 'Assistant coach',
  fitnessCoach: 'Fitness coach',
  headScout: 'Head scout',
  academyDirector: 'Academy director',
};

export function staffInRole(career: Career, teamId: string, role: StaffRole): StaffMember | null {
  const league = career.season.league;
  return teamById(league, teamId).staffIds.map((id) => league.staff[id]).find((s) => s?.role === role) ?? null;
}

export function staffPool(career: Career, role?: StaffRole): StaffMember[] {
  const league = career.season.league;
  return career.staffPool
    .map((id) => league.staff[id])
    .filter((s): s is StaffMember => !!s && (!role || s.role === role))
    .sort((a, b) => b.rating - a.rating);
}

/** What firing someone costs: a share of the wages left on the deal. */
export function fireCost(member: StaffMember): number {
  return roundMoney(member.contract.wage * member.contract.years * C.staff.fireCostShare);
}

/** Hires from the pool. Whoever held the role is let go (and paid off). */
export function hireStaff(career: Career, staffId: string): ClubResult {
  const league = career.season.league;
  const member = league.staff[staffId];
  if (!member || !career.staffPool.includes(staffId)) return fail('They are not available.');
  if (spendingLimits(career).locked) return fail('The spending lock forbids new staff.');
  const team = userTeam(career);
  const current = staffInRole(career, team.id, member.role);
  const books = userBooks(career);
  const payoff = current ? fireCost(current) : 0;
  if (books.cash < payoff) return fail(`Paying off the current ${ROLE_LABELS[member.role].toLowerCase()} costs ${money(payoff)}.`);
  if (current) {
    spend(books, 'severance', payoff);
    removeFromClub(career, current);
  }
  career.staffPool = career.staffPool.filter((id) => id !== staffId);
  member.teamId = team.id;
  member.contract.years = Math.max(2, member.contract.years);
  team.staffIds.push(member.id);
  addInbox(career, 'staff', `New ${ROLE_LABELS[member.role].toLowerCase()}`, `${playerName(member)} (rated ${member.rating}) joins on ${money(member.contract.wage)} a season.${current ? ` ${playerName(current)} leaves with ${money(payoff)}.` : ''}`);
  return ok(`${playerName(member)} hired.`);
}

/** Lets a staff member go. The role stays empty until you hire (a head coach is needed to play). */
export function fireStaff(career: Career, staffId: string): ClubResult {
  const member = career.season.league.staff[staffId];
  if (!member || member.teamId !== career.userTeamId) return fail('They do not work for you.');
  const cost = fireCost(member);
  spend(userBooks(career), 'severance', cost);
  removeFromClub(career, member);
  return ok(`${playerName(member)} has left (${money(cost)}).`);
}

function removeFromClub(career: Career, member: StaffMember): void {
  if (member.teamId) {
    const team = teamById(career.season.league, member.teamId);
    team.staffIds = team.staffIds.filter((id) => id !== member.id);
  }
  member.teamId = null;
  member.contract.years = 1;
  if (!career.staffPool.includes(member.id)) career.staffPool.push(member.id);
}

/** Tops the hiring pool back up to the target per role and trims it to the best few. */
export function refillStaffPool(career: Career): void {
  const league = career.season.league;
  const ids = makeIdFactory(league.nextId);
  const rng = careerRng(career, 'staff-pool');
  const S = C.staff;
  for (const role of STAFF_ROLES) {
    const pool = staffPool(career, role);
    for (let i = pool.length; i < S.poolPerRole; i++) {
      const member = generateStaffMember(rng, role, null, rng.float(S.poolQuality.min, S.poolQuality.max), ids, defaultNames);
      league.staff[member.id] = member;
      career.staffPool.push(member.id);
    }
    for (const extra of pool.slice(S.poolPerRole + 2)) {
      career.staffPool = career.staffPool.filter((id) => id !== extra.id);
      delete league.staff[extra.id];
    }
  }
  league.nextId = ids.current();
}

/**
 * A good fitness coach speeds up injury recovery: each week, every injured
 * player at a club whose fitness coach is rated at least the floor has a
 * chance (scaled by the rating) to come back a week early.
 */
export function fitnessRehab(career: Career): void {
  const league = career.season.league;
  const S = C.staff;
  const rng = careerRng(career, 'fitness-rehab');
  for (const team of league.teams) {
    const coach = staffInRole(career, team.id, 'fitnessCoach');
    if (!coach || coach.rating < S.fitnessRehabFloor) continue;
    const chance = S.fitnessRehabChance * (coach.rating / 100);
    for (const id of team.playerIds) {
      const p = league.players[id];
      if (p && p.injuryWeeks > 0 && rng.chance(chance)) p.injuryWeeks -= 1;
    }
  }
}

/** A club must have a head coach before it can play; the best in the pool steps in if needed. */
export function ensureHeadCoach(career: Career): void {
  if (staffInRole(career, career.userTeamId, 'headCoach')) return;
  const best = staffPool(career, 'headCoach')[0];
  if (!best) return;
  const team = userTeam(career);
  career.staffPool = career.staffPool.filter((id) => id !== best.id);
  best.teamId = team.id;
  team.staffIds.push(best.id);
  addInbox(career, 'staff', 'Interim head coach', `${playerName(best)} has taken charge until you appoint someone.`);
}

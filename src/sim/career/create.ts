/**
 * A new career: the league, the season, every club's books, and the owner's
 * fortune for the chosen difficulty.
 */
import { createLeague, teamById } from '../league';
import { createSeason } from '../season';
import type { TeamColors } from '../types';
import { fairPrice, newDebt } from './books';
import { makeSponsorOffers, refillStaffPool } from './club';
import { createStadiums } from './stadium';
import { newNews } from './news';
import { newStory } from './story';
import type { Career, ClubBooks, Crest, MatchMode, TierId } from './types';
import { C, addInbox, clamp, emptyLedger, money, userTeam } from './util';
import { ensureOwners } from './rivalry';

export const CAREER_VERSION = 10;

export interface Branding {
  name: string;
  shortName: string;
  city: string;
  abbr: string;
  colors: TeamColors;
}

export interface NewCareerOptions {
  seed: number;
  teamId: string;
  tier: TierId;
  homegrownRule: boolean;
  branding?: Branding;
  crest?: Crest;
  matchMode?: MatchMode;
}

/** Which difficulty a club belongs to. */
export function tierOfClub(teamId: string): TierId | null {
  for (const id of C.tiers.order as TierId[]) if ((C.tiers[id].clubs as string[]).includes(teamId)) return id;
  return null;
}

export function defaultCrest(colors: TeamColors, abbr: string): Crest {
  return { shape: 'shield', pattern: 'plain', primary: colors.primary, secondary: colors.secondary, initials: abbr.slice(0, 3), icon: 'none' };
}

export function createCareer(opts: NewCareerOptions): Career {
  const league = createLeague(opts.seed, { homegrownRule: opts.homegrownRule });
  const season = createSeason(league, undefined, { homegrownRule: opts.homegrownRule });
  const team = teamById(league, opts.teamId);
  if (opts.branding) {
    const b = opts.branding;
    team.name = b.name.trim() || team.name;
    team.shortName = b.shortName.trim() || team.shortName;
    team.city = b.city.trim() || team.city;
    team.abbr = (b.abbr.trim() || team.abbr).toUpperCase().slice(0, 3);
    team.colors = { ...b.colors };
  }
  const tier = C.tiers[opts.tier];

  const career: Career = {
    version: CAREER_VERSION,
    seed: league.seed,
    userTeamId: team.id,
    tier: opts.tier,
    homegrownRule: opts.homegrownRule,
    crest: opts.crest ?? defaultCrest(team.colors, team.abbr),
    owner: { fortune: tier.fortune, injected: 0 },
    phase: 'preseason',
    preseasonWeek: 1,
    weekIndex: 0,
    season,
    books: {},
    stadiums: {},
    ladder: { level: 0, deadlineWeek: null, goodWeeks: 0, lastForcedSaleWeek: null },
    loansIn: [],
    incomingBids: [],
    counters: {},
    sponsorOffers: [],
    staffPool: [],
    userSelection: null,
    delegation: { matchMode: opts.matchMode ?? 'full', autoLineup: false },
    liveMatch: null,
    liveRecord: null,
    lastUserMatch: null,
    replays: { club: {}, round: {} },
    playerSeason: {},
    inbox: [],
    history: [],
    story: newStory(),
    news: newNews(),
    deadline: null,
    owners: {},
    counter: 0,
    gameOverReason: null,
  };
  ensureOwners(career);

  for (const t of league.teams) {
    const user = t.id === team.id;
    const books: ClubBooks = {
      teamId: t.id,
      cash: user ? tier.cash : Math.round(C.aiClubs.cashBase + C.aiClubs.cashPerFinance * t.finances),
      debts: [],
      ledger: emptyLedger(),
      lastLedger: null,
      payrollAccum: 0,
      payrollWeeks: 0,
      overCapSeasons: 0,
      academyLevel: user ? 1 : clamp(1 + Math.round(t.finances * 3), 1, 4),
      ticketPrice: fairPrice(t),
      sponsor: null,
      namingRights: null,
      baseFanMood: t.fanMood,
    };
    career.books[t.id] = books;
  }
  createStadiums(career);
  if (tier.debt > 0) career.books[team.id].debts.push(newDebt(career, C.lenders.startingLender, tier.debt));

  career.sponsorOffers = makeSponsorOffers(career);
  refillStaffPool(career);
  const debtLine = tier.debt > 0 ? ` The club owes ${money(tier.debt)} to the bank.` : '';
  addInbox(
    career,
    'info',
    `Welcome to ${userTeam(career).shortName}`,
    `You own the club now. There is ${money(tier.cash)} in the bank and ${money(tier.fortune)} of your own money to put in if you need it.${debtLine} Four pre-season weeks until kick-off: pick a shirt sponsor, set ticket prices and shape the squad.`,
  );
  return career;
}

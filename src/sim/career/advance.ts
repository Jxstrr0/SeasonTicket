/**
 * Moving a career forward one week at a time. Pre-season weeks are money and
 * the market; season weeks also play every fixture through the same Stage 1
 * season code, with the user's lineup, ticket prices and live match plugged
 * in through hooks. Every match plays on the spatial engine: the user's
 * live match in fine mode (live.ts), the rest in coarse mode.
 */
import { pickSelection } from '../coach';
import { simulateSpatialMatch } from '../spatial/bridge';
import type { MatchContext, MatchState } from '../match/state';
import { attendanceShare, buildMatchSetup, matchesForWeek, prepareWeek, settleWeek } from '../season';
import type { PreparedWeek, SeasonHooks } from '../season';
import { SEASON_TUNING } from '../data';
import type { MatchResult, MatchSetup, ScheduledMatch } from '../types';
import { fairPrice, priceAdjustedShare, settleMatch, settleSeason, updateLadder, weeklyBooks } from './books';
import { autoSignSponsor, ensureHeadCoach, fitnessRehab } from './club';
import { compactResult } from './compact';
import { clearLive, finishLive, liveOf, startLive } from './live';
import { weeklyMarket } from './market';
import { matchSelection } from './selection';
import { stadiumAttendance, weeklyStadium } from './stadium';
import { weeklyNews } from './news';
import { moodForm, weeklyStory } from './story';
import type { Career } from './types';
import { C, addInbox, userTeam } from './util';

type Background = (setup: MatchSetup, ctx: MatchContext) => MatchResult;
const SPATIAL: Background = (setup, ctx) => simulateSpatialMatch(setup, ctx, 'coarse');
let background: Background = SPATIAL;

/**
 * Swap the engine for the matches the user does not watch, or null for the spatial engine.
 * Only for tests of the owner loop (finances, contracts, the stadium), which play many
 * seasons and would otherwise spend minutes in the match engine; the game never calls it.
 */
export function setBackgroundEngine(fn: Background | null): void {
  background = fn ?? SPATIAL;
}

/**
 * The hooks the season uses for this career. `live` builds the user's side
 * for the match screen: under full control (or big calls) the user, not the
 * AI, makes the in-game decisions.
 */
export function careerHooks(career: Career, live = false): SeasonHooks {
  const userId = career.userTeamId;
  return {
    select: (rng, team, players, headCoach, opts) => {
      if (team.id !== userId) return pickSelection(rng, team, players, headCoach, opts);
      const selection = matchSelection(career, rng, opts.opponent);
      const form = moodForm(career, selection.lineup.starters);
      if (form) selection.form = form;
      return selection;
    },
    attendance: (rng, home, away, playoff) => {
      const base = stadiumAttendance(career, home, attendanceShare(rng, home, away, playoff));
      if (home.id !== userId) return base;
      return priceAdjustedShare(base, career.books[userId].ticketPrice, fairPrice(home));
    },
    aiControlled: (teamId) => !(live && teamId === userId && career.delegation.matchMode === 'full'),
    simulate: (setup, ctx) => {
      // The user's match: finished on the match screen, or walked away from and seen out by the head coach.
      if (career.liveMatch?.setup.matchId === setup.matchId) return finishLive(career, ctx);
      return background(setup, ctx);
    },
  };
}

/** The user's fixture in the coming week, if there is one. */
export function userFixture(career: Career): ScheduledMatch | null {
  if (career.phase !== 'season') return null;
  const state = career.season;
  return matchesForWeek(state, state.week).find((m) => !m.result && (m.homeId === career.userTeamId || m.awayId === career.userTeamId)) ?? null;
}

/** Builds the user's match for the live screen. The rest of the week plays when the career advances. */
export function startUserMatch(career: Career): MatchState | null {
  const match = userFixture(career);
  if (!match) return null;
  if (career.liveMatch?.setup.matchId === match.id) {
    liveOf(career);
    return career.liveMatch;
  }
  ensureHeadCoach(career);
  const setup = buildMatchSetup(career.season, match, careerHooks(career, true));
  if (career.delegation.matchMode === 'coach') setup.aiControlled = { home: true, away: true };
  return startLive(career, setup);
}

/**
 * A season week with its matches set up, waiting to be played. `jobs` are the matches to
 * play away from the screen (every fixture but the user's live one); the game hands them to
 * the MatchRunner and passes the results, in the same order, to settleCareerWeek.
 */
export interface CareerWeek {
  jobs: MatchSetup[];
  ctx: MatchContext;
  prep: PreparedWeek;
}

/**
 * The first half of a season week: the weekly books, the coach check and a setup for every
 * fixture. Null outside the season, where advanceCareer does the whole week. Nothing else may
 * change the career until settleCareerWeek.
 */
export function prepareCareerWeek(career: Career): CareerWeek | null {
  if (career.phase !== 'season' || career.season.phase === 'complete') return null;
  weeklyBooks(career);
  ensureHeadCoach(career);
  const prep = prepareWeek(career.season, careerHooks(career));
  if (!prep) return null;
  const jobs = prep.setups.filter((s) => s.matchId !== career.liveMatch?.setup.matchId);
  return { jobs, ctx: prep.ctx, prep };
}

/** The second half: the user's live match is seen out, then every result is settled. */
export function settleCareerWeek(career: Career, week: CareerWeek, played: readonly MatchResult[]): MatchResult[] {
  if (played.length !== week.jobs.length) throw new Error(`${played.length} results for ${week.jobs.length} matches`);
  const byId = new Map(week.jobs.map((s, k) => [s.matchId, played[k]]));
  const { prep } = week;
  const all = prep.setups.map((setup) => byId.get(setup.matchId) ?? finishLive(career, prep.ctx));
  settleWeek(career.season, prep, all);
  const results: MatchResult[] = [];
  career.replays.round = {};
  for (const match of prep.fixtures) {
    const result = match.result;
    if (!result) continue;
    settleMatch(career, match, result);
    const mine = match.homeId === career.userTeamId || match.awayId === career.userTeamId;
    if (result.replay) (mine ? career.replays.club : career.replays.round)[result.matchId] = result.replay;
    delete result.replay;
    if (mine) {
      tallyUserPlayers(career, result);
      career.lastUserMatch = structuredClone(result);
    }
    compactResult(result);
    results.push(result);
  }
  // The live match, if any, belonged to this week; never carry it over.
  clearLive(career);
  fitnessRehab(career);
  weeklyMarket(career);
  weeklyStory(career);
  weeklyNews(career, results);
  if (checkLadder(career)) return results;
  career.weekIndex += 1;
  const state = career.season;
  if (state.phase === 'complete') {
    settleSeason(career);
    career.phase = 'review';
    const champion = state.championId ? state.league.teams.find((t) => t.id === state.championId) : null;
    addInbox(career, 'season', `Season ${state.league.season} is over`, `${champion ? `${champion.shortName} are champions.` : 'The season is over.'} Review the year, then start the off-season.`);
  }
  weeklyStadium(career);
  return results;
}

/** One week forward, all on this thread. Returns the results played this week (already compacted). */
export function advanceCareer(career: Career): MatchResult[] {
  if (career.phase === 'review' || career.phase === 'gameOver') return [];
  if (career.phase === 'preseason') {
    weeklyBooks(career);
    weeklyMarket(career);
    preseasonRecovery(career);
    weeklyStory(career);
    weeklyNews(career, []);
    if (checkLadder(career)) return [];
    career.weekIndex += 1;
    career.preseasonWeek += 1;
    if (career.preseasonWeek > C.calendar.preseasonWeeks) {
      career.phase = 'season';
      autoSignSponsor(career);
      addInbox(career, 'season', 'Kick-off week', `The season starts now. ${userTeam(career).shortName} play this week.`);
    }
    weeklyStadium(career);
    return [];
  }
  const week = prepareCareerWeek(career);
  if (!week) return [];
  return settleCareerWeek(career, week, week.jobs.map((setup) => background(setup, week.ctx)));
}

function checkLadder(career: Career): boolean {
  if (!updateLadder(career)) return false;
  career.phase = 'gameOver';
  clearLive(career);
  career.gameOverReason = 'The lenders put the club into receivership. Your time as owner is over.';
  return true;
}

function preseasonRecovery(career: Career): void {
  const max = SEASON_TUNING.condition.max;
  for (const p of Object.values(career.season.league.players)) {
    if (p.injuryWeeks > 0) p.injuryWeeks -= 1;
    p.condition = max;
  }
}

function tallyUserPlayers(career: Career, result: MatchResult): void {
  const squad = new Set(userTeam(career).playerIds);
  for (const s of Object.values(result.playerStats)) {
    if (!squad.has(s.playerId) || s.minutes <= 0) continue;
    const line = (career.playerSeason[s.playerId] ??= { apps: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, yellows: 0, reds: 0 });
    line.apps += 1;
    line.minutes += s.minutes;
    line.goals += s.goals;
    line.assists += s.assists;
    line.ratingSum += s.rating;
    line.yellows += s.yellowCards;
    line.reds += s.redCards;
  }
}

/** Plays weeks until the season review (or game over). For tests and "sim to end". */
export function advanceToReview(career: Career, maxWeeks = 60): void {
  for (let i = 0; i < maxWeeks && (career.phase === 'preseason' || career.phase === 'season'); i++) advanceCareer(career);
}


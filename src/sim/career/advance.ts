/**
 * Moving a career forward one week at a time. Pre-season weeks are money and
 * the market; season weeks also play every fixture through the same Stage 1
 * season code, with the user's lineup, ticket prices and live match plugged
 * in through hooks.
 */
import { pickSelection } from '../coach';
import { createMatch, finalizeMatch, simulateMatch, stepMinute } from '../match/engine';
import type { MatchState } from '../match/state';
import { advanceWeek, attendanceShare, buildMatchSetup, matchContext, matchesForWeek } from '../season';
import type { SeasonHooks } from '../season';
import { SEASON_TUNING } from '../data';
import type { MatchResult, ScheduledMatch } from '../types';
import { fairPrice, priceAdjustedShare, settleMatch, settleSeason, updateLadder, weeklyBooks } from './books';
import { autoSignSponsor, ensureHeadCoach, fitnessRehab } from './club';
import { compactResult } from './compact';
import { weeklyMarket } from './market';
import { matchSelection } from './selection';
import type { Career } from './types';
import { C, addInbox, userTeam } from './util';

/** Hard stop for a live match that somehow never finishes. */
const MAX_LIVE_STEPS = 400;

/**
 * The hooks the season uses for this career. `live` builds the user's side
 * for the match screen: under full control (or big calls) the user, not the
 * AI, makes the in-game decisions.
 */
export function careerHooks(career: Career, live = false): SeasonHooks {
  const userId = career.userTeamId;
  return {
    select: (rng, team, players, headCoach, opts) =>
      team.id === userId ? matchSelection(career, rng, opts.opponent) : pickSelection(rng, team, players, headCoach, opts),
    attendance: (rng, home, away, playoff) => {
      const base = attendanceShare(rng, home, away, playoff);
      if (home.id !== userId) return base;
      return priceAdjustedShare(base, career.books[userId].ticketPrice, fairPrice(home));
    },
    aiControlled: (teamId) => !(live && teamId === userId && career.delegation.matchMode === 'full'),
    simulate: (setup, ctx) => {
      const live = career.liveMatch;
      if (!live || live.setup.matchId !== setup.matchId) return simulateMatch(setup, ctx);
      // The user walked away from the match screen: the head coach sees it out.
      live.home.aiControlled = true;
      live.away.aiControlled = true;
      for (let i = 0; i < MAX_LIVE_STEPS && !live.finished; i++) stepMinute(live, ctx);
      career.liveMatch = null;
      return finalizeMatch(live, ctx);
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
  if (career.liveMatch?.setup.matchId === match.id) return career.liveMatch;
  ensureHeadCoach(career);
  const setup = buildMatchSetup(career.season, match, careerHooks(career, true));
  if (career.delegation.matchMode === 'coach') setup.aiControlled = { home: true, away: true };
  career.liveMatch = createMatch(setup, matchContext(career.season.league));
  return career.liveMatch;
}

/** One week forward. Returns the results played this week (already compacted). */
export function advanceCareer(career: Career): MatchResult[] {
  if (career.phase === 'review' || career.phase === 'gameOver') return [];
  let results: MatchResult[] = [];
  if (career.phase === 'preseason') {
    weeklyBooks(career);
    weeklyMarket(career);
    preseasonRecovery(career);
    if (checkLadder(career)) return [];
    career.weekIndex += 1;
    career.preseasonWeek += 1;
    if (career.preseasonWeek > C.calendar.preseasonWeeks) {
      career.phase = 'season';
      autoSignSponsor(career);
      addInbox(career, 'season', 'Kick-off week', `The season starts now. ${userTeam(career).shortName} play this week.`);
    }
    return [];
  }

  weeklyBooks(career);
  ensureHeadCoach(career);
  const state = career.season;
  const week = state.week;
  const fixtures = matchesForWeek(state, week).filter((m) => !m.result);
  advanceWeek(state, careerHooks(career));
  for (const match of fixtures) {
    const result = match.result;
    if (!result) continue;
    settleMatch(career, match, result);
    if (match.homeId === career.userTeamId || match.awayId === career.userTeamId) {
      tallyUserPlayers(career, result);
      career.lastUserMatch = structuredClone(result);
    }
    compactResult(result);
    results.push(result);
  }
  // The live match, if any, belonged to this week; never carry it over.
  career.liveMatch = null;
  fitnessRehab(career);
  weeklyMarket(career);
  if (checkLadder(career)) return results;
  career.weekIndex += 1;
  if (state.phase === 'complete') {
    settleSeason(career);
    career.phase = 'review';
    const champion = state.championId ? state.league.teams.find((t) => t.id === state.championId) : null;
    addInbox(career, 'season', `Season ${state.league.season} is over`, `${champion ? `${champion.shortName} are champions.` : 'The season is over.'} Review the year, then start the off-season.`);
  }
  return results;
}

function checkLadder(career: Career): boolean {
  if (!updateLadder(career)) return false;
  career.phase = 'gameOver';
  career.liveMatch = null;
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


/**
 * Locks the Stage 1 believability targets from CLAUDE.md against the real
 * generated league: real clubs, real squads, the real AI coach and the real
 * engine, over several seasons. Prints a compact table so a tuning change can
 * be judged at a glance.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { inMatchDecisions, pickSelection } from '../src/sim/coach';
import { COACH_TUNING, MATCH_TUNING } from '../src/sim/data';
import { createLeague } from '../src/sim/league';
import { createMatch, isFinished, stepMinute } from '../src/sim/match/engine';
import type { MatchState } from '../src/sim/match/state';
import { unitOfPosition } from '../src/sim/match/strength';
import { cushionFactor } from '../src/sim/match/tick';
import { Rng } from '../src/sim/rng';
import { createSeason, defaultHooks, runSeason, seasonSummary, type SeasonState } from '../src/sim/season';
import type { MatchAction, MatchResult, PlayerMatchStats, Side } from '../src/sim/types';
import { coachOf, contextOf, makeSetup, makeTeam, mergePlayers } from './helpers/matchFixtures';
import { spearman } from './helpers/seasonFixtures';

// Sixteen leagues: enough that one odd league (a cluster of gung-ho coaches, say) cannot carry the averages.
const SEEDS = Array.from({ length: 16 }, (_, i) => `believe-${i + 1}`);
const MAX_SEASON_MS = 10_000;
const TOP_SIX = 6;
const BOTTOM_SIX = 6;
const TOP_SCORERS_CHECKED = 10;
const ATTACKING_POSITIONS = new Set(['ST', 'W', 'AM']);

interface Played {
  seed: string;
  state: SeasonState;
  ms: number;
}

/** Everything the bands below assert, measured over a set of seasons. */
interface Metrics {
  matches: number;
  goals: number;
  sevenPlusShare: number;
  homeWin: number;
  draw: number;
  shots: number;
  onTargetShare: number;
  xg: number;
  homePossession: number;
  possessionSumError: number;
  dominantPossession: number;
  yellows: number;
  reds: number;
  injuries: number;
  subs: number;
  maxSubs: number;
  rating: number;
  winnerRating: number;
  loserRating: number;
}

function playSeason(seed: string): Played {
  const start = performance.now();
  const state = runSeason(createSeason(createLeague(seed)), defaultHooks());
  return { seed, state, ms: performance.now() - start };
}

function leagueResults(state: SeasonState): MatchResult[] {
  return state.schedule.matches.flatMap((m) => (m.stage === 'league' && m.result ? [m.result] : []));
}

function allResults(state: SeasonState): MatchResult[] {
  return state.schedule.matches.flatMap((m) => (m.result ? [m.result] : []));
}

const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

function sideOfPlayer(result: MatchResult, state: SeasonState, playerId: string): Side {
  return state.league.players[playerId]?.teamId === result.homeId ? 'home' : 'away';
}

function subsBySide(result: MatchResult): Record<Side, number> {
  const subs = { home: 0, away: 0 };
  for (const e of result.events) if (e.type === 'substitution' && e.side) subs[e.side] += 1;
  return subs;
}

function measure(seasons: Played[]): Metrics {
  const results = seasons.flatMap((p) => leagueResults(p.state).map((r) => ({ r, state: p.state })));
  const teamStats = results.flatMap(({ r }) => [r.stats.home, r.stats.away]);
  const totalShots = teamStats.reduce((sum, s) => sum + s.shots, 0);
  const totalOnTarget = teamStats.reduce((sum, s) => sum + s.shotsOnTarget, 0);
  const subs = results.flatMap(({ r }) => Object.values(subsBySide(r)));

  const appearances: PlayerMatchStats[] = [];
  const winners: number[] = [];
  const losers: number[] = [];
  for (const { r, state } of results) {
    for (const s of Object.values(r.playerStats)) {
      if (s.minutes <= 0) continue;
      appearances.push(s);
      if (r.winnerId === null) continue;
      const side = sideOfPlayer(r, state, s.playerId);
      const won = (side === 'home' ? r.homeId : r.awayId) === r.winnerId;
      (won ? winners : losers).push(s.rating);
    }
  }

  return {
    matches: results.length,
    goals: mean(results.map(({ r }) => r.homeScore + r.awayScore)),
    sevenPlusShare: mean(results.map(({ r }) => (r.homeScore + r.awayScore >= 7 ? 1 : 0))),
    homeWin: mean(results.map(({ r }) => (r.homeScore > r.awayScore ? 1 : 0))),
    draw: mean(results.map(({ r }) => (r.homeScore === r.awayScore ? 1 : 0))),
    shots: mean(teamStats.map((s) => s.shots)),
    onTargetShare: totalShots ? totalOnTarget / totalShots : 0,
    xg: mean(teamStats.map((s) => s.xg)),
    homePossession: mean(results.map(({ r }) => r.stats.home.possession)),
    possessionSumError: Math.max(...results.map(({ r }) => Math.abs(r.stats.home.possession + r.stats.away.possession - 1))),
    dominantPossession: mean(results.map(({ r }) => Math.max(r.stats.home.possession, r.stats.away.possession))),
    yellows: mean(teamStats.map((s) => s.yellowCards)),
    reds: mean(teamStats.map((s) => s.redCards)),
    injuries: mean(results.map(({ r }) => r.injuries.length)),
    subs: mean(subs),
    maxSubs: Math.max(...subs),
    rating: mean(appearances.map((s) => s.rating)),
    winnerRating: mean(winners),
    loserRating: mean(losers),
  };
}

/** League goals per player over a season, highest first. */
function scorers(state: SeasonState): { playerId: string; goals: number }[] {
  const totals = new Map<string, number>();
  for (const r of leagueResults(state)) {
    for (const s of Object.values(r.playerStats)) if (s.goals > 0) totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + s.goals);
  }
  return [...totals.entries()].map(([playerId, goals]) => ({ playerId, goals })).sort((a, b) => b.goals - a.goals || a.playerId.localeCompare(b.playerId));
}

function qualityRanking(state: SeasonState): string[] {
  return state.league.teams
    .slice()
    .sort((a, b) => b.squadQuality - a.squadQuality || a.id.localeCompare(b.id))
    .map((t) => t.id);
}

function tableRank(state: SeasonState, teamId: string): number {
  return state.standings.findIndex((r) => r.teamId === teamId);
}

function qualityPointsRho(state: SeasonState): number {
  const quality = new Map(state.league.teams.map((t) => [t.id, t.squadQuality]));
  return spearman(
    state.standings.map((r) => quality.get(r.teamId) ?? 0),
    state.standings.map((r) => r.points),
  );
}

function weakestClub(state: SeasonState): string {
  return qualityRanking(state)[state.league.teams.length - 1];
}

function printTable(seasons: Played[]): void {
  const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`.padStart(4 + (d ? d + 1 : 0));
  const f = (x: number, d = 2) => x.toFixed(d).padStart(5);
  const header = 'seed          ms goals    7+ home draw shots  onT    xG   yel   red   inj  subs  rate  top   rho champQ shieldQ weakest';
  const rows = seasons.map((p) => {
    const m = measure([p]);
    const top = scorers(p.state)[0]?.goals ?? 0;
    const champQ = qualityRanking(p.state).indexOf(p.state.championId ?? '') + 1;
    const shieldQ = qualityRanking(p.state).indexOf(p.state.shieldWinnerId ?? '') + 1;
    const weakest = tableRank(p.state, weakestClub(p.state)) + 1;
    return (
      `${p.seed.padEnd(10)} ${p.ms.toFixed(0).padStart(5)} ${f(m.goals)} ${pct(m.sevenPlusShare, 1)} ${pct(m.homeWin)} ${pct(m.draw)} ${f(m.shots, 1)} ${pct(m.onTargetShare)} ${f(m.xg)} ` +
      `${f(m.yellows)} ${f(m.reds, 3)} ${f(m.injuries)} ${f(m.subs, 1)} ${f(m.rating)} ${String(top).padStart(4)} ${f(qualityPointsRho(p.state))} ${String(champQ).padStart(6)} ${String(shieldQ).padStart(7)} ${String(weakest).padStart(7)}`
    );
  });
  const all = measure(seasons);
  const ratings = `ratings: all ${all.rating.toFixed(2)}, winners ${all.winnerRating.toFixed(2)}, losers ${all.loserRating.toFixed(2)}`;
  const totals =
    `ALL ${all.matches} matches: goals ${all.goals.toFixed(2)}, 7+ ${pct(all.sevenPlusShare, 1)}, home ${pct(all.homeWin)}, draw ${pct(all.draw)}, ` +
    `shots ${all.shots.toFixed(1)}, on target ${pct(all.onTargetShare)}, xG ${all.xg.toFixed(2)}, home poss ${all.homePossession.toFixed(3)}, ` +
    `dominant poss ${all.dominantPossession.toFixed(3)}, yellows ${all.yellows.toFixed(2)}, reds ${all.reds.toFixed(3)}, injuries ${all.injuries.toFixed(2)}, subs ${all.subs.toFixed(2)} (max ${all.maxSubs})`;
  console.log(['[believability]', header, ...rows, totals, ratings].join('\n'));
}

describe('believability of the real league over several seasons', () => {
  let seasons: Played[];
  let all: Metrics;

  beforeAll(() => {
    seasons = SEEDS.map(playSeason);
    all = measure(seasons);
    printTable(seasons);
  }, 300_000);

  it('simulates each season and playoffs in under 10 seconds', () => {
    for (const p of seasons) {
      expect(p.state.phase, p.seed).toBe('complete');
      expect(p.ms, p.seed).toBeLessThan(MAX_SEASON_MS);
    }
  });

  it('is deterministic: the same seed replays the same season', () => {
    const again = playSeason(SEEDS[0]);
    const first = seasons[0];
    expect(again.state.standings).toEqual(first.state.standings);
    expect(allResults(again.state).map((r) => [r.homeScore, r.awayScore, r.stats.home.shots, r.stats.away.xg])).toEqual(
      allResults(first.state).map((r) => [r.homeScore, r.awayScore, r.stats.home.shots, r.stats.away.xg]),
    );
  }, 30_000);

  describe('scorelines', () => {
    it('averages 2.4 to 3.1 goals per match', () => {
      expect(all.goals).toBeGreaterThanOrEqual(2.4);
      expect(all.goals).toBeLessThanOrEqual(3.1);
      // Every single season stays in a plausible band too, so no league is a goal-fest.
      for (const p of seasons) {
        const { avgGoals } = seasonSummary(p.state);
        expect(avgGoals, p.seed).toBeGreaterThanOrEqual(2.1);
        expect(avgGoals, p.seed).toBeLessThanOrEqual(3.4);
      }
    });

    it('keeps 7+ goal matches to at most 2%', () => {
      expect(all.sevenPlusShare).toBeLessThanOrEqual(0.02);
    });

    it('wins at home 40-50% of the time and draws 20-30%', () => {
      expect(all.homeWin).toBeGreaterThanOrEqual(0.4);
      expect(all.homeWin).toBeLessThanOrEqual(0.5);
      expect(all.draw).toBeGreaterThanOrEqual(0.2);
      expect(all.draw).toBeLessThanOrEqual(0.3);
    });
  });

  describe('team stats', () => {
    it('gives each team 9 to 16 shots, 30-45% on target, 0.9 to 1.9 xG', () => {
      expect(all.shots).toBeGreaterThanOrEqual(9);
      expect(all.shots).toBeLessThanOrEqual(16);
      expect(all.onTargetShare).toBeGreaterThanOrEqual(0.3);
      expect(all.onTargetShare).toBeLessThanOrEqual(0.45);
      expect(all.xg).toBeGreaterThanOrEqual(0.9);
      expect(all.xg).toBeLessThanOrEqual(1.9);
    });

    it('splits possession to 1 per match, near 0.5 overall and 0.35-0.65 in a typical match', () => {
      expect(all.possessionSumError).toBeLessThan(1e-9);
      expect(all.homePossession).toBeGreaterThanOrEqual(0.47);
      expect(all.homePossession).toBeLessThanOrEqual(0.56);
      // The side with more of the ball averages well under 65%.
      expect(all.dominantPossession).toBeGreaterThanOrEqual(0.5);
      expect(all.dominantPossession).toBeLessThanOrEqual(0.65);
      for (const p of seasons) {
        for (const team of p.state.league.teams) {
          const shares = leagueResults(p.state).flatMap((r) => (r.homeId === team.id ? [r.stats.home.possession] : r.awayId === team.id ? [r.stats.away.possession] : []));
          const avg = mean(shares);
          expect(avg, `${p.seed} ${team.id}`).toBeGreaterThanOrEqual(0.35);
          expect(avg, `${p.seed} ${team.id}`).toBeLessThanOrEqual(0.65);
        }
      }
    });

    it('shows 1.2-2.8 yellows and 0.03-0.12 reds per team, 0.10-0.35 injuries per match', () => {
      expect(all.yellows).toBeGreaterThanOrEqual(1.2);
      expect(all.yellows).toBeLessThanOrEqual(2.8);
      expect(all.reds).toBeGreaterThanOrEqual(0.03);
      expect(all.reds).toBeLessThanOrEqual(0.12);
      expect(all.injuries).toBeGreaterThanOrEqual(0.1);
      expect(all.injuries).toBeLessThanOrEqual(0.35);
    });
  });

  describe('players', () => {
    it('produces a top scorer with 14 to 30 league goals each season', () => {
      for (const p of seasons) {
        const top = scorers(p.state)[0]?.goals ?? 0;
        expect(top, p.seed).toBeGreaterThanOrEqual(14);
        expect(top, p.seed).toBeLessThanOrEqual(30);
      }
    });

    it('fills the top 10 scorers mostly with strikers, wingers and attacking mids', () => {
      for (const p of seasons) {
        const top = scorers(p.state).slice(0, TOP_SCORERS_CHECKED);
        const attackers = top.filter((s) => ATTACKING_POSITIONS.has(p.state.league.players[s.playerId].position)).length;
        expect(attackers, p.seed).toBeGreaterThanOrEqual(7);
      }
    });

    it('rates players 6.0 to 7.2 on average, winners above losers', () => {
      expect(all.rating).toBeGreaterThanOrEqual(6.0);
      expect(all.rating).toBeLessThanOrEqual(7.2);
      expect(all.winnerRating).toBeGreaterThan(all.loserRating + 0.3);
    });
  });

  describe('squad strength predicts the table', () => {
    it('correlates squad quality and points above 0.6 on average', () => {
      const rhos = seasons.map((p) => qualityPointsRho(p.state));
      expect(mean(rhos)).toBeGreaterThan(0.6);
      for (const [i, rho] of rhos.entries()) expect(rho, seasons[i].seed).toBeGreaterThan(0.35);
    });

    it('crowns a top-6 squad as table winner and playoff champion in most seasons', () => {
      const topSquad = (p: Played, id: string | null) => qualityRanking(p.state).slice(0, TOP_SIX).includes(id ?? '');
      const champions = seasons.filter((p) => topSquad(p, p.state.championId)).length;
      const shields = seasons.filter((p) => topSquad(p, p.state.shieldWinnerId)).length;
      const needed = Math.ceil((seasons.length * 4) / 6);
      expect(champions).toBeGreaterThanOrEqual(needed);
      expect(shields).toBeGreaterThanOrEqual(needed);
    });

    it('sends the weakest (0.30-quality) club to the bottom six in most seasons', () => {
      for (const p of seasons) expect(p.state.league.teams.find((t) => t.id === weakestClub(p.state))?.squadQuality).toBeLessThanOrEqual(0.35);
      const bottom = seasons.filter((p) => tableRank(p.state, weakestClub(p.state)) >= p.state.league.teams.length - BOTTOM_SIX).length;
      expect(bottom).toBeGreaterThan(seasons.length / 2);
    });
  });

  describe('substitutions and sendings-off', () => {
    it('has the AI make 2 to 5 substitutions per side, never more than 5', () => {
      expect(all.subs).toBeGreaterThanOrEqual(2);
      expect(all.subs).toBeLessThanOrEqual(5);
      for (const p of seasons) {
        for (const r of allResults(p.state)) {
          const subs = subsBySide(r);
          expect(subs.home, r.matchId).toBeLessThanOrEqual(5);
          expect(subs.away, r.matchId).toBeLessThanOrEqual(5);
        }
      }
    });

    it('never brings back a substituted or sent-off player', () => {
      for (const p of seasons) {
        for (const r of allResults(p.state)) {
          const gone = new Set<string>();
          const cameOn = new Set<string>();
          const starters = new Set(Object.keys(r.playerStats));
          for (const e of r.events) {
            const named = [e.playerId, e.secondaryPlayerId].filter((id): id is string => id !== null);
            for (const id of named) expect(gone.has(id), `${r.matchId} ${e.minute}' ${e.type} names departed ${id}`).toBe(false);
            if (e.type === 'substitution' && e.playerId && e.secondaryPlayerId) {
              expect(cameOn.has(e.secondaryPlayerId), `${r.matchId} ${e.secondaryPlayerId} came on twice`).toBe(false);
              cameOn.add(e.secondaryPlayerId);
              gone.add(e.playerId);
            }
            if ((e.type === 'redCard' || e.type === 'secondYellow') && e.playerId) gone.add(e.playerId);
          }
          for (const id of r.sentOff) expect(starters.has(id)).toBe(true);
        }
      }
    });

    it('gives sent-off players no minutes after the card', () => {
      for (const p of seasons) {
        for (const r of allResults(p.state)) {
          // A full-match player's minutes are the regulation (or extra-time) minutes plus every stoppage minute played.
          const fullMatch = Math.max(...Object.values(r.playerStats).map((s) => s.minutes));
          const stoppage = fullMatch - (r.extraTime ? 120 : 90);
          for (const e of r.events) {
            if ((e.type !== 'redCard' && e.type !== 'secondYellow') || !e.playerId) continue;
            const minutes = r.playerStats[e.playerId].minutes;
            expect(minutes, `${r.matchId} ${e.playerId}`).toBeLessThanOrEqual(e.minute + e.added + stoppage);
          }
        }
      }
    });
  });

  it('only uses attacking units for the attacking-position check', () => {
    // Guards the ATTACKING_POSITIONS set against drift from the engine's unit table.
    for (const position of ATTACKING_POSITIONS) expect(unitOfPosition(position as 'ST' | 'W' | 'AM')).toBe('attacker');
  });
});

// ---------------------------------------------------------------------------
// The levers added during calibration, checked directly
// ---------------------------------------------------------------------------

describe('calibration levers', () => {
  const favourite = makeTeam('calfav', 0.85, 71);
  const middle = makeTeam('calmid', 0.6, 72);
  const underdog = makeTeam('caldog', 0.35, 73);
  const players = mergePlayers(favourite.players, middle.players, underdog.players);
  const neutralCoach = (teamId: string) => ({ ...coachOf(teamId), attackLean: 0.5, aggression: 0.5 });
  const mentalityAgainst = (teamId: string, team: typeof favourite, opponent: typeof favourite, lookup = players) =>
    pickSelection(new Rng(1), team.team, lookup, neutralCoach(teamId), { opponent: opponent.team }).tactics.mentality;

  it('lets a favourite play on the front foot and an underdog sit deeper', () => {
    const balanced = COACH_TUNING.tactics.balancedDial;
    expect(mentalityAgainst('calfav', favourite, underdog)).toBeGreaterThan(balanced);
    expect(mentalityAgainst('caldog', underdog, favourite)).toBeLessThan(balanced);
    expect(mentalityAgainst('calmid', middle, middle)).toBe(balanced);
    // The shift is capped: even the biggest mismatch moves a neutral coach one dial step.
    expect(mentalityAgainst('calfav', favourite, underdog) - mentalityAgainst('caldog', underdog, favourite)).toBeLessThanOrEqual(2);
  });

  it('ignores the matchup when the opponent eleven cannot be looked up', () => {
    expect(mentalityAgainst('caldog', underdog, favourite, underdog.players)).toBe(COACH_TUNING.tactics.balancedDial);
  });

  const ctx = contextOf('calmid', 'caldog');
  /** A human-managed match stepped to `minute`, so the only decisions are the ones the test asks for. */
  function matchAt(minute: number, seed = 1): MatchState {
    const state = createMatch(makeSetup('calmid', 'caldog', seed, { aiControlled: { home: false, away: false } }), ctx);
    while (!isFinished(state) && state.minute < minute) stepMinute(state, ctx);
    // A sending-off would trigger its own tactical change; keep the scenario clean.
    if (state.home.sentOff.length + state.away.sentOff.length > 0) throw new Error('pick another seed: a player was sent off');
    state.injuries = [];
    return state;
  }
  const mentalityChange = (actions: MatchAction[]) => {
    const change = actions.find((a): a is Extract<MatchAction, { type: 'setTactics' }> => a.type === 'setTactics');
    return change?.tactics.mentality;
  };

  it('eases off with a two-goal cushion from the hour mark, and more so late on', () => {
    const I = COACH_TUNING.inMatch;
    const early = matchAt(I.comfortable.from - 5);
    const start = early.setup.home.tactics.mentality;
    early.homeScore = 2;
    early.awayScore = 0;
    expect(mentalityChange(inMatchDecisions(early, ctx, 'home'))).toBeUndefined();

    const hour = matchAt(I.comfortable.from + 1);
    hour.homeScore = 1;
    hour.awayScore = 0;
    expect(mentalityChange(inMatchDecisions(hour, ctx, 'home'))).toBeUndefined();
    hour.homeScore = 2;
    expect(mentalityChange(inMatchDecisions(hour, ctx, 'home'))).toBe(Math.max(1, start + I.comfortable.mentalityStep));

    const late = matchAt(I.protect.from + 1);
    late.homeScore = 3;
    late.awayScore = 1;
    expect(mentalityChange(inMatchDecisions(late, ctx, 'home'))).toBe(Math.max(1, start + I.comfortable.mentalityStep + I.protect.mentalityStep));
  });

  it('trims the shot rate of a side two or more goals up, never below the floor', () => {
    const C = MATCH_TUNING.scoreEffects;
    const state = matchAt(1);
    const at = (home: number, away: number, side: Side) => {
      state.homeScore = home;
      state.awayScore = away;
      return cushionFactor(state, side);
    };
    expect(at(0, 0, 'home')).toBe(1);
    expect(at(1, 0, 'home')).toBe(1);
    expect(at(2, 0, 'home')).toBeCloseTo(1 - C.shotRatePerGoal, 10);
    expect(at(3, 0, 'home')).toBeCloseTo(1 - 2 * C.shotRatePerGoal, 10);
    expect(at(9, 0, 'home')).toBe(C.minShotRate);
    // Only the side ahead eases off; the side chasing keeps going.
    expect(at(3, 0, 'away')).toBe(1);
    expect(at(0, 2, 'away')).toBeCloseTo(1 - C.shotRatePerGoal, 10);
  });
});

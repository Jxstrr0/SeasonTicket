/**
 * The season-level believability checks, shared by the Stage 1 engine's run
 * (tests/believability.test.ts) and the spatial engine's runs in both modes
 * (tests/slow/). Real clubs, real squads, the real AI coach, several seasons;
 * prints a compact table so a tuning change can be judged at a glance.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { unitOfPosition } from '../../src/sim/match/strength';
import { seasonSummary, type SeasonState } from '../../src/sim/season';
import type { MatchResult, PlayerMatchStats, Side } from '../../src/sim/types';
import { spearman } from './seasonFixtures';

const TOP_SIX = 6;
const BOTTOM_SIX = 6;
const TOP_SCORERS_CHECKED = 10;
const ATTACKING_POSITIONS = new Set(['ST', 'W', 'AM']);

export interface Played {
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
  passAccuracy: number;
  fouls: number;
  corners: number;
  offsides: number;
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
    passAccuracy: mean(teamStats.map((s) => s.passAccuracy)),
    fouls: mean(teamStats.map((s) => s.fouls)),
    corners: mean(teamStats.map((s) => s.corners)),
    offsides: mean(teamStats.map((s) => s.offsides)),
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

function printTable(label: string, seasons: Played[]): void {
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
    `dominant poss ${all.dominantPossession.toFixed(3)}, yellows ${all.yellows.toFixed(2)}, reds ${all.reds.toFixed(3)}, injuries ${all.injuries.toFixed(2)}, subs ${all.subs.toFixed(2)} (max ${all.maxSubs}), ` +
    `pass accuracy ${pct(all.passAccuracy)}, fouls ${all.fouls.toFixed(1)}, corners ${all.corners.toFixed(1)}, offsides ${all.offsides.toFixed(1)}`;
  console.log([`[believability: ${label}]`, header, ...rows, totals, ratings].join('\n'));
}

export interface SuiteOptions {
  /** Each season (and its playoffs) must play within this; the spatial engine's budgets live in the perf tests. */
  maxSeasonMs?: number;
  /** Play the first season twice and compare. */
  determinism?: boolean;
  /** Also check the spatial engine's own targets: pass completion, fouls, corners, offsides. */
  spatial?: boolean;
}

/**
 * The season-level believability targets (CLAUDE.md and docs/STAGE_4_5_SPATIAL_ENGINE.md section 7)
 * over `seeds` real generated leagues, each played to the end of its playoffs by `play`.
 */
export function believabilitySuite(label: string, seeds: readonly string[], play: (seed: string) => Played | Promise<Played>, opts: SuiteOptions = {}): void {
describe(`believability of the real league over several seasons (${label})`, () => {
  let seasons: Played[];
  let all: Metrics;

  beforeAll(async () => {
    seasons = [];
    for (const seed of seeds) seasons.push(await play(seed));
    all = measure(seasons);
    printTable(label, seasons);
  }, 1_800_000);

  it('plays every season and its playoffs to the end', () => {
    for (const p of seasons) {
      expect(p.state.phase, p.seed).toBe('complete');
      if (opts.maxSeasonMs !== undefined) expect(p.ms, p.seed).toBeLessThan(opts.maxSeasonMs);
    }
  });

  it('plays 240 league matches and a five-match top-6 playoff, and crowns a top-6 side', () => {
    for (const p of seasons) {
      const { schedule, standings, bracket, championId } = p.state;
      expect(schedule.matches.every((m) => m.result !== undefined), p.seed).toBe(true);
      expect(leagueResults(p.state), p.seed).toHaveLength(240);
      expect(allResults(p.state), p.seed).toHaveLength(245);
      expect(bracket?.seeds, p.seed).toHaveLength(6);
      expect(standings.slice(0, 6).map((r) => r.teamId), p.seed).toContain(championId);
    }
  });

  it('only names players that exist in the league in every event', () => {
    for (const p of seasons) {
      const players = p.state.league.players;
      for (const r of allResults(p.state)) {
        for (const e of r.events) {
          if (e.playerId !== null) expect(players[e.playerId], `${r.matchId} ${e.type}`).toBeDefined();
          if (e.secondaryPlayerId !== null) expect(players[e.secondaryPlayerId], `${r.matchId} ${e.type}`).toBeDefined();
        }
      }
    }
  });

  it.runIf(opts.determinism)('is deterministic: the same seed replays the same season', async () => {
    const again = await play(seeds[0]);
    const first = seasons[0];
    expect(again.state.standings).toEqual(first.state.standings);
    expect(allResults(again.state).map((r) => [r.homeScore, r.awayScore, r.stats.home.shots, r.stats.away.xg])).toEqual(
      allResults(first.state).map((r) => [r.homeScore, r.awayScore, r.stats.home.shots, r.stats.away.xg]),
    );
  }, 600_000);

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
    it('produces a top scorer with 12 to 30 league goals each season', () => {
      for (const p of seasons) {
        const top = scorers(p.state)[0]?.goals ?? 0;
        expect(top, p.seed).toBeGreaterThanOrEqual(12);
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

  describe.runIf(opts.spatial)('play on the spatial engine', () => {
    it('completes 70-88% of passes', () => {
      expect(all.passAccuracy).toBeGreaterThanOrEqual(0.7);
      expect(all.passAccuracy).toBeLessThanOrEqual(0.88);
    });

    it('gives each team 9 to 15 fouls, 3 to 7 corners and 1 to 4 offsides', () => {
      expect(all.fouls).toBeGreaterThanOrEqual(9);
      expect(all.fouls).toBeLessThanOrEqual(15);
      expect(all.corners).toBeGreaterThanOrEqual(3);
      expect(all.corners).toBeLessThanOrEqual(7);
      expect(all.offsides).toBeGreaterThanOrEqual(1);
      expect(all.offsides).toBeLessThanOrEqual(4);
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
            // A penalty names the fouler, who may have just been sent off for the same foul.
            const fouler = e.type === 'penaltyAwarded' ? e.secondaryPlayerId : null;
            const named = [e.playerId, e.secondaryPlayerId].filter((id): id is string => id !== null && id !== fouler);
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
}

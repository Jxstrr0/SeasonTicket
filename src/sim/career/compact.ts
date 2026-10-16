/**
 * Stored results are trimmed once a week is played so a save stays small:
 * only goals, red cards and injuries stay in the timeline (without their
 * commentary line), only scorers, assisters and sent-off players keep a
 * stat line, and fractions are rounded. The user's latest match is kept in
 * full separately (career.lastUserMatch).
 */
import type { MatchResult, TeamMatchStats } from '../types';
import { C } from './util';

const KEEP = new Set<string>(C.results.keepEventTypes);
const r2 = (x: number) => Math.round(x * 100) / 100;

function roundTeam(s: TeamMatchStats): void {
  s.xg = r2(s.xg);
  s.possession = r2(s.possession);
  s.passAccuracy = r2(s.passAccuracy);
}

export function compactResult(result: MatchResult): void {
  result.events = result.events
    .filter((e) => KEEP.has(e.type))
    .map((e) => ({ ...e, text: '', xg: e.xg === null ? null : r2(e.xg) }));
  const kept: MatchResult['playerStats'] = {};
  for (const [id, s] of Object.entries(result.playerStats)) {
    if (s.goals > 0 || s.assists > 0 || s.redCards > 0) kept[id] = { ...s, xg: r2(s.xg) };
  }
  result.playerStats = kept;
  result.attendanceShare = r2(result.attendanceShare);
  roundTeam(result.stats.home);
  roundTeam(result.stats.away);
}

/**
 * What just happened in a match, for the crowd's sound and the commentary ticker (Stage 5.5).
 * The watch is shown the engine after every step and hands back what is new since the last
 * look: whistles, fouls, cards, shots, goals, kicks of the ball and shootout kicks. It reads
 * the engine's logs and never changes the match, so the sound and ticker can't alter a result.
 *
 * Each moment carries the engine time it was seen at (`ms`); the screen plays it when its own
 * clock gets there, so a 3D view running a little behind the engine hears it in step.
 */
import { BALL_DEAD, RESTART_KICKOFF, type SpatialMatch } from '../../sim/spatial/state';
import type { ShotOutcome, Side, SpatialEvent } from '../../sim/spatial/types';

export type Moment =
  | { kind: 'kickoff'; ms: number; side: Side }
  | { kind: 'event'; ms: number; event: SpatialEvent }
  | { kind: 'shot'; ms: number; side: Side; player: number; xg: number; header: boolean; outcome: ShotOutcome; setPiece?: 'freeKick' | 'penalty' }
  | { kind: 'goal'; ms: number; side: Side; scorer: number; assist: number; ownGoal: boolean; header: boolean; score: [number, number] }
  | { kind: 'spot'; ms: number; side: Side; player: number; keeper: number; outcome: 'scored' | 'saved' | 'missed'; score: [number, number] }
  /** The ball struck (a pass, shot or clearance): `power` 0 to 1, `x` along the pitch. */
  | { kind: 'kick'; ms: number; power: number; x: number };

/** Ball speed (m/s) that counts as a full-power strike. */
const FULL_POWER = 30;

export class MomentWatch {
  private m: SpatialMatch | null = null;
  private lastMs = -1;
  private events = 0;
  private shots = 0;
  private goals = 0;
  private spots = 0;
  private strikeMs = 0;
  private kickoff = false;

  /** Start (silently) from where `m` stands: a new match, or a jump to another moment. */
  skip(m: SpatialMatch): void {
    this.m = m;
    this.lastMs = m.clockMs;
    this.events = m.events.length;
    this.shots = m.shotLog.length;
    this.goals = m.goalLog.length;
    this.spots = m.shootout?.kicks.length ?? 0;
    this.strikeMs = m.ball.strikeMs;
    this.kickoff = m.restartKind === RESTART_KICKOFF;
  }

  /**
   * What is new in `m` since the last look, in the order it happened. A different match, or
   * the clock going backwards (a replay started again), starts over without reporting.
   */
  observe(m: SpatialMatch, out: Moment[] = []): Moment[] {
    if (m !== this.m || m.clockMs < this.lastMs) {
      this.skip(m);
      return out;
    }
    // The logs are read by count, so a step that leaves the clock alone (the final whistle)
    // still reports what it added, and a second look reports nothing twice.
    const ms = m.clockMs;
    this.lastMs = ms;
    const b = m.ball;
    if (b.strikeMs !== this.strikeMs) {
      this.strikeMs = b.strikeMs;
      if (b.owner < 0 && b.state !== BALL_DEAD) out.push({ kind: 'kick', ms, power: Math.min(1, Math.hypot(b.vx, b.vy) / FULL_POWER), x: b.x });
    }
    const kickoff = m.restartKind === RESTART_KICKOFF;
    if (this.kickoff && !kickoff && b.state !== BALL_DEAD) out.push({ kind: 'kickoff', ms, side: m.poss });
    this.kickoff = kickoff;
    for (; this.events < m.events.length; this.events++) out.push({ kind: 'event', ms, event: m.events[this.events] });
    for (; this.shots < m.shotLog.length; this.shots++) {
      const s = m.shotLog[this.shots];
      // Goals come through the goal log, with the score.
      if (s.outcome === 'goal') continue;
      out.push({ kind: 'shot', ms, side: s.side, player: s.player, xg: s.xg, header: s.header, outcome: s.outcome, setPiece: s.setPiece });
    }
    for (; this.goals < m.goalLog.length; this.goals++) {
      const g = m.goalLog[this.goals];
      out.push({ kind: 'goal', ms, side: g.side, scorer: g.scorer, assist: g.assist, ownGoal: g.ownGoal, header: g.header, score: [m.score[0], m.score[1]] });
    }
    const so = m.shootout;
    if (so) {
      for (; this.spots < so.kicks.length; this.spots++) {
        const k = so.kicks[this.spots];
        out.push({ kind: 'spot', ms, side: k.side, player: k.player, keeper: k.keeper, outcome: k.outcome, score: [so.score[0], so.score[1]] });
      }
    }
    return out;
  }
}

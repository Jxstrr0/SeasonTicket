/**
 * Spatial match engine, build step 6: the systems around open play. Periods and stoppage
 * time, extra time and the shootout, substitutions (made only when the ball is dead, five at
 * most), fatigue, 10- and 9-man shapes, and replays that include substitutions.
 */
import { describe, expect, it } from 'vitest';
import { SPATIAL_TUNING } from '../src/sim/data';
import {
  captureFrame, createSpatial, fingerprint, matchToss, queueCancelSub, queueSubstitution, queueTactics, replayFrames, runSeconds,
  spatialFinished, spatialRecord, stepSpatial,
} from '../src/sim/spatial/engine';
import { FOUL_FRONT, foul } from '../src/sim/spatial/rules';
import { BALL_DEAD, type SpatialMatch } from '../src/sim/spatial/state';
import { clockLabel, matchTime, startShootout } from '../src/sim/spatial/systems';
import { FRAME_VALUES, PERIOD, whoOf, type Side } from '../src/sim/spatial/types';
import { setupWithBench, tactics } from './helpers/spatialFixtures';

const MIN = 60000;

/** Who kicked off each period played, by match (see playOut). */
const kickers = new WeakMap<SpatialMatch, Side[]>();

function playOut(m: SpatialMatch): SpatialMatch {
  const ko: Side[] = [m.poss as Side];
  let period = m.period;
  while (stepSpatial(m)) {
    if (m.period !== period) {
      period = m.period;
      if (period < PERIOD.SHOOTOUT) ko.push(m.poss as Side);
    }
  }
  kickers.set(m, ko);
  return m;
}

/** A straight red for whoever commits the next foul. */
function sendOff(m: SpatialMatch, f: number, v: number): void {
  const CD = SPATIAL_TUNING.card;
  const keep = CD.straightRed;
  CD.straightRed = 1;
  try { foul(m, f, v, FOUL_FRONT, false); } finally { CD.straightRed = keep; }
}

describe('spatial periods and stoppage time', () => {
  const matches = [0, 1, 2, 3].map((k) => playOut(createSpatial(setupWithBench(), `periods-${k}`, 'coarse')));

  it('two halves of 45 minutes, each with 1 to 6 minutes added, then the end', () => {
    for (const m of matches) {
      expect(spatialFinished(m)).toBe(true);
      expect(m.periodLog.map((r) => r.period)).toEqual([PERIOD.FIRST, PERIOD.SECOND]);
      for (const r of m.periodLog) {
        expect(r.added).toBeGreaterThanOrEqual(1);
        expect(r.added).toBeLessThanOrEqual(6);
        const over = r.endMs - r.startMs - 45 * MIN;
        // The whistle waits for the announced time, and for the ball to be safe.
        expect(over).toBeGreaterThanOrEqual(r.added * MIN);
        expect(over).toBeLessThan((r.added + 1.5) * MIN);
      }
      const notes = m.events.filter((e) => e.kind === 'whistle').map((e) => e.note);
      expect(notes).toEqual(['half', 'full']);
    }
  });

  it('the clock shows 45+ in first-half stoppage, and the half-time whistle is in the first half', () => {
    const m = matches[0];
    const half = m.events.find((e) => e.kind === 'whistle' && e.note === 'half');
    expect(half).toBeDefined();
    const t = matchTime(m, (half as { ms: number }).ms);
    expect(t.period).toBe(PERIOD.FIRST);
    expect(t.minute).toBe(45);
    expect(t.added).toBeGreaterThanOrEqual(1);
    const second = matchTime(m, m.periodLog[1].startMs + 10 * MIN + 1);
    expect(second.period).toBe(PERIOD.SECOND);
    expect(second.minute).toBe(56);
    const live = createSpatial(setupWithBench(), 'clock', 'coarse');
    runSeconds(live, 46 * 60);
    expect(clockLabel(live)).toMatch(/^45\+\d|^HT|^4[56]:/);
  });
});

let cupCache: SpatialMatch[] | null = null;

/** Cup ties until one goes to a shootout (a draw after 90 and after 120 minutes). */
function cupTies(): SpatialMatch[] {
  if (cupCache) return cupCache;
  const ties: SpatialMatch[] = [];
  for (let k = 0; k < 40 && !ties.some((m) => m.shootout); k++) ties.push(playOut(createSpatial(setupWithBench({}, {}, true), `cup-${k}`, 'coarse')));
  cupCache = ties;
  return ties;
}

describe('spatial extra time and the shootout', () => {
  const ties = cupTies();

  it('a cup tie level after 90 minutes plays two halves of extra time, with stoppage', () => {
    const et = ties.filter((m) => m.periodLog.some((r) => r.period === PERIOD.ET_FIRST));
    expect(et.length).toBeGreaterThan(0);
    for (const m of ties) {
      const periods = m.periodLog.map((r) => r.period).filter((p) => p < PERIOD.SHOOTOUT);
      const level90 = periods.length > 2;
      expect(periods).toEqual(level90 ? [0, 1, 2, 3] : [0, 1]);
      for (const r of m.periodLog.filter((x) => x.period === PERIOD.ET_FIRST || x.period === PERIOD.ET_SECOND)) {
        expect(r.endMs - r.startMs).toBeGreaterThanOrEqual(15 * MIN);
        expect(r.endMs - r.startMs).toBeLessThan(19 * MIN);
      }
      if (!m.shootout) expect(m.score[0]).not.toBe(m.score[1]);
    }
  });

  it('a shootout alternates, has a winner the other side cannot catch, and leaves the score alone', () => {
    const m = ties.find((x) => x.shootout) as SpatialMatch;
    expect(m).toBeDefined();
    const so = m.shootout!;
    expect(m.score[0]).toBe(m.score[1]);
    expect(so.winner === 0 || so.winner === 1).toBe(true);
    // Kicks alternate, starting with the side that won the toss.
    so.kicks.forEach((k, n) => expect(k.side).toBe(n % 2 === 0 ? so.first : 1 - so.first));
    const scored: [number, number] = [0, 0];
    for (const k of so.kicks) if (k.outcome === 'scored') scored[k.side]++;
    expect(scored).toEqual(so.score);
    const w = so.winner as Side;
    expect(so.score[w]).toBeGreaterThan(so.score[1 - w]);
    // Nobody takes a second kick before every team-mate on the pitch has taken one.
    for (const s of [0, 1] as Side[]) {
      const takers = so.kicks.filter((k) => k.side === s).map((k) => k.player);
      expect(new Set(takers.slice(0, 10)).size).toBe(Math.min(10, takers.length));
    }
    expect(m.events[m.events.length - 1]).toMatchObject({ kind: 'whistle', note: 'shootout' });
  });
});

describe('spatial kick-off coin toss', () => {
  it('the toss is the same for the same seed, and each side kicks off the first half about half the time', () => {
    let home = 0;
    const n = 200;
    for (let k = 0; k < n; k++) {
      const seed = `toss-${k}`;
      const a = createSpatial(setupWithBench(), seed, 'coarse');
      const b = createSpatial(setupWithBench(), seed, 'fine');
      expect(b.toss).toEqual(a.toss);
      expect(matchToss(seed)).toEqual(a.toss);
      expect(a.poss).toBe(a.toss[0]);
      expect(b.poss).toBe(a.toss[0]);
      if (a.poss === 0) home++;
    }
    expect(home / n).toBeGreaterThan(0.38);
    expect(home / n).toBeLessThan(0.62);
  });

  it('the other side kicks off the second half; extra time follows its own toss', () => {
    const played = [0, 1, 2, 3].map((k) => playOut(createSpatial(setupWithBench(), `periods-${k}`, 'coarse')));
    for (const m of [...played, ...cupTies()]) {
      const ko = kickers.get(m) as Side[];
      expect(ko[0]).toBe(m.toss[0]);
      expect(ko[1]).toBe(1 - m.toss[0]);
      if (ko.length > 2) {
        expect(ko[2]).toBe(m.toss[1]);
        expect(ko[3]).toBe(1 - m.toss[1]);
      }
    }
    expect(cupTies().some((m) => (kickers.get(m) as Side[]).length > 2)).toBe(true);
  });
});

describe('spatial shootout with a man sent off', () => {
  function pens(): SpatialMatch {
    const s = setupWithBench({}, {}, true);
    // Away penalty skill rises with the slot, so its weakest takers are slots 1 and 2.
    s.away.players.forEach((p, k) => { p.attributes = { ...p.attributes, spk: 40 + k * 4 }; });
    s.away.tactics.setPieceTakers.penalties = s.away.players[1].id;
    const m = createSpatial(s, 'pens-red', 'coarse');
    // Home down to nine.
    m.on[5] = 0;
    m.on[7] = 0;
    m.period = PERIOD.SHOOTOUT;
    startShootout(m);
    return m;
  }

  it('the side with more players leaves out its weakest takers, keeping its keeper and named taker', () => {
    const m = pens();
    const [home, away] = m.shootout!.order;
    expect(home.length).toBe(9);
    expect(away.length).toBe(9);
    expect(away[0]).toBe(whoOf(m.setup, 1, m.setup.away.players[1].id));
    expect(away).toContain(whoOf(m.setup, 1, m.setup.away.players[0].id));
    // Slots 2 and 3 are the weakest left after the named taker: they sit it out.
    expect(away).not.toContain(whoOf(m.setup, 1, m.setup.away.players[2].id));
    expect(away).not.toContain(whoOf(m.setup, 1, m.setup.away.players[3].id));
  });

  it('nobody kicks twice until every kicker on both sides has kicked', () => {
    const m = playOut(pens());
    const so = m.shootout!;
    expect(so.winner === 0 || so.winner === 1).toBe(true);
    for (const s of [0, 1] as Side[]) {
      const takers = so.kicks.filter((k) => k.side === s).map((k) => k.player);
      expect(new Set(takers.slice(0, 9)).size).toBe(Math.min(9, takers.length));
      expect(takers.every((t) => so.order[s].includes(t))).toBe(true);
    }
  });
});

describe('spatial substitutions', () => {
  it('a substitution waits for the ball to go dead, then the new man plays on', () => {
    const m = createSpatial(setupWithBench(), 'sub-dead', 'fine');
    runSeconds(m, 20 * 60);
    queueSubstitution(m, 0, 'home-9', 'home-b7');
    let made = false, deadWhenMade = false;
    for (let k = 0; k < 6000 && !made; k++) {
      const before = m.events.length;
      stepSpatial(m);
      if (m.events.slice(before).some((e) => e.kind === 'sub')) { made = true; deadWhenMade = m.ball.state === BALL_DEAD; }
    }
    expect(made).toBe(true);
    expect(deadWhenMade).toBe(true);
    const inn = whoOf(m.setup, 0, 'home-b7'), out = whoOf(m.setup, 0, 'home-9');
    expect(m.at[out]).toBe(-1);
    expect(m.at[inn]).toBeGreaterThanOrEqual(0);
    expect(m.energy[inn]).toBeGreaterThan(m.energy[out]);
    expect(m.subsUsed[0]).toBe(1);
  }, 30_000);

  it('five at most; a player who has come off cannot go back on; a cancelled one is given back', () => {
    const m = createSpatial(setupWithBench(), 'sub-rules', 'coarse');
    runSeconds(m, 60);
    queueSubstitution(m, 1, 'away-10', 'away-b8');
    queueCancelSub(m, 1, 'away-10');
    runSeconds(m, 2);
    expect(m.subsUsed[1]).toBe(0);
    for (let k = 1; k <= 6; k++) queueSubstitution(m, 1, `away-${k}`, `away-b${k}`);
    runSeconds(m, 2);
    expect(m.subsUsed[1]).toBe(5);
    playOut(m);
    const subs = m.events.filter((e) => e.kind === 'sub' && e.side === 1);
    expect(subs.length).toBe(5);
    // The sixth (away-6 for away-b6) never happened, and nobody came back on.
    expect(m.at[whoOf(m.setup, 1, 'away-b6')]).toBe(-1);
    for (const e of subs) expect(m.at[e.player]).toBe(-1);
  }, 30_000);
});

describe('spatial fatigue', () => {
  it('energy falls through the match, faster for a side that presses high', () => {
    // Energy goes with distance run and sprinted, so pressing costs what the extra running
    // costs: a few per cent (kept physical, docs/DESIGN.md 17.14 question 11).
    let press = 0, sit = 0, keeper = 0;
    for (let k = 0; k < 3; k++) {
      const m = createSpatial(setupWithBench({ pressing: 5, tempo: 5 }, { pressing: 1, tempo: 1 }), `fatigue-${k}`, 'coarse');
      runSeconds(m, 60 * 60);
      const mean = (s: Side) => {
        let sum = 0;
        for (let j = 1; j < 11; j++) sum += m.energy[m.who[s * 11 + j]];
        return sum / 10;
      };
      press += mean(0) / 3;
      sit += mean(1) / 3;
      keeper += m.energy[m.who[0]] / 3;
    }
    expect(press).toBeLessThan(0.85);
    expect(sit).toBeLessThan(0.9);
    expect(press).toBeLessThan(sit - 0.01);
    // The keepers barely tire.
    expect(keeper).toBeGreaterThan(press + 0.1);
  }, 30_000);
});

describe('spatial short-handed shapes', () => {
  it('a 4-3-3 down to ten drops its holding midfielder and keeps four at the back; down to nine, a winger too', () => {
    const m = createSpatial(setupWithBench(), 'ten-men', 'coarse');
    runSeconds(m, 120);
    sendOff(m, 13, 9);
    runSeconds(m, 5);
    const spots = (s: Side) => { const out: number[] = []; for (let k = 1; k < 11; k++) if (m.on[s * 11 + k]) out.push(m.teams[s].spot[k]); return out.sort((a, b) => a - b); };
    expect(spots(1)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
    sendOff(m, 18, 9);
    runSeconds(m, 5);
    expect(spots(1)).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
    expect(m.on[11]).toBe(1);
    // Nine men still finish the match.
    playOut(m);
    expect(spatialFinished(m)).toBe(true);
  }, 30_000);
});

describe('spatial replays with substitutions', () => {
  it('a match with substitutions and tactic changes replays exactly from its record', () => {
    const live = createSpatial(setupWithBench(), 'replay-subs', 'fine');
    runSeconds(live, 50 * 60);
    queueSubstitution(live, 0, 'home-8', 'home-b6');
    queueTactics(live, 1, tactics({ mentality: 5, pressing: 4 }));
    runSeconds(live, 3 * 60);
    queueSubstitution(live, 1, 'away-9', 'away-b7');
    const frames: Int16Array[] = [];
    while (live.clockMs < 60 * MIN) {
      if (live.clockMs >= 58 * MIN) {
        const f = new Int16Array(FRAME_VALUES);
        captureFrame(live, f);
        frames.push(f);
      }
      stepSpatial(live);
    }
    expect(live.events.filter((e) => e.kind === 'sub').length).toBe(2);
    const record = JSON.parse(JSON.stringify(spatialRecord(live)));
    const replay = replayFrames(record, 58 * 60, 60 * 60);
    expect(replay.length).toBe(frames.length * FRAME_VALUES);
    for (let k = 0; k < frames.length; k++) {
      expect(Array.from(replay.subarray(k * FRAME_VALUES, (k + 1) * FRAME_VALUES))).toEqual(Array.from(frames[k]));
    }
    // And the whole match: the same record plays to the same end.
    playOut(live);
    const again = playOut(createSpatial(record.setup, record.seed, record.mode, record.actions));
    expect(fingerprint(again)).toBe(fingerprint(live));
  }, 60_000);
});

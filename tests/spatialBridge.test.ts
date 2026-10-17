/**
 * The spatial engine behind the season's match API (Stage 4.5 step 6): a whole match gives a
 * MatchResult that is consistent with itself, the AI head coach substitutes, a level playoff
 * goes to extra time and penalties, a manager's changes go in, and replays are exact.
 */
import { describe, expect, it } from 'vitest';
import { applySpatialAction, createSpatialLive, finalizeSpatial, simulateSpatialMatch, stepSpatialMinute } from '../src/sim/spatial/bridge';
import type { MatchContext } from '../src/sim/match/state';
import type { MatchResult } from '../src/sim/types';
import { contextOf, makeSetup, makeTeam } from './helpers/matchFixtures';

makeTeam('sbA', 0.6, 11);
makeTeam('sbB', 0.6, 12);
const ctx: MatchContext = contextOf('sbA', 'sbB');

const GOALS = new Set(['goal', 'penaltyScored', 'ownGoal']);
const league: MatchResult[] = [];
for (let k = 0; k < 6; k++) league.push(simulateSpatialMatch(makeSetup('sbA', 'sbB', 500 + k), ctx));
const cup: MatchResult[] = [];
for (let k = 0; k < 30 && cup.filter((r) => r.shootout).length < 1; k++) {
  cup.push(simulateSpatialMatch(makeSetup('sbA', 'sbB', 700 + k, { playoff: true }), ctx));
}

describe('spatial bridge: a whole match', () => {
  it('goals agree across the score, the events, the team stats and the players', () => {
    for (const r of league) {
      expect(r.events.filter((e) => GOALS.has(e.type)).length).toBe(r.homeScore + r.awayScore);
      expect(r.stats.home.goals).toBe(r.homeScore);
      expect(r.stats.away.goals).toBe(r.awayScore);
      const own = r.events.filter((e) => e.type === 'ownGoal').length;
      const players = Object.values(r.playerStats).reduce((a, p) => a + p.goals, 0);
      expect(players + own).toBe(r.homeScore + r.awayScore);
    }
  });

  it('events start at kick-off, end at full time and never go back in time', () => {
    for (const r of league) {
      expect(r.events[0].type).toBe('kickoff');
      expect(r.events[r.events.length - 1].type).toBe('fullTime');
      for (let i = 1; i < r.events.length; i++) expect(r.events[i].minute).toBeGreaterThanOrEqual(r.events[i - 1].minute);
      expect(r.events.filter((e) => e.type === 'halfTime').length).toBe(1);
      for (const e of r.events) expect(e.text.length).toBeGreaterThan(0);
    }
  });

  it('a league match records a winner exactly when it is not a draw', () => {
    for (const r of league) {
      expect(r.extraTime).toBe(false);
      expect(r.shootout).toBeNull();
      const want = r.homeScore > r.awayScore ? r.homeId : r.awayScore > r.homeScore ? r.awayId : null;
      expect(r.winnerId).toBe(want);
    }
  });

  it('the AI head coach makes at most five subs a side, from the bench, mostly after the hour', () => {
    let subs = 0, late = 0;
    for (const r of league) {
      for (const side of ['home', 'away'] as const) {
        const own = r.events.filter((e) => e.type === 'substitution' && e.side === side);
        expect(own.length).toBeLessThanOrEqual(5);
        const ins = new Set(own.map((e) => e.secondaryPlayerId));
        expect(ins.size).toBe(own.length);
        subs += own.length;
        late += own.filter((e) => e.minute >= 55).length;
      }
    }
    expect(subs / (league.length * 2)).toBeGreaterThanOrEqual(2);
    expect(late / subs).toBeGreaterThan(0.75);
  });

  it('shots and cards in the player stats add up to the team totals', () => {
    for (const r of league) {
      for (const side of ['home', 'away'] as const) {
        const teamId = side === 'home' ? r.homeId : r.awayId;
        const ids = Object.keys(r.playerStats).filter((id) => ctx.players[id]?.teamId === teamId);
        const sum = (f: (p: MatchResult['playerStats'][string]) => number) => ids.reduce((a, id) => a + f(r.playerStats[id]), 0);
        expect(sum((p) => p.shots)).toBe(r.stats[side].shots);
        expect(sum((p) => p.yellowCards)).toBe(r.stats[side].yellowCards);
        expect(sum((p) => p.minutes)).toBeGreaterThan(900);
      }
    }
  });

  it('replays exactly from the same setup', () => {
    expect(simulateSpatialMatch(makeSetup('sbA', 'sbB', 500), ctx)).toEqual(league[0]);
  });
});

describe('spatial bridge: playoffs', () => {
  it('a level playoff goes to extra time, and a level extra time to a shootout with a winner', () => {
    const shootouts = cup.filter((r) => r.shootout);
    expect(shootouts.length).toBeGreaterThan(0);
    for (const r of cup) {
      expect(r.winnerId).not.toBeNull();
      if (!r.extraTime) continue;
      const types = r.events.map((e) => e.type);
      expect(types).toContain('extraTimeHalf');
      expect(types).toContain('extraTimeEnd');
    }
    for (const r of shootouts) {
      const so = r.shootout as { home: number; away: number };
      expect(r.homeScore).toBe(r.awayScore);
      expect(so.home).not.toBe(so.away);
      expect(r.winnerId).toBe(so.home > so.away ? r.homeId : r.awayId);
      expect(r.events[r.events.length - 1].type).toBe('shootoutEnd');
    }
  });
});

describe('spatial bridge: the manager', () => {
  it('a substitution is made at the next stoppage, and a bad one is refused', () => {
    const live = createSpatialLive(makeSetup('sbA', 'sbB', 901, { aiControlled: { home: false, away: true } }), ctx, 'coarse');
    for (let k = 0; k < 30; k++) stepSpatialMinute(live);
    const out = live.state.home.onPitch[9], inn = live.state.home.bench[0];
    applySpatialAction(live, { type: 'substitute', side: 'home', outId: out, inId: inn });
    expect(live.state.home.subsUsed).toBe(1);
    expect(live.state.home.onPitch).toContain(inn);
    expect(() => applySpatialAction(live, { type: 'substitute', side: 'home', outId: out, inId: inn })).toThrow();
    let made = false;
    for (let k = 0; k < 20 && !made; k++) made = stepSpatialMinute(live).some((e) => e.type === 'substitution' && e.side === 'home');
    expect(made).toBe(true);
    while (!live.state.finished) stepSpatialMinute(live);
    const r = finalizeSpatial(live);
    expect(r.events.filter((e) => e.type === 'substitution' && e.side === 'home').length).toBe(1);
    expect(r.playerStats[inn].minutes).toBeGreaterThan(0);
  });

  it('a tactics change is announced and taken up by the engine', () => {
    const live = createSpatialLive(makeSetup('sbA', 'sbB', 902, { aiControlled: { home: false, away: false } }), ctx, 'coarse');
    stepSpatialMinute(live);
    const events = applySpatialAction(live, { type: 'setMentality', side: 'home', mentality: 5 });
    expect(events.some((e) => e.type === 'tacticChange')).toBe(true);
    stepSpatialMinute(live);
    expect(live.m.teams[0].tactics.mentality).toBe(5);
  });
});

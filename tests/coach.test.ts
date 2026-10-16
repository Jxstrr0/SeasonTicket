/**
 * AI head coach tests: pre-match selection (eleven, bench, takers, tactics,
 * homegrown rule) and in-match decisions (subs, chasing, protecting, red cards).
 */
import { describe, expect, it } from 'vitest';
import { dialFrom, inMatchDecisions, pickSelection } from '../src/sim/coach';
import { COACH_TUNING, FORMATIONS } from '../src/sim/data';
import { createMatch, isFinished, stepMinute } from '../src/sim/match/engine';
import type { MatchContext, MatchState } from '../src/sim/match/state';
import { Rng } from '../src/sim/rng';
import type { MatchAction, Player, StaffMember, Team, TeamSelection } from '../src/sim/types';
import { coachOf, contextOf, makeSetup, makeTeam } from './helpers/matchFixtures';

const I = COACH_TUNING.inMatch;

/** A fresh squad with its own copy of the players, safe to mutate in one test. */
function squad(id: string, quality = 0.6, seed = 1): { team: Team; players: Record<string, Player>; coach: StaffMember } {
  const made = makeTeam(id, quality, seed);
  const players: Record<string, Player> = {};
  for (const [pid, p] of Object.entries(made.players)) players[pid] = { ...p, attributes: { ...p.attributes }, secondaryPositions: p.secondaryPositions.slice() };
  return { team: made.team, players, coach: { ...coachOf(id) } };
}

function expectValidSelection(selection: TeamSelection, team: Team, players: Record<string, Player>): void {
  const { starters, bench } = selection.lineup;
  expect(starters).toHaveLength(11);
  expect(new Set(starters).size).toBe(11);
  expect(starters.every((id) => id !== '' && team.playerIds.includes(id))).toBe(true);
  expect(players[starters[0]].position).toBe('GK');
  expect(starters.filter((id) => players[id].position === 'GK')).toHaveLength(1);
  expect(bench.length).toBeLessThanOrEqual(9);
  expect(bench.some((id) => players[id].position === 'GK')).toBe(true);
  expect(bench.every((id) => team.playerIds.includes(id) && !starters.includes(id))).toBe(true);
  expect(new Set(bench).size).toBe(bench.length);
  for (const id of [...starters, ...bench]) {
    expect(players[id].injuryWeeks).toBe(0);
    expect(players[id].suspensionMatches).toBe(0);
  }
  expect(FORMATIONS.map((f) => f.id)).toContain(selection.tactics.formationId);
  const takers = selection.tactics.setPieceTakers;
  for (const taker of [takers.penalties, takers.freeKicks, takers.corners]) {
    expect(taker).not.toBeNull();
    expect(starters).toContain(taker);
    expect(players[taker!].position).not.toBe('GK');
  }
}

function domesticCount(ids: string[], players: Record<string, Player>): number {
  return ids.filter((id) => players[id].nationality === 'valmere').length;
}

// ---------------------------------------------------------------------------
// Pre-match selection
// ---------------------------------------------------------------------------

describe('pickSelection', () => {
  it('picks 11 distinct starters with one keeper in slot 0 and a bench of at most 9 with a keeper', () => {
    for (const [i, quality] of [0.3, 0.6, 0.9].entries()) {
      const { team, players, coach } = squad(`sel${i}`, quality, i + 10);
      for (const seed of [1, 2, 3]) expectValidSelection(pickSelection(new Rng(seed), team, players, coach), team, players);
      expectValidSelection(pickSelection(new Rng(4), team, players, null), team, players);
    }
  });

  it('is deterministic for the same seed', () => {
    const { team, players, coach } = squad('detsel');
    expect(pickSelection(new Rng(9), team, players, coach)).toEqual(pickSelection(new Rng(9), team, players, coach));
  });

  it('leaves out injured and suspended players, even the best ones and the first-choice keeper', () => {
    const { team, players, coach } = squad('crocked', 0.6, 5);
    const first = pickSelection(new Rng(1), team, players, coach);
    const benched = [first.lineup.starters[0], ...first.lineup.starters.slice(1, 4)];
    players[benched[0]].injuryWeeks = 3;
    players[benched[1]].injuryWeeks = 1;
    players[benched[2]].suspensionMatches = 1;
    players[benched[3]].suspensionMatches = 2;
    const second = pickSelection(new Rng(1), team, players, coach);
    expectValidSelection(second, team, players);
    for (const id of benched) {
      expect(second.lineup.starters).not.toContain(id);
      expect(second.lineup.bench).not.toContain(id);
    }
  });

  it('respects a homegrown minimum of 6 even when the domestic players are the weakest', () => {
    for (const seed of [21, 22, 23, 24]) {
      const { team, players, coach } = squad(`home${seed}`, 0.6, seed);
      // Only the seven weakest outfielders are Valmeran, so talent alone would pick few of them.
      const outfield = team.playerIds.filter((id) => players[id].position !== 'GK').sort((a, b) => players[a].overall - players[b].overall);
      for (const id of team.playerIds) players[id].nationality = 'esperia';
      for (const id of outfield.slice(0, 7)) players[id].nationality = 'valmere';

      const free = pickSelection(new Rng(seed), team, players, coach, { homegrownMinimum: 0 });
      expect(domesticCount(free.lineup.starters, players)).toBeLessThan(6);
      const ruled = pickSelection(new Rng(seed), team, players, coach, { homegrownMinimum: 6 });
      expectValidSelection(ruled, team, players);
      expect(domesticCount(ruled.lineup.starters, players)).toBeGreaterThanOrEqual(6);
    }
  });

  it('fields as many domestic players as it can when the squad has too few', () => {
    const { team, players, coach } = squad('fewlocals', 0.6, 30);
    for (const id of team.playerIds) players[id].nationality = 'kaltland';
    const locals = team.playerIds.filter((id) => players[id].position === 'CM').slice(0, 3);
    for (const id of locals) players[id].nationality = 'valmere';
    const selection = pickSelection(new Rng(1), team, players, coach, { homegrownMinimum: 6 });
    expectValidSelection(selection, team, players);
    expect(domesticCount(selection.lineup.starters, players)).toBe(3);
  });

  it('turns the head coach philosophy into tactics', () => {
    const { team, players, coach } = squad('philosophy', 0.6, 40);
    const opponent = squad('opponent', 0.6, 41);
    const bold = pickSelection(new Rng(1), team, players, { ...coach, attackLean: 0.95, aggression: 0.95 }, { opponent: opponent.team });
    expect(bold.tactics.mentality).toBe(5);
    expect(bold.tactics.pressing).toBe(5);
    expect(bold.tactics.tempo).toBe(5);
    expect(bold.tactics.manMarkTarget).toBeNull();

    const cautiousCoach = { ...coach, attackLean: 0.05, aggression: 0.1 };
    const cautious = pickSelection(new Rng(1), team, players, cautiousCoach, { opponent: opponent.team, opponentPlayers: opponent.players });
    expect(cautious.tactics.mentality).toBe(1);
    expect(cautious.tactics.pressing).toBe(1);
    expect(cautious.tactics.timeWasting).toBe(COACH_TUNING.tactics.timeWastingDialCautious);
    // A cautious coach man-marks the opponent's best attacker.
    const target = cautious.tactics.manMarkTarget;
    expect(target).not.toBeNull();
    expect(opponent.team.selection.lineup.starters).toContain(target);
    expect(['AM', 'W', 'ST']).toContain(opponent.players[target!].position);
    // A league-wide lookup works without the separate opponent map.
    const leagueWide = pickSelection(new Rng(1), team, { ...players, ...opponent.players }, cautiousCoach, { opponent: opponent.team });
    expect(leagueWide.tactics.manMarkTarget).toBe(target);

    const none = pickSelection(new Rng(1), team, players, null);
    expect([none.tactics.mentality, none.tactics.pressing, none.tactics.tempo, none.tactics.width]).toEqual([3, 3, 3, 3]);
  });

  it('prefers the head coach formation when it is nearly as good as the best', () => {
    const { team, players, coach } = squad('shape', 0.6, 50);
    const picks = [1, 2, 3, 4, 5].map((seed) => pickSelection(new Rng(seed), team, players, { ...coach, preferredFormation: '4-4-2' }).tactics.formationId);
    expect(new Set(picks)).toEqual(new Set(['4-4-2']));
  });

  it('maps philosophy values onto the five dial steps', () => {
    expect([0, 0.19, 0.2, 0.45, 0.6, 0.79, 0.8, 1].map(dialFrom)).toEqual([1, 1, 2, 3, 4, 4, 5, 5]);
  });
});

// ---------------------------------------------------------------------------
// In-match decisions
// ---------------------------------------------------------------------------

makeTeam('coachhome', 0.6, 61);
makeTeam('coachaway', 0.6, 62);
const ctx: MatchContext = contextOf('coachhome', 'coachaway');

/** A human-managed match stepped to `minute`, so the only decisions are the ones the test asks for. */
function matchAt(minute: number, seed = 1): MatchState {
  const state = createMatch(makeSetup('coachhome', 'coachaway', seed, { aiControlled: { home: false, away: false } }), ctx);
  while (!isFinished(state) && state.minute < minute) stepMinute(state, ctx);
  // Keep the scenarios clean: no injuries or cards carried in from the random first part.
  state.injuries = [];
  for (const side of [state.home, state.away]) {
    if (side.sentOff.length > 0) throw new Error('pick another seed: a player was sent off');
  }
  state.homeScore = 0;
  state.awayScore = 0;
  return state;
}

function outfieldStarter(state: MatchState, index = 0): string {
  return state.home.onPitch.filter((id) => id !== '' && ctx.players[id].position !== 'GK')[index];
}

function subsIn(actions: MatchAction[]): Extract<MatchAction, { type: 'substitute' }>[] {
  return actions.filter((a): a is Extract<MatchAction, { type: 'substitute' }> => a.type === 'substitute');
}

function tacticsIn(actions: MatchAction[]): Extract<MatchAction, { type: 'setTactics' }> | undefined {
  return actions.find((a): a is Extract<MatchAction, { type: 'setTactics' }> => a.type === 'setTactics');
}

describe('inMatchDecisions', () => {
  it('substitutes an exhausted player during the sub window', () => {
    const state = matchAt(65);
    const tired = outfieldStarter(state, 2);
    for (const id of state.home.onPitch) if (id !== '') state.home.fatigue[id] = 0.9;
    state.home.fatigue[tired] = 0.2;
    const subs = subsIn(inMatchDecisions(state, ctx, 'home'));
    expect(subs).toHaveLength(1);
    expect(subs[0].outId).toBe(tired);
    expect(state.home.bench).toContain(subs[0].inId);
  });

  it('waits for the sub window before replacing a merely tired player', () => {
    const state = matchAt(30);
    state.home.fatigue[outfieldStarter(state)] = 0.2;
    expect(subsIn(inMatchDecisions(state, ctx, 'home'))).toEqual([]);
  });

  it('replaces an injured player at any minute', () => {
    const state = matchAt(10);
    const hurt = outfieldStarter(state, 1);
    state.injuries.push({ playerId: hurt, weeks: 2 });
    const subs = subsIn(inMatchDecisions(state, ctx, 'home'));
    expect(subs).toHaveLength(1);
    expect(subs[0].outId).toBe(hurt);
  });

  it('brings on the spare keeper when the keeper is sent off', () => {
    const state = matchAt(30);
    const keeper = state.home.onPitch[0];
    state.home.onPitch[0] = '';
    state.home.sentOff.push(keeper);
    const subs = subsIn(inMatchDecisions(state, ctx, 'home'));
    expect(subs).toHaveLength(1);
    expect(ctx.players[subs[0].inId].position).toBe('GK');
  });

  it('keeps making planned substitutions in extra time', () => {
    const state = matchAt(65);
    state.period = 'etFirstHalf';
    state.minute = 100;
    const tired = outfieldStarter(state, 3);
    for (const id of state.home.onPitch) if (id !== '') state.home.fatigue[id] = 0.9;
    state.home.fatigue[tired] = 0.3;
    expect(subsIn(inMatchDecisions(state, ctx, 'home')).map((a) => a.outId)).toEqual([tired]);
  });

  it('makes no substitution once five are used or the bench is empty', () => {
    const state = matchAt(65);
    state.home.fatigue[outfieldStarter(state)] = 0.2;
    state.home.subsUsed = 5;
    expect(subsIn(inMatchDecisions(state, ctx, 'home'))).toEqual([]);
    state.home.subsUsed = 0;
    state.home.bench = [];
    expect(subsIn(inMatchDecisions(state, ctx, 'home'))).toEqual([]);
  });

  it('chases a deficit with a more attacking mentality, more so two goals down', () => {
    const base = matchAt(I.chase.from + 1);
    const start = base.home.tactics.mentality;
    base.awayScore = 1;
    expect(tacticsIn(inMatchDecisions(base, ctx, 'home'))?.tactics.mentality).toBe(Math.min(5, start + I.chase.mentalityStep));
    base.awayScore = 2;
    expect(tacticsIn(inMatchDecisions(base, ctx, 'home'))?.tactics.mentality).toBe(Math.min(5, start + I.chase.twoGoalsStep));
  });

  it('protects a late lead: deeper, more defensive, runs the clock down and counters', () => {
    const state = matchAt(I.protect.from + 1);
    const start = state.home.tactics;
    state.homeScore = 1;
    const change = tacticsIn(inMatchDecisions(state, ctx, 'home'));
    expect(change).toBeDefined();
    expect(change!.tactics.mentality).toBe(Math.max(1, start.mentality + I.protect.mentalityStep));
    expect(change!.tactics.defensiveLine).toBe(Math.max(1, start.defensiveLine + I.protect.lineStep));
    expect(change!.tactics.timeWasting).toBe(I.protect.timeWasting);
    expect(change!.tactics.counterAttack).toBe(true);
  });

  it('keeps its shape while level and before the late phase', () => {
    const state = matchAt(40);
    expect(inMatchDecisions(state, ctx, 'home')).toEqual([]);
  });

  it('tightens up after a red card', () => {
    const state = matchAt(30);
    const victim = outfieldStarter(state, 4);
    state.home.onPitch[state.home.onPitch.indexOf(victim)] = '';
    state.home.sentOff.push(victim);
    const change = tacticsIn(inMatchDecisions(state, ctx, 'home'));
    expect(change).toBeDefined();
    expect(change!.tactics.mentality).toBe(Math.max(1, state.setup.home.tactics.mentality - 1));
    const fallback = (I.redCard.formationFallback as Record<string, string>)[state.setup.home.tactics.formationId];
    expect(change!.tactics.formationId).toBe(fallback);
  });

  it('makes no decisions in a shootout or after the final whistle, and is deterministic', () => {
    const state = matchAt(70);
    state.awayScore = 1;
    state.home.fatigue[outfieldStarter(state)] = 0.3;
    const copy = JSON.parse(JSON.stringify(state)) as MatchState;
    expect(inMatchDecisions(copy, ctx, 'home')).toEqual(inMatchDecisions(state, ctx, 'home'));
    expect(copy.rngState).toBe(state.rngState);
    state.period = 'shootout';
    expect(inMatchDecisions(state, ctx, 'home')).toEqual([]);
    state.finished = true;
    state.period = 'finished';
    expect(inMatchDecisions(state, ctx, 'home')).toEqual([]);
  });

  it('AI subs in real matches come in the sub window unless forced by an injury or a sending-off', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const state = createMatch(makeSetup('coachhome', 'coachaway', seed), ctx);
      while (!isFinished(state)) stepMinute(state, ctx);
      for (const e of state.events.filter((x) => x.type === 'substitution')) {
        const forced = state.injuries.some((i) => i.playerId === e.playerId) || ctx.players[e.secondaryPlayerId!].position === 'GK';
        if (!forced && e.minute <= 90) {
          expect(e.minute).toBeGreaterThanOrEqual(I.subWindow.from);
          expect(e.minute).toBeLessThanOrEqual(I.subWindow.to);
        }
      }
    }
  });
});

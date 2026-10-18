import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  EVENTS,
  OWNER_MEMORY,
  addHeat,
  advanceCareer,
  answerEvent,
  askingPrice,
  bidFactor,
  createCareer,
  crowdBoost,
  fanSwing,
  fixtureBadge,
  isDerby,
  openEvents,
  ownerMemory,
  rivalLevel,
  rivalsOf,
  rivalryHeat,
  sellFactor,
  squadOf,
  userAskingPrice,
  type Career,
  type TierId,
} from '../src/sim/career';
import { RIVALRY_TUNING } from '../src/sim/data';
import { decodeSave, encodeSave, migrate } from '../src/game/save';

function newCareer(seed = 41, withDerby = true): Career {
  const tier = C.tiers.order[1] as TierId;
  const probe = createCareer({ seed, teamId: (C.tiers[tier].clubs as string[])[0], tier, homegrownRule: false });
  const teams = probe.season.league.teams;
  // A club in the tier with a same-region neighbour, so the derby paths run.
  const clubs = C.tiers[tier].clubs as string[];
  const pick = clubs.find((id) => withDerby === teams.some((t) => t.id !== id && isDerby(probe, id, t.id))) ?? clubs[0];
  return createCareer({ seed, teamId: pick, tier, homegrownRule: false });
}

function playYear(career: Career): void {
  for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
    for (const ev of openEvents(career)) answerEvent(career, ev.id, null);
    advanceCareer(career);
  }
}

describe('rivalries: derbies', () => {
  it('a derby is any same-region game and draws a bigger, louder crowd', () => {
    const career = newCareer();
    const me = career.userTeamId;
    const rival = career.season.league.teams.find((t) => isDerby(career, me, t.id));
    expect(rival).toBeTruthy();
    expect(rivalLevel(career, rival!.id)).toBe('derby');
    expect(fixtureBadge(career, { homeId: me, awayId: rival!.id })).toBe('derby');
    expect(crowdBoost(career, me, rival!.id)).toBeCloseTo(RIVALRY_TUNING.derby.crowdBoost);
    expect(fanSwing(career, rival!.id, me)).toBeGreaterThan(1);
    expect(rivalryHeat(career, rival!.id)).toBeGreaterThanOrEqual(RIVALRY_TUNING.derbyBase);
    const plain = career.season.league.teams.find((t) => t.id !== me && !isDerby(career, me, t.id))!;
    expect(fixtureBadge(career, { homeId: me, awayId: plain.id })).toBeNull();
    expect(crowdBoost(career, me, plain.id)).toBe(0);
    expect(fanSwing(career, me, plain.id)).toBe(1);
  });

  it('history makes a rival out of a plain club, and it cools', () => {
    const career = newCareer();
    const me = career.userTeamId;
    const plain = career.season.league.teams.find((t) => t.id !== me && !isDerby(career, me, t.id))!;
    addHeat(career, plain.id, RIVALRY_TUNING.rivalHeat + 0.05);
    expect(rivalLevel(career, plain.id)).toBe('rival');
    expect(rivalsOf(career).some((r) => r.teamId === plain.id)).toBe(true);
    addHeat(career, plain.id, -1);
    expect(career.story.heat[plain.id]).toBeUndefined();
    addHeat(career, me, 0.5);
    expect(career.story.heat[me]).toBeUndefined();
  });
});

describe('rivalries: a season', () => {
  const career = newCareer();
  const before = JSON.stringify(career.owners);
  playYear(career);

  it('the derbies leave heat behind and the rivalry stays in range', () => {
    expect(career.phase).toBe('review');
    const derbyIds = career.season.league.teams.filter((t) => isDerby(career, career.userTeamId, t.id)).map((t) => t.id);
    for (const id of derbyIds) expect(career.story.heat[id] ?? 0).toBeGreaterThan(0);
    for (const v of Object.values(career.story.heat)) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('owners keep their names and temperaments, with memory in range', () => {
    const now = career.owners;
    const was = JSON.parse(before) as Career['owners'];
    for (const [id, o] of Object.entries(was)) {
      expect(now[id].name).toBe(o.name);
      expect(now[id].temperament).toBe(o.temperament);
      expect(Math.abs(now[id].memory)).toBeLessThanOrEqual(1);
    }
  });

  it('is the same season from the same seed', () => {
    const again = newCareer();
    playYear(again);
    expect(again.story.heat).toEqual(career.story.heat);
    expect(again.owners).toEqual(career.owners);
  });
});

describe('rivalries: owners', () => {
  it('every other club has an owner, the same for the same seed', () => {
    const a = newCareer(7);
    const b = newCareer(7);
    const others = a.season.league.teams.filter((t) => t.id !== a.userTeamId);
    expect(Object.keys(a.owners).sort()).toEqual(others.map((t) => t.id).sort());
    expect(a.owners).toEqual(b.owners);
    expect(a.owners[a.userTeamId]).toBeUndefined();
    const temperaments = new Set(Object.values(newCareer(3).owners).concat(Object.values(a.owners)).map((o) => o.temperament));
    expect(temperaments.size).toBeGreaterThanOrEqual(3);
  });

  it('memory and rivalry move what an owner asks and offers', () => {
    const career = newCareer();
    const me = career.userTeamId;
    const seller = career.season.league.teams.find((t) => t.id !== me && !isDerby(career, me, t.id))!;
    const player = squadOf(career, seller.id).sort((x, y) => y.value - x.value)[0];
    const base = sellFactor(career, seller.id);
    expect(userAskingPrice(career, player)).toBeGreaterThan(0);
    expect(Math.abs(userAskingPrice(career, player) / askingPrice(career, player) - base)).toBeLessThan(0.05);
    ownerMemory(career, seller.id, 1);
    expect(sellFactor(career, seller.id)).toBeLessThan(base);
    const bid = bidFactor(career, seller.id);
    ownerMemory(career, seller.id, -2);
    expect(bidFactor(career, seller.id)).toBeLessThan(bid);
    const sour = sellFactor(career, seller.id);
    addHeat(career, seller.id, 0.8);
    expect(sellFactor(career, seller.id)).toBeGreaterThan(sour);
    expect(OWNER_MEMORY.accept).toBeGreaterThan(0);
  });
});

describe('rivalries: events and saves', () => {
  it('the rivalry events are loaded', () => {
    const ids = EVENTS.map((e) => e.id);
    for (const id of ['rival-jibe', 'derby-wager', 'rival-tapping', 'derby-safety', 'mural-wars', 'derby-tickets', 'rival-dinner']) {
      expect(ids).toContain(id);
    }
  });

  it('a derby event comes up in a few seasons', () => {
    let seen = 0;
    for (const seed of [41, 42, 43]) {
      const career = newCareer(seed);
      for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
        for (const ev of openEvents(career)) {
          const def = EVENTS.find((d) => d.id === ev.eventId);
          if (def?.when.derbyNext || def?.when.rivalNext) seen++;
          answerEvent(career, ev.id, null);
        }
        advanceCareer(career);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('owners survive a save code and a version 7 save gets them', () => {
    const career = newCareer();
    ownerMemory(career, Object.keys(career.owners)[0], 0.3);
    expect(decodeSave(encodeSave(career)).owners).toEqual(career.owners);
    const old = JSON.parse(JSON.stringify(career)) as { version: number; owners?: unknown };
    delete old.owners;
    old.version = 7;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(Object.keys(up.owners).length).toBe(career.season.league.teams.length - 1);
    expect(up.owners[Object.keys(career.owners)[1]]).toEqual(career.owners[Object.keys(career.owners)[1]]);
    advanceCareer(up);
  });
});

describe('rivalries: screens', async () => {
  const { renderClub } = await import('../src/ui/views/career/club');
  const { rivalPill, ownerLine } = await import('../src/ui/views/career/parts');
  it('the Club screen lists the derby rivals with their owners', () => {
    const career = newCareer();
    const html = renderClub(career, { pendingConfirm: null } as never);
    expect(html).toContain('Rivals');
    expect(html).toContain('pill-derby');
    const rival = rivalsOf(career)[0];
    expect(html).toContain(career.owners[rival.teamId].name);
  });

  it('badges and owner lines read plainly', () => {
    const career = newCareer();
    expect(rivalPill('derby')).toContain('Derby');
    expect(rivalPill(null)).toBe('');
    const id = Object.keys(career.owners)[0];
    expect(ownerLine(career, id)).toMatch(/^Owner: .+ · .+, neutral$/);
    expect(ownerLine(career, career.userTeamId)).toBe('');
  });
});

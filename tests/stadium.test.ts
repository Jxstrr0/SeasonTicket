import { describe, expect, it } from 'vitest';
import {
  CAREER_VERSION,
  STAND_IDS,
  advanceCareer,
  advanceToReview,
  cancelProject,
  capacityWhenBuilt,
  continueToNextSeason,
  createCareer,
  fullCapacity,
  hospitalityPerMatch,
  orderProject,
  setStadiumLook,
  stadiumAttendance,
  stadiumOptions,
  standSeats,
  totalBoxes,
  tvBonus,
  userTeam,
  type Career,
} from '../src/sim/career';
import { decodeSave, encodeSave, migrate } from '../src/game/save';
import { STADIUM_TUNING as S } from '../src/sim/data';
import CLUBS from '../src/data/clubs.json';
import { initialUi } from '../src/ui/career/state';
import { renderStadium } from '../src/ui/views/career/stadium';
import { buildStadiumSnapshot } from '../src/ui/career/stadiumSnapshot';

function newCareer(teamId = 'crowncaster-city', seed = 5): Career {
  const career = createCareer({ seed, teamId, tier: 'easy', homegrownRule: false });
  career.books[career.userTeamId].cash = 60_000_000;
  return career;
}

function toKickoff(career: Career): void {
  while (career.phase === 'preseason') advanceCareer(career);
}

const userStadium = (career: Career) => career.stadiums[career.userTeamId];

describe('stadium', () => {
  it('starts every club in a ground close to its listed capacity', () => {
    const career = newCareer();
    for (const club of CLUBS) {
      const team = career.season.league.teams.find((t) => t.id === club.id)!;
      const ground = career.stadiums[club.id];
      expect(Math.abs(fullCapacity(ground) - club.stadiumCapacity)).toBeLessThanOrEqual(1500);
      expect(team.stadiumCapacity).toBe(fullCapacity(ground));
      expect(ground.demand).toBe(club.stadiumCapacity);
    }
    // Bigger clubs have bigger grounds and more boxes.
    expect(totalBoxes(career.stadiums['crowncaster-city'])).toBeGreaterThan(totalBoxes(career.stadiums['frostbeck-town']));
    expect(JSON.stringify(newCareer().stadiums)).toBe(JSON.stringify(career.stadiums));
  });

  it('builds a stand in the pre-season: paid up front, finished on time, more seats', () => {
    const career = newCareer();
    const option = stadiumOptions(career).find((o) => o.kind === 'stand' && o.available)!;
    expect(option).toBeTruthy();
    const cash = career.books[career.userTeamId].cash;
    const before = fullCapacity(userStadium(career));
    const res = orderProject(career, option.key);
    expect(res.ok).toBe(true);
    expect(career.books[career.userTeamId].cash).toBeCloseTo(cash - option.cost, 0);
    expect(career.books[career.userTeamId].ledger.spending.upgrades).toBeCloseTo(option.cost, 0);
    expect(userStadium(career).projects).toHaveLength(1);
    // Pre-season work closes nothing.
    expect(userTeam(career).stadiumCapacity).toBe(before);
    // The same structure can't take a second project.
    expect(stadiumOptions(career).find((o) => o.key === option.key)!.available).toBe(false);
    // The seats it will add are counted as soon as work starts.
    expect(capacityWhenBuilt(userStadium(career))).toBe(before + option.seatsAdded);
    for (let i = 0; i < option.weeks; i++) advanceCareer(career);
    expect(userStadium(career).projects).toHaveLength(0);
    expect(fullCapacity(userStadium(career))).toBe(before + option.seatsAdded);
    expect(capacityWhenBuilt(userStadium(career))).toBe(before + option.seatsAdded);
    expect(career.inbox.some((m) => m.kind === 'stadium')).toBe(true);
  });

  it('closes seats for work started in the season, and queues summer work for free until then', () => {
    const career = newCareer();
    toKickoff(career);
    const before = userTeam(career).stadiumCapacity;
    const stands = stadiumOptions(career).filter((o) => o.kind === 'stand' && o.available);
    expect(stands.length).toBeGreaterThanOrEqual(2);
    expect(orderProject(career, stands[0].key, 'now').ok).toBe(true);
    const target = stands[0].target as (typeof STAND_IDS)[number];
    const closed = Math.round((standSeats(userStadium(career), target) * S.stands.closedShare) / 100) * 100;
    expect(userTeam(career).stadiumCapacity).toBe(before - closed);

    const cash = career.books[career.userTeamId].cash;
    expect(orderProject(career, stands[1].key, 'summer').ok).toBe(true);
    const queued = userStadium(career).projects.find((p) => p.queued)!;
    expect(queued).toBeTruthy();
    expect(userTeam(career).stadiumCapacity).toBe(before - closed);
    expect(cancelProject(career, queued.id).ok).toBe(true);
    expect(career.books[career.userTeamId].cash).toBeCloseTo(cash, 0);
    expect(career.books[career.userTeamId].ledger.spending.upgrades).toBeCloseTo(stands[0].cost, 0);
    // Work under way can't be called off.
    expect(cancelProject(career, userStadium(career).projects[0].id).ok).toBe(false);
  });

  it('builds queued work over the summer and finishes it before kick-off', () => {
    const career = newCareer();
    toKickoff(career);
    const option = stadiumOptions(career).find((o) => o.kind === 'stand' && o.available)!;
    const before = fullCapacity(userStadium(career));
    expect(orderProject(career, option.key, 'summer').ok).toBe(true);
    advanceToReview(career);
    expect(userStadium(career).projects).toHaveLength(1);
    expect(fullCapacity(userStadium(career))).toBe(before);
    continueToNextSeason(career);
    const left = Math.max(0, option.weeks - S.projects.summerWeeks);
    expect(userStadium(career).projects.reduce((n, p) => n + p.weeksLeft, 0)).toBe(left);
    toKickoff(career);
    expect(userStadium(career).projects).toHaveLength(0);
    expect(userTeam(career).stadiumCapacity).toBe(before + option.seatsAdded);
  });

  it('explains why a project is not available', () => {
    const career = newCareer('frostbeck-town');
    const corner = stadiumOptions(career).find((o) => o.kind === 'corner')!;
    expect(corner.available).toBe(false);
    expect(corner.reason).toMatch(/Needs/);
    career.books[career.userTeamId].cash = 10_000;
    const upgrade = stadiumOptions(career).find((o) => o.kind === 'upgrade')!;
    expect(upgrade.reason).toMatch(/Costs/);
    expect(orderProject(career, upgrade.key).ok).toBe(false);

    career.books[career.userTeamId].cash = 60_000_000;
    const ups = stadiumOptions(career).filter((o) => o.kind === 'upgrade' && o.available);
    for (const o of ups.slice(0, S.projects.maxActive)) expect(orderProject(career, o.key).ok).toBe(true);
    const next = stadiumOptions(career).find((o) => o.kind === 'upgrade' && !userStadium(career).projects.some((p) => p.target === o.target))!;
    expect(next.reason).toMatch(/busy/);

    const locked = newCareer('frostbeck-town');
    locked.ladder.level = 3;
    expect(stadiumOptions(locked).every((o) => !o.available)).toBe(true);
  });

  it('turns upgrades into money', () => {
    const career = newCareer();
    const ground = userStadium(career);
    const team = userTeam(career);
    const tv = tvBonus(ground);
    ground.upgrades.floodlights += 1;
    expect(tvBonus(ground)).toBe(tv + S.upgrades.floodlights.tvPerLevel);
    expect(hospitalityPerMatch(team, ground)).toBeGreaterThan(0);
    const small = newCareer('frostbeck-town');
    expect(hospitalityPerMatch(userTeam(small), userStadium(small))).toBe(0);

    toKickoff(career);
    advanceCareer(career);
    advanceCareer(career);
    expect(career.books[career.userTeamId].ledger.income.hospitality).toBeGreaterThan(0);
  });

  it('fills a ground only as far as demand allows', () => {
    const career = newCareer();
    const team = userTeam(career);
    const ground = userStadium(career);
    const normal = stadiumAttendance(career, team, 0.7);
    ground.demand = team.stadiumCapacity * 2;
    expect(stadiumAttendance(career, team, 0.7)).toBe(1);
    ground.demand = team.stadiumCapacity / 2;
    expect(stadiumAttendance(career, team, 0.7)).toBeLessThan(normal);
  });

  it('lets the owner restyle the ground for free, within the choices', () => {
    const career = newCareer();
    const cash = career.books[career.userTeamId].cash;
    setStadiumLook(career, { seats: 'initials', mow: 'checks', roof: 'primary' });
    setStadiumLook(career, { mow: 'plaid' as never });
    expect(userStadium(career).look).toEqual({ seats: 'initials', mow: 'checks', roof: 'primary' });
    expect(career.books[career.userTeamId].cash).toBe(cash);
  });

  it('keeps a built ground, its building work and its look through an exported save code', () => {
    const career = newCareer();
    const first = stadiumOptions(career).find((o) => o.kind === 'stand' && o.available)!;
    orderProject(career, first.key);
    for (let i = 0; i < first.weeks; i++) advanceCareer(career);
    const second = stadiumOptions(career).find((o) => o.available && o.key !== first.key)!;
    expect(orderProject(career, second.key).ok).toBe(true);
    advanceCareer(career);
    setStadiumLook(career, { seats: 'initials', mow: 'diagonal', roof: 'secondary' });
    const before = buildStadiumSnapshot(career);
    expect(before.works).toHaveLength(1);

    const restored = decodeSave(encodeSave(career));
    expect(restored.stadiums).toEqual(career.stadiums);
    // The 3D ground is drawn from this snapshot, so the same snapshot means the same ground.
    // (The crest's clip-path id is a page-wide counter, so it is left out of the comparison.)
    const plain = (snap: typeof before) => ({ ...snap, crestSvg: snap.crestSvg?.replace(/crest-clip-\d+/g, 'crest-clip') });
    expect(plain(buildStadiumSnapshot(restored))).toEqual(plain(before));
    expect(fullCapacity(userStadium(restored))).toBe(fullCapacity(userStadium(career)));
  });

  it('upgrades a version 1 save to a ground for every club', () => {
    const career = newCareer();
    const v1 = JSON.parse(JSON.stringify(career));
    v1.version = 1;
    delete v1.stadiums;
    for (const t of v1.season.league.teams) t.stadiumCapacity = CLUBS.find((c) => c.id === t.id)!.stadiumCapacity;
    for (const b of Object.values(v1.books) as { ledger: { income: Record<string, number> } }[]) delete b.ledger.income.hospitality;
    const migrated = migrate(v1);
    expect(migrated.version).toBe(CAREER_VERSION);
    expect(migrated.stadiums).toEqual(career.stadiums);
    expect(migrated.season.league.teams.map((t) => t.stadiumCapacity)).toEqual(career.season.league.teams.map((t) => t.stadiumCapacity));
    expect(migrated.books[career.userTeamId].ledger.income.hospitality).toBe(0);
    expect(encodeSave(migrated).length).toBeGreaterThan(0);
  });

  it('has AI clubs improve their grounds over a few seasons', () => {
    const career = newCareer('frostbeck-town', 9);
    const start = JSON.stringify(Object.entries(career.stadiums).filter(([id]) => id !== career.userTeamId));
    const startSeats = Object.fromEntries(Object.entries(career.stadiums).map(([id, g]) => [id, fullCapacity(g)]));
    for (let season = 0; season < 3; season++) {
      career.books[career.userTeamId].cash = 60_000_000;
      advanceToReview(career);
      continueToNextSeason(career);
    }
    expect(JSON.stringify(Object.entries(career.stadiums).filter(([id]) => id !== career.userTeamId))).not.toBe(start);
    for (const [id, ground] of Object.entries(career.stadiums)) expect(fullCapacity(ground)).toBeGreaterThanOrEqual(startSeats[id]);
  }, 60_000);
});

describe('stadium tab', () => {
  it('offers summer or now in the season, and start-now or call-off for queued work', () => {
    const career = newCareer();
    toKickoff(career);
    const ui = { ...initialUi(), screen: 'hub' as const, tab: 'stadium' as const, stadiumPick: 'east' as const };
    let html = renderStadium(career, ui);
    expect(html).toContain('Pay now, build in the off-season');
    expect(html).toMatch(/data-action="order-project"[^>]*data-id="[^"|]+\|now"/);
    const option = stadiumOptions(career).find((o) => o.kind === 'stand' && o.target === 'east' && o.available)!;
    expect(orderProject(career, option.key, 'summer').ok).toBe(true);
    html = renderStadium(career, ui);
    expect(html).toContain('start-project-now');
    expect(html).toContain('cancel-project');
    expect(html).toContain('1 of 3 building crews booked');
    for (const pick of ['corners', 'ground', 'look'] as const) {
      // The 3D view is the default; the plan shows when chosen or when 3D is off.
      expect(renderStadium(career, { ...ui, stadiumPick: pick })).toContain('data-slot="stadium-3d"');
      expect(renderStadium(career, { ...ui, stadiumPick: pick, stadiumView: 'plan' })).toContain('st-plan');
      expect(renderStadium(career, { ...ui, stadiumPick: pick, quality: 'off' })).toContain('st-plan');
      expect(renderStadium(career, { ...ui, stadiumPick: pick, stadium3dFailed: true })).not.toContain('data-slot="stadium-3d"');
    }
  });
});

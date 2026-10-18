import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  EVENTS,
  acceptSponsor,
  advanceCareer,
  answerEvent,
  createCareer,
  eventDef,
  openEvents,
  ongoingStories,
  orderProject,
  ownerMemory,
  setTicketPrice,
  squadOf,
  stadiumOptions,
  startStoryEvent,
  storyGate,
  userBooks,
  userTeam,
  type Career,
  type StoryEvent,
  type TierId,
} from '../src/sim/career';
import { decodeSave, encodeSave, migrate } from '../src/game/save';

function newCareer(seed = 63): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

/** One week on, with the staff answering anything left open except `keep`. */
function week(career: Career, keep: string[] = []): void {
  for (const ev of openEvents(career)) if (!keep.includes(ev.eventId)) answerEvent(career, ev.id, null);
  advanceCareer(career);
}

function intoSeason(career: Career, weeks = 1): void {
  while (career.phase === 'preseason') week(career);
  for (let i = 0; i < weeks; i++) week(career);
}

function star(career: Career) {
  return [...squadOf(career, career.userTeamId)].sort((a, b) => b.overall - a.overall)[0];
}

function opened(career: Career, eventId: string): StoryEvent | undefined {
  return openEvents(career).find((e) => e.eventId === eventId);
}

/** In the paper, or on the wire waiting for the next edition. */
function inPaper(career: Career, re: RegExp): boolean {
  return [...career.news.items, ...career.news.wire].some((n) => 'headline' in n && re.test(n.headline));
}

function headCoach(career: Career): string | undefined {
  return userTeam(career).staffIds.find((id) => career.season.league.staff[id]?.role === 'headCoach');
}

const CRISES = EVENTS.filter((e) => e.id === 'dressing-room-row' || e.when.chainOnly || ['transfer-request', 'injury-crisis', 'sponsor-scandal', 'floodlight-failure', 'fan-protest', 'permit-fight', 'coach-poach', 'lender-visit', 'naming-rights-backlash'].includes(e.id));

describe('crises: data', () => {
  it('every follow-up named by a choice exists and is chain-only', () => {
    expect(CRISES.length).toBeGreaterThanOrEqual(18);
    for (const def of EVENTS) {
      for (const c of def.choices) {
        for (const fx of c.effects) {
          if (!('next' in fx)) continue;
          const next = eventDef(fx.next);
          expect(next, `${def.id}/${c.id} -> ${fx.next}`).toBeTruthy();
          expect(next!.when.chainOnly).toBe(true);
        }
      }
    }
  });

  it('chain-only steps are never drawn on their own', () => {
    // An owner who never picks a choice that starts a follow-up never sees one.
    const career = newCareer(64);
    const seen = new Set<string>();
    for (let i = 0; i < 40 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
      for (const ev of openEvents(career)) {
        seen.add(ev.eventId);
        const def = eventDef(ev.eventId);
        const pick = def?.choices.find((c) => !c.effects.some((fx) => 'next' in fx));
        answerEvent(career, ev.id, pick?.id ?? null);
      }
      advanceCareer(career);
    }
    for (const id of seen) expect(eventDef(id)?.when.chainOnly ?? false, id).toBe(false);
  });
});

describe('crises: chains', () => {
  it('a dressing-room row talked out flares again three weeks later, about the same player', () => {
    const career = newCareer();
    intoSeason(career);
    const p = star(career);
    const ev = startStoryEvent(career, 'dressing-room-row', p.id)!;
    expect(answerEvent(career, ev.id, 'talk').ok).toBe(true);
    for (let i = 0; i < 5 && !opened(career, 'row-flares'); i++) week(career, ['row-flares']);
    const next = opened(career, 'row-flares');
    expect(next).toBeTruthy();
    expect(next!.playerId).toBe(p.id);
    expect(next!.person).toBe(ev.person);
  });

  it('a follow-up is dropped when the player has left', () => {
    const career = newCareer();
    intoSeason(career);
    const p = star(career);
    answerEvent(career, startStoryEvent(career, 'transfer-request', p.id)!.id, 'refuse');
    p.teamId = null as never;
    userTeam(career).playerIds = userTeam(career).playerIds.filter((id) => id !== p.id);
    for (let i = 0; i < 5; i++) week(career, ['request-sulk']);
    expect(career.story.events.some((e) => e.eventId === 'request-sulk')).toBe(false);
  });

  it("the lenders' chain ends with a star sale picked for the step", () => {
    const career = newCareer();
    intoSeason(career);
    career.ladder.level = 1;
    career.ladder.deadlineWeek = career.weekIndex + 10;
    const visit = startStoryEvent(career, 'lender-visit')!;
    answerEvent(career, visit.id, 'bluff');
    expect(career.ladder.deadlineWeek).toBe(career.weekIndex + 11);
    for (let i = 0; i < 5 && !opened(career, 'lender-followup'); i++) week(career, ['lender-followup']);
    const follow = opened(career, 'lender-followup')!;
    expect(follow.person).toBe(visit.person);
    answerEvent(career, follow.id, 'sell');
    for (let i = 0; i < 3 && !opened(career, 'lender-star-sale'); i++) week(career, ['lender-star-sale']);
    const sale = opened(career, 'lender-star-sale');
    expect(sale?.playerId).toBeTruthy();
    const bids = career.incomingBids.length;
    answerEvent(career, sale!.id, 'list');
    const mail = career.inbox[0];
    expect(career.incomingBids.length > bids || /No takers/.test(mail.title)).toBe(true);
  });
});

describe('crises: effects', () => {
  it('suspend keeps the player out and listPlayer brings a bid', () => {
    const career = newCareer();
    intoSeason(career);
    const p = star(career);
    const before = p.suspensionMatches;
    answerEvent(career, startStoryEvent(career, 'dressing-room-row', p.id)!.id, 'discipline');
    expect(p.suspensionMatches).toBe(before + 1);
    const bids = career.incomingBids.length;
    answerEvent(career, startStoryEvent(career, 'transfer-request', p.id)!.id, 'accept');
    const bid = career.incomingBids.find((b) => b.playerId === p.id);
    expect(career.incomingBids.length > bids || /No takers/.test(career.inbox[0].title)).toBe(true);
    if (bid) expect(bid.fee).toBeGreaterThan(0);
  });

  it('heal shortens every injury but never clears it outright', () => {
    const career = newCareer();
    intoSeason(career);
    const hurt = squadOf(career, career.userTeamId).slice(0, 4);
    hurt.forEach((p, i) => (p.injuryWeeks = i + 1));
    const ops = userBooks(career).ledger.spending.operations;
    answerEvent(career, startStoryEvent(career, 'injury-crisis')!.id, 'specialist');
    expect(hurt.map((p) => p.injuryWeeks)).toEqual([1, 1, 2, 3]);
    expect(userBooks(career).ledger.spending.operations).toBeGreaterThan(ops);
  });

  it('gate changes the crowd at the next home match only, and clears afterwards', () => {
    const career = newCareer();
    intoSeason(career);
    const me = career.userTeamId;
    const home = () => career.season.schedule.matches.find((m) => !m.result && m.week > career.season.week - 1 && m.homeId === me)!;
    const week0 = home().week;
    answerEvent(career, startStoryEvent(career, 'floodlight-failure')!.id, 'early');
    expect(storyGate(career, me, week0)).toBeCloseTo(-0.25);
    expect(storyGate(career, me, week0 + 1)).toBe(0);
    expect(storyGate(career, home().awayId, week0)).toBe(0);
    // Two closures before the same game stack.
    answerEvent(career, startStoryEvent(career, 'fan-protest')!.id, 'ignore');
    expect(storyGate(career, me, week0)).toBeCloseTo(-0.35);
    while (career.season.week <= week0) week(career, ['protest-boycott']);
    expect(career.story.gate).toBeNull();
  });

  it('dropSponsor ends the shirt deal and brings fresh offers', () => {
    const career = newCareer();
    expect(acceptSponsor(career, 0).ok).toBe(true);
    intoSeason(career);
    expect(userBooks(career).sponsor).toBeTruthy();
    answerEvent(career, startStoryEvent(career, 'sponsor-scandal')!.id, 'drop');
    expect(userBooks(career).sponsor).toBeNull();
    expect(career.sponsorOffers.length).toBeGreaterThan(0);
    expect(inPaper(career, /drop shirt sponsor/)).toBe(true);
  });

  it('delayBuild stretches the work under way', () => {
    const career = newCareer();
    const option = stadiumOptions(career).find((o) => o.available)!;
    expect(orderProject(career, option.key).ok).toBe(true);
    const pr = career.stadiums[career.userTeamId].projects[0];
    const left = pr.weeksLeft;
    answerEvent(career, startStoryEvent(career, 'permit-fight')!.id, 'delay');
    expect(pr.weeksLeft).toBe(left + 4);
  });

  it('coachLeaves swaps in an interim, pays compensation and pleases the rival owner', () => {
    const career = newCareer();
    intoSeason(career);
    const was = headCoach(career);
    const ev = startStoryEvent(career, 'coach-poach')!;
    expect(ev.teamId).toBeTruthy();
    const memory = career.owners[ev.teamId!].memory;
    const cash = userBooks(career).cash;
    answerEvent(career, ev.id, 'sell');
    const now = headCoach(career);
    expect(now).toBeTruthy();
    expect(now).not.toBe(was);
    expect(career.season.league.staff[was!].teamId).toBeNull();
    expect(userBooks(career).cash).toBe(cash + ev.amount);
    expect(career.owners[ev.teamId!].memory).toBeGreaterThan(memory);
    ownerMemory(career, ev.teamId!, 0);
  });
});

describe('crises: promises to the fans', () => {
  it('a price freeze is broken by a rise, and the paper hears', () => {
    const career = newCareer();
    intoSeason(career);
    answerEvent(career, startStoryEvent(career, 'fan-protest')!.id, 'freeze');
    expect(setTicketPrice(career, Math.round(userBooks(career).ticketPrice * 1.2)).ok).toBe(true);
    for (let i = 0; i < 13; i++) week(career);
    expect(career.inbox.some((m) => /raised prices after promising/.test(m.title))).toBe(true);
    expect(inPaper(career, /breaks ticket promise/)).toBe(true);
  });

  it('a kept price freeze says so', () => {
    const career = newCareer();
    intoSeason(career);
    answerEvent(career, startStoryEvent(career, 'fan-protest')!.id, 'freeze');
    for (let i = 0; i < 13; i++) week(career);
    expect(career.inbox.some((m) => m.title === 'Price freeze kept')).toBe(true);
  });

  it('a promise of wins is judged on the wins that came', () => {
    const career = newCareer();
    intoSeason(career);
    const won = () => career.season.standings.find((r) => r.teamId === career.userTeamId)!.won;
    const start = won();
    answerEvent(career, startStoryEvent(career, 'fan-protest')!.id, 'meet');
    for (let i = 0; i < 7; i++) week(career);
    const kept = won() - start >= 3;
    expect(career.inbox.some((m) => m.title === (kept ? 'The fans got their wins' : 'The wins never came'))).toBe(true);
  });
});

describe('crises: saves and determinism', () => {
  it('the same seed and answers give the same story', () => {
    const run = () => {
      const career = newCareer(65);
      for (let i = 0; i < 24; i++) {
        for (const ev of openEvents(career)) answerEvent(career, ev.id, eventDef(ev.eventId)?.choices.at(-1)?.id ?? null);
        advanceCareer(career);
      }
      return JSON.stringify([career.story, userBooks(career).cash]);
    };
    expect(run()).toBe(run());
  });

  it('a pending gate and chain survive a save code, and a version 8 save upgrades', () => {
    const career = newCareer();
    intoSeason(career);
    answerEvent(career, startStoryEvent(career, 'floodlight-failure')!.id, 'early');
    answerEvent(career, startStoryEvent(career, 'transfer-request', star(career).id)!.id, 'refuse');
    const back = decodeSave(encodeSave(career));
    expect(back.story.gate).toEqual(career.story.gate);
    expect(back.story.timers).toEqual(career.story.timers);
    const old = JSON.parse(JSON.stringify(career)) as { version: number; story: { gate?: unknown } };
    delete old.story.gate;
    old.version = 8;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(up.story.gate).toBeNull();
    advanceCareer(up);
  });
});

describe('crises: the Ongoing card', async () => {
  const { renderClub } = await import('../src/ui/views/career/club');
  const { renderHome } = await import('../src/ui/views/career/home');
  it('lists promises, unfinished stories and the next home crowd, without spoiling surprises', () => {
    const career = newCareer();
    intoSeason(career);
    expect(renderHome(career, { pendingConfirm: null } as never)).not.toContain('card-title">Ongoing');
    const p = star(career);
    answerEvent(career, startStoryEvent(career, 'transfer-request', p.id)!.id, 'refuse');
    answerEvent(career, startStoryEvent(career, 'fan-protest')!.id, 'freeze');
    answerEvent(career, startStoryEvent(career, 'floodlight-failure')!.id, 'early');
    const list = ongoingStories(career);
    expect(list.map((o) => o.kind).sort()).toEqual(['gate', 'promise', 'story']);
    const story = list.find((o) => o.kind === 'story')!;
    expect(story.detail).toContain(p.firstName);
    expect(story.detail).not.toMatch(/\{\w+\}/);
    const club = renderClub(career, { pendingConfirm: null } as never);
    expect(club).toContain('Ongoing');
    expect(club).toContain('No ticket price rise');
    expect(renderHome(career, { pendingConfirm: null } as never)).toContain('card-title">Ongoing');
  });
});

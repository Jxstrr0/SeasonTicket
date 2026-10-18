/**
 * Stage 6 close-out: the story-layer bugs the review round found stay fixed.
 */
import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  acceptBid,
  advanceCareer,
  answerEvent,
  conditionsMet,
  createCareer,
  eventDef,
  fill,
  settleSeasonPromises,
  startStoryEvent,
  transferWindowOpen,
  userBooks,
  userTeam,
  type Career,
  type TierId,
} from '../src/sim/career';

function newCareer(seed = 21): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

const NO_EVENT = { playerId: null, person: null, amount: 0, teamId: null };

describe('story fixes: bids you asked for', () => {
  it('can be accepted while the window is shut, and stand until they lapse', () => {
    const career = newCareer();
    for (let i = 0; i < 12 && (career.phase !== 'season' || transferWindowOpen(career)); i++) advanceCareer(career);
    expect(transferWindowOpen(career)).toBe(false);
    const team = userTeam(career);
    const league = career.season.league;
    const id = [...team.playerIds].sort((a, b) => league.players[a].overall - league.players[b].overall)[5];
    answerEvent(career, startStoryEvent(career, 'transfer-request', id)!.id, 'accept');
    const bid = career.incomingBids.find((b) => b.playerId === id)!;
    expect(bid.listed).toBe(true);
    advanceCareer(career);
    expect(career.incomingBids.some((b) => b.id === bid.id)).toBe(true);
    expect(acceptBid(career, bid.id).ok).toBe(true);
    expect(league.players[id].teamId).not.toBe(career.userTeamId);
  });
});

describe('story fixes: conditions', () => {
  it('the lenders only come for more time while their deadline is running', () => {
    const career = newCareer();
    const when = eventDef('lender-visit')!.when;
    career.ladder.level = 1;
    career.ladder.deadlineWeek = null;
    expect(conditionsMet(career, when)).toBe(false);
    career.ladder.deadlineWeek = career.weekIndex + 4;
    expect(conditionsMet(career, when)).toBe(true);
  });

  it('a council follow-up waits weeks after its flag was set', () => {
    const career = newCareer();
    const when = eventDef('council-reminder')!.when;
    expect(conditionsMet(career, when)).toBe(false);
    answerEvent(career, startStoryEvent(career, 'council-parking')!.id, 'promise');
    expect(conditionsMet(career, when)).toBe(false);
    career.story.flags.councilWaiting = career.weekIndex - 6;
    expect(conditionsMet(career, when)).toBe(true);
    answerEvent(career, startStoryEvent(career, 'council-reminder')!.id, 'stall');
    expect(career.story.flags.councilWaiting).toBeUndefined();
    expect(career.story.flags.councilAnnoyed).toBe(career.weekIndex);
  });
});

describe('story fixes: chains keep their people', () => {
  function scandal(changeSponsor: boolean): boolean {
    const career = newCareer();
    const books = userBooks(career);
    books.sponsor = { brand: 'Brand One', perSeason: 500000, yearsLeft: 2 };
    answerEvent(career, startStoryEvent(career, 'sponsor-scandal')!.id, 'stand');
    if (changeSponsor) books.sponsor = { brand: 'Brand Two', perSeason: 400000, yearsLeft: 3 };
    for (const t of career.story.timers) t.week = career.weekIndex;
    advanceCareer(career);
    return career.story.events.some((e) => e.eventId === 'scandal-deepens');
  }

  it('drops the sponsor step when the sponsor it was about has gone', () => {
    expect(scandal(false)).toBe(true);
    expect(scandal(true)).toBe(false);
  });

  it('a poached coach joins the rival, and the rival’s old coach goes to the pool', () => {
    const career = newCareer();
    const league = career.season.league;
    const team = userTeam(career);
    const coachId = team.staffIds.find((id) => league.staff[id].role === 'headCoach')!;
    const ev = startStoryEvent(career, 'coach-poach')!;
    const rival = league.teams.find((t) => t.id === ev.teamId)!;
    const oldId = rival.staffIds.find((id) => league.staff[id].role === 'headCoach');
    answerEvent(career, ev.id, 'sell');
    expect(league.staff[coachId].teamId).toBe(rival.id);
    expect(rival.staffIds).toContain(coachId);
    expect(team.staffIds).not.toContain(coachId);
    expect(team.staffIds.some((id) => league.staff[id].role === 'headCoach')).toBe(true);
    if (oldId) {
      expect(rival.staffIds).not.toContain(oldId);
      expect(league.staff[oldId].teamId === null || league.staff[oldId].teamId === team.id).toBe(true);
    }
  });
});

describe('story fixes: promises and the season end', () => {
  it('a pre-season promise of games starts counting at the first match week', () => {
    const career = newCareer();
    expect(career.phase).toBe('preseason');
    const id = userTeam(career).playerIds[3];
    answerEvent(career, startStoryEvent(career, 'transfer-request', id)!.id, 'convince');
    const t = career.story.timers.find((x) => x.kind === 'starts')!;
    expect(t.from).toBe(career.weekIndex + C.calendar.preseasonWeeks - career.preseasonWeek + 1);
    expect(t.week).toBe((t.from as number) + 6);
  });

  it('judges a running promise at the season end on the share of time that passed', () => {
    const career = newCareer();
    const id = userTeam(career).playerIds[3];
    answerEvent(career, startStoryEvent(career, 'transfer-request', id)!.id, 'convince');
    const t = career.story.timers.find((x) => x.kind === 'starts')!;
    // Half the promised time has passed: half the four games are owed.
    t.from = career.weekIndex - 3;
    t.week = career.weekIndex + 3;
    career.playerSeason[id] = { ...(career.playerSeason[id] ?? {}), apps: t.baseline + 1 } as (typeof career.playerSeason)[string];
    settleSeasonPromises(career);
    expect(career.story.timers.some((x) => x.kind === 'starts')).toBe(false);
    expect(career.inbox.some((m) => m.title.startsWith('Promise broken'))).toBe(true);
  });
});

describe('story fixes: text', () => {
  it('writes "the" before a stadium only when its name lacks one', () => {
    const career = newCareer();
    const team = userTeam(career);
    team.stadiumName = 'The Foundry';
    expect(fill(career, NO_EVENT, 'at {theStadium}')).toBe('at The Foundry');
    team.stadiumName = 'Riverside Park';
    expect(fill(career, NO_EVENT, 'at {theStadium}')).toBe('at the Riverside Park');
  });
});

import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  advanceCareer,
  advanceDeadlineHour,
  answerDeadlineCall,
  answerEvent,
  bidForPlayer,
  closeDeadline,
  createCareer,
  deadlineView,
  openDeadline,
  openEvents,
  transferWindowOpen,
  userBooks,
  type Career,
  type DeadlineCall,
  type DeadlineKind,
  type TierId,
} from '../src/sim/career';
import { decodeSave, encodeSave, migrate } from '../src/game/save';
import { DEADLINE_TUNING } from '../src/sim/data';

function newCareer(seed = 71): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

function week(career: Career): void {
  for (const ev of openEvents(career)) answerEvent(career, ev.id, null);
  advanceCareer(career);
}

/** A career on the last pre-season week, war room open. */
function atDeadline(seed = 71): Career {
  const career = newCareer(seed);
  while (career.preseasonWeek < C.calendar.preseasonWeeks) week(career);
  return career;
}

/** A career with an open call of this kind, moving the clock and trying seeds until one rings. */
function withCall(kind: DeadlineKind): { career: Career; call: DeadlineCall } {
  for (let seed = 1; seed < 40; seed++) {
    const career = atDeadline(seed);
    while (openDeadline(career)) {
      const call = openDeadline(career)!.calls.find((c) => c.kind === kind && c.status === 'open');
      if (call) return { career, call };
      advanceDeadlineHour(career);
    }
  }
  throw new Error(`no ${kind} call in 40 seeds`);
}

const player = (career: Career, id: string | null) => career.season.league.players[id!];

describe('deadline day: the calendar', () => {
  it('opens on the last week of each window, once, with a call at 09:00', () => {
    const career = newCareer();
    week(career);
    expect(openDeadline(career)).toBeNull();
    while (career.preseasonWeek < C.calendar.preseasonWeeks) week(career);
    const day = openDeadline(career)!;
    expect(day.key).toBe(`${career.season.league.season}-pre`);
    expect(day.hour).toBe(DEADLINE_TUNING.startHour);
    expect(day.calls.length).toBeGreaterThan(0);
    expect(career.inbox[0].title).toBe('Deadline day');

    week(career);
    expect(career.phase).toBe('season');
    expect(career.deadline!.closed).toBe(true);
    const last = C.calendar.midSeasonWindow.at(-1)!;
    while (career.season.week < last) week(career);
    expect(openDeadline(career)?.key).toBe(`${career.season.league.season}-mid`);
    week(career);
    expect(career.deadline!.closed).toBe(true);
    expect(transferWindowOpen(career)).toBe(false);
  });

  it('the staff see the day out when the week is played: nothing left open, front page printed, window shut', () => {
    const career = atDeadline();
    closeDeadline(career);
    const day = career.deadline!;
    expect(day.closed).toBe(true);
    expect(day.byStaff).toBe(true);
    expect(day.hour).toBe(DEADLINE_TUNING.endHour);
    expect(day.calls.every((c) => c.status !== 'open' && c.result)).toBe(true);
    expect(career.news.wire.some((w) => w.kind === 'story' && w.weight === DEADLINE_TUNING.frontPageWeight)).toBe(true);
    expect(transferWindowOpen(career)).toBe(false);
    const target = Object.values(career.season.league.players).find((p) => p.teamId && p.teamId !== career.userTeamId)!;
    expect(bidForPlayer(career, target.id, target.value * 3, 3).message).toMatch(/shut/);
    // The staff never spend the owner's money.
    expect(day.deals.every((d) => d.dir === 'out')).toBe(true);
  });

  it('the clock runs 09:00 to 23:00 within the call limits', () => {
    const career = atDeadline(5);
    let hours = 0;
    while (openDeadline(career)) {
      const day = openDeadline(career)!;
      expect(day.calls.filter((c) => c.status === 'open').length).toBeLessThanOrEqual(DEADLINE_TUNING.calls.maxOpen);
      expect(day.calls.length).toBeLessThanOrEqual(DEADLINE_TUNING.calls.maxTotal);
      advanceDeadlineHour(career);
      hours += 1;
    }
    expect(hours).toBe(DEADLINE_TUNING.endHour - DEADLINE_TUNING.startHour);
    expect(career.deadline!.byStaff).toBe(false);
    expect(deadlineView(career)!.closed).toBe(true);
  });
});

describe('deadline day: the calls', () => {
  it('a late bid sells the player when accepted', () => {
    const { career, call } = withCall('lateBid');
    const cash = userBooks(career).cash;
    const r = answerDeadlineCall(career, call.id, 'yes');
    expect(r.ok).toBe(true);
    expect(call.status).toBe('accepted');
    expect(player(career, call.playerId).teamId).toBe(call.teamId);
    expect(userBooks(career).cash).toBe(cash + call.fee);
    expect(deadlineView(career)!.board.outs.length).toBe(1);
  });

  it('asking for more either lifts the fee once or ends the call', () => {
    const { career, call } = withCall('lateBid');
    const fee = call.fee;
    answerDeadlineCall(career, call.id, 'more');
    if (call.status === 'open') {
      expect(call.fee).toBeGreaterThan(fee);
      expect(answerDeadlineCall(career, call.id, 'more').ok).toBe(false);
    } else {
      expect(call.status).toBe('declined');
      expect(player(career, call.playerId).teamId).toBe(career.userTeamId);
    }
  });

  it('a panic sale and a free agent join when the owner says yes', () => {
    const sale = withCall('panicSale');
    const cash = userBooks(sale.career).cash;
    answerDeadlineCall(sale.career, sale.call.id, 'yes');
    expect(sale.call.status).toBe('accepted');
    expect(player(sale.career, sale.call.playerId).teamId).toBe(sale.career.userTeamId);
    expect(userBooks(sale.career).cash).toBe(cash - sale.call.fee);

    const agent = withCall('freeAgent');
    answerDeadlineCall(agent.career, agent.call.id, 'yes');
    expect(agent.call.status).toBe('accepted');
    expect(player(agent.career, agent.call.playerId).teamId).toBe(agent.career.userTeamId);
    expect(deadlineView(agent.career)!.board.ins.length).toBe(1);
  });

  it('a hijack: gazump and he is yours; let it go and the rival signs him', () => {
    const a = withCall('hijack');
    answerDeadlineCall(a.career, a.call.id, 'yes');
    expect(a.call.status).toBe('accepted');
    expect(player(a.career, a.call.playerId).teamId).toBe(a.career.userTeamId);

    const b = withCall('hijack');
    answerDeadlineCall(b.career, b.call.id, 'no');
    expect(b.call.result).toBeTruthy();
    const moved = player(b.career, b.call.playerId).teamId;
    expect([b.call.rivalId, b.call.teamId]).toContain(moved);
  });

  it('a silly call has no effect on the books', () => {
    const { career, call } = withCall('flavour');
    const cash = userBooks(career).cash;
    answerDeadlineCall(career, call.id, 'yes');
    expect(call.result).toBeTruthy();
    expect(userBooks(career).cash).toBe(cash);
  });

  it('answers to a closed call are refused', () => {
    const { career, call } = withCall('lateBid');
    answerDeadlineCall(career, call.id, 'no');
    expect(answerDeadlineCall(career, call.id, 'yes').ok).toBe(false);
  });
});

describe('deadline day: saves and determinism', () => {
  it('the same seed and answers give the same day', () => {
    const run = () => {
      const career = atDeadline(9);
      while (openDeadline(career)) {
        for (const c of openDeadline(career)!.calls) if (c.status === 'open') answerDeadlineCall(career, c.id, c.kind === 'lateBid' ? 'more' : 'yes');
        advanceDeadlineHour(career);
      }
      return JSON.stringify([career.deadline, userBooks(career).cash]);
    };
    expect(run()).toBe(run());
  });

  it('an open war room survives a save code, and a version 9 save in the last week gets one', () => {
    const career = atDeadline();
    advanceDeadlineHour(career);
    const back = decodeSave(encodeSave(career));
    expect(back.deadline).toEqual(career.deadline);
    const old = JSON.parse(JSON.stringify(career)) as { version: number; deadline?: unknown };
    delete old.deadline;
    old.version = 9;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(openDeadline(up)?.hour).toBe(DEADLINE_TUNING.startHour);
    advanceCareer(up);
    expect(up.deadline!.closed).toBe(true);
  });
});

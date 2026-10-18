import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  EVENTS,
  advanceCareer,
  answerEvent,
  careerHooks,
  createCareer,
  decisionsThisSeason,
  eventDef,
  eventView,
  fill,
  moodForm,
  openEvents,
  playerMood,
  startStoryEvent,
  userBooks,
  userTeam,
  type Career,
  type TierId,
} from '../src/sim/career';
import { STORY_TUNING } from '../src/sim/data';
import { Rng } from '../src/sim/rng';
import { decodeSave, encodeSave, migrate } from '../src/game/save';

function newCareer(seed = 21): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

/** An owner who answers about two thirds of events at random and leaves the rest to the staff. */
function playSeason(career: Career, rng: Rng, quiet: number[] = []): void {
  for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
    for (const ev of openEvents(career)) {
      if (!rng.chance(0.66)) continue;
      answerEvent(career, ev.id, rng.pick(eventDef(ev.eventId)!.choices).id);
    }
    const before = career.story.events.length;
    advanceCareer(career);
    quiet.push(career.story.events.filter((e) => e.weekIndex === career.weekIndex - 1).length === 0 && career.story.events.length <= before ? 1 : 0);
  }
}

function firstPlayer(career: Career): string {
  return userTeam(career).playerIds[0];
}

describe('story layer: a season', () => {
  const career = newCareer();
  const quiet: number[] = [];
  playSeason(career, new Rng(5), quiet);
  const decisions = decisionsThisSeason(career);

  it('brings plenty of varied decisions', () => {
    const counts = new Map<string, number>();
    for (const d of decisions) counts.set(d.eventId, (counts.get(d.eventId) ?? 0) + 1);
    expect(decisions.length).toBeGreaterThanOrEqual(25);
    expect(counts.size).toBeGreaterThanOrEqual(20);
    expect(Math.max(...counts.values()) / decisions.length).toBeLessThanOrEqual(0.08);
  });

  it('keeps the Normal pace to one or two decisions a week', () => {
    const perWeek = decisions.length / quiet.length;
    expect(perWeek).toBeGreaterThanOrEqual(1);
    expect(perWeek).toBeLessThanOrEqual(2);
  });

  it('has quiet weeks and lets the staff answer some', () => {
    expect(quiet.some((q) => q === 1)).toBe(true);
    expect(decisions.some((d) => d.staff)).toBe(true);
    expect(decisions.some((d) => !d.staff)).toBe(true);
  });

  it('brings many kinds of visitor', () => {
    const roles = new Set(decisions.map((d) => eventDef(d.eventId)!.role));
    expect(roles.size).toBeGreaterThanOrEqual(9);
  });

  it('never leaves more open than the cap', () => {
    expect(openEvents(career).length).toBeLessThanOrEqual(STORY_TUNING.pace.maxOpen);
  });

  it('is the same story from the same seed and choices', () => {
    const again = newCareer();
    playSeason(again, new Rng(5));
    expect(again.story).toEqual(career.story);
  });
});

describe('story layer: events and effects', () => {
  it('fills every placeholder in every event', () => {
    const career = newCareer();
    const teamId = career.season.league.teams.find((t) => t.id !== career.userTeamId)!.id;
    const ev = { playerId: firstPlayer(career), person: 'A Visitor', amount: 50_000, teamId };
    for (const def of EVENTS) {
      const texts = [def.title, def.text, ...def.choices.flatMap((c) => [c.label, c.hint, c.result])];
      for (const c of def.choices) for (const e of c.effects) {
        if ('later' in e) texts.push(e.title, e.text);
        if ('next' in e && e.note) texts.push(e.note);
        if ('promise' in e) texts.push(...[e.kept, e.broken, e.news].filter((x): x is string => !!x));
      }
      for (const t of texts) expect(fill(career, ev, t), `${def.id}: ${t}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('opens with a decision message and closes when answered', () => {
    const career = newCareer();
    const ev = startStoryEvent(career, 'reporter-exclusive')!;
    const mail = career.inbox[0];
    expect(mail.kind).toBe('decision');
    expect(mail.eventRef).toBe(ev.id);
    expect(eventView(career, ev)!.choices.length).toBe(3);
    const press = career.story.press;
    expect(answerEvent(career, ev.id, 'open').ok).toBe(true);
    expect(career.story.press).toBeCloseTo(press + 0.08, 5);
    expect(mail.body).toContain('You chose');
    expect(answerEvent(career, ev.id, 'open').ok).toBe(false);
    expect(openEvents(career)).toHaveLength(0);
  });

  it('moves money on the named ledger line, scaled by the market', () => {
    const career = newCareer();
    const books = userBooks(career);
    const ev = startStoryEvent(career, 'hospital-visit')!;
    expect(ev.amount).toBeGreaterThan(0);
    expect(ev.amount % STORY_TUNING.money.round).toBe(0);
    const cash = books.cash, ops = books.ledger.spending.operations;
    answerEvent(career, ev.id, 'donate');
    expect(books.cash).toBe(cash - ev.amount);
    expect(books.ledger.spending.operations).toBe(ops + ev.amount);
    const fine = startStoryEvent(career, 'training-scuffle', firstPlayer(career))!;
    answerEvent(career, fine.id, 'fine');
    expect(books.ledger.income.other).toBe(fine.amount);
  });

  it('changes fan mood, player mood, the squad, goodwill, flags and ticket prices', () => {
    const career = newCareer();
    const team = userTeam(career);
    const books = userBooks(career);
    const id = firstPlayer(career);
    const other = team.playerIds[1];

    const fans = team.fanMood;
    answerEvent(career, startStoryEvent(career, 'losing-run-fans')!.id, 'meet');
    expect(team.fanMood).toBeCloseTo(fans + 0.05, 5);

    const mood = playerMood(career, id);
    answerEvent(career, startStoryEvent(career, 'youngster-boots', id)!.id, 'no');
    expect(playerMood(career, id)).toBeCloseTo(mood - 0.15, 5);

    const squad = playerMood(career, other);
    answerEvent(career, startStoryEvent(career, 'winning-run-bonus', id)!.id, 'pay');
    expect(playerMood(career, other)).toBeCloseTo(squad + 0.08, 5);

    const goodwill = career.story.goodwill;
    answerEvent(career, startStoryEvent(career, 'sponsor-appearance')!.id, 'no');
    expect(career.story.goodwill).toBeCloseTo(goodwill - 0.12, 5);

    answerEvent(career, startStoryEvent(career, 'council-parking')!.id, 'no');
    expect(career.story.flags.councilAnnoyed).toBe(career.weekIndex);

    const price = books.ticketPrice;
    answerEvent(career, startStoryEvent(career, 'ticket-complaint')!.id, 'cut');
    expect(books.ticketPrice).toBe(Math.round(price * 0.9));
  });

  it('pays out a delayed consequence weeks later', () => {
    const career = newCareer();
    const books = userBooks(career);
    const ev = startStoryEvent(career, 'retro-kit')!;
    answerEvent(career, ev.id, 'big');
    const merch = books.ledger.income.merchandise;
    career.story.timers[0].week = career.weekIndex;
    advanceCareer(career);
    expect(books.ledger.income.merchandise - merch).toBeGreaterThanOrEqual(ev.amount * 2);
    expect(career.inbox.some((m) => m.title === 'The retro kit sold out')).toBe(true);
  });

  it('lets the staff answer at the deadline, cash unscaled', () => {
    const career = newCareer();
    const books = userBooks(career);
    const ev = startStoryEvent(career, 'hospital-visit')!;
    const ops = books.ledger.spending.operations;
    for (let i = 0; i < 4 && ev.answer === null; i++) advanceCareer(career);
    expect(ev.answer).toBe('staff');
    expect(books.ledger.spending.operations - ops).toBeGreaterThanOrEqual(ev.amount / 2);
    // The staff's choice costs what the owner's would: cash is never scaled.
    expect(eventDef('hospital-visit')!.choices.find((c) => c.id === 'visit')!.effects[0]).toEqual({ cash: -0.5, line: 'operations' });
    const mail = career.inbox.find((m) => m.id === ev.mailId)!;
    expect(mail.body).toContain('dealt with it');
    expect(career.story.decisions.find((d) => d.eventId === 'hospital-visit')).toMatchObject({ eventId: 'hospital-visit', choiceId: 'visit', staff: true });
  });

  it('answers on the owner’s say-so with "let the staff handle it"', () => {
    const career = newCareer();
    const ev = startStoryEvent(career, 'mascot-pay')!;
    expect(answerEvent(career, ev.id, null).ok).toBe(true);
    expect(ev.answer).toBe('staff');
  });
});

describe('story layer: promises', () => {
  it('a broken promise of games costs mood and the press', () => {
    const career = newCareer();
    const id = firstPlayer(career);
    const ev = startStoryEvent(career, 'fringe-minutes', id)!;
    answerEvent(career, ev.id, 'promise');
    const mood = playerMood(career, id), press = career.story.press;
    career.story.timers[0].week = career.weekIndex;
    advanceCareer(career);
    expect(playerMood(career, id)).toBeLessThan(mood - 0.2);
    expect(career.story.press).toBeLessThan(press);
    expect(career.inbox.some((m) => m.title.startsWith('Promise broken'))).toBe(true);
  });

  it('a kept promise lifts him', () => {
    const career = newCareer();
    const id = firstPlayer(career);
    const ev = startStoryEvent(career, 'fringe-minutes', id)!;
    answerEvent(career, ev.id, 'promise');
    career.playerSeason[id] = { apps: 3, minutes: 270, goals: 0, assists: 0, ratingSum: 20, yellows: 0, reds: 0 };
    const mood = playerMood(career, id);
    career.story.timers[0].week = career.weekIndex;
    advanceCareer(career);
    expect(playerMood(career, id)).toBeGreaterThan(mood);
    expect(career.inbox.some((m) => m.title.startsWith('Promise kept'))).toBe(true);
  });

  it('a signing promise counts a signing made after it', () => {
    const career = newCareer();
    answerEvent(career, startStoryEvent(career, 'coach-wants-signing')!.id, 'back');
    career.inbox.unshift({ id: `m_${career.counter + 5}`, weekIndex: career.weekIndex, season: 1, kind: 'transfer', title: 'Signed A Player', body: '', read: true });
    career.counter += 5;
    career.story.timers[0].week = career.weekIndex;
    advanceCareer(career);
    expect(career.inbox.some((m) => m.title === 'The coach got his signing')).toBe(true);
  });
});

describe('story layer: mood on match day and saves', () => {
  it('turns the eleven’s mood into at most 3% form', () => {
    const career = newCareer();
    const eleven = userTeam(career).playerIds.slice(0, 11);
    expect(moodForm(career, eleven)).toBe(0);
    for (const id of eleven) career.story.mood[id] = 1;
    expect(moodForm(career, eleven)).toBeCloseTo(STORY_TUNING.mood.matchForm, 5);
    for (const id of eleven) career.story.mood[id] = 0;
    expect(moodForm(career, eleven)).toBeCloseTo(-STORY_TUNING.mood.matchForm, 5);
  });

  it('gives form to the owner’s side only', () => {
    const career = newCareer();
    for (const id of userTeam(career).playerIds) career.story.mood[id] = 1;
    const hooks = careerHooks(career);
    const league = career.season.league;
    const mine = userTeam(career);
    const other = league.teams.find((t) => t.id !== mine.id)!;
    const coach = Object.values(league.staff)[0];
    const opts = { opponent: other, home: true } as Parameters<typeof hooks.select>[4];
    expect(hooks.select(new Rng(1), mine, league.players, coach, opts).form).toBeGreaterThan(0);
    expect(hooks.select(new Rng(1), other, league.players, coach, { ...opts, opponent: mine }).form).toBeUndefined();
  });

  it('keeps an open event through a save code', () => {
    const career = newCareer();
    const ev = startStoryEvent(career, 'documentary')!;
    const copy = decodeSave(encodeSave(career));
    expect(openEvents(copy).map((e) => e.id)).toEqual([ev.id]);
    expect(answerEvent(copy, ev.id, 'yes').ok).toBe(true);
  });

  it('migrates a version 4 save to a neutral story', () => {
    const career = newCareer();
    const old = JSON.parse(JSON.stringify(career)) as Record<string, unknown>;
    delete old.story;
    old.version = 4;
    for (const b of Object.values(old.books as Record<string, { ledger: { income: Record<string, number> } }>)) delete b.ledger.income.other;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(up.story.events).toEqual([]);
    expect(up.story.pace).toBe('normal');
    expect(userBooks(up).ledger.income.other).toBe(0);
    advanceCareer(up);
  });
});

describe('story layer: screens', async () => {
  const { initialUi } = await import('../src/ui/career/state');
  const { renderInbox } = await import('../src/ui/views/career/inbox');
  const { renderHome } = await import('../src/ui/views/career/home');
  const { officeVisitor } = await import('../src/ui/career/office');

  it('shows a waiting event with its choices on Home, pinned in the inbox, and at the office door', () => {
    const career = newCareer();
    const ev = startStoryEvent(career, 'reporter-exclusive')!;
    // Newer mail arrives after it; the event still comes first.
    advanceCareer(career);
    const ui = initialUi();
    const home = renderHome(career, ui);
    expect(home).toContain(`data-action="event-choice" data-id="${ev.id}" data-choice="open"`);
    expect(home).toContain('data-choice="staff"');
    const first = renderInbox(career, ui).split('<li')[1];
    expect(first).toContain(`data-id="${ev.mailId}"`);
    expect(first).toContain('Waiting on you');
    ui.inboxOpen = ev.mailId;
    expect(renderInbox(career, ui)).toContain(`data-id="${ev.id}" data-choice="open"`);
    expect(officeVisitor(career)).toMatchObject({ mailId: ev.mailId, role: 'reporter' });
    answerEvent(career, ev.id, 'short');
    expect(renderHome(career, ui)).not.toContain(`data-id="${ev.id}"`);
  });
});

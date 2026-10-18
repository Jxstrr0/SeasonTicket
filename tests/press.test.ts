import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  PRESS_QUESTION_LIST,
  advanceCareer,
  answerEvent,
  createCareer,
  eventView,
  openConference,
  openEvents,
  type Career,
  type StoryEvent,
  type TierId,
} from '../src/sim/career';
import { Rng } from '../src/sim/rng';
import { encodeSave, decodeSave, migrate } from '../src/game/save';

function newCareer(seed = 41): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

interface Log {
  conferences: StoryEvent[];
  texts: string[];
}

/** A whole year. `pick` answers each press question (null leaves it to the assistant). */
function playSeason(career: Career, pick: (rng: Rng) => string | null, rng = new Rng(3)): Log {
  const log: Log = { conferences: [], texts: [] };
  for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
    const conf = openConference(career);
    if (conf) {
      log.conferences.push(conf);
      for (let n = 0; n < 4 && conf.answer === null; n++) {
        const view = eventView(career, conf)!;
        log.texts.push(view.title, view.text, ...view.choices.map((c) => c.label));
        if (view.press?.reply) log.texts.push(view.press.reply);
        const r = answerEvent(career, conf.id, pick(rng));
        expect(r.ok).toBe(true);
        if (r.text) log.texts.push(r.text);
      }
    }
    for (const ev of openEvents(career)) if (!ev.press) answerEvent(career, ev.id, null);
    advanceCareer(career);
  }
  return log;
}

describe('press conferences: a season', () => {
  const career = newCareer();
  const log = playSeason(career, (rng) => rng.pick(['calm', 'bold', 'deflect']));

  it('calls a conference for the big weeks, not every week', () => {
    expect(career.phase).toBe('review');
    expect(log.conferences.length).toBeGreaterThanOrEqual(5);
    expect(log.conferences.length).toBeLessThanOrEqual(22);
  });

  it('asks two or three questions, each answered', () => {
    for (const ev of log.conferences) {
      expect(ev.press!.questions.length).toBeGreaterThanOrEqual(2);
      expect(ev.press!.questions.length).toBeLessThanOrEqual(3);
      expect(ev.answer).toBe('done');
      expect(ev.press!.questions.every((q) => q.tone !== null && !q.staff)).toBe(true);
    }
  });

  it('fills every placeholder', () => {
    for (const t of log.texts) expect(t).not.toMatch(/[{}]|undefined|NaN/);
    for (const m of career.inbox) expect(`${m.title} ${m.body}`).not.toMatch(/[{}]|undefined|NaN/);
    for (const n of career.news.items) expect(`${n.headline} ${n.body}`).not.toMatch(/[{}]|undefined|NaN/);
  });

  it('judges every promise to win once the match is played', () => {
    expect(career.story.claims).toEqual([]);
  });

  it('is the same conference from the same seed and answers', () => {
    const again = newCareer();
    const log2 = playSeason(again, (rng) => rng.pick(['calm', 'bold', 'deflect']));
    expect(log2.conferences.map((e) => e.press!.questions.map((q) => q.id + q.tone))).toEqual(log.conferences.map((e) => e.press!.questions.map((q) => q.id + q.tone)));
    expect(again.story.heat).toEqual(career.story.heat);
  });
});

describe('press conferences: answers', () => {
  it('lets the assistant take any questions left when the week is played', () => {
    const career = newCareer(7);
    const log = playSeason(career, () => null);
    expect(log.conferences.length).toBeGreaterThan(0);
    for (const ev of log.conferences) {
      expect(ev.answer).toBe('staff');
      expect(ev.press!.questions.every((q) => q.staff && q.tone === 'calm')).toBe(true);
    }
  });

  it('closes an unanswered conference before the match', () => {
    const career = newCareer(8);
    let conf: StoryEvent | null = null;
    for (let i = 0; i < 50 && !conf && career.phase !== 'review'; i++) {
      for (const ev of openEvents(career)) if (!ev.press) answerEvent(career, ev.id, null);
      advanceCareer(career);
      conf = openConference(career);
    }
    expect(conf).not.toBeNull();
    advanceCareer(career);
    expect(conf!.answer).toBe('staff');
  });

  it('a bold promise to win is kept or broken', () => {
    const career = newCareer(9);
    playSeason(career, () => 'bold');
    const said = career.inbox.filter((m) => /^You said it|^Words come back/.test(m.title));
    const claimQs = PRESS_QUESTION_LIST.filter((q) => q.answers.bold.effects.some((e) => 'claim' in e));
    expect(claimQs.length).toBeGreaterThan(0);
    expect(said.length).toBeGreaterThan(0);
  });

  it('bold talk heats rivalries; calm talk keeps them cool', () => {
    const hot = newCareer(10);
    playSeason(hot, () => 'bold');
    const cool = newCareer(10);
    playSeason(cool, () => 'calm');
    const sum = (c: Career) => Object.values(c.story.heat).reduce((a, b) => a + b, 0) + c.story.events.filter((e) => e.press).length * 0;
    expect(sum(hot)).toBeGreaterThanOrEqual(sum(cool));
  });

  it('every question has three answers with labels and replies', () => {
    expect(PRESS_QUESTION_LIST.length).toBeGreaterThanOrEqual(25);
    for (const q of PRESS_QUESTION_LIST) for (const t of ['calm', 'bold', 'deflect'] as const) {
      expect(q.answers[t].label.length).toBeGreaterThan(3);
      expect(q.answers[t].reply.length).toBeGreaterThan(3);
    }
  });
});

describe('press conferences: saves', () => {
  it('survives a save code mid-conference', () => {
    const career = newCareer(8);
    for (let i = 0; i < 50 && !openConference(career) && career.phase !== 'review'; i++) {
      for (const ev of openEvents(career)) answerEvent(career, ev.id, null);
      advanceCareer(career);
    }
    const conf = openConference(career)!;
    answerEvent(career, conf.id, 'calm');
    const copy = decodeSave(encodeSave(career));
    expect(openConference(copy)?.press).toEqual(conf.press);
  });

  it('migrates a version 6 save', () => {
    const career = newCareer();
    const old = JSON.parse(JSON.stringify(career)) as { version: number; story: Record<string, unknown> };
    delete old.story.heat;
    delete old.story.claims;
    delete old.story.lastPress;
    old.version = 6;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(up.story.heat).toEqual({});
    expect(up.story.claims).toEqual([]);
    expect(up.story.lastPress).toBe(-1);
    advanceCareer(up);
  });
});

describe('press conferences: screens', async () => {
  const { renderEventCard } = await import('../src/ui/views/career/story');
  it('shows one question at a time with the three answers and the assistant', () => {
    const career = newCareer(8);
    for (let i = 0; i < 50 && !openConference(career) && career.phase !== 'review'; i++) {
      for (const ev of openEvents(career)) answerEvent(career, ev.id, null);
      advanceCareer(career);
    }
    const conf = openConference(career)!;
    const first = renderEventCard(career, conf, true);
    expect(first).toContain(`Question 1 of ${conf.press!.questions.length}`);
    expect(first.match(/data-action="event-choice"/g)!.length).toBe(4);
    expect(first).not.toContain('press-reply');
    answerEvent(career, conf.id, 'bold');
    const second = renderEventCard(career, conf, true);
    expect(second).toContain('Question 2 of');
    expect(second).toContain('press-reply');
    expect(second).toContain('take the rest');
  });
});

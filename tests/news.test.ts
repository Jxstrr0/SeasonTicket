import { describe, expect, it } from 'vitest';
import './helpers/quickCareer';
import {
  C,
  CAREER_VERSION,
  advanceCareer,
  answerEvent,
  createCareer,
  eventDef,
  frontPage,
  newsEditions,
  openEvents,
  socialFeed,
  type Career,
  type TierId,
} from '../src/sim/career';
import { NEWS_TUNING, SOCIAL } from '../src/sim/data';
import { Rng } from '../src/sim/rng';
import { decodeSave, encodeSave, migrate } from '../src/game/save';
import { esc } from '../src/ui/html';

function newCareer(seed = 33): Career {
  const tier = C.tiers.order[1] as TierId;
  const club = (C.tiers[tier].clubs as string[])[0];
  return createCareer({ seed, teamId: club, tier, homegrownRule: false });
}

/** Plays the whole year, answering most events, and keeps every edition and post printed. */
function playSeason(career: Career, rng: Rng): { headlines: string[]; posts: string[]; editions: number } {
  const headlines: string[] = [];
  const posts: string[] = [];
  let editions = 0;
  for (let i = 0; i < 60 && (career.phase === 'preseason' || career.phase === 'season'); i++) {
    for (const ev of openEvents(career)) {
      if (rng.chance(0.7)) answerEvent(career, ev.id, rng.pick(eventDef(ev.eventId)!.choices).id);
    }
    const week = career.weekIndex;
    advanceCareer(career);
    const page = frontPage(career);
    if (page?.weekIndex === week) {
      editions++;
      headlines.push(...page.items.map((x) => x.headline));
    }
    posts.push(...socialFeed(career).filter((p) => p.weekIndex === week).map((p) => p.text));
  }
  return { headlines, posts, editions };
}

describe('newspaper and social feed: a season', () => {
  const career = newCareer();
  const played = playSeason(career, new Rng(9));
  if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.NEWS_DUMP) {
    console.log(played.headlines.join("\n"));
    for (const e of [...newsEditions(career)].reverse()) {
      console.log(`\n== ${e.label}`);
      for (const it of e.items) console.log(`  [${it.weight}] ${it.headline} — ${it.body}`);
    }
    for (const p of [...socialFeed(career)].reverse()) console.log(`  @${p.handle} (${p.likes}) ${p.text}`);
  }

  it('prints an edition nearly every week', () => {
    expect(career.phase).toBe('review');
    expect(played.editions).toBeGreaterThanOrEqual(30);
  });

  it('varies its headlines', () => {
    const distinct = new Set(played.headlines);
    expect(played.headlines.length).toBeGreaterThanOrEqual(50);
    expect(distinct.size / played.headlines.length).toBeGreaterThan(0.6);
  });

  it('fills every placeholder and capitalises', () => {
    for (const it of career.news.items) {
      expect(`${it.headline} ${it.body}`).not.toMatch(/[{}]/);
      expect(it.headline[0]).toBe(it.headline[0].toUpperCase());
    }
    for (const p of socialFeed(career)) expect(p.text).not.toMatch(/[{}]|undefined|NaN/);
  });

  it('covers results, the table and the season', () => {
    const kinds = new Set(career.news.items.map((x) => x.kind));
    expect(kinds.has('result')).toBe(true);
    expect(kinds.has('season')).toBe(true);
  });

  it('keeps the feed and the archive to their caps', () => {
    expect(career.news.items.length).toBeLessThanOrEqual(NEWS_TUNING.keep.items);
    expect(career.news.posts.length).toBeLessThanOrEqual(NEWS_TUNING.keep.posts);
    expect(career.news.wire).toEqual([]);
    expect(played.posts.length).toBeGreaterThanOrEqual(60);
  });

  it('gives fans short, plain handles', () => {
    for (const p of socialFeed(career)) {
      expect(p.handle).toMatch(/^[A-Za-z0-9_]{3,20}$/);
      expect(p.likes).toBeGreaterThanOrEqual(NEWS_TUNING.social.likes.min);
    }
    // Fans repeat themselves, but not every week.
    const texts = socialFeed(career).map((p) => p.text);
    expect(new Set(texts).size / texts.length).toBeGreaterThan(0.7);
  });

  it('is the same paper from the same seed and choices', () => {
    const again = newCareer();
    playSeason(again, new Rng(9));
    expect(again.news.items.map((x) => x.headline)).toEqual(career.news.items.map((x) => x.headline));
    expect(again.news.posts.map((x) => x.handle + x.text)).toEqual(career.news.posts.map((x) => x.handle + x.text));
  });

  it('adds little to the save code', () => {
    const withNews = encodeSave(career).length;
    const copy = structuredClone(career);
    copy.news.items = [];
    copy.news.posts = [];
    expect(withNews - encodeSave(copy).length).toBeLessThan(12_000);
  });
});

describe('newspaper: one-off stories', () => {
  it('reports a signing and a public decision', () => {
    const career = newCareer(4);
    career.news.wire.push({ kind: 'transfer', playerId: 'x', name: 'Test Player', fromId: career.season.league.teams.find((t) => t.id !== career.userTeamId)!.id, toId: career.userTeamId, fee: 2_000_000, how: 'fee' });
    advanceCareer(career);
    const page = frontPage(career)!;
    expect(page.label).toBe('Pre-season week 1');
    expect(page.items.some((x) => x.kind === 'transfer' && `${x.headline} ${x.body}`.includes('Test Player'))).toBe(true);
    expect(page.items.some((x) => x.kind === 'preview')).toBe(true);
  });

  it('survives a save code', () => {
    const career = newCareer(5);
    advanceCareer(career);
    const copy = decodeSave(encodeSave(career));
    expect(copy.news.items.map((x) => x.id)).toEqual(career.news.items.map((x) => x.id));
  });

  it('migrates a version 5 save to an empty paper', () => {
    const career = newCareer();
    const old = JSON.parse(JSON.stringify(career)) as Record<string, unknown>;
    delete old.news;
    old.version = 5;
    const up = migrate(old);
    expect(up.version).toBe(CAREER_VERSION);
    expect(up.news.items).toEqual([]);
    advanceCareer(up);
    expect(frontPage(up)).not.toBeNull();
  });

  it('never posts as an official account', () => {
    const words = [...SOCIAL.handles.start, ...SOCIAL.handles.core, ...SOCIAL.handles.end].join(' ');
    expect(words).not.toMatch(/official|verified|admin/i);
  });
});

describe('newspaper: screens', async () => {
  const { initialUi } = await import('../src/ui/career/state');
  const { renderNews } = await import('../src/ui/views/career/news');
  const { renderHome } = await import('../src/ui/views/career/home');
  const career = newCareer(6);
  advanceCareer(career);
  advanceCareer(career);

  it('shows the latest paper with back issues, and the fan feed', () => {
    const ui = initialUi();
    const paper = renderNews(career, ui);
    expect(paper).toContain(NEWS_TUNING.paper);
    expect(paper).toContain(esc(frontPage(career)!.items[0].headline));
    expect(paper).toMatch(/data-action="news-edition" data-week="\d+"/);
    ui.newsView = 'feed';
    const feed = renderNews(career, ui);
    expect(feed).toContain(`@${socialFeed(career)[0].handle}`);
  });

  it('opens an older edition', () => {
    const ui = initialUi();
    const [latest, older] = newsEditions(career);
    ui.newsEdition = older.weekIndex;
    expect(renderNews(career, ui)).toContain(older.label);
    expect(renderNews(career, ui)).not.toContain(`${latest.label} · latest`);
  });

  it('puts the lead headline on Home', () => {
    expect(renderHome(career, initialUi())).toContain('Read the paper');
  });

  it('gives the office TV the front page', async () => {
    const { buildOfficeSnapshot } = await import('../src/ui/career/office');
    const snap = buildOfficeSnapshot(career);
    expect(snap.news?.paper).toBe(NEWS_TUNING.paper);
    expect(snap.news?.lead).toBe(frontPage(career)!.items[0].headline);
  });
});

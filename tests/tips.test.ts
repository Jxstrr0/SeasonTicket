/**
 * Stage 7.1: first-time tips and the Help screen. Each screen has its tip,
 * a tip shows once, and the help answers carry real numbers.
 */
import { describe, expect, it } from 'vitest';
import tipsData from '../src/data/help/tips.json';
import { HUB_TABS, initialUi, type UiState } from '../src/ui/career/state';
import { TIP_IDS, loadTips, markSeen, nextTip, onScreenOf, storeTips, tipCandidates, tipOf, tipsPaused, type TipStore } from '../src/ui/career/tips';
import { fillHelp, helpSections, renderHelp, renderTip } from '../src/ui/views/career/help';

const NONE = { event: false, press: false };

function hub(patch: Partial<UiState> = {}): UiState {
  return { ...initialUi(), screen: 'hub', ...patch };
}

const fresh = (): TipStore => ({ off: false, seen: [] });

describe('first-time tips', () => {
  it('lists every tip once, with short tap-only text', () => {
    expect([...tipsData.order].sort()).toEqual([...TIP_IDS].sort());
    for (const id of TIP_IDS) {
      const t = tipOf(id);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.text.length).toBeLessThanOrEqual(320);
      expect(t.text).not.toMatch(/\b(click|hover|mouse)\b/i);
    }
  });

  it('has a tip for every hub tab', () => {
    for (const tab of HUB_TABS) {
      const c = tipCandidates(hub({ tab: tab.id }), true, NONE);
      expect(c[0]).toBe('welcome');
      if (tab.id !== 'home') expect(c).toContain(tab.id);
    }
  });

  it('puts the welcome first, then a card in front of the owner, then the screen', () => {
    expect(tipCandidates(hub({ tab: 'squad' }), true, { event: true, press: false })).toEqual(['welcome', 'visitor', 'squad']);
    expect(tipCandidates(hub({ inOffice: true }), true, { event: false, press: true })).toEqual(['welcome', 'press', 'office']);
  });

  it('reads visitor and press cards from the markup', () => {
    expect(onScreenOf('<section class="card event-card press-card">')).toEqual({ event: false, press: true });
    expect(onScreenOf('<section class="card event-card">')).toEqual({ event: true, press: false });
    expect(onScreenOf('<main>')).toEqual(NONE);
  });

  it('covers match day and its viewers, deadline day, replays and the review', () => {
    const live = (pitch: boolean, match3d: boolean): UiState => {
      const ui = hub({ screen: 'live', match3d, quality: 'medium' });
      ui.live = { ...ui.live, pitch };
      return ui;
    };
    expect(tipCandidates(live(false, true), true, NONE)).toEqual(['live']);
    expect(tipCandidates(live(true, false), true, NONE)).toEqual(['live', 'live-pitch']);
    expect(tipCandidates(live(true, true), true, NONE)).toEqual(['live', 'live-3d']);
    expect(tipCandidates(hub({ screen: 'deadline' }), true, NONE)).toEqual(['deadline']);
    expect(tipCandidates(hub({ screen: 'replay' }), true, NONE)).toEqual(['replay']);
    expect(tipCandidates(hub({ screen: 'review' }), true, NONE)).toEqual(['review']);
    expect(tipCandidates(hub({ screen: 'title' }), false, NONE)).toEqual([]);
  });

  it('waits while the menu is open or a week plays', () => {
    expect(tipsPaused(hub())).toBe(false);
    expect(tipsPaused(hub({ menuOpen: true }))).toBe(true);
    expect(tipsPaused(hub({ weekRun: { done: 0, total: 0, toEnd: false, label: '' } }))).toBe(true);
  });

  it('shows each tip once, none when off, and all again after a reset', () => {
    const store = fresh();
    const c = tipCandidates(hub({ tab: 'money' }), true, NONE);
    expect(nextTip(store, c)).toBe('welcome');
    markSeen(store, 'welcome');
    expect(nextTip(store, c)).toBe('money');
    markSeen(store, 'money');
    markSeen(store, 'money');
    expect(store.seen).toEqual(['welcome', 'money']);
    expect(nextTip(store, c)).toBeNull();
    expect(nextTip({ off: true, seen: [] }, c)).toBeNull();
    expect(nextTip(fresh(), c)).toBe('welcome');
  });

  it('keeps the record per device and survives a garbled one', () => {
    const mem = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const before = g.localStorage;
    g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    try {
      storeTips({ off: true, seen: ['welcome', 'squad'] });
      expect(loadTips()).toEqual({ off: true, seen: ['welcome', 'squad'] });
      mem.set('seasonticket.tips', JSON.stringify({ seen: ['welcome', 'nope', 3] }));
      expect(loadTips()).toEqual({ off: false, seen: ['welcome'] });
      mem.set('seasonticket.tips', '{not json');
      expect(loadTips()).toEqual(fresh());
    } finally {
      g.localStorage = before;
    }
  });

  it('renders a card with Got it and No more tips', () => {
    const html = renderTip('market');
    expect(html).toContain('data-action="tip-ok"');
    expect(html).toContain('data-action="tips-off"');
    expect(html).toContain(tipOf('market').title);
  });
});

describe('help screen', () => {
  it('fills every number from the tuning and has no empty answers', () => {
    const sections = helpSections();
    expect(sections.length).toBeGreaterThanOrEqual(5);
    let n = 0;
    for (const s of sections) {
      for (const i of s.items) {
        n++;
        expect(i.q.length).toBeGreaterThan(0);
        expect(i.a.length).toBeGreaterThan(20);
        expect(i.a).not.toMatch(/\{\w+\}/);
        expect(i.q + i.a).not.toMatch(/\b(click|hover|mouse)\b/i);
      }
    }
    expect(n).toBeGreaterThanOrEqual(25);
  });

  it('answers the questions the plan names', () => {
    const qs = helpSections().flatMap((s) => s.items.map((i) => i.q));
    expect(qs).toContain('How do I lose the club?');
    expect(qs).toContain('What is the wage cap?');
    expect(qs).toContain('What does mentality do?');
  });

  it('quotes the wage cap and leaves unknown names alone', () => {
    const cap = helpSections().flatMap((s) => s.items).find((i) => i.q === 'What is the wage cap?')!;
    expect(cap.a).toMatch(/\$\d/);
    expect(fillHelp('{nope} and {cap}')).toMatch(/^\{nope\} and \$/);
  });

  it('opens each answer with a tap and has a way back', () => {
    const html = renderHelp();
    expect(html).toContain('<details class="help-q">');
    expect(html).toContain('data-action="back"');
  });
});

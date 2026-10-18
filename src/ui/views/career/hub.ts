/** The career hub frame: top bar with the next action, the tab strip, the menu and the flash message. */
import { C, LADDER_NAMES, type StoryPace, money, transferWindowOpen, userBooks, userFixture, userTeam, type Career } from '../../../sim/career';
import { cls, each, esc } from '../../html';
import { weekLabel } from '../../model';
import { HUB_TABS, SOUND_SETTINGS, type HubTab, type SoundSetting, type UiState } from '../../career/state';
import { QUALITY_OPTIONS } from '../../../render/quality';
import { MATCH_MODES } from './newCareer';
import { renderCrest } from './crest';
import { renderHome } from './home';
import { renderSquad } from './squad';
import { renderLineup } from './lineup';
import { renderMarket } from './market';
import { renderMoney } from './money';
import { renderClub } from './club';
import { renderStadium } from './stadium';
import { renderInbox } from './inbox';
import { renderLeague } from './league';
import { renderNews } from './news';
import { renderEventCard } from './story';

/** The office scene: the visitor's event over the 3D room. */
function renderScene(career: Career, ui: UiState): string {
  const ev = ui.sceneId ? career.story.events.find((e) => e.id === ui.sceneId && e.answer === null) : undefined;
  return ev ? renderEventCard(career, ev, true) : '';
}

const PACE_OPTIONS: { id: StoryPace; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'normal', label: 'Normal' },
  { id: 'busy', label: 'Busy' },
];

export function careerWeekLabel(career: Career): string {
  if (career.phase === 'preseason') return `Pre-season · week ${career.preseasonWeek} of ${C.calendar.preseasonWeeks}`;
  const season = career.season;
  if (career.phase !== 'season') return `Season ${season.league.season} · over`;
  const base = weekLabel(season, season.week);
  return season.phase === 'break' ? `${base} · Break` : base;
}

export function unreadCount(career: Career): number {
  return career.inbox.filter((m) => !m.read).length;
}

/** The big button in the top bar: what the owner does next. */
function primaryActions(career: Career, ui: UiState): string {
  const busy = ui.simming;
  switch (career.phase) {
    case 'preseason':
      return `<button type="button" data-action="next-week"${busy ? ' disabled' : ''}>Next week</button>`;
    case 'review':
      return `<button type="button" data-action="review">Season review</button>`;
    case 'gameOver':
      return `<button type="button" data-action="game-over">What happened</button>`;
    case 'season': {
      if (busy) return `<button type="button" class="btn-secondary" data-action="stop-sim">Stop</button>`;
      const fixture = userFixture(career);
      if (fixture) {
        const oppId = fixture.homeId === career.userTeamId ? fixture.awayId : fixture.homeId;
        const opp = career.season.league.teams.find((t) => t.id === oppId);
        const live = career.liveMatch?.setup.matchId === fixture.id;
        return `<button type="button" data-action="match-day">${live ? 'Back to match' : `Match day vs ${esc(opp?.abbr ?? '')}`}</button>
          <button type="button" class="btn-secondary" data-action="next-week">Quick sim</button>`;
      }
      const sim = career.season.phase === 'playoffs' ? `<button type="button" class="btn-secondary" data-action="sim-end">Sim to end</button>` : '';
      return `<button type="button" data-action="next-week">Next week</button>${sim}`;
    }
  }
}

function renderTopBar(career: Career, ui: UiState): string {
  const team = userTeam(career);
  const books = userBooks(career);
  const level = career.ladder.level;
  const ladder = level > 0 ? `<span class="pill pill-warn">${esc(LADDER_NAMES[level])}</span>` : '';
  const window = transferWindowOpen(career) ? '<span class="pill pill-ok">Window open</span>' : '';
  return `<header class="topbar career-topbar">
    <button type="button" class="topbar-club" data-action="menu" aria-expanded="${ui.menuOpen}" aria-label="Menu">
      ${renderCrest(career.crest, 30)}
      <span class="topbar-title">${esc(team.shortName)}</span>
      <span class="menu-glyph" aria-hidden="true">☰</span>
    </button>
    <div class="topbar-status">
      <span>${esc(careerWeekLabel(career))}</span>
      <span class="${cls('cash', books.cash < 0 && 'negative')}">${esc(money(books.cash))}</span>
      ${window}${ladder}
    </div>
    <div class="topbar-actions">${primaryActions(career, ui)}</div>
  </header>`;
}

const SOUND_LABELS: Record<SoundSetting, string> = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' };
const SOUND_OPTIONS = SOUND_SETTINGS.map((id) => ({ id, label: SOUND_LABELS[id] }));

function renderMenu(career: Career, ui: UiState): string {
  if (!ui.menuOpen) return '';
  const mode = career.delegation.matchMode;
  return `<div class="menu-sheet card" role="dialog" aria-label="Menu">
    <div class="card-title">Match-day mode</div>
    <div class="segmented stack" role="group">
      ${each(MATCH_MODES, (m) => `<button type="button" class="${cls('seg', m.id === mode && 'on')}" data-action="set-mode" data-mode="${esc(m.id)}" aria-pressed="${m.id === mode}"><strong>${esc(m.label)}</strong><span class="small">${esc(m.hint)}</span></button>`)}
    </div>
    <div class="card-title">Graphics</div>
    <div class="segmented" role="group">
      ${each(QUALITY_OPTIONS, (q) => `<button type="button" class="${cls('seg', q.id === ui.quality && 'on')}" data-action="set-quality" data-quality="${q.id}" aria-pressed="${q.id === ui.quality}">${esc(q.label)}</button>`)}
    </div>
    <p class="muted small">Low runs best on older phones. Off uses the plain menus with no 3D office.</p>
    <label class="check"><input type="checkbox" data-change="show-fps"${ui.showFps ? ' checked' : ''}> Show the frame rate on the 3D match</label>
    <div class="card-title">Match sound</div>
    <div class="segmented" role="group">
      ${each(SOUND_OPTIONS, (o) => `<button type="button" class="${cls('seg', o.id === ui.sound && 'on')}" data-action="set-sound" data-sound="${o.id}" aria-pressed="${o.id === ui.sound}">${esc(o.label)}</button>`)}
    </div>
    <p class="muted small">The crowd, the referee's whistle and the ball on match day. On iPhones the ring/silent switch mutes it.</p>
    <div class="card-title">Story pace</div>
    <div class="segmented" role="group">
      ${each(PACE_OPTIONS, (o) => `<button type="button" class="${cls('seg', o.id === career.story.pace && 'on')}" data-action="set-pace" data-pace="${o.id}" aria-pressed="${o.id === career.story.pace}">${esc(o.label)}</button>`)}
    </div>
    <p class="muted small">How often people bring you decisions. Normal is one or two a week, more in transfer windows.</p>
    <label class="check"><input type="checkbox" data-change="auto-lineup"${career.delegation.autoLineup ? ' checked' : ''}> Head coach picks the lineup each week</label>
    <div class="menu-row">
      <button type="button" class="btn-secondary" data-action="save-code">Save code</button>
      <button type="button" class="btn-secondary" data-action="to-title">Quit to title</button>
      <button type="button" class="btn-secondary" data-action="menu">Close</button>
    </div>
    <p class="muted small">The game saves itself after every action.</p>
  </div>`;
}

export function renderFlash(ui: UiState): string {
  if (!ui.flash) return '';
  return `<div class="${cls('flash', ui.flash.kind === 'error' && 'flash-error')}" role="status">
    <span>${esc(ui.flash.text)}</span>
    <button type="button" class="btn-icon" data-action="dismiss-flash" aria-label="Dismiss">✕</button>
  </div>`;
}

function tabLabel(career: Career, id: HubTab, label: string): string {
  if (id !== 'inbox') return esc(label);
  const n = unreadCount(career);
  return n > 0 ? `${esc(label)} <span class="badge">${n}</span>` : esc(label);
}

function renderTabs(career: Career, ui: UiState): string {
  const office =
    ui.quality === 'off'
      ? ''
      : `<button type="button" class="${cls('tab', ui.inOffice && 'active')}" data-action="office" aria-current="${ui.inOffice ? 'page' : 'false'}">Office</button>`;
  const on = (id: HubTab): boolean => !ui.inOffice && id === ui.tab;
  return `<nav class="tabs career-tabs" aria-label="Sections">
    ${office}${each(HUB_TABS, (t) => `<button type="button" class="${cls('tab', on(t.id) && 'active')}" data-action="tab" data-tab="${t.id}" aria-current="${on(t.id) ? 'page' : 'false'}">${tabLabel(career, t.id, t.label)}</button>`)}
  </nav>`;
}

function renderTab(career: Career, ui: UiState): string {
  switch (ui.tab) {
    case 'home':
      return renderHome(career, ui);
    case 'squad':
      return renderSquad(career, ui);
    case 'lineup':
      return renderLineup(career, ui);
    case 'market':
      return renderMarket(career, ui);
    case 'money':
      return renderMoney(career, ui);
    case 'club':
      return renderClub(career, ui);
    case 'stadium':
      return renderStadium(career, ui);
    case 'inbox':
      return renderInbox(career, ui);
    case 'news':
      return renderNews(career, ui);
    case 'league':
      return renderLeague(career, ui);
  }
}

export function renderHub(career: Career, ui: UiState): string {
  // In the office the 3D room fills the screen behind the frame; the desk objects are the menu.
  if (ui.inOffice) {
    return `${renderTopBar(career, ui)}
  ${renderMenu(career, ui)}
  ${renderTabs(career, ui)}
  <div class="office-hud">${renderFlash(ui)}${renderScene(career, ui)}</div>`;
  }
  return `${renderTopBar(career, ui)}
  ${renderMenu(career, ui)}
  ${renderTabs(career, ui)}
  <main class="shell hub">${renderFlash(ui)}${renderTab(career, ui)}</main>`;
}

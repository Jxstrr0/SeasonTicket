/** Small pieces shared by the career screens. */
import { ongoingStories, ownerOf, temperamentLabel, type Career, type OngoingStory, type RivalLevel } from '../../../sim/career';
import { WORLD, isDomestic, nation } from '../../../sim/data';
import type { Player, Position } from '../../../sim/types';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';

/**
 * A button that needs two taps: the first arms it ("Tap again to confirm"),
 * the second runs the action. CareerApp does the arming.
 */
export function confirmButton(ui: UiState, action: string, id: string, label: string, className = 'btn-secondary'): string {
  const armed = ui.pendingConfirm === `${action}:${id}`;
  return `<button type="button" class="${cls(className, armed && 'armed')}" data-action="${esc(action)}" data-id="${esc(id)}" data-confirm="1">${armed ? 'Tap again to confirm' : esc(label)}</button>`;
}

export const POSITION_ORDER: readonly Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

/** Condition as a percentage with a colour band. */
export function conditionCell(condition: number): string {
  const pct = Math.round(condition * 100);
  const band = pct >= 85 ? 'cond-good' : pct >= 65 ? 'cond-mid' : 'cond-low';
  return `<span class="${band}">${pct}%</span>`;
}

/** Injury, suspension and homegrown markers for a player row. */
export function playerFlags(p: Player, loaned = false): string {
  const flags: string[] = [];
  if (p.injuryWeeks > 0) flags.push(`<span class="flag flag-injury" title="Injured">+${p.injuryWeeks}w</span>`);
  if (p.suspensionMatches > 0) flags.push(`<span class="flag flag-ban" title="Suspended">Ban ${p.suspensionMatches}</span>`);
  if (isDomestic(p.nationality)) flags.push(`<span class="flag flag-home" title="${esc(WORLD.country.demonym)}">HG</span>`);
  if (loaned) flags.push('<span class="flag flag-loan" title="On loan">Loan</span>');
  return flags.join('');
}

export function available(p: Player): boolean {
  return p.injuryWeeks <= 0 && p.suspensionMatches <= 0;
}

export function nationName(p: Player): string {
  return nation(p.nationality).name;
}

/** Position chips used as a filter. */
export function positionFilter(current: Position | 'all', action: string): string {
  const all: (Position | 'all')[] = ['all', ...POSITION_ORDER];
  return `<div class="chip-row" role="group" aria-label="Position">
    ${all.map((p) => `<button type="button" class="${cls('chip', p === current && 'on')}" data-action="${esc(action)}" data-pos="${p}" aria-pressed="${p === current}">${p === 'all' ? 'All' : p}</button>`).join('')}
  </div>`;
}

/** A 1-5 dial as five buttons. */
export function dialRow(label: string, key: string, value: number, low: string, high: string, disabled = false): string {
  const buttons = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="${cls('dial-step', n === value && 'on')}" data-action="set-dial" data-key="${esc(key)}" data-value="${n}" aria-pressed="${n === value}"${disabled ? ' disabled' : ''}>${n}</button>`)
    .join('');
  return `<div class="dial">
    <div class="dial-head"><span>${esc(label)}</span><span class="muted small">${esc(low)} → ${esc(high)}</span></div>
    <div class="dial-steps" role="group" aria-label="${esc(label)}">${buttons}</div>
  </div>`;
}

export function option(value: string, label: string, current: string): string {
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
}

export function yearsSelect(name: string, current = 3, min = 1, max = 5): string {
  const opts: string[] = [];
  for (let y = min; y <= max; y++) opts.push(option(String(y), `${y} year${y === 1 ? '' : 's'}`, String(current)));
  return `<select class="field" name="${esc(name)}">${opts.join('')}</select>`;
}

/** "Derby" or "Rivalry" next to a fixture. */
export function rivalPill(level: RivalLevel | null): string {
  if (!level) return '';
  return level === 'derby' ? '<span class="pill pill-derby">Derby</span>' : '<span class="pill pill-rival">Rivalry</span>';
}

/** How a club's owner feels about you, in a word. */
export function ownerFeeling(memory: number): string {
  return memory >= 0.15 ? 'warm towards you' : memory <= -0.15 ? 'cold towards you' : 'neutral';
}

/** "Owner: Name · Showman, neutral" for a club, or '' if it has none. */
export function ownerLine(career: Career, teamId: string | null | undefined): string {
  const o = ownerOf(career, teamId);
  return o ? `Owner: ${o.name} · ${temperamentLabel(o.temperament)}, ${ownerFeeling(o.memory)}` : '';
}

const ONGOING_PILL: Record<OngoingStory['kind'], string> = { promise: 'Promise', story: 'Not over', gate: 'Next home game' };

function weeksLine(o: OngoingStory): string {
  const w = o.weeks === 1 ? 'a week' : `${o.weeks} weeks`;
  return o.kind === 'promise' ? `About ${w} left.` : `More to come in about ${w}.`;
}

/**
 * Promises you have made and stories that may come back (Stage 6.5). On the
 * Club screen it always shows; `compact` (Home) shows nothing when there is nothing.
 */
export function renderOngoing(career: Career, compact = false): string {
  const list = ongoingStories(career);
  if (compact && !list.length) return '';
  const shown = compact ? list.slice(0, 3) : list;
  const body = list.length
    ? `<ul class="ongoing-list">${each(shown, (o) => `<li>
        <div class="ongoing-top"><span class="pill pill-${o.kind}">${ONGOING_PILL[o.kind]}</span><strong>${esc(o.title)}</strong></div>
        <div class="muted small">${esc(o.detail)}${o.weeks !== null ? ` ${weeksLine(o)}` : ''}</div>
      </li>`)}</ul>${compact && list.length > shown.length ? `<p class="muted small">And ${list.length - shown.length} more on the Club screen.</p>` : ''}`
    : '<p class="muted">Nothing on the go. Promises you make and stories that aren\'t finished show up here.</p>';
  return `<section class="card ongoing">
    <div class="card-title">Ongoing</div>
    ${body}
  </section>`;
}

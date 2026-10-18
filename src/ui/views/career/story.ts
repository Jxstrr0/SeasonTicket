/** Story events (Stage 6): the scene card with its choices, used in the inbox, on Home and over the office. */
import { eventView, openEvents, type Career, type StoryEvent } from '../../../sim/career';
import { each, esc } from '../../html';
import officeTuning from '../../../data/tuning/office.json';

const ROLE_LABELS = Object.fromEntries(Object.entries(officeTuning.visitors.roles).map(([id, r]) => [id, r.label])) as Record<string, string>;

function deadlineText(career: Career, ev: StoryEvent): string {
  const left = ev.deadlineWeek - career.weekIndex;
  return left <= 1 ? 'Decide this week, or the staff will.' : `Decide within ${left} weeks, or the staff will.`;
}

/** The scene: who came in, what they want, and the choices. `scene` is the office overlay version with a close button. */
export function renderEventCard(career: Career, ev: StoryEvent, scene = false): string {
  const v = eventView(career, ev);
  if (!v) return '';
  const who = ROLE_LABELS[v.role] ?? 'Visitor';
  return `<section class="card event-card${scene ? ' event-scene' : ''}" aria-label="${esc(v.title)}">
    <div class="event-top">
      <span class="pill pill-decision">${esc(who)}</span>
      ${scene ? '<button type="button" class="btn-icon" data-action="close-scene" aria-label="Later">✕</button>' : ''}
    </div>
    <div class="card-title">${esc(v.title)}</div>
    ${each(v.text.split('\n').filter(Boolean), (line) => `<p>${esc(line)}</p>`)}
    <div class="event-choices">
      ${each(v.choices, (c) => `<button type="button" class="event-choice" data-action="event-choice" data-id="${esc(v.id)}" data-choice="${esc(c.id)}"><strong>${esc(c.label)}</strong><span class="small">${esc(c.hint)}</span></button>`)}
      <button type="button" class="btn-secondary event-staff" data-action="event-choice" data-id="${esc(v.id)}" data-choice="staff">Let ${esc(v.staffName)} handle it</button>
    </div>
    <p class="muted small">${esc(deadlineText(career, ev))}</p>
  </section>`;
}

/** Home: events waiting on the owner. The first opens in full, the rest are links. */
export function renderWaiting(career: Career): string {
  const open = openEvents(career);
  if (!open.length) return '';
  const [first, ...rest] = open;
  const more = rest.length
    ? `<section class="card"><div class="card-title">Also waiting on you</div><ul class="mail-mini">${each(rest, (ev) => {
        const v = eventView(career, ev);
        return v ? `<li><button type="button" class="link-btn" data-action="open-mail" data-id="${esc(ev.mailId)}">${esc(v.title)}</button></li>` : '';
      })}</ul></section>`
    : '';
  return `${renderEventCard(career, first)}${more}`;
}

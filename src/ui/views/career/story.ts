/** Story events (Stage 6): the scene card with its choices, used in the inbox, on Home and over the office. */
import { eventView, openEvents, type Career, type EventView, type StoryEvent } from '../../../sim/career';
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
  if (v.press) return renderPressCard(v, scene);
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

/** A press conference: one question at a time, with how the last answer went down. */
function renderPressCard(v: EventView, scene: boolean): string {
  const p = v.press!;
  return `<section class="card event-card press-card${scene ? ' event-scene' : ''}" aria-label="${esc(v.title)}">
    <div class="event-top">
      <span class="pill pill-decision">Press</span>
      <span class="small muted">Question ${p.index + 1} of ${p.total}</span>
      ${scene ? '<button type="button" class="btn-icon" data-action="close-scene" aria-label="Later">✕</button>' : ''}
    </div>
    <div class="card-title">${esc(v.title)}</div>
    ${p.reply ? `<p class="press-reply small">${esc(p.reply)}</p>` : ''}
    <p class="press-q">${esc(v.text)}</p>
    <div class="event-choices">
      ${each(v.choices, (c) => `<button type="button" class="event-choice press-answer tone-${esc(c.id)}" data-action="event-choice" data-id="${esc(v.id)}" data-choice="${esc(c.id)}"><span class="small press-tone">${esc(c.hint)}</span><strong>“${esc(c.label)}”</strong></button>`)}
      <button type="button" class="btn-secondary event-staff" data-action="event-choice" data-id="${esc(v.id)}" data-choice="staff">Let ${esc(v.staffName)} take ${p.index > 0 ? 'the rest' : 'it'}</button>
    </div>
    <p class="muted small">Answer before the next match, or ${esc(v.staffName)} will.</p>
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

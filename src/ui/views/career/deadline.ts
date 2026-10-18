/** Deadline day (Stage 6.6): the war room screen and its card on Home. */
import { deadlineView, money, openDeadline, type Career, type DeadlineCallView, type DeadlineKind, type DeadlineView } from '../../../sim/career';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { renderFlash } from './hub';
import { confirmButton } from './parts';

const KIND_LABELS: Record<DeadlineKind, string> = {
  lateBid: 'Bid',
  panicSale: 'Selling',
  freeAgent: 'Agent',
  hijack: 'Hijack',
  flavour: 'Call',
};

const STATUS_LABELS: Record<DeadlineCallView['status'], string> = {
  open: '',
  accepted: 'Done',
  declined: 'Over',
  lapsed: 'Missed',
};

function windowName(v: DeadlineView): string {
  return v.key.endsWith('-pre') ? 'Pre-season window' : 'Mid-season window';
}

function leftText(v: DeadlineView): string {
  if (v.closed) return 'The window has shut.';
  return `${v.hoursLeft} hour${v.hoursLeft === 1 ? '' : 's'} until the window shuts at ${v.endHour}:00.`;
}

function renderCall(c: DeadlineCallView): string {
  const open = c.status === 'open';
  const hurry = open && c.hoursLeft <= 1;
  return `<section class="${cls('card', 'war-call', `war-${c.kind}`, !open && 'war-done')}" aria-label="${esc(c.title)}">
    <div class="war-call-top">
      <span class="${cls('pill', open ? 'pill-decision' : 'pill-muted')}">${esc(KIND_LABELS[c.kind])}</span>
      <span class="small muted">${esc(c.time)}</span>
      ${open ? `<span class="${cls('small', hurry ? 'war-hurry' : 'muted')}">${hurry ? 'Answer before the clock moves' : `${c.hoursLeft} hours to answer`}</span>` : `<span class="small muted">${esc(STATUS_LABELS[c.status])}${c.byStaff ? ' · staff' : ''}</span>`}
    </div>
    <div class="card-title">${esc(c.title)}</div>
    ${open ? `<p>${esc(c.text)}</p>` : ''}
    ${c.result ? `<p class="${cls('small', !open && 'muted')}">${esc(c.result)}</p>` : ''}
    ${open ? `<div class="war-choices">${each(c.choices, (ch) => `<button type="button" class="${cls(ch.id !== 'yes' && 'btn-secondary')}" data-action="deadline-call" data-id="${esc(c.id)}" data-choice="${esc(ch.id)}">${esc(ch.label)}</button>`)}</div>` : ''}
  </section>`;
}

function renderBoard(v: DeadlineView): string {
  const b = v.board;
  const list = (items: string[]) => (items.length ? `<ul class="war-list">${each(items, (x) => `<li>${esc(x)}</li>`)}</ul>` : '<p class="small muted">None yet.</p>');
  return `<aside class="card war-board" aria-label="Whiteboard">
    <div class="card-title">Whiteboard</div>
    <dl class="facts">
      <div><dt>Cash</dt><dd class="${cls(b.cash < 0 && 'negative')}">${esc(money(b.cash))}</dd></div>
      ${b.maxFee < b.cash ? `<div><dt>Most you can pay</dt><dd>${esc(money(b.maxFee))}</dd></div>` : ''}
      <div><dt>Wage room</dt><dd class="${cls(b.wageRoom < 0 && 'negative')}">${esc(b.wageRoom < 0 ? `${money(-b.wageRoom)} over the cap` : money(b.wageRoom))}</dd></div>
      <div><dt>Squad</dt><dd>${b.squad} of ${b.maxSquad}</dd></div>
    </dl>
    <div class="war-board-cols">
      <div><div class="small muted">In</div>${list(b.ins)}</div>
      <div><div class="small muted">Out</div>${list(b.outs)}</div>
    </div>
    ${b.targets.length ? `<div class="small muted">On offer</div><ul class="war-list">${each(b.targets, (t) => `<li>${esc(t.name)} <span class="muted">${esc(t.pos)} · ${esc(t.club)} · ${t.fee > 0 ? esc(money(t.fee)) : 'free'}</span></li>`)}</ul>` : ''}
  </aside>`;
}

/** The war room: the clock and its buttons, the calls, the whiteboard and the day so far. */
export function renderDeadline(career: Career, ui: UiState): string {
  const v = deadlineView(career);
  if (!v) {
    return `<main class="shell war-room"><section class="card"><p>There is no deadline day on right now.</p>
      <div class="row-actions"><button type="button" data-action="to-hub">Back</button></div></section></main>`;
  }
  const open = v.calls.filter((c) => c.status === 'open');
  const done = v.calls.filter((c) => c.status !== 'open');
  return `<main class="shell war-room">
    <section class="card war-head">
      <div class="war-clock-box">
        <div class="card-title">Deadline day · ${esc(windowName(v))}</div>
        <div class="war-clock" aria-label="Time">${esc(v.time)}</div>
        <div class="small muted">${esc(leftText(v))}</div>
      </div>
      <div class="war-actions">
        ${v.closed ? '' : `<button type="button" data-action="deadline-hour">${v.hoursLeft === 1 ? 'Shut the window' : 'Next hour'}</button>`}
        ${v.closed ? '' : confirmButton(ui, 'deadline-staff', v.key, 'Leave it to the staff')}
        <button type="button" class="btn-secondary" data-action="to-hub">${v.closed ? 'Back to the office' : 'Step out'}</button>
      </div>
    </section>
    ${renderFlash(ui)}
    <div class="war-grid">
      <div class="war-calls">
        ${open.length ? each(open, renderCall) : `<section class="card"><p class="muted">${v.closed ? 'The phones have stopped.' : 'No calls on hold. Move the clock on.'}</p></section>`}
        ${done.length ? `<details class="war-earlier"${open.length ? '' : ' open'}><summary>Earlier calls (${done.length})</summary>${each(done, renderCall)}</details>` : ''}
      </div>
      ${renderBoard(v)}
    </div>
  </main>`;
}

/** Home: the war room is open. */
export function renderDeadlineCard(career: Career): string {
  if (!openDeadline(career)) return '';
  const v = deadlineView(career)!;
  const waiting = v.calls.filter((c) => c.status === 'open').length;
  return `<section class="card war-card">
    <div class="card-title">Deadline day · ${esc(v.time)}</div>
    <p>${waiting ? `${waiting} call${waiting === 1 ? '' : 's'} on hold.` : 'The phones are quiet for now.'} The window shuts at ${v.endHour}:00. Calls you leave go to the staff when the week is played.</p>
    <div class="row-actions"><button type="button" data-action="war-room">Enter the war room</button></div>
  </section>`;
}

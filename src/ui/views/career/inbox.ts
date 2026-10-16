/** Inbox: news from the club, newest first. Tapping a message opens it and marks it read. */
import type { Career, InboxMessage } from '../../../sim/career';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { unreadCount } from './hub';

const KIND_LABELS: Record<InboxMessage['kind'], string> = {
  info: 'Club',
  finance: 'Money',
  transfer: 'Transfer',
  bid: 'Bid',
  staff: 'Staff',
  youth: 'Academy',
  ladder: 'Lenders',
  match: 'Match',
  season: 'Season',
  stadium: 'Stadium',
};

function when(m: InboxMessage, career: Career): string {
  const sameSeason = m.season === career.season.league.season;
  return sameSeason ? `Week ${m.weekIndex + 1}` : `Season ${m.season}`;
}

function renderMessage(career: Career, ui: UiState, m: InboxMessage): string {
  const open = ui.inboxOpen === m.id;
  return `<li class="${cls('mail', !m.read && 'unread', open && 'open')}">
    <button type="button" class="mail-head" data-action="open-mail" data-id="${open ? '' : esc(m.id)}" aria-expanded="${open}">
      <span class="${cls('pill', `pill-${m.kind}`)}">${esc(KIND_LABELS[m.kind])}</span>
      <span class="mail-title">${esc(m.title)}</span>
      <span class="muted small">${esc(when(m, career))}</span>
    </button>
    ${open ? `<div class="mail-body">${each(m.body.split('\n').filter(Boolean), (line) => `<p>${esc(line)}</p>`)}</div>` : ''}
  </li>`;
}

export function renderInbox(career: Career, ui: UiState): string {
  const unread = unreadCount(career);
  if (!career.inbox.length) return '<section class="card"><p class="muted">No messages yet.</p></section>';
  return `<section class="card">
    <div class="feed-top">
      <div class="card-title">Inbox${unread ? ` · ${unread} unread` : ''}</div>
      ${unread ? '<button type="button" class="btn-secondary" data-action="read-all">Mark all read</button>' : ''}
    </div>
    <ul class="mail-list">${each(career.inbox, (m) => renderMessage(career, ui, m))}</ul>
  </section>`;
}

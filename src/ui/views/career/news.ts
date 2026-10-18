/** News: the weekly paper (with back issues) and the fans' social feed. */
import { newsEditions, paperName, socialFeed, type Career, type NewsItem, type SocialPost } from '../../../sim/career';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';

export const NEWS_VIEWS = [
  { id: 'paper', label: 'Paper' },
  { id: 'feed', label: 'Fan feed' },
] as const;

function renderStory(it: NewsItem, lead: boolean): string {
  return `<article class="${cls('story', lead && 'lead', it.mine && 'mine')}">
    <h3 class="story-head">${esc(it.headline)}</h3>
    ${it.body ? `<p class="story-body">${esc(it.body)}</p>` : ''}
  </article>`;
}

function renderPaper(career: Career, ui: UiState): string {
  const editions = newsEditions(career);
  if (!editions.length) return '<p class="muted">The first edition comes out at the end of this week.</p>';
  const at = Math.max(0, editions.findIndex((e) => e.weekIndex === ui.newsEdition));
  const e = editions[at];
  const [lead, ...rest] = e.items;
  const older = editions[at + 1];
  const newer = at > 0 ? editions[at - 1] : null;
  return `<div class="paper">
    <header class="paper-mast">
      <div class="paper-name">${esc(paperName())}</div>
      <div class="paper-edition small">${esc(e.label)}${at === 0 ? ' · latest' : ''}</div>
    </header>
    ${renderStory(lead, true)}
    ${rest.length ? `<div class="story-grid">${each(rest, (it) => renderStory(it, false))}</div>` : ''}
    <div class="row-actions paper-nav">
      <button type="button" class="btn-secondary" data-action="news-edition" data-week="${older ? older.weekIndex : ''}" ${older ? '' : 'disabled'}>‹ Older</button>
      <button type="button" class="btn-secondary" data-action="news-edition" data-week="${newer ? newer.weekIndex : ''}" ${newer ? '' : 'disabled'}>Newer ›</button>
    </div>
  </div>`;
}

const TONE: Record<SocialPost['tone'], string> = { up: '▲', down: '▼', flat: '•' };

function renderPost(p: SocialPost): string {
  return `<li class="${cls('post', `post-${p.kind}`, `tone-${p.tone}`)}">
    <div class="post-head"><strong>@${esc(p.handle)}</strong>${p.kind === 'rival' ? ' <span class="pill">Rival fan</span>' : p.kind === 'rumour' ? ' <span class="pill">Rumour</span>' : ''}</div>
    <p class="post-text">${esc(p.text)}</p>
    <div class="post-foot small muted"><span aria-hidden="true">${TONE[p.tone]}</span> ${p.likes.toLocaleString('en-US')} like${p.likes === 1 ? '' : 's'}</div>
  </li>`;
}

function renderFeed(career: Career): string {
  const posts = socialFeed(career);
  if (!posts.length) return '<p class="muted">Nothing from the fans yet. Give them a week.</p>';
  return `<ul class="fan-feed">${each(posts, renderPost)}</ul>`;
}

export function renderNews(career: Career, ui: UiState): string {
  return `<section class="card news">
    <div class="segmented" role="group" aria-label="News view">
      ${each(NEWS_VIEWS, (v) => `<button type="button" class="${cls('seg', v.id === ui.newsView && 'on')}" data-action="news-view" data-view="${v.id}" aria-pressed="${v.id === ui.newsView}">${esc(v.label)}</button>`)}
    </div>
    ${ui.newsView === 'feed' ? renderFeed(career) : renderPaper(career, ui)}
  </section>`;
}

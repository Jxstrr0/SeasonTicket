/** Market: scout players at other clubs, sign free agents, and answer bids for your own. */
import {
  C,
  userAskingPrice,
  freeAgentsOpen,
  loanFee,
  money,
  playerName,
  scoutedRange,
  spendingLimits,
  squadOf,
  squadRole,
  transferWindowOpen,
  userBooks,
  wageDemand,
  type Career,
} from '../../../sim/career';
import { positionLabel } from '../../../sim/data';
import type { Player } from '../../../sim/types';
import { clubLabel, team } from '../../format';
import { cls, each, esc } from '../../html';
import { MARKET_PAGE, type UiState } from '../../career/state';
import { available, confirmButton, nationName, playerFlags, positionFilter, yearsSelect } from './parts';

const LOAN_SHARES = [C.loans.wageShare.min, C.loans.wageShare.default, C.loans.wageShare.max];

function range([lo, hi]: [number, number]): string {
  return lo === hi ? String(lo) : `${lo}-${hi}`;
}

function mid(r: [number, number]): number {
  return (r[0] + r[1]) / 2;
}

/** The fee a loan costs at a given wage share: paying less of the wage costs more up front. */
function loanCost(p: Player, share: number): number {
  return loanFee(p) * (1 + (C.loans.wageShare.max - share));
}

function renderStatus(career: Career): string {
  const books = userBooks(career);
  const limits = spendingLimits(career);
  const window = transferWindowOpen(career);
  const free = freeAgentsOpen(career);
  const squad = squadOf(career, career.userTeamId).length;
  const limitText = limits.locked
    ? 'Spending lock: no fees, and wages are capped.'
    : Number.isFinite(limits.maxFee)
      ? `Lender limits: fees up to ${money(limits.maxFee)}, wages up to ${money(limits.maxWage)}.`
      : '';
  return `<section class="card market-status">
    <div class="pill-row">
      <span class="${cls('pill', window ? 'pill-on' : 'pill-off')}">Transfer window ${window ? 'open' : 'shut'}</span>
      <span class="${cls('pill', free ? 'pill-on' : 'pill-off')}">Free agents ${free ? 'open' : 'shut'}</span>
      <span class="pill">Cash ${esc(money(books.cash))}</span>
      <span class="pill">Squad ${squad}/${C.transfers.maxSquad}</span>
    </div>
    ${window ? '' : `<p class="muted small">The window is open in pre-season and in weeks ${esc(C.calendar.midSeasonWindow.join(', '))} of the season.</p>`}
    ${limitText ? `<p class="warn small">${esc(limitText)}</p>` : ''}
  </section>`;
}

function renderSubtabs(ui: UiState, bids: number): string {
  const tabs: { id: UiState['marketView']; label: string }[] = [
    { id: 'scout', label: 'Scout' },
    { id: 'free', label: 'Free agents' },
    { id: 'bids', label: bids ? `Bids (${bids})` : 'Bids' },
  ];
  return `<div class="subtabs" role="tablist">${each(tabs, (t) => `<button type="button" role="tab" class="${cls('subtab', ui.marketView === t.id && 'on')}" aria-selected="${ui.marketView === t.id}" data-action="market-view" data-view="${t.id}">${esc(t.label)}</button>`)}</div>`;
}

function renderList(career: Career, ui: UiState, players: Player[], free: boolean): string {
  const league = career.season.league;
  const shown = players.slice(0, ui.marketLimit);
  const rows = each(shown, (p) => {
    const r = scoutedRange(career, p);
    const where = p.teamId ? team(league, p.teamId).shortName : 'Free';
    const price = free ? `${money(wageDemand(career, p, career.userTeamId))}/yr` : money(userAskingPrice(career, p));
    return `<tr>
      <td class="name-cell"><button type="button" class="link-btn" data-action="market-player" data-id="${esc(p.id)}">${esc(playerName(p))}</button> ${playerFlags(p)}</td>
      <td>${esc(p.position)}</td>
      <td class="num">${p.age}</td>
      <td class="num"><strong>${range(r.overall)}</strong></td>
      <td class="num hide-narrow">${range(r.potential)}</td>
      <td class="hide-narrow">${esc(where)}</td>
      <td class="num">${esc(price)}</td>
    </tr>`;
  });
  const more = players.length > shown.length
    ? `<button type="button" class="btn-secondary" data-action="market-more">Show ${Math.min(MARKET_PAGE, players.length - shown.length)} more</button>`
    : '';
  return `<div class="table-wrap">
      <table class="data-table market-table">
        <thead><tr><th>Name</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th class="num hide-narrow">Pot</th><th class="hide-narrow">Club</th><th class="num">${free ? 'Wants' : 'Price'}</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">Nobody matches.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="muted small">Showing ${shown.length} of ${players.length}.</p>
    ${more}`;
}

function scoutTargets(career: Career, ui: UiState): Player[] {
  const league = career.season.league;
  return league.teams
    .filter((t) => t.id !== career.userTeamId)
    .flatMap((t) => squadOf(career, t.id))
    .filter((p) => ui.marketPos === 'all' || p.position === ui.marketPos)
    .sort((a, b) => mid(scoutedRange(career, b).overall) - mid(scoutedRange(career, a).overall) || a.age - b.age);
}

function freeAgents(career: Career, ui: UiState): Player[] {
  const league = career.season.league;
  return league.freeAgentIds
    .map((id) => league.players[id])
    .filter((p): p is Player => !!p && (ui.marketPos === 'all' || p.position === ui.marketPos))
    .sort((a, b) => mid(scoutedRange(career, b).overall) - mid(scoutedRange(career, a).overall));
}

function renderTargetDetail(career: Career, p: Player): string {
  const league = career.season.league;
  const r = scoutedRange(career, p);
  const seller = p.teamId ? team(league, p.teamId) : null;
  const wage = wageDemand(career, p, career.userTeamId);
  const asking = seller ? userAskingPrice(career, p) : 0;
  const counter = career.counters[p.id];
  const window = transferWindowOpen(career);
  const role = seller ? squadRole(career, p) : null;
  const onLoan = career.loansIn.length >= C.loans.maxLoansIn;
  let deal: string;
  if (seller) {
    const suggested = Math.round((counter ?? asking) / 1000);
    const bid = window
      ? `<form data-form="bid" data-id="${esc(p.id)}" class="deal-form">
          <label>Fee ($k)<input class="field" type="number" name="fee" inputmode="numeric" min="0" step="any" value="${suggested}"></label>
          <label>Contract${yearsSelect('years', 3)}</label>
          <button type="submit">Make bid</button>
        </form>
        ${counter ? `<p class="small">${esc(seller.shortName)} came back asking ${esc(money(counter))}.</p>` : ''}`
      : '<p class="muted small">Bids open when the transfer window does.</p>';
    const loans = window && role !== 'starter'
      ? `<div class="card-title">Loan until the end of the season</div>
        <p class="muted small">Pay less of the wage and the fee goes up.${onLoan ? ` You already have ${C.loans.maxLoansIn} loans.` : ''}</p>
        <div class="row-actions">${each(LOAN_SHARES, (share) => `<button type="button" class="btn-secondary" data-action="loan-in" data-id="${esc(p.id)}" data-share="${share}"${onLoan ? ' disabled' : ''}>Pay ${Math.round(share * 100)}% of wage · fee ${esc(money(loanCost(p, share)))}</button>`)}</div>`
      : role === 'starter' && window
        ? `<p class="muted small">${esc(seller.shortName)} will not loan out a starter.</p>`
        : '';
    deal = `${bid}${loans}`;
  } else {
    deal = freeAgentsOpen(career)
      ? `<form data-form="sign-free" data-id="${esc(p.id)}" class="deal-form">
          <label>Contract${yearsSelect('years', 2)}</label>
          <button type="submit">Sign for ${esc(money(wage))}/yr</button>
        </form>`
      : '<p class="muted small">Free agents cannot sign during the run-in.</p>';
  }
  return `<section class="card player-detail">
    <div class="feed-top">
      <button type="button" class="btn-secondary" data-action="market-player" data-id="">Back to list</button>
      <span class="muted small">${seller ? clubLabel(seller) : 'Free agent'}</span>
    </div>
    <h2 class="player-name">${esc(playerName(p))} ${playerFlags(p)}</h2>
    <p class="small">${esc(positionLabel(p.position))} · Age ${p.age} · ${esc(nationName(p))}${available(p) ? '' : ' · unavailable right now'}</p>
    <dl class="facts compact">
      <div><dt>Overall</dt><dd><strong>${range(r.overall)}</strong></dd></div>
      <div><dt>Potential</dt><dd>${range(r.potential)}</dd></div>
      ${seller ? `<div><dt>Asking price</dt><dd>${esc(money(asking))}</dd></div>` : ''}
      <div><dt>Wage demand</dt><dd>${esc(money(wage))}/yr</dd></div>
      ${seller ? `<div><dt>Contract left</dt><dd>${p.contract.years} yr${p.contract.years === 1 ? '' : 's'}</dd></div>` : ''}
      ${role ? `<div><dt>At ${esc(seller?.shortName ?? '')}</dt><dd>${esc(role === 'starter' ? 'Starter' : role === 'rotation' ? 'Rotation' : 'Fringe')}</dd></div>` : ''}
    </dl>
    <p class="muted small">Ratings are your head scout's estimate. A better scout narrows the range.</p>
    ${deal}
  </section>`;
}

function renderBids(career: Career, ui: UiState): string {
  const league = career.season.league;
  const bids = career.incomingBids
    .map((b) => ({ b, p: league.players[b.playerId] }))
    .filter((x) => x.p && x.p.teamId === career.userTeamId);
  const bidList = bids.length
    ? `<ul class="deal-list">${each(bids, ({ b, p }) => `<li>
        <div><strong>${esc(playerName(p))}</strong> <span class="muted small">${esc(p.position)} · ${p.overall} · value ${esc(money(p.value))}</span></div>
        <div class="small">${esc(team(league, b.fromTeamId).shortName)} offer <strong>${esc(money(b.fee))}</strong> · ${Math.max(0, b.expiresWeek - career.weekIndex + 1)} wk left</div>
        <div class="row-actions">
          ${confirmButton(ui, 'accept-bid', b.id, 'Accept', 'btn-primary')}
          <button type="button" class="btn-secondary" data-action="reject-bid" data-id="${esc(b.id)}">Reject</button>
        </div>
      </li>`)}</ul>`
    : '<p class="muted small">No bids right now. Clubs bid while the window is open, or you can offer a player from the Squad tab.</p>';
  const counters = Object.entries(career.counters)
    .map(([id, fee]) => ({ p: league.players[id], fee }))
    .filter((x) => x.p && x.p.teamId && x.p.teamId !== career.userTeamId);
  const counterList = counters.length
    ? `<div class="card-title">Counter-offers</div>
      <ul class="deal-list">${each(counters, ({ p, fee }) => `<li>
        <div><strong>${esc(playerName(p))}</strong> <span class="muted small">${esc(team(league, p.teamId as string).shortName)} want ${esc(money(fee))}</span></div>
        <button type="button" class="btn-secondary" data-action="market-player" data-id="${esc(p.id)}">Open</button>
      </li>`)}</ul>`
    : '';
  const loans = career.loansIn
    .map((l) => ({ l, p: league.players[l.playerId] }))
    .filter((x) => !!x.p);
  const loanList = loans.length
    ? `<div class="card-title">On loan with you</div>
      <ul class="deal-list">${each(loans, ({ l, p }) => `<li><strong>${esc(playerName(p))}</strong> <span class="muted small">from ${esc(team(league, l.fromTeamId).shortName)} · you pay ${Math.round(l.wageShare * 100)}% of the wage</span></li>`)}</ul>`
    : '';
  return `<section class="card">
    <div class="card-title">Bids for your players</div>
    ${bidList}
    ${counterList}
    ${loanList}
  </section>`;
}

export function renderMarket(career: Career, ui: UiState): string {
  const league = career.season.league;
  const status = renderStatus(career);
  const tabs = renderSubtabs(ui, career.incomingBids.length);
  const picked = ui.marketPlayerId ? league.players[ui.marketPlayerId] : undefined;
  if (picked && picked.teamId !== career.userTeamId) return `${status}${renderTargetDetail(career, picked)}`;
  if (ui.marketView === 'bids') return `${status}${tabs}${renderBids(career, ui)}`;
  const free = ui.marketView === 'free';
  const players = free ? freeAgents(career, ui) : scoutTargets(career, ui);
  return `${status}${tabs}
  <section class="card">
    ${positionFilter(ui.marketPos, 'market-pos')}
    ${renderList(career, ui, players, free)}
  </section>`;
}

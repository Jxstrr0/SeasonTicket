/** Club: ticket prices, the shirt sponsor, naming rights, the academy and the staff. */
import {
  C,
  ROLE_LABELS,
  academyUpgradeCost,
  academyUpkeep,
  estimatedGate,
  fairPrice,
  fireCost,
  money,
  namingRightsOffer,
  playerName,
  spendingLimits,
  staffInRole,
  staffPool,
  userBooks,
  userTeam,
  type Career,
} from '../../../sim/career';
import { STAFF_ROLES, type StaffMember, type StaffRole } from '../../../sim/types';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { confirmButton } from './parts';

const ROLE_HELP: Record<StaffRole, string> = {
  headCoach: 'Picks the team and tactics when you delegate, makes the in-game calls, and drives player development.',
  assistantCoach: 'Helps develop players over the off-season.',
  fitnessCoach: 'Gets injured players back sooner (rated 50 or better).',
  headScout: 'Narrows the rating ranges you see on other clubs’ players.',
  academyDirector: 'Raises the quality of the youth intake each off-season.',
};

function renderTickets(career: Career): string {
  const team = userTeam(career);
  const books = userBooks(career);
  const fair = fairPrice(team);
  const gate = estimatedGate(team);
  const t = C.tickets;
  const diff = books.ticketPrice - fair;
  const hint = Math.abs(diff) < 1
    ? 'About what fans think is fair.'
    : diff > 0
      ? 'Above what fans think is fair: fewer will come, and the mood drops if crowds thin out.'
      : 'Below the fair price: fuller stands, less money per seat.';
  return `<section class="card">
    <div class="card-title">Tickets</div>
    <dl class="facts compact">
      <div><dt>Price</dt><dd><strong>$${books.ticketPrice.toFixed(2)}</strong></dd></div>
      <div><dt>Fair price</dt><dd>$${fair.toFixed(2)}</dd></div>
      <div><dt>Capacity</dt><dd>${team.stadiumCapacity.toLocaleString('en-US')}</dd></div>
      <div><dt>Fan mood</dt><dd>${Math.round(team.fanMood * 100)}%</dd></div>
    </dl>
    <p class="muted small">${esc(hint)} A typical home gate at a fair price is about ${esc(money(gate))}.</p>
    <form data-form="ticket" class="inline-form">
      <label class="small">New price ($)<input class="field small-field" type="number" name="price" inputmode="decimal" min="${t.minPrice}" max="${t.maxPrice}" step="0.5" value="${books.ticketPrice}"></label>
      <button type="submit" class="btn-secondary">Set price</button>
    </form>
  </section>`;
}

function renderSponsor(career: Career, ui: UiState): string {
  const books = userBooks(career);
  const deal = books.sponsor;
  const sponsor = deal
    ? `<p>${esc(deal.brand)} pays <strong>${esc(money(deal.perSeason))}</strong> a season · ${deal.yearsLeft} season${deal.yearsLeft === 1 ? '' : 's'} left.</p>`
    : career.sponsorOffers.length
      ? `<p class="muted small">Pick one. If you haven't chosen by kick-off, the best offer is signed for you.</p>
        <ul class="deal-list">${each(career.sponsorOffers, (o, i) => `<li class="deal-row">
          <div><strong>${esc(o.brand)}</strong><div class="small">${esc(money(o.perSeason))} a season for ${o.years} season${o.years === 1 ? '' : 's'}</div></div>
          <button type="button" class="btn-secondary" data-action="accept-sponsor" data-index="${i}">Sign</button>
        </li>`)}</ul>`
      : '<p class="muted small">No offers right now. New ones arrive in the off-season.</p>';
  const naming = books.namingRights;
  const offer = namingRightsOffer(career);
  const namingBody = naming
    ? `<p>${esc(naming.brand)} has the name for ${naming.yearsLeft} more season${naming.yearsLeft === 1 ? '' : 's'}. It goes back to the ${esc(naming.originalName)} after that.</p>`
    : offer
      ? `<p class="small">${esc(offer.brand)} will pay <strong>${esc(money(offer.fee))}</strong> up front to rename the ground for ${offer.years} seasons. Fans won't love it (mood -${Math.round(C.namingRights.fanMoodHit * 100)}%).</p>
        <div class="row-actions">${confirmButton(ui, 'sell-naming', 'offer', 'Sell the name')}</div>`
      : '';
  return `<section class="card">
    <div class="card-title">Shirt sponsor</div>
    ${sponsor}
    <div class="card-title">Stadium name · ${esc(userTeam(career).stadiumName)}</div>
    ${namingBody}
  </section>`;
}

function renderAcademy(career: Career, ui: UiState): string {
  const books = userBooks(career);
  const cost = academyUpgradeCost(career);
  const level = books.academyLevel;
  const max = C.youth.upgradeCost.length + 1;
  const intake = C.youth.intakeByLevel[level - 1] ?? 0;
  const locked = spendingLimits(career).locked;
  const upgrade = cost === null
    ? '<p class="muted small">Top level.</p>'
    : locked
      ? '<p class="warn small">The spending lock forbids upgrades.</p>'
      : `<div class="row-actions">${confirmButton(ui, 'upgrade-academy', 'next', `Upgrade for ${money(cost)}`)}</div>`;
  return `<section class="card">
    <div class="card-title">Youth academy</div>
    <div class="level-pips" aria-label="Level ${level} of ${max}">${each(Array.from({ length: max }, (_, i) => i), (i) => `<span class="${cls('pip', i < level && 'on')}"></span>`)}</div>
    <p class="small">Level ${level} of ${max}: about ${intake} prospects each off-season. Upkeep ${esc(money(academyUpkeep(books)))} a season.</p>
    ${upgrade}
  </section>`;
}

function staffLine(m: StaffMember): string {
  return `<span class="small muted">Rated <strong>${m.rating}</strong> · age ${m.age} · ${esc(money(m.contract.wage))}/yr · ${m.contract.years} yr${m.contract.years === 1 ? '' : 's'}</span>`;
}

function renderRole(career: Career, ui: UiState, role: StaffRole): string {
  const current = staffInRole(career, career.userTeamId, role);
  const open = ui.staffRole === role;
  const pool = open ? staffPool(career, role) : [];
  const payoff = current ? fireCost(current) : 0;
  const head = current
    ? `<div><strong>${esc(playerName(current))}</strong></div>${staffLine(current)}`
    : '<div class="warn">Vacant</div>';
  const fire = current && role !== 'headCoach'
    ? confirmButton(ui, 'fire-staff', current.id, `Let go (${money(payoff)})`)
    : '';
  const list = open
    ? `<ul class="deal-list hire-list">${pool.length
        ? each(pool, (m) => `<li class="deal-row">
            <div><strong>${esc(playerName(m))}</strong><div>${staffLine(m)}</div></div>
            ${confirmButton(ui, 'hire-staff', m.id, 'Hire', 'btn-primary')}
          </li>`)
        : '<li class="muted small">Nobody available.</li>'}</ul>
      ${current ? `<p class="muted small">Hiring pays off ${esc(playerName(current))} (${esc(money(payoff))}).</p>` : ''}`
    : '';
  return `<li class="staff-role">
    <div class="staff-head">
      <div>
        <div class="small muted">${esc(ROLE_LABELS[role])}</div>
        ${head}
      </div>
      <div class="row-actions">
        ${fire}
        <button type="button" class="btn-secondary" data-action="staff-role" data-role="${open ? '' : role}" aria-expanded="${open}">${open ? 'Close' : 'Replace'}</button>
      </div>
    </div>
    <p class="muted small">${esc(ROLE_HELP[role])}</p>
    ${list}
  </li>`;
}

function renderStaff(career: Career, ui: UiState): string {
  return `<section class="card">
    <div class="card-title">Staff</div>
    <ul class="staff-list">${each(STAFF_ROLES, (role) => renderRole(career, ui, role))}</ul>
  </section>`;
}

export function renderClub(career: Career, ui: UiState): string {
  return `<div class="club-grid">
    <div>
      ${renderTickets(career)}
      ${renderSponsor(career, ui)}
      ${renderAcademy(career, ui)}
    </div>
    <div>${renderStaff(career, ui)}</div>
  </div>`;
}

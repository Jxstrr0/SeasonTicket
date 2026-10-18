/** Money: cash, the owner's fortune, debt and the lenders, the season's ledger and the wage cap. */
import {
  C,
  FINANCING_KEYS,
  INCOME_KEYS,
  LADDER_NAMES,
  SPENDING_KEYS,
  borrowOptions,
  ledgerTotals,
  lender,
  money,
  playerPayroll,
  revenueBasis,
  spendingLimits,
  staffPayroll,
  totalDebt,
  userBooks,
  type Career,
  type FinancingKey,
  type IncomeKey,
  type Ledger,
  type SpendingKey,
} from '../../../sim/career';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';

const INCOME_LABELS: Record<IncomeKey, string> = {
  tickets: 'Tickets',
  concessions: 'Food and drink',
  merchandise: 'Merchandise',
  sponsors: 'Shirt sponsor',
  namingRights: 'Naming rights',
  tv: 'TV money',
  merit: 'League prize money',
  playoffs: 'Playoff money',
  playerSales: 'Player sales',
  loanFees: 'Loan fees received',
  luxuryShare: 'Luxury tax share',
  hospitality: 'Hospitality boxes',
  other: 'Other (fines, one-offs)',
};

const SPENDING_LABELS: Record<SpendingKey, string> = {
  playerWages: 'Player wages',
  staffWages: 'Staff wages',
  operations: 'Running the club',
  matchday: 'Match-day costs',
  transfers: 'Transfer fees',
  loanFees: 'Loan fees paid',
  luxuryTax: 'Luxury tax',
  interest: 'Interest',
  academy: 'Academy upkeep',
  severance: 'Pay-offs',
  upgrades: 'Upgrades',
};

const FINANCING_LABELS: Record<FinancingKey, string> = {
  ownerInjection: 'Your money in',
  borrowed: 'Borrowed',
  repaid: 'Repaid early',
};

function ladderHint(level: number): string {
  switch (level) {
    case 0:
      return 'The lenders are happy.';
    case 1:
      return 'A warning letter. Get back in the black and meet every loan condition.';
    case 2:
      return `A lender CFO caps fees at ${money(C.ladder.cfo.maxFee)} and wages at ${money(C.ladder.cfo.maxWage)}.`;
    case 3:
      return `Spending lock: no transfer fees, no upgrades, new wages capped at ${money(C.ladder.lockMaxWage)}.`;
    case 4:
      return 'Forced sales: the lenders sell a player every few weeks until the books are fixed.';
    default:
      return 'Receivership. The club has been taken away.';
  }
}

function renderOverview(career: Career): string {
  const books = userBooks(career);
  const debt = totalDebt(books);
  const level = career.ladder.level;
  const left = career.ladder.deadlineWeek === null ? null : Math.max(0, career.ladder.deadlineWeek - career.weekIndex);
  return `<section class="card">
    <div class="card-title">Overview</div>
    <dl class="facts">
      <div><dt>Club cash</dt><dd class="${cls(books.cash < 0 && 'negative')}">${esc(money(books.cash))}</dd></div>
      <div><dt>Debt</dt><dd>${esc(money(debt))}</dd></div>
      <div><dt>Your fortune</dt><dd>${esc(money(career.owner.fortune))}</dd></div>
      <div><dt>Put in so far</dt><dd>${esc(money(career.owner.injected))}</dd></div>
    </dl>
    <div class="ladder" aria-label="Lender ladder">
      ${each(LADDER_NAMES, (name, i) => `<span class="${cls('ladder-step', i === level && 'on', i < level && 'past')}">${esc(name)}</span>`)}
    </div>
    <p class="small ${level > 0 ? 'warn' : 'muted'}">${esc(ladderHint(level))}${left !== null && level > 0 ? ` ${left} week${left === 1 ? '' : 's'} to recover before the next step.` : ''}</p>
    ${books.cash < 0 ? `<p class="warn small">Overdrawn: ${Math.round(C.lenders.overdraftRate * 100)}% a year in interest, and the ladder climbs until you are back above zero.</p>` : ''}
  </section>`;
}

function ledgerRows<K extends string>(keys: readonly K[], values: Record<K, number>, labels: Record<K, string>): string {
  return each(
    keys.filter((k) => values[k] !== 0),
    (k) => `<tr><td>${esc(labels[k])}</td><td class="num">${esc(money(values[k]))}</td></tr>`,
  );
}

function renderLedger(title: string, ledger: Ledger): string {
  const t = ledgerTotals(ledger);
  const financing = ledgerRows(FINANCING_KEYS, ledger.financing, FINANCING_LABELS);
  return `<section class="card">
    <div class="card-title">${esc(title)}</div>
    <div class="ledger-grid">
      <table class="data-table ledger">
        <thead><tr><th>Income</th><th class="num">${esc(money(t.income))}</th></tr></thead>
        <tbody>${ledgerRows(INCOME_KEYS, ledger.income, INCOME_LABELS) || '<tr><td class="muted" colspan="2">Nothing yet.</td></tr>'}</tbody>
      </table>
      <table class="data-table ledger">
        <thead><tr><th>Spending</th><th class="num">${esc(money(t.spending))}</th></tr></thead>
        <tbody>${ledgerRows(SPENDING_KEYS, ledger.spending, SPENDING_LABELS) || '<tr><td class="muted" colspan="2">Nothing yet.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="ledger-profit">Profit <strong class="${cls(t.profit < 0 && 'negative')}">${esc(money(t.profit))}</strong></p>
    ${financing ? `<table class="data-table ledger"><thead><tr><th colspan="2">Financing (not profit)</th></tr></thead><tbody>${financing}</tbody></table>` : ''}
  </section>`;
}

function renderPayroll(career: Career): string {
  const payroll = playerPayroll(career, career.userTeamId);
  const staff = staffPayroll(career, career.userTeamId);
  const cap = C.wageCap.cap;
  const books = userBooks(career);
  const average = books.payrollWeeks > 0 ? books.payrollAccum / books.payrollWeeks : payroll;
  const over = Math.max(0, average - cap);
  const rate = books.overCapSeasons >= C.wageCap.repeatAfterSeasons ? C.wageCap.repeatTaxRate : C.wageCap.taxRate;
  const pct = Math.min(100, Math.round((payroll / cap) * 100));
  return `<section class="card">
    <div class="card-title">Wage cap</div>
    <div class="meter" role="img" aria-label="Payroll ${pct}% of the cap"><span class="${cls('meter-fill', payroll > cap && 'over')}" style="width:${pct}%"></span></div>
    <dl class="facts compact">
      <div><dt>Player wages</dt><dd>${esc(money(payroll))}/yr</dd></div>
      <div><dt>Cap</dt><dd>${esc(money(cap))}</dd></div>
      <div><dt>Season average</dt><dd>${esc(money(average))}</dd></div>
      <div><dt>Staff wages</dt><dd>${esc(money(staff))}/yr</dd></div>
    </dl>
    <p class="small ${over > 0 ? 'warn' : 'muted'}">${over > 0
      ? `On course to pay ${esc(money(over * rate))} luxury tax (${Math.round(rate * 100)}% of every dollar over).`
      : 'The cap is soft: go over and you pay luxury tax on the season average. Clubs under it share the pot.'}</p>
  </section>`;
}

function renderDebts(career: Career): string {
  const books = userBooks(career);
  if (!books.debts.length) return '';
  return `<section class="card">
    <div class="card-title">Loans</div>
    <ul class="deal-list">${each(books.debts, (d) => {
      const l = lender(d.lenderId);
      const weeksPerSeason = C.calendar.weeksPerYear;
      return `<li>
        <div><strong>${esc(l.name)}</strong> <span class="muted small">${Math.round(d.rate * 100)}% · ${esc(money(d.weeklyPayment))}/wk · ${(d.weeksLeft / weeksPerSeason).toFixed(1)} seasons left</span></div>
        <div class="small">Owed ${esc(money(d.balance))}${d.minCash > 0 ? ` · keep ${esc(money(d.minCash))} in the bank` : ''}</div>
        <form data-form="repay" data-id="${esc(d.id)}" class="inline-form">
          <label class="small">Repay ($k)<input class="field small-field" type="number" name="amount" inputmode="numeric" min="1" step="any" value="${Math.round(Math.min(d.balance, Math.max(0, books.cash)) / 1000)}"></label>
          <button type="submit" class="btn-secondary">Repay</button>
        </form>
      </li>`;
    })}</ul>
  </section>`;
}

function renderBorrow(career: Career): string {
  const options = borrowOptions(career);
  const revenue = revenueBasis(career, career.userTeamId);
  return `<section class="card">
    <div class="card-title">Borrow</div>
    <p class="muted small">Lenders look at your yearly revenue (about ${esc(money(revenue))}) and what you already owe. Breaking a condition starts the lender ladder.</p>
    <ul class="deal-list">${each(options, (o) => {
      const l = o.lender;
      const terms = `${Math.round(l.rate * 100)}% a year over ${l.seasons} seasons${l.minCashCondition > 0 ? `, keep ${money(l.minCashCondition)} in the bank` : ''}`;
      const form = o.available
        ? `<form data-form="borrow" data-id="${esc(l.id)}" class="inline-form">
            <label class="small">Amount ($k)<input class="field small-field" type="number" name="amount" inputmode="numeric" min="${C.lenders.minLoan / 1000}" max="${o.max / 1000}" step="any" value="${Math.round(o.max / 1000)}"></label>
            <button type="submit" class="btn-secondary">Borrow</button>
          </form>`
        : `<p class="muted small">${esc(o.reason ?? '')}</p>`;
      return `<li>
        <div><strong>${esc(l.name)}</strong> <span class="muted small">up to ${esc(money(o.max))}</span></div>
        <div class="small">${esc(terms)}</div>
        ${form}
      </li>`;
    })}</ul>
  </section>`;
}

function renderInject(career: Career): string {
  const fortune = career.owner.fortune;
  return `<section class="card">
    <div class="card-title">Put in your own money</div>
    <p class="muted small">Your fortune is finite and money you put in never comes back. Minimum ${esc(money(C.owner.minInjection))}.</p>
    ${fortune >= C.owner.minInjection
      ? `<form data-form="inject" class="inline-form">
          <label class="small">Amount ($k)<input class="field small-field" type="number" name="amount" inputmode="numeric" min="${C.owner.minInjection / 1000}" max="${Math.floor(fortune / 1000)}" step="any" value="${C.owner.minInjection / 1000}"></label>
          <button type="submit">Put money in</button>
        </form>`
      : '<p class="warn small">Your fortune is spent.</p>'}
  </section>`;
}

export function renderMoney(career: Career, _ui: UiState): string {
  const books = userBooks(career);
  const limits = spendingLimits(career);
  const limitNote = limits.locked || Number.isFinite(limits.maxFee)
    ? `<p class="warn small">Lender limits on: ${limits.locked ? 'no transfer fees' : `fees up to ${esc(money(limits.maxFee))}`}, wages up to ${esc(money(limits.maxWage))}.</p>`
    : '';
  return `<div class="money-grid">
    <div>
      ${renderOverview(career)}
      ${limitNote}
      ${renderPayroll(career)}
      ${renderInject(career)}
    </div>
    <div>
      ${renderLedger(`Season ${career.season.league.season} so far`, books.ledger)}
      ${books.lastLedger ? renderLedger('Last season', books.lastLedger) : ''}
      ${renderDebts(career)}
      ${renderBorrow(career)}
    </div>
  </div>`;
}

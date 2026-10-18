/** The Help screen and the first-time tip card (Stage 7.1). */
import { C, money } from '../../../sim/career';
import { SEASON_TUNING } from '../../../sim/data';
import { each, esc } from '../../html';
import { tipOf, type TipId } from '../../career/tips';
import helpData from '../../../data/help/help.json';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** The numbers the answers quote, from the tuning files. */
function helpVars(): Record<string, string> {
  return {
    preseasonWeeks: String(C.calendar.preseasonWeeks),
    deadlineWeeks: String(C.ladder.deadlineWeeks),
    goodWeeks: String(C.ladder.goodWeeksToRecover),
    receivership: money(C.ladder.receivershipOverdraft),
    cap: money(C.wageCap.cap),
    taxRate: pct(C.wageCap.taxRate),
    repeatTaxRate: pct(C.wageCap.repeatTaxRate),
    minSquad: String(C.transfers.userMinSquad),
    maxSquad: String(C.transfers.maxSquad),
    minKeepers: String(C.transfers.minGoalkeepers),
    fillTo: String(C.transfers.emergencyFillTo),
    homegrown: String(SEASON_TUNING.homegrownMinimum),
  };
}

/** Fills {name} from the tuning; an unknown name is left as it is, so a test can catch it. */
export function fillHelp(text: string, vars = helpVars()): string {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
}

export interface HelpSection {
  title: string;
  items: { q: string; a: string }[];
}

export function helpSections(): HelpSection[] {
  const vars = helpVars();
  return helpData.sections.map((s) => ({ title: s.title, items: s.items.map((i) => ({ q: i.q, a: fillHelp(i.a, vars) })) }));
}

export function renderHelp(): string {
  return `<main class="shell help-screen">
    <header class="help-head">
      <button type="button" class="btn-secondary" data-action="back">Back</button>
      <h1>Help</h1>
    </header>
    ${each(
      helpSections(),
      (s) => `<section class="card help-section">
        <h2 class="card-title">${esc(s.title)}</h2>
        ${each(s.items, (i) => `<details class="help-q"><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`)}
      </section>`,
    )}
    <p class="center"><button type="button" class="btn-secondary" data-action="back">Back</button></p>
  </main>`;
}

/** The tip card, floating at the bottom of the screen. */
export function renderTip(id: TipId): string {
  const tip = tipOf(id);
  return `<aside class="tip-card" role="note" aria-label="Tip: ${esc(tip.title)}">
    <div class="tip-title">${esc(tip.title)}</div>
    <p>${esc(tip.text)}</p>
    <div class="tip-row">
      <button type="button" data-action="tip-ok" data-id="${esc(id)}">Got it</button>
      <button type="button" class="btn-secondary" data-action="tips-off">No more tips</button>
    </div>
  </aside>`;
}

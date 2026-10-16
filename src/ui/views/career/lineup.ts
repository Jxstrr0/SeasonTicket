/**
 * Lineup and tactics: the eleven on a pitch, a picker for the tapped slot,
 * the bench, and the tactics dials. The tactics panel is shared with the
 * live match screen.
 */
import {
  ensureUserSelection,
  homegrownStarters,
  squadOf,
  userFixture,
  type Career,
} from '../../../sim/career';
import { FORMATIONS, MATCH_TUNING, formation as formationOf } from '../../../sim/data';
import { slotAbility } from '../../../sim/match/lineup';
import type { League, Player, Tactics } from '../../../sim/types';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { available, confirmButton, conditionCell, dialRow, option, playerFlags } from './parts';

const MAX_BENCH = MATCH_TUNING.squad.maxBench;

export interface TacticsPanelOptions {
  disabled: boolean;
  /** Players who can take set pieces (the eleven). */
  takers: Player[];
  /** Opponent players for man-marking; empty hides the control. */
  opponents: Player[];
}

const DIALS: readonly { key: keyof Tactics; label: string; low: string; high: string }[] = [
  { key: 'mentality', label: 'Mentality', low: 'Very defensive', high: 'Very attacking' },
  { key: 'pressing', label: 'Pressing', low: 'Sit off', high: 'All-out press' },
  { key: 'defensiveLine', label: 'Defensive line', low: 'Deep', high: 'Very high' },
  { key: 'width', label: 'Width', low: 'Narrow', high: 'Very wide' },
  { key: 'tempo', label: 'Tempo', low: 'Slow', high: 'Frantic' },
  { key: 'directness', label: 'Passing', low: 'Short', high: 'Long balls' },
  { key: 'timeWasting', label: 'Time-wasting', low: 'Never', high: 'Always' },
];

const TAKERS: readonly { key: keyof Tactics['setPieceTakers']; label: string }[] = [
  { key: 'penalties', label: 'Penalties' },
  { key: 'freeKicks', label: 'Free kicks' },
  { key: 'corners', label: 'Corners' },
];

function surname(p: Player | undefined): string {
  return p ? p.lastName : '';
}

export function renderFormationPicker(current: string, disabled: boolean): string {
  return `<div class="chip-row" role="group" aria-label="Formation">
    ${each(FORMATIONS, (f) => `<button type="button" class="${cls('chip', f.id === current && 'on')}" data-action="set-formation" data-id="${esc(f.id)}" aria-pressed="${f.id === current}"${disabled ? ' disabled' : ''}>${esc(f.name)}</button>`)}
  </div>`;
}

/** Dials, counter-attacks, set-piece takers and man-marking. */
export function renderTacticsPanel(tactics: Tactics, opts: TacticsPanelOptions): string {
  const off = opts.disabled ? ' disabled' : '';
  const takerOptions = (current: string | null) =>
    option('', 'Best available', current ?? '') + each(opts.takers, (p) => option(p.id, `${p.lastName} (${p.attributes.spk})`, current ?? ''));
  const manMark = opts.opponents.length
    ? `<label>Man-mark<select class="field" data-change="man-mark"${off}>
        ${option('', 'Nobody', tactics.manMarkTarget ?? '')}
        ${each(opts.opponents, (p) => option(p.id, `${p.lastName} · ${p.position} ${p.overall}`, tactics.manMarkTarget ?? ''))}
      </select></label>`
    : '';
  return `<div class="tactics-panel">
    <div class="dials">${each(DIALS, (d) => dialRow(d.label, d.key, tactics[d.key] as number, d.low, d.high, opts.disabled))}</div>
    <label class="check"><input type="checkbox" data-change="counter"${tactics.counterAttack ? ' checked' : ''}${off}> Counter-attack when we win the ball</label>
    <div class="field-grid takers">
      ${each(TAKERS, (t) => `<label>${esc(t.label)}<select class="field" data-change="taker" data-key="${t.key}"${off}>${takerOptions(tactics.setPieceTakers[t.key])}</select></label>`)}
      ${manMark}
    </div>
  </div>`;
}

/** Opponent squad for man-marking: the next fixture's best sixteen. */
export function opponentPlayers(career: Career): Player[] {
  const fixture = userFixture(career);
  if (!fixture) return [];
  const oppId = fixture.homeId === career.userTeamId ? fixture.awayId : fixture.homeId;
  return squadOf(career, oppId)
    .filter(available)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 16);
}

function renderPitch(league: League, tactics: Tactics, starters: string[], selected: number | null, locked: boolean): string {
  const f = formationOf(tactics.formationId);
  return `<div class="pitch" aria-label="Starting eleven">
    <div class="pitch-lines" aria-hidden="true"><span class="pitch-half"></span><span class="pitch-circle"></span><span class="pitch-box top"></span><span class="pitch-box bottom"></span></div>
    ${each(f.slots, (slot) => {
      const p = league.players[starters[slot.index] ?? ''];
      const out = p && !available(p);
      const style = `left:${(slot.x * 100).toFixed(1)}%;bottom:${(slot.y * 92 + 2).toFixed(1)}%`;
      return `<button type="button" class="${cls('slot', slot.index === selected && 'on', !p && 'empty', out && 'out')}" style="${style}" data-action="slot" data-slot="${slot.index}"${locked ? ' disabled' : ''}>
        <span class="slot-pos">${esc(slot.label)}</span>
        <span class="slot-name">${p ? esc(surname(p)) : 'Empty'}</span>
        ${p ? `<span class="slot-ovr">${p.overall}</span>` : ''}
      </button>`;
    })}
  </div>`;
}

function whereIs(starters: string[], bench: string[], tactics: Tactics, id: string): string {
  const i = starters.indexOf(id);
  if (i >= 0) return formationOf(tactics.formationId).slots[i]?.label ?? 'XI';
  return bench.includes(id) ? 'Bench' : '';
}

function renderPicker(career: Career, slotIndex: number): string {
  const league = career.season.league;
  const sel = ensureUserSelection(career);
  const slot = formationOf(sel.tactics.formationId).slots[slotIndex];
  if (!slot) return '';
  const current = sel.lineup.starters[slotIndex] ?? '';
  const squad = squadOf(career, career.userTeamId).sort((a, b) => slotAbility(b, slot) - slotAbility(a, slot) || b.overall - a.overall);
  return `<section class="card picker">
    <div class="feed-top">
      <div class="card-title">Pick the ${esc(slot.label)}</div>
      <button type="button" class="btn-secondary" data-action="slot" data-slot="">Done</button>
    </div>
    <ul class="pick-list">${each(squad, (p) => {
      const where = whereIs(sel.lineup.starters, sel.lineup.bench, sel.tactics, p.id);
      const fit = Math.round(slotAbility(p, slot));
      const ok = available(p);
      return `<li><button type="button" class="${cls('pick', p.id === current && 'on')}" data-action="pick-starter" data-id="${esc(p.id)}"${ok && p.id !== current ? '' : ' disabled'}>
        <span class="pick-name">${esc(p.firstName.charAt(0))}. ${esc(p.lastName)} ${playerFlags(p)}</span>
        <span class="muted small">${esc(p.position)}${where ? ` · ${esc(where)}` : ''}</span>
        <span class="pick-fit" title="Fit for this slot">${fit}</span>
        <span class="small">${conditionCell(p.condition)}</span>
      </button></li>`;
    })}</ul>
  </section>`;
}

function renderBench(career: Career, locked: boolean): string {
  const league = career.season.league;
  const sel = ensureUserSelection(career);
  const others = squadOf(career, career.userTeamId)
    .filter((p) => !sel.lineup.starters.includes(p.id))
    .sort((a, b) => Number(sel.lineup.bench.includes(b.id)) - Number(sel.lineup.bench.includes(a.id)) || b.overall - a.overall);
  const full = sel.lineup.bench.length >= MAX_BENCH;
  return `<section class="card">
    <div class="card-title">Bench · ${sel.lineup.bench.length}/${MAX_BENCH}</div>
    <p class="muted small">Tap to add or remove. Five substitutions per match.</p>
    <div class="bench-list">${each(others, (p) => {
      const on = sel.lineup.bench.includes(p.id);
      const disabled = locked || (!on && (full || !available(p)));
      return `<button type="button" class="${cls('bench-chip', on && 'on')}" data-action="bench-toggle" data-id="${esc(p.id)}" aria-pressed="${on}"${disabled ? ' disabled' : ''}>
        <span>${esc(p.position)}</span> ${esc(league.players[p.id].lastName)} <strong>${p.overall}</strong>${p.injuryWeeks > 0 ? ' <span class="flag flag-injury">Inj</span>' : ''}${p.suspensionMatches > 0 ? ' <span class="flag flag-ban">Ban</span>' : ''}
      </button>`;
    })}</div>
  </section>`;
}

export function renderLineup(career: Career, ui: UiState): string {
  const league = career.season.league;
  const sel = ensureUserSelection(career);
  const auto = career.delegation.autoLineup;
  const hg = homegrownStarters(career);
  const takers = sel.lineup.starters.map((id) => league.players[id]).filter((p): p is Player => !!p);
  const notice = auto
    ? `<section class="card notice">
        <p>The head coach picks the lineup and tactics before each match. This is the most recent pick.</p>
        <button type="button" data-action="take-lineup">I'll pick the team</button>
      </section>`
    : '';
  const warn = hg.minimum > 0 && hg.count < hg.minimum
    ? `<p class="warn small">Homegrown rule: ${hg.count} of the ${hg.minimum} Valmeran starters needed. The coach will swap players in before kick-off.</p>`
    : '';
  const out = sel.lineup.starters.filter((id) => id && !available(league.players[id])).length;
  return `${notice}
  <div class="lineup-grid">
    <section class="card">
      <div class="card-title">Formation</div>
      ${renderFormationPicker(sel.tactics.formationId, auto)}
      ${renderPitch(league, sel.tactics, sel.lineup.starters, ui.lineupSlot, auto)}
      ${hg.minimum > 0 ? `<p class="muted small">Valmeran starters: ${hg.count}/${hg.minimum}</p>` : ''}
      ${warn}
      ${out ? `<p class="warn small">${out} of your eleven can't play. Tap the slot to replace them, or the coach will.</p>` : ''}
      ${auto ? '' : `<div class="row-actions">${confirmButton(ui, 'reset-lineup', 'all', "Use the coach's pick")}</div>`}
    </section>
    <div class="lineup-side">
      ${!auto && ui.lineupSlot !== null ? renderPicker(career, ui.lineupSlot) : ''}
      <section class="card">
        <div class="card-title">Tactics</div>
        ${renderTacticsPanel(sel.tactics, { disabled: auto, takers, opponents: opponentPlayers(career) })}
      </section>
    </div>
  </div>
  ${renderBench(career, auto)}`;
}

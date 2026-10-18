/**
 * The user's eleven, bench and tactics. The user edits a saved selection;
 * before every match it is repaired (injured, suspended or departed players
 * replaced, set-piece takers checked) so the engine always gets a full side.
 * With auto-lineup on, the head coach picks everything.
 */
import { MATCH_TUNING, formation as formationOf, isDomestic } from '../data';
import { enforceHomegrown, pickSelection } from '../coach';
import { headCoachOf, homegrownMinimumFor, teamById } from '../league';
import { assignToSlots, slotAbility } from '../match/lineup';
import type { Rng } from '../rng';
import type { Player, Tactics, Team, TeamSelection } from '../types';
import type { Career } from './types';
import { careerRng, squadOf } from './util';

const MAX_BENCH = MATCH_TUNING.squad.maxBench;

function available(p: Player | undefined): p is Player {
  return !!p && p.injuryWeeks <= 0 && p.suspensionMatches <= 0;
}

/** What the head coach would pick for the next match. */
export function coachSelection(career: Career, rng: Rng = careerRng(career, 'coach-pick'), opponent?: Team): TeamSelection {
  const league = career.season.league;
  const team = teamById(league, career.userTeamId);
  return pickSelection(rng, team, league.players, headCoachOf(league, team.id), {
    opponent,
    homegrownMinimum: homegrownMinimumFor(career.homegrownRule),
  });
}

/** The user's saved selection, created from the coach's pick the first time it is needed. */
export function ensureUserSelection(career: Career): TeamSelection {
  if (!career.userSelection) career.userSelection = coachSelection(career);
  return career.userSelection;
}

/**
 * Fixes a selection in place so it is legal for a match: every starter is
 * fit and in the squad, empty slots are filled with the best fit, the bench
 * holds only fit squad players, and takers are on the pitch.
 */
export function repairSelection(career: Career, selection: TeamSelection): TeamSelection {
  const league = career.season.league;
  const players = league.players;
  const squadIds = new Set(teamById(league, career.userTeamId).playerIds);
  const formation = formationOf(selection.tactics.formationId);
  const ok = (id: string) => id !== '' && squadIds.has(id) && available(players[id]);

  const starters = formation.slots.map((_, i) => {
    const id = selection.lineup.starters[i] ?? '';
    return ok(id) ? id : '';
  });
  // No player twice.
  const seen = new Set<string>();
  starters.forEach((id, i) => {
    if (id === '') return;
    if (seen.has(id)) starters[i] = '';
    seen.add(id);
  });

  const empty = starters.map((id, i) => (id === '' ? i : -1)).filter((i) => i >= 0);
  if (empty.length > 0) {
    // Fill gaps preferring the bench, then the rest of the squad.
    const pool = [...selection.lineup.bench, ...squadIds].filter((id, i, all) => ok(id) && !starters.includes(id) && all.indexOf(id) === i);
    const sub = { ...formation, slots: empty.map((i) => formation.slots[i]) };
    const picks = assignToSlots(pool, sub, players, slotAbility);
    empty.forEach((slotIndex, k) => (starters[slotIndex] = picks[k] ?? ''));
  }

  const bench = selection.lineup.bench.filter((id, i, all) => ok(id) && !starters.includes(id) && all.indexOf(id) === i);
  if (bench.length < MAX_BENCH) {
    const rest = [...squadIds]
      .filter((id) => ok(id) && !starters.includes(id) && !bench.includes(id))
      .sort((a, b) => players[b].overall - players[a].overall || (a < b ? -1 : 1));
    // Make sure a keeper sits on the bench if there is one.
    const gk = rest.find((id) => players[id].position === 'GK');
    if (gk && !bench.some((id) => players[id].position === 'GK')) bench.push(gk);
    for (const id of rest) {
      if (bench.length >= MAX_BENCH) break;
      if (!bench.includes(id)) bench.push(id);
    }
  }
  bench.length = Math.min(bench.length, MAX_BENCH);

  const takers = selection.tactics.setPieceTakers;
  const onPitch = (id: string | null) => (id !== null && starters.includes(id) ? id : null);
  const outfield = starters.filter((id) => id !== '' && players[id].position !== 'GK');
  const bestBy = (score: (p: Player) => number) =>
    outfield.slice().sort((a, b) => score(players[b]) - score(players[a]))[0] ?? null;
  selection.lineup = { starters, bench };
  selection.tactics.setPieceTakers = {
    penalties: onPitch(takers.penalties) ?? bestBy((p) => p.attributes.spk + p.attributes.cmp),
    freeKicks: onPitch(takers.freeKicks) ?? bestBy((p) => p.attributes.spk),
    corners: onPitch(takers.corners) ?? bestBy((p) => p.attributes.spk + p.attributes.crs),
  };
  return selection;
}

/** The selection the user's club takes into a match. */
export function matchSelection(career: Career, rng: Rng, opponent: Team): TeamSelection {
  if (career.delegation.autoLineup) {
    const pick = coachSelection(career, rng, opponent);
    career.userSelection = pick;
    return structuredClone(pick);
  }
  const selection = repairSelection(career, ensureUserSelection(career));
  if (selection.lineup.starters.some((id) => id === '')) {
    // The squad is too thin for the chosen shape; let the coach sort it out.
    return coachSelection(career, rng, opponent);
  }
  const copy = structuredClone(selection);
  meetHomegrownRule(career, copy);
  if (copy.tactics.manMarkTarget && !opponent.playerIds.includes(copy.tactics.manMarkTarget)) copy.tactics.manMarkTarget = null;
  return copy;
}

/**
 * The homegrown rule holds for the owner's own pick too: short of Valmeran starters, the
 * coach swaps the nearest ones in before kick-off (as the lineup screen warns). Only the
 * match's copy changes; the saved lineup stays as the owner left it.
 */
function meetHomegrownRule(career: Career, selection: TeamSelection): void {
  const minimum = homegrownMinimumFor(career.homegrownRule) ?? 0;
  if (minimum <= 0) return;
  const players = career.season.league.players;
  const starters = selection.lineup.starters.slice();
  const pool = squadOf(career, career.userTeamId).filter(available).map((p) => p.id);
  enforceHomegrown(starters, pool, formationOf(selection.tactics.formationId), players, minimum);
  if (starters.every((id, i) => id === selection.lineup.starters[i])) return;
  selection.lineup = { starters, bench: selection.lineup.bench.filter((id) => !starters.includes(id)) };
  // Refills the bench and moves set pieces off anyone who dropped out.
  repairSelection(career, selection);
}

// ---------------------------------------------------------------------------
// Edits from the lineup and tactics screens
// ---------------------------------------------------------------------------

/** Puts a player in a starting slot. If he was already starting or on the bench, the two swap places. */
export function setStarter(career: Career, slotIndex: number, playerId: string): void {
  const sel = ensureUserSelection(career);
  const { starters, bench } = sel.lineup;
  const current = starters[slotIndex] ?? '';
  const fromSlot = starters.indexOf(playerId);
  const fromBench = bench.indexOf(playerId);
  if (fromSlot >= 0) {
    starters[fromSlot] = current;
  } else if (fromBench >= 0) {
    if (current) bench[fromBench] = current;
    else bench.splice(fromBench, 1);
  }
  starters[slotIndex] = playerId;
}

/** Adds or removes a player from the bench. */
export function toggleBench(career: Career, playerId: string): void {
  const sel = ensureUserSelection(career);
  const bench = sel.lineup.bench;
  const i = bench.indexOf(playerId);
  if (i >= 0) bench.splice(i, 1);
  else if (!sel.lineup.starters.includes(playerId) && bench.length < MAX_BENCH) bench.push(playerId);
}

/** Changes shape, re-seating the current eleven in their best slots. */
export function setFormation(career: Career, formationId: string): void {
  const sel = ensureUserSelection(career);
  const formation = formationOf(formationId);
  const league = career.season.league;
  const eleven = sel.lineup.starters.filter((id) => id !== '');
  sel.lineup.starters = assignToSlots(eleven, formation, league.players, slotAbility);
  sel.tactics.formationId = formationId;
}

export function setTactics(career: Career, patch: Partial<Tactics>): void {
  const sel = ensureUserSelection(career);
  sel.tactics = { ...sel.tactics, ...patch, setPieceTakers: { ...sel.tactics.setPieceTakers, ...(patch.setPieceTakers ?? {}) } };
}

/** Throws the saved selection away and takes the coach's pick. */
export function resetToCoach(career: Career): void {
  career.userSelection = coachSelection(career);
}

/** Domestic starters in the saved eleven, for the homegrown-rule warning. */
export function homegrownStarters(career: Career): { count: number; minimum: number } {
  const league = career.season.league;
  const sel = ensureUserSelection(career);
  const count = sel.lineup.starters.filter((id) => id && isDomestic(league.players[id]?.nationality ?? '')).length;
  return { count, minimum: homegrownMinimumFor(career.homegrownRule) ?? 0 };
}

/** Squad sorted for display: by position order, then overall. */
export function squadForDisplay(career: Career): Player[] {
  const order = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];
  return squadOf(career, career.userTeamId).sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || b.overall - a.overall);
}

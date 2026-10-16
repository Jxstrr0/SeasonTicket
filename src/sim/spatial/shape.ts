/**
 * Team shape: where each player wants to stand given the ball, the tactics and whether
 * his team has the ball. Each step a team writes its "anchors" (line height, block length,
 * centre and width, in and out of possession) into a ring buffer; each player reads them
 * back after his own reaction delay, so sharper readers of the game move first.
 */
import { SPATIAL_TUNING, formation } from '../data';
import type { Tactics } from '../types';
import {
  A_BEHIND_CAP, A_BLEND, A_IN_CENTRE, A_IN_LEN, A_IN_LINE, A_IN_WIDTH, A_OFF_CAP, A_OUT_CENTRE,
  A_OUT_LEN, A_OUT_LINE, A_OUT_WIDTH, A_PRESS_ADV, ANCHORS, LENGTH, RING, WIDTH,
  acrossOf, clamp, depthOf, type SpatialMatch, type TeamState,
} from './state';
import type { Side } from './types';

const T = SPATIAL_TUNING;
const SO = T.shapeOut;
const SI = T.shapeIn;

/** Reload slot spots and per-tactics precomputes after a formation or tactics change. */
export function applyTeamTactics(m: SpatialMatch, team: TeamState, tactics: Tactics): void {
  team.tactics = { ...tactics, setPieceTakers: { ...tactics.setPieceTakers } };
  team.formation = formation(tactics.formationId);
  const slots = team.formation.slots;
  for (let s = 0; s < 11; s++) {
    const slot = slots[s];
    const def = slot.def ?? [slot.y, slot.x];
    const att = slot.att ?? def;
    team.defU[s] = def[0];
    team.defV[s] = def[1];
    team.attU[s] = att[0];
    team.attV[s] = att[1];
  }
  // Rest defence: the K deepest outfield slots by in-possession depth stay behind the ball.
  const k = SI.behindBall[team.tactics.mentality - 1];
  const order = [];
  for (let s = 1; s < 11; s++) order.push(s);
  order.sort((a, b) => team.attU[a] - team.attU[b] || a - b);
  team.isBehind.fill(0);
  for (let j = 0; j < k && j < order.length; j++) team.isBehind[order[j]] = 1;
  // Counter runners: the most advanced slots, sorted left to right for their channels.
  const runners = order
    .filter((s) => team.attU[s] >= T.counter.minU)
    .sort((a, b) => team.attU[b] - team.attU[a] || a - b)
    .slice(0, T.counter.runners)
    .sort((a, b) => team.attV[a] - team.attV[b] || a - b);
  team.counterSlots = runners;
  resolveMarker(m, team);
}

/** Pick the slot that man-marks: the one whose defensive spot is nearest the target's attacking spot. */
export function resolveMarker(m: SpatialMatch, team: TeamState): void {
  team.markerSlot = -1;
  team.markTarget = -1;
  const id = team.tactics.manMarkTarget;
  if (!id) return;
  const opp = m.teams[1 - team.side];
  const oppPlayers = team.side === 0 ? m.setup.away.players : m.setup.home.players;
  const slot = oppPlayers.findIndex((p) => p.id === id);
  if (slot <= 0) return; // not on the pitch, or the goalkeeper
  const tu = 1 - opp.attU[slot];
  const tv = 1 - opp.attV[slot];
  let best = -1;
  let bestD = Infinity;
  for (let s = 1; s < 11; s++) {
    const du = (team.defU[s] - tu) * SO.blockLength;
    const dv = (team.defV[s] - tv) * SO.blockWidth;
    const d = du * du + dv * dv;
    if (d < bestD) { bestD = d; best = s; }
  }
  team.markerSlot = best;
  team.markTarget = (1 - team.side) * 11 + slot;
}

/** Second-deepest opponent (usually the last defender) measured in our frame. */
function secondLastOpponent(m: SpatialMatch, side: Side): number {
  let a = -Infinity, b = -Infinity;
  const o = (1 - side) * 11;
  for (let j = o; j < o + 11; j++) {
    const d = depthOf(side, m.px[j]);
    if (d > a) { b = a; a = d; } else if (d > b) b = d;
  }
  return b;
}

/** Work out this step's anchors for one team and write them into its ring. */
export function writeAnchors(m: SpatialMatch, team: TeamState, slotIndex: number): void {
  const side = team.side;
  const t = team.tactics;
  // Shapes follow the smoothed focus; the offside cap uses the real ball.
  const bd = depthOf(side, m.focusX);
  const ba = acrossOf(side, m.focusY);
  const H = SO.lineHeight[t.defensiveLine - 1];
  const shift = T.mentalityShift[t.mentality - 1];

  // Out of possession.
  let outLine = clamp(H + SO.lineSlope * (bd - T.pitch.halfway), SO.lineMin, SO.lineMax);
  const gap = clamp(SO.gapFactor * bd, SO.gapMin, SO.gapMax);
  if (bd - gap < outLine) outLine = bd - gap;
  const wBox = clamp((SO.boxBallDepth + SO.boxBlend - bd) / SO.boxBlend, 0, 1);
  if (wBox > 0) {
    const boxLine = SO.boxLineBase + (SO.boxLineRise * clamp(bd, 0, SO.boxBallDepth)) / SO.boxBallDepth;
    outLine += (boxLine - outLine) * wBox;
  }
  if (outLine < SO.lineMin) outLine = SO.lineMin;
  const outLen = SO.blockLength + shift;
  const outWidth = SO.blockWidth;
  const outCentre = clamp(34 + SO.acrossFollow * (ba - 34), outWidth / 2 + 1, WIDTH - 1 - outWidth / 2);

  // In possession.
  const inLine = clamp(H + SI.lineSlope * (bd - T.pitch.halfway) + shift, SI.lineMin, SI.lineMax);
  const inLen = SI.blockLengthBase + SI.blockLengthPerMentality * (t.mentality - 1);
  const inWidth = SI.width[t.width - 1];
  const inCentre = clamp(34 + SI.acrossFollow * (ba - 34), inWidth / 2 + 1, WIDTH - 1 - inWidth / 2);
  const offLine = Math.max(secondLastOpponent(m, side), depthOf(side, m.ball.x), T.pitch.halfway);
  const offCap = offLine - SI.onsideMargin;
  const behindCap = Math.max(bd - SI.behindGap, inLine);

  const r = team.ring;
  const o = (slotIndex % RING) * ANCHORS;
  r[o + A_OUT_LINE] = outLine;
  r[o + A_OUT_LEN] = outLen;
  r[o + A_OUT_CENTRE] = outCentre;
  r[o + A_OUT_WIDTH] = outWidth;
  r[o + A_IN_LINE] = inLine;
  r[o + A_IN_LEN] = inLen;
  r[o + A_IN_CENTRE] = inCentre;
  r[o + A_IN_WIDTH] = inWidth;
  r[o + A_OFF_CAP] = offCap;
  r[o + A_BEHIND_CAP] = behindCap;
  r[o + A_PRESS_ADV] = team.pressAdv;
  r[o + A_BLEND] = team.w;
}

/** Fill the whole ring with the current anchors (at kick-off and after big jumps). */
export function fillRing(m: SpatialMatch, team: TeamState): void {
  for (let k = 0; k < RING; k++) writeAnchors(m, team, k);
}

/** Out-of-possession spot depth for a slot from a set of anchors, without the press advance. */
export function outDepth(team: TeamState, slot: number, ringIndex: number): number {
  const o = (ringIndex % RING) * ANCHORS;
  return team.ring[o + A_OUT_LINE] + team.defU[slot] * team.ring[o + A_OUT_LEN];
}

/**
 * Shape spot for every player of one team, each reading the anchors after his own delay.
 * Writes world coordinates into m.sx / m.sy.
 */
export function computeSpots(m: SpatialMatch, team: TeamState): void {
  const side = team.side;
  const r = team.ring;
  const base = side * 11;
  const minU = T.press.midfieldMinU;
  for (let s = 1; s < 11; s++) {
    const i = base + s;
    const idx = (((m.steps - m.delay[i]) % RING) + RING) % RING;
    const o = idx * ANCHORS;
    const w = r[o + A_BLEND];
    // Out of possession.
    let dOut = r[o + A_OUT_LINE] + team.defU[s] * r[o + A_OUT_LEN];
    if (team.defU[s] >= minU) dOut += r[o + A_PRESS_ADV];
    const aOut = r[o + A_OUT_CENTRE] + (team.defV[s] - 0.5) * r[o + A_OUT_WIDTH];
    // In possession.
    let dIn = r[o + A_IN_LINE] + team.attU[s] * r[o + A_IN_LEN];
    if (dIn > r[o + A_OFF_CAP]) dIn = r[o + A_OFF_CAP];
    if (team.isBehind[s] && dIn > r[o + A_BEHIND_CAP]) dIn = r[o + A_BEHIND_CAP];
    const aIn = r[o + A_IN_CENTRE] + (team.attV[s] - 0.5) * r[o + A_IN_WIDTH];
    const d = clamp(dOut + (dIn - dOut) * w, 1, LENGTH - 1);
    const a = clamp(aOut + (aIn - aOut) * w, T.touchlineMargin, WIDTH - T.touchlineMargin);
    m.sx[i] = depthOf(side, d);
    m.sy[i] = acrossOf(side, a);
  }
  // Goalkeeper: no delay, on the line from the middle of his goal towards the ball.
  const gk = base;
  const o = (m.steps % RING) * ANCHORS;
  const w = r[o + A_BLEND];
  const line = r[o + A_OUT_LINE] + (r[o + A_IN_LINE] - r[o + A_OUT_LINE]) * w;
  const bd = depthOf(side, m.ball.x);
  const ba = acrossOf(side, m.ball.y);
  const K = T.keeper;
  const off = bd > K.nearBallDepth
    ? clamp(K.farFactor * line + K.farOffset, K.farMin, K.farMax)
    : K.nearMin + ((K.nearMax - K.nearMin) * clamp(bd, 0, K.nearBallDepth)) / K.nearBallDepth;
  const dx = bd;
  const dy = ba - T.pitch.goalCentreAcross;
  const len = Math.sqrt(dx * dx + dy * dy);
  const gd = len > 1e-9 ? (off * dx) / len : off;
  const ga = len > 1e-9 ? T.pitch.goalCentreAcross + (off * dy) / len : T.pitch.goalCentreAcross;
  m.sx[gk] = depthOf(side, gd);
  m.sy[gk] = acrossOf(side, ga);
}

/** The anchors a team is using right now (no delay), blended by its possession weight. */
export function currentLine(team: TeamState, steps: number): number {
  const o = (steps % RING) * ANCHORS;
  const w = team.ring[o + A_BLEND];
  return team.ring[o + A_OUT_LINE] + (team.ring[o + A_IN_LINE] - team.ring[o + A_OUT_LINE]) * w;
}

export function currentOffCap(team: TeamState, steps: number): number {
  return team.ring[(steps % RING) * ANCHORS + A_OFF_CAP];
}

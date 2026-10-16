/**
 * Stadium: a plan of the ground you can tap, what each part could become,
 * the building work under way, and the free look choices (seats, grass, roof).
 */
import {
  CORNER_IDS,
  CORNER_NAMES,
  CORNER_STANDS,
  MAX_STAND_LEVEL,
  STAND_IDS,
  S,
  UPGRADE_IDS,
  averageHomeCrowd,
  boxUpkeep,
  boxesPerRow,
  closedSeatsByStand,
  concessionsBonus,
  coveredShare,
  freeWeeksBeforeSeason,
  fullCapacity,
  hospitalityPerMatch,
  maxUpgradeLevel,
  merchandiseMultiplier,
  money,
  openCapacity,
  projectLabel,
  seatsClosedBy,
  sponsorMultiplier,
  stadiumOptions,
  standLevelName,
  standName,
  standSeats,
  totalBoxes,
  tvBonus,
  upgradeDef,
  userTeam,
  type Career,
  type CornerId,
  type Stadium,
  type StadiumLook,
  type StadiumOption,
  type StandId,
  type UpgradeId,
} from '../../../sim/career';
import { cls, each, esc } from '../../html';
import { STADIUM_PICKS, type StadiumPick, type StadiumView, type UiState } from '../../career/state';
import { renderCrest } from './crest';
import { confirmButton } from './parts';

const seats = (n: number): string => n.toLocaleString('en-US');
const pct = (x: number): string => `${Math.round(x * 100)}%`;

const PICK_LABELS: Record<StadiumPick, string> = {
  west: 'Main Stand',
  east: 'East Stand',
  north: 'North End',
  south: 'South End',
  corners: 'Corners',
  ground: 'Ground-wide',
  look: 'Look',
};

const LOOK_LABELS: { key: keyof StadiumLook; title: string; values: Record<string, string> }[] = [
  { key: 'seats', title: 'Seats', values: { primary: 'Club colour', secondary: 'Second colour', mixed: 'Mixed', initials: 'Initials' } },
  { key: 'mow', title: 'Grass', values: { stripes: 'Stripes', wide: 'Wide stripes', checks: 'Checks', diagonal: 'Diagonal', rings: 'Rings' } },
  { key: 'roof', title: 'Roof', values: { white: 'White', primary: 'Club colour', secondary: 'Second colour', grey: 'Grey' } },
];

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** Plan coordinates: north on the left, so the Main Stand (west) runs along the bottom. */
const W = 160;
const H = 128;
const CX = W / 2;
const CY = H / 2;
const PL = 84; // pitch length
const PW = 54; // pitch width
const GAP = 3;
const px0 = CX - PL / 2;
const px1 = CX + PL / 2;
const py0 = CY - PW / 2;
const py1 = CY + PW / 2;
const depth = (level: number): number => 7 + level * 5.5;

type Rect = { x: number; y: number; w: number; h: number };

/** Where a stand sits, and which edge faces the pitch. */
function standRect(id: StandId, level: number): Rect & { front: 'top' | 'bottom' | 'left' | 'right' } {
  const d = depth(level);
  switch (id) {
    case 'east':
      return { x: px0, y: py0 - GAP - d, w: PL, h: d, front: 'bottom' };
    case 'west':
      return { x: px0, y: py1 + GAP, w: PL, h: d, front: 'top' };
    case 'north':
      return { x: px0 - GAP - d, y: py0, w: d, h: PW, front: 'right' };
    case 'south':
      return { x: px1 + GAP, y: py0, w: d, h: PW, front: 'left' };
  }
}

/** The tap area for a stand: from the pitch out to the edge of the plan. */
function standHit(id: StandId): Rect {
  switch (id) {
    case 'east':
      return { x: px0, y: 0, w: PL, h: py0 };
    case 'west':
      return { x: px0, y: py1, w: PL, h: H - py1 };
    case 'north':
      return { x: 0, y: py0, w: px0, h: PW };
    case 'south':
      return { x: px1, y: py0, w: W - px1, h: PW };
  }
}

/** The square between two stands, sized by their depths. */
function cornerRect(id: CornerId, stadium: Stadium): Rect {
  const [end, side] = CORNER_STANDS[id];
  const de = depth(stadium.stands[end].level);
  const ds = depth(stadium.stands[side].level);
  const left = end === 'north';
  const top = side === 'east';
  return {
    x: left ? px0 - GAP - de : px1 + GAP,
    y: top ? py0 - GAP - ds : py1 + GAP,
    w: de,
    h: ds,
  };
}

function cornerHit(id: CornerId): Rect {
  const [end, side] = CORNER_STANDS[id];
  return {
    x: end === 'north' ? 0 : px1,
    y: side === 'east' ? 0 : py1,
    w: end === 'north' ? px0 : W - px1,
    h: side === 'east' ? py0 : H - py1,
  };
}

const rect = (r: Rect, attrs: string): string => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" ${attrs}/>`;

interface Palette {
  primary: string;
  secondary: string;
  roof: string;
}

function palette(career: Career, look: StadiumLook): Palette {
  const t = userTeam(career);
  const roof = { white: '#e8ecf2', primary: t.colors.primary, secondary: t.colors.secondary, grey: '#8c9096' }[look.roof];
  return { primary: t.colors.primary, secondary: t.colors.secondary, roof };
}

/** Seat colour. Mixed seats come in blocks, one block per section, running back from the pitch. */
function seatFill(look: StadiumLook, across: boolean): string {
  switch (look.seats) {
    case 'primary':
    case 'initials':
      return 'var(--seat-a)';
    case 'secondary':
      return 'var(--seat-b)';
    case 'mixed':
      return across ? 'url(#st-mixed-v)' : 'url(#st-mixed-h)';
  }
}

function mowPattern(look: StadiumLook): string {
  const a = '#3f8f3a';
  const b = '#4ca043';
  switch (look.mow) {
    case 'stripes':
      return `<pattern id="st-mow" width="${PL / 12}" height="10" patternUnits="userSpaceOnUse" x="${px0}"><rect width="${PL / 24}" height="10" fill="${b}"/></pattern>`;
    case 'wide':
      return `<pattern id="st-mow" width="${PL / 6}" height="10" patternUnits="userSpaceOnUse" x="${px0}"><rect width="${PL / 12}" height="10" fill="${b}"/></pattern>`;
    case 'checks':
      return `<pattern id="st-mow" width="${PL / 6}" height="${PW / 4}" patternUnits="userSpaceOnUse" x="${px0}" y="${py0}"><rect width="${PL / 12}" height="${PW / 8}" fill="${b}"/><rect x="${PL / 12}" y="${PW / 8}" width="${PL / 12}" height="${PW / 8}" fill="${b}"/></pattern>`;
    case 'diagonal':
      return `<pattern id="st-mow" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4.5" height="9" fill="${b}"/></pattern>`;
    case 'rings':
      return `<pattern id="st-mow" width="${PL}" height="${PW}" patternUnits="userSpaceOnUse" x="${px0}" y="${py0}">${each([30, 22, 14], (r) => `<circle cx="${PL / 2}" cy="${PW / 2}" r="${r + 4}" fill="${b}"/><circle cx="${PL / 2}" cy="${PW / 2}" r="${r}" fill="${a}"/>`)}</pattern>`;
  }
}

function pitchSvg(career: Career, look: StadiumLook, picked: boolean): string {
  const lines = 'fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="0.6"';
  const box = (x: number, w: number) => `<rect x="${x}" y="${CY - 13}" width="${w}" height="26" ${lines}/>`;
  const crest = renderCrest(career.crest, 12).replace('class="crest"', 'class="crest" x="0" y="0"');
  return `<g data-action="stadium-pick" data-part="ground" class="${cls('st-part', picked && 'on')}" role="button" aria-label="Pitch and ground-wide upgrades">
    <rect x="${px0 - GAP}" y="${py0 - GAP}" width="${PL + GAP * 2}" height="${PW + GAP * 2}" fill="#2f6b2c"/>
    <rect x="${px0}" y="${py0}" width="${PL}" height="${PW}" fill="#3f8f3a"/>
    <rect x="${px0}" y="${py0}" width="${PL}" height="${PW}" fill="url(#st-mow)"/>
    <rect x="${px0}" y="${py0}" width="${PL}" height="${PW}" ${lines}/>
    <line x1="${CX}" y1="${py0}" x2="${CX}" y2="${py1}" ${lines}/>
    <circle cx="${CX}" cy="${CY}" r="7.3" ${lines}/>
    ${box(px0, 13.2)}${box(px1 - 13.2, 13.2)}
    <g transform="translate(${CX - 6} ${CY - 7.2})" opacity="0.9">${crest}</g>
  </g>`;
}

function roofSvg(r: Rect & { front: string }, roof: number): string {
  if (roof <= 0) return '';
  const share = roof >= 2 ? 1 : 0.5;
  let o: Rect;
  switch (r.front) {
    case 'bottom':
      o = { x: r.x, y: r.y, w: r.w, h: r.h * share };
      break;
    case 'top':
      o = { x: r.x, y: r.y + r.h * (1 - share), w: r.w, h: r.h * share };
      break;
    case 'right':
      o = { x: r.x, y: r.y, w: r.w * share, h: r.h };
      break;
    default:
      o = { x: r.x + r.w * (1 - share), y: r.y, w: r.w * share, h: r.h };
  }
  // The leading edge of the roof, over the pitch side of the covered rows.
  const edge =
    r.front === 'bottom' ? `<line x1="${o.x}" y1="${(o.y + o.h).toFixed(1)}" x2="${o.x + o.w}" y2="${(o.y + o.h).toFixed(1)}"/>`
    : r.front === 'top' ? `<line x1="${o.x}" y1="${o.y.toFixed(1)}" x2="${o.x + o.w}" y2="${o.y.toFixed(1)}"/>`
    : r.front === 'right' ? `<line x1="${(o.x + o.w).toFixed(1)}" y1="${o.y}" x2="${(o.x + o.w).toFixed(1)}" y2="${o.y + o.h}"/>`
    : `<line x1="${o.x.toFixed(1)}" y1="${o.y}" x2="${o.x.toFixed(1)}" y2="${o.y + o.h}"/>`;
  return `${rect(o, 'fill="var(--roof)" fill-opacity="0.3"')}<g stroke="var(--roof)" stroke-width="1.3">${edge}</g>`;
}

function boxBand(r: Rect & { front: string }, rows: number): string {
  if (rows <= 0) return '';
  const t = 1.6 * rows;
  // The boxes sit along the back of the stand, away from the pitch.
  const band: Rect =
    r.front === 'bottom' ? { x: r.x, y: r.y, w: r.w, h: t }
    : r.front === 'top' ? { x: r.x, y: r.y + r.h - t, w: r.w, h: t }
    : r.front === 'right' ? { x: r.x, y: r.y, w: t, h: r.h }
    : { x: r.x + r.w - t, y: r.y, w: t, h: r.h };
  return rect(band, 'fill="#9fd3ff" fill-opacity="0.9"');
}

function rowLines(r: Rect & { front: string }, level: number): string {
  if (level <= 0) return '';
  const n = level * 2 + 1;
  const out: string[] = [];
  for (let i = 1; i < n; i++) {
    const f = i / n;
    if (r.front === 'bottom' || r.front === 'top') {
      const y = r.y + r.h * f;
      out.push(`<line x1="${r.x}" y1="${y.toFixed(1)}" x2="${r.x + r.w}" y2="${y.toFixed(1)}"/>`);
    } else {
      const x = r.x + r.w * f;
      out.push(`<line x1="${x.toFixed(1)}" y1="${r.y}" x2="${x.toFixed(1)}" y2="${r.y + r.h}"/>`);
    }
  }
  return `<g stroke="rgba(0,0,0,0.28)" stroke-width="0.3">${out.join('')}</g>`;
}

/** Hatching over a structure being built (solid) or paid for and waiting for the off-season (dashed outline). */
function worksSvg(r: Rect, state: 'active' | 'queued' | null): string {
  if (state === 'active') return rect(r, 'fill="url(#st-works)" stroke="#f2a33a" stroke-width="0.8"');
  if (state === 'queued') return rect(r, 'fill="none" stroke="#f2a33a" stroke-width="0.8" stroke-dasharray="2 1.5"');
  return '';
}

function projectState(stadium: Stadium, target: string): 'active' | 'queued' | null {
  const p = stadium.projects.filter((x) => x.target === target);
  if (p.some((x) => !x.queued)) return 'active';
  return p.length ? 'queued' : null;
}

function standSvg(career: Career, stadium: Stadium, id: StandId, picked: boolean): string {
  const s = stadium.stands[id];
  const r = standRect(id, s.level);
  const look = stadium.look;
  const body = s.level === 0 ? rect(r, 'fill="#4a7c3f"') : rect(r, `fill="${seatFill(look, id === 'east' || id === 'west')}"`);
  const initials = look.seats === 'initials' && s.level > 0 && (id === 'west' || id === 'east')
    ? `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 2}" text-anchor="middle" font-size="${Math.min(7, r.h * 0.6).toFixed(1)}" font-weight="800" fill="var(--seat-b)" letter-spacing="3">${esc(userTeam(career).abbr)}</text>`
    : '';
  const label = `<text class="st-label" x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" text-anchor="middle" dominant-baseline="middle"${id === 'north' || id === 'south' ? ` transform="rotate(${id === 'north' ? -90 : 90} ${r.x + r.w / 2} ${r.y + r.h / 2})"` : ''}>${esc(standName(id))}</text>`;
  const outline = picked ? rect(r, 'fill="none" stroke="var(--accent)" stroke-width="1.2"') : '';
  return `<g data-action="stadium-pick" data-part="${id}" class="${cls('st-part', picked && 'on')}" role="button" aria-label="${esc(standName(id))}: ${esc(standLevelName(s.level))}">
    ${rect(standHit(id), 'fill="transparent"')}
    ${body}${rowLines(r, s.level)}${initials}${boxBand(r, s.boxRows)}${roofSvg(r, s.roof)}${worksSvg(r, projectState(stadium, id))}
    ${label}${outline}
  </g>`;
}

function cornerSvg(stadium: Stadium, id: CornerId, picked: boolean): string {
  const level = stadium.corners[id];
  const r = cornerRect(id, stadium);
  const [end, side] = CORNER_STANDS[id];
  // The outer point of the corner, away from the pitch.
  const ox = end === 'north' ? r.x : r.x + r.w;
  const oy = side === 'east' ? r.y : r.y + r.h;
  const ix = end === 'north' ? r.x + r.w : r.x;
  const iy = side === 'east' ? r.y + r.h : r.y;
  let body: string;
  if (level >= 2) body = rect(r, `fill="${seatFill(stadium.look, true)}"`);
  else if (level === 1) {
    // A bevelled infill: the outer point is cut off.
    const cx = ox + (ix - ox) * 0.45;
    const cy = oy + (iy - oy) * 0.45;
    body = `<polygon points="${ix},${iy} ${ix},${oy} ${cx.toFixed(1)},${oy} ${ox},${cy.toFixed(1)} ${ox},${iy}" fill="${seatFill(stadium.look, true)}"/>`;
  } else body = rect(r, 'fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" stroke-width="0.4" stroke-dasharray="1.5 1.5"');
  return `<g data-action="stadium-pick" data-part="corners" class="${cls('st-part', picked && 'on')}" role="button" aria-label="${esc(CORNER_NAMES[id])}">
    ${rect(cornerHit(id), 'fill="transparent"')}${body}${worksSvg(r, projectState(stadium, id))}
  </g>`;
}

function extrasSvg(stadium: Stadium): string {
  const u = stadium.upgrades;
  const out: string[] = [];
  // Floodlight masts in the four outer corners; brighter with each level.
  for (const [x, y] of [[4, 4], [W - 4, 4], [4, H - 4], [W - 4, H - 4]]) {
    if (u.floodlights > 0) out.push(`<circle cx="${x}" cy="${y}" r="${2.5 + u.floodlights * 2}" fill="url(#st-glow)"/>`);
    out.push(`<rect x="${x - 1.4}" y="${y - 1.4}" width="2.8" height="2.8" fill="${u.floodlights > 0 ? '#fff6e0' : '#5a5f66'}"/>`);
  }
  // LED ribbon round the pitch.
  if (u.signage > 0) {
    out.push(`<rect x="${px0 - 1.6}" y="${py0 - 1.6}" width="${PL + 3.2}" height="${PW + 3.2}" fill="none" stroke="#4ecdc4" stroke-width="${0.5 + u.signage * 0.4}" stroke-dasharray="6 1.2"/>`);
  }
  // The video board over the South End.
  if (u.videoBoard > 0) {
    const w = 3 + u.videoBoard * 1.2;
    const h = 10 + u.videoBoard * 4;
    out.push(`<rect x="${W - w - 1.5}" y="${CY - h / 2}" width="${w}" height="${h}" rx="0.6" fill="#11151c" stroke="#4ecdc4" stroke-width="0.6"/>`);
  }
  return out.join('');
}

function planSvg(career: Career, stadium: Stadium, pick: StadiumPick): string {
  const pal = palette(career, stadium.look);
  return `<svg class="st-plan" viewBox="0 0 ${W} ${H}" style="--seat-a:${esc(pal.primary)};--seat-b:${esc(pal.secondary)};--roof:${esc(pal.roof)}" role="group" aria-label="Plan of the ground">
    <defs>
      ${mowPattern(stadium.look)}
      <pattern id="st-mixed-v" width="12" height="12" patternUnits="userSpaceOnUse" x="${px0}"><rect width="12" height="12" fill="var(--seat-a)"/><rect width="4" height="12" fill="var(--seat-b)"/></pattern>
      <pattern id="st-mixed-h" width="12" height="12" patternUnits="userSpaceOnUse" y="${py0}"><rect width="12" height="12" fill="var(--seat-a)"/><rect width="12" height="4" fill="var(--seat-b)"/></pattern>
      <pattern id="st-works" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#f2a33a" fill-opacity="0.75"/></pattern>
      <radialGradient id="st-glow"><stop offset="0" stop-color="#fff6d0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="4" fill="#1c2230"/>
    ${pitchSvg(career, stadium.look, pick === 'ground')}
    ${each(CORNER_IDS, (id) => cornerSvg(stadium, id, pick === 'corners'))}
    ${each(STAND_IDS, (id) => standSvg(career, stadium, id, pick === id))}
    ${extrasSvg(stadium)}
    <g class="st-compass" transform="translate(9 ${H / 2})"><path d="M-4 0 L3 -3 L1.5 0 L3 3 Z"/><text x="0" y="8" text-anchor="middle">N</text></g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function renderFacts(career: Career, stadium: Stadium): string {
  const team = userTeam(career);
  const full = fullCapacity(stadium);
  const open = openCapacity(career, career.userTeamId);
  const crowd = averageHomeCrowd(career, career.userTeamId);
  const sizes = Object.values(career.stadiums).map(fullCapacity).sort((a, b) => b - a);
  const rank = sizes.indexOf(full) + 1;
  const ordinal = rank === 1 ? 'biggest' : `${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} biggest`;
  return `<dl class="facts compact">
      <div><dt>Seats</dt><dd>${seats(open)}${open < full ? `<span class="warn small st-of">of ${seats(full)} when work ends</span>` : ''}</dd></div>
      <div><dt>Demand</dt><dd>${seats(stadium.demand)}</dd></div>
      <div><dt>Avg crowd</dt><dd>${crowd > 0 ? pct(crowd) : '–'}</dd></div>
      <div><dt>Condition</dt><dd>${pct(team.stadiumCondition)}</dd></div>
      <div><dt>Under cover</dt><dd>${pct(coveredShare(stadium))}</dd></div>
      <div><dt>Boxes</dt><dd>${totalBoxes(stadium)}</dd></div>
    </dl>
    <p class="muted small">The ${ordinal} ground in the league. Demand is how many people want a ticket: a bigger ground only fills if it grows, and it grows with happy fans and trophies.</p>`;
}

function progressBar(done: number, total: number): string {
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  return `<div class="st-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${(share * 100).toFixed(0)}%"></span></div>`;
}

function renderProjects(career: Career, ui: UiState, stadium: Stadium): string {
  const inSeason = career.phase === 'season';
  const closed = closedSeatsByStand(stadium, inSeason);
  const crews = `${stadium.projects.length} of ${S.projects.maxActive} building crews booked`;
  const body = stadium.projects.length
    ? `<ul class="deal-list">${each(stadium.projects, (p) => {
        const label = esc(projectLabel(p.kind, p.target, p.toLevel));
        if (p.queued) {
          const shut = seatsClosedBy(stadium, p.kind, p.target);
          return `<li><div class="deal-row"><div><strong>${label}</strong><div class="small muted">Paid ${esc(money(p.cost))} · waits for the off-season (${p.weeks} weeks)</div></div></div>
            <div class="row-actions">${confirmButton(ui, 'start-project-now', p.id, shut > 0 ? `Start now (shuts ${seats(shut)} seats)` : 'Start now')}${confirmButton(ui, 'cancel-project', p.id, `Call off, refund ${money(p.cost)}`)}</div></li>`;
        }
        const shut = p.kind === 'stand' || p.kind === 'roof' || p.kind === 'boxes' ? closed[p.target as StandId] ?? 0 : 0;
        return `<li><div class="deal-row"><div><strong>${label}</strong><div class="small muted">${p.weeksLeft} week${p.weeksLeft === 1 ? '' : 's'} left${shut > 0 ? ` · <span class="warn">${seats(shut)} seats shut</span>` : ''}</div></div></div>
          ${progressBar(p.weeks - p.weeksLeft, p.weeks)}</li>`;
      })}</ul>`
    : '<p class="muted small">Nothing being built. Tap a part of the plan to see what it could become.</p>';
  return `<section class="card"><div class="card-title">Building work</div>${body}<p class="muted small">${crews}.</p></section>`;
}

/** When work bought now would happen, and what it costs in shut seats. */
function timingNote(career: Career, stadium: Stadium, o: StadiumOption): string {
  const shut = seatsClosedBy(stadium, o.kind, o.target);
  if (career.phase === 'preseason') {
    const free = freeWeeksBeforeSeason(career);
    if (o.weeks <= free) return 'Done before kick-off.';
    const over = o.weeks - free;
    return shut > 0
      ? `Runs ${over} week${over === 1 ? '' : 's'} into the season, with ${seats(shut)} seats shut until then.`
      : `Runs ${over} week${over === 1 ? '' : 's'} into the season.`;
  }
  if (career.phase === 'season') {
    return shut > 0
      ? `Start now and ${seats(shut)} seats stay shut for ${o.weeks} weeks, or pay now and build in the off-season.`
      : 'No seats shut while this is built.';
  }
  return '';
}

/** The timing note and order buttons for an option that can be bought. */
function optionBuy(career: Career, ui: UiState, stadium: Stadium, o: StadiumOption): string {
  const shut = seatsClosedBy(stadium, o.kind, o.target);
  let buttons: string;
  if (career.phase === 'season') {
    buttons = confirmButton(ui, 'order-project', `${o.key}|summer`, 'Pay now, build in the off-season', 'btn-primary') +
      confirmButton(ui, 'order-project', `${o.key}|now`, shut > 0 ? 'Start now' : 'Build now');
  } else if (career.phase === 'preseason') {
    buttons = confirmButton(ui, 'order-project', `${o.key}|now`, 'Build', 'btn-primary');
  } else {
    buttons = '<span class="muted small">Building opens again in the pre-season.</span>';
  }
  const note = timingNote(career, stadium, o);
  return `${note ? `<p class="muted small">${esc(note)}</p>` : ''}<div class="row-actions">${buttons}</div>`;
}

function optionRow(career: Career, ui: UiState, stadium: Stadium, o: StadiumOption): string {
  const head = `<div class="deal-row"><div><strong>${esc(o.title)}</strong><div class="small">${esc(o.detail)}</div></div>
    <div class="st-price"><strong>${esc(money(o.cost))}</strong><div class="small muted">${o.weeks} week${o.weeks === 1 ? '' : 's'}</div></div></div>`;
  if (!o.available) return `<li class="st-option off">${head}<p class="warn small">${esc(o.reason ?? 'Not available.')}</p></li>`;
  return `<li class="st-option">${head}${optionBuy(career, ui, stadium, o)}</li>`;
}

/** Price, timing and buttons for an option whose name is already shown above it. */
function optionActions(career: Career, ui: UiState, stadium: Stadium, o: StadiumOption): string {
  const price = `<p class="small">Next level: <strong>${esc(money(o.cost))}</strong> <span class="muted">· ${o.weeks} week${o.weeks === 1 ? '' : 's'}</span></p>`;
  if (!o.available) return `<div class="st-option off">${price}<p class="warn small">${esc(o.reason ?? 'Not available.')}</p></div>`;
  return `<div class="st-option">${price}${optionBuy(career, ui, stadium, o)}</div>`;
}

function optionList(career: Career, ui: UiState, stadium: Stadium, options: StadiumOption[], empty: string): string {
  return options.length
    ? `<ul class="deal-list">${each(options, (o) => optionRow(career, ui, stadium, o))}</ul>`
    : `<p class="muted small">${esc(empty)}</p>`;
}

function pips(level: number, max: number): string {
  return `<div class="level-pips" aria-label="Level ${level} of ${max}">${each(Array.from({ length: max }, (_, i) => i), (i) => `<span class="${cls('pip', i < level && 'on')}"></span>`)}</div>`;
}

function renderStandPanel(career: Career, ui: UiState, stadium: Stadium, id: StandId): string {
  const s = stadium.stands[id];
  const team = userTeam(career);
  const boxes = s.boxRows * boxesPerRow(id);
  const options = stadiumOptions(career).filter((o) => o.target === id);
  const work = stadium.projects.find((p) => p.target === id);
  const building = work
    ? `${projectLabel(work.kind, work.target, work.toLevel)}: ${work.queued ? 'paid for, waiting for the off-season' : `${work.weeksLeft} week${work.weeksLeft === 1 ? '' : 's'} left`}. One job at a time on each stand.`
    : '';
  return `<section class="card">
    <div class="card-title">${esc(standName(id))} · ${esc(standLevelName(s.level))}</div>
    ${pips(s.level, MAX_STAND_LEVEL)}
    <dl class="facts compact">
      <div><dt>Seats</dt><dd>${seats(standSeats(stadium, id))}</dd></div>
      <div><dt>Roof</dt><dd>${esc(S.roof.levels[s.roof].name)}</dd></div>
      <div><dt>Boxes</dt><dd>${boxes}</dd></div>
    </dl>
    ${building ? `<p class="warn small">${esc(building)}</p>` : ''}
    ${boxes > 0 ? `<p class="muted small">The whole ground's boxes bring in about ${esc(money(hospitalityPerMatch(team, stadium)))} a home match and cost ${esc(money(boxUpkeep(stadium)))} a season to run.</p>` : ''}
    ${optionList(career, ui, stadium, options, 'Fully built. This stand is as big as it gets.')}
  </section>`;
}

function renderCornersPanel(career: Career, ui: UiState, stadium: Stadium): string {
  const options = stadiumOptions(career).filter((o) => o.kind === 'corner');
  return `<section class="card">
    <div class="card-title">Corners</div>
    <p class="muted small">Corners join two stands and add seats without touching the stands either side, so no seats shut while they go up.</p>
    <dl class="facts compact">${each(CORNER_IDS, (id) => `<div><dt>${esc(CORNER_NAMES[id].replace(' corner', ''))}</dt><dd>${esc(S.corners.levels[stadium.corners[id]].name)}</dd></div>`)}</dl>
    ${optionList(career, ui, stadium, options, 'Every corner is filled in.')}
  </section>`;
}

/** What each club-wide upgrade does at a level, from the tuning values. */
function upgradeEffect(stadium: Stadium, id: UpgradeId, level: number): string {
  const probe: Stadium = { ...stadium, upgrades: { ...stadium.upgrades, [id]: level } };
  switch (id) {
    case 'floodlights':
      return `TV money +${money(tvBonus(probe))} a season`;
    case 'videoBoard':
      return `Sponsor +${pct(level * S.upgrades.videoBoard.sponsorPerLevel)}, happier fans`;
    case 'signage':
      return `Sponsor +${pct(level * S.upgrades.signage.sponsorPerLevel)}`;
    case 'concourse':
      return `+$${concessionsBonus(probe).toFixed(2)} food and drink per fan`;
    case 'shop':
      return `Merchandise +${pct(merchandiseMultiplier(probe) - 1)}`;
    case 'pitch':
      return `Condition +${Math.round(level * S.upgrades.pitch.conditionPerLevel * 100)}`;
  }
}

function renderGroundPanel(career: Career, ui: UiState, stadium: Stadium): string {
  const all = stadiumOptions(career);
  const refurb = all.filter((o) => o.kind === 'refurbish');
  const rows = each(UPGRADE_IDS, (id) => {
    const level = stadium.upgrades[id];
    const max = maxUpgradeLevel(id);
    const def = upgradeDef(id);
    const option = all.find((o) => o.kind === 'upgrade' && o.target === id);
    const now = level > 0 ? upgradeEffect(stadium, id, level) : 'None yet';
    const next = level < max ? ` · next: ${upgradeEffect(stadium, id, level + 1)}` : ' · top level';
    const busy = stadium.projects.some((p) => p.target === id);
    return `<li><div class="deal-row"><div><strong>${esc(def.name)}</strong><div class="small muted">${esc(def.about)}</div></div></div>
      ${pips(level, max)}
      <p class="small">${esc(now)}<span class="muted">${esc(next)}</span></p>
      ${option && !busy ? optionActions(career, ui, stadium, option) : busy ? '<p class="muted small">Being built.</p>' : ''}</li>`;
  });
  return `<section class="card">
    <div class="card-title">Ground-wide</div>
    <dl class="facts compact">
      <div><dt>TV bonus</dt><dd>${esc(money(tvBonus(stadium)))}</dd></div>
      <div><dt>Sponsor</dt><dd>×${sponsorMultiplier(stadium).toFixed(2)}</dd></div>
      <div><dt>Shop</dt><dd>×${merchandiseMultiplier(stadium).toFixed(2)}</dd></div>
    </dl>
    <ul class="deal-list">${rows}</ul>
    ${refurb.length ? `<div class="card-title st-sub">Refurbishment</div><p class="muted small">Grounds wear a little every season, and a tired ground keeps people away.</p>${optionList(career, ui, stadium, refurb, '')}` : ''}
  </section>`;
}

function renderLookPanel(stadium: Stadium): string {
  const groups = each(LOOK_LABELS, (g) => {
    const current = stadium.look[g.key];
    return `<div class="card-title st-sub">${esc(g.title)}</div>
      <div class="segmented st-look" role="group" aria-label="${esc(g.title)}">${each(Object.entries(g.values), ([value, label]) =>
        `<button type="button" class="${cls('seg', current === value && 'on')}" data-action="stadium-look" data-key="${g.key}" data-value="${esc(value)}" aria-pressed="${current === value}">${esc(label)}</button>`)}</div>`;
  });
  return `<section class="card">
    <div class="card-title">Look</div>
    <p class="muted small">Free, and done by the next home match. Colours come from your club's branding.</p>
    ${groups}
  </section>`;
}

function renderPanel(career: Career, ui: UiState, stadium: Stadium): string {
  const pick = ui.stadiumPick;
  switch (pick) {
    case 'corners':
      return renderCornersPanel(career, ui, stadium);
    case 'ground':
      return renderGroundPanel(career, ui, stadium);
    case 'look':
      return renderLookPanel(stadium);
    default:
      return renderStandPanel(career, ui, stadium, pick);
  }
}

/** True when the Stadium tab can show the 3D ground on this device. */
export function stadium3dAvailable(ui: UiState): boolean {
  return ui.quality !== 'off' && !ui.stadium3dFailed;
}

const VIEW_LABELS: Record<StadiumView, string> = { model: '3D', plan: 'Plan' };

function renderGround(career: Career, ui: UiState, stadium: Stadium): string {
  const team = userTeam(career);
  const can3d = stadium3dAvailable(ui);
  const show3d = can3d && ui.stadiumView === 'model';
  const toggle = can3d
    ? `<div class="segmented st-views" role="group" aria-label="How to show the ground">${each(['model', 'plan'] as const, (v) =>
        `<button type="button" class="${cls('seg', ui.stadiumView === v && 'on')}" data-action="stadium-view" data-view="${v}" aria-pressed="${ui.stadiumView === v}">${VIEW_LABELS[v]}</button>`)}</div>`
    : '';
  const ground = show3d
    ? `<div class="st-slot" data-slot="stadium-3d"></div>
       <p class="small muted st-hint">Swipe sideways to turn the ground, pinch to zoom, and slide two fingers up or down to tilt. Tap a stand to pick it.</p>`
    : planSvg(career, stadium, ui.stadiumPick);
  return `<section class="card">
    <div class="st-head"><div class="card-title">${esc(team.stadiumName)}</div>${toggle}</div>
    ${ground}
    ${renderFacts(career, stadium)}
  </section>`;
}

export function renderStadium(career: Career, ui: UiState): string {
  const stadium = career.stadiums[career.userTeamId];
  const chips = `<div class="chip-row" role="group" aria-label="Part of the ground">${each(STADIUM_PICKS, (p) =>
    `<button type="button" class="${cls('chip', ui.stadiumPick === p && 'on')}" data-action="stadium-pick" data-part="${p}" aria-pressed="${ui.stadiumPick === p}">${esc(PICK_LABELS[p])}</button>`)}</div>`;
  return `<div class="club-grid stadium-grid">
    <div>
      ${renderGround(career, ui, stadium)}
      ${renderProjects(career, ui, stadium)}
    </div>
    <div>
      ${chips}
      ${renderPanel(career, ui, stadium)}
    </div>
  </div>`;
}

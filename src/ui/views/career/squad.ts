/** Squad: every player at the club, with a detail panel for contracts, release and sale. */
import {
  money,
  playerName,
  releaseCost,
  renewalTerms,
  squadForDisplay,
  squadRole,
  transferWindowOpen,
  type Career,
  moodBand,
  playerMood,
  type MoodBand,
} from '../../../sim/career';

const MOOD_TEXT: Record<MoodBand, string> = { unhappy: 'Unhappy', settled: 'Settled', happy: 'Happy' };
import { positionLabel } from '../../../sim/data';
import type { AttributeKey, Player } from '../../../sim/types';
import { cls, each, esc } from '../../html';
import type { UiState } from '../../career/state';
import { conditionCell, confirmButton, nationName, playerFlags, yearsSelect } from './parts';

const ATTRIBUTE_GROUPS: readonly { label: string; keys: readonly [AttributeKey, string][] }[] = [
  { label: 'Physical', keys: [['pac', 'Pace'], ['sta', 'Stamina'], ['str', 'Strength'], ['dur', 'Durability']] },
  {
    label: 'Technical',
    keys: [['dri', 'Dribbling'], ['pas', 'Passing'], ['vis', 'Vision'], ['fin', 'Finishing'], ['hea', 'Heading'], ['crs', 'Crossing'], ['spk', 'Set pieces']],
  },
  { label: 'Defending', keys: [['tck', 'Tackling'], ['mrk', 'Marking'], ['pos', 'Positioning']] },
  { label: 'Mental', keys: [['cmp', 'Composure'], ['wrk', 'Work rate'], ['agg', 'Aggression']] },
  { label: 'Goalkeeping', keys: [['ref', 'Reflexes'], ['han', 'Handling'], ['kck', 'Kicking'], ['gkp', 'Keeper positioning']] },
];

const ROLE_TEXT = { starter: 'Starter', rotation: 'Rotation', fringe: 'Fringe' } as const;

function isLoaned(career: Career, id: string): boolean {
  return career.loansIn.some((l) => l.playerId === id);
}

function attrBand(n: number): string {
  return n >= 75 ? 'attr-high' : n >= 55 ? 'attr-mid' : 'attr-low';
}

function renderAttributes(p: Player): string {
  // Keepers see the goalkeeping block first; outfielders do not need it.
  const groups = p.position === 'GK'
    ? [ATTRIBUTE_GROUPS[4], ATTRIBUTE_GROUPS[0], ATTRIBUTE_GROUPS[3]]
    : ATTRIBUTE_GROUPS.slice(0, 4);
  return `<div class="attr-groups">${each(
    groups,
    (g) => `<div class="attr-group">
      <div class="small muted">${esc(g.label)}</div>
      <dl class="attrs">${each(g.keys, ([k, label]) => `<div><dt>${esc(label)}</dt><dd class="${attrBand(p.attributes[k])}">${p.attributes[k]}</dd></div>`)}</dl>
    </div>`,
  )}</div>`;
}

function renderSeasonLine(career: Career, p: Player): string {
  const line = career.playerSeason[p.id];
  if (!line || line.apps === 0) return '<p class="muted small">No appearances this season yet.</p>';
  const avg = line.apps > 0 ? (line.ratingSum / line.apps).toFixed(1) : '-';
  return `<dl class="facts compact">
    <div><dt>Apps</dt><dd>${line.apps}</dd></div>
    <div><dt>Minutes</dt><dd>${line.minutes}</dd></div>
    <div><dt>Goals</dt><dd>${line.goals}</dd></div>
    <div><dt>Assists</dt><dd>${line.assists}</dd></div>
    <div><dt>Avg rating</dt><dd>${avg}</dd></div>
    <div><dt>Cards</dt><dd>${line.yellows}Y ${line.reds}R</dd></div>
  </dl>`;
}

function renderContract(career: Career, ui: UiState, p: Player): string {
  if (isLoaned(career, p.id)) {
    const loan = career.loansIn.find((l) => l.playerId === p.id);
    const parent = career.season.league.teams.find((t) => t.id === loan?.fromTeamId);
    return `<p class="small">On loan from ${esc(parent?.name ?? 'another club')} until the end of the season. You pay ${Math.round((loan?.wageShare ?? 1) * 100)}% of the wage.</p>`;
  }
  const terms = renewalTerms(career, p);
  const renew = terms.open
    ? `<form data-form="renew" data-id="${esc(p.id)}" class="inline-form">
        <span class="small">Renew at ${esc(money(terms.wage))}/yr for</span>
        ${yearsSelect('years', 3)}
        <button type="submit">Renew</button>
      </form>`
    : `<p class="muted small">Renewal talks open in the last year of the deal.</p>`;
  const sell = transferWindowOpen(career)
    ? confirmButton(ui, 'offer-player', p.id, 'Offer to other clubs')
    : '<p class="muted small">You can offer this player to other clubs when the transfer window opens.</p>';
  return `${renew}
    <div class="row-actions">
      ${confirmButton(ui, 'release-player', p.id, `Release (costs ${money(releaseCost(p))})`)}
      ${sell}
    </div>`;
}

function renderDetail(career: Career, ui: UiState, p: Player): string {
  const loaned = isLoaned(career, p.id);
  const secondary = p.secondaryPositions.length ? ` · also ${p.secondaryPositions.join(', ')}` : '';
  return `<section class="card player-detail">
    <div class="feed-top">
      <button type="button" class="btn-secondary" data-action="player" data-id="">Back to squad</button>
      <span class="muted small">#${p.jersey}</span>
    </div>
    <h2 class="player-name">${esc(playerName(p))} ${playerFlags(p, loaned)}</h2>
    <p class="small">${esc(positionLabel(p.position))}${esc(secondary)} · Age ${p.age} · ${esc(nationName(p))} · ${esc(ROLE_TEXT[squadRole(career, p)])}</p>
    <dl class="facts compact">
      <div><dt>Overall</dt><dd><strong>${p.overall}</strong></dd></div>
      <div><dt>Potential</dt><dd>${p.potential}</dd></div>
      <div><dt>Condition</dt><dd>${conditionCell(p.condition)}</dd></div>
      ${p.teamId === career.userTeamId ? `<div><dt>Mood</dt><dd>${esc(MOOD_TEXT[moodBand(playerMood(career, p.id))])}</dd></div>` : ''}
      <div><dt>Form</dt><dd>${p.form.length ? (p.form.reduce((a, b) => a + b, 0) / p.form.length).toFixed(1) : '-'}</dd></div>
      <div><dt>Wage</dt><dd>${esc(money(p.contract.wage))}/yr</dd></div>
      <div><dt>Contract</dt><dd>${p.contract.years} yr${p.contract.years === 1 ? '' : 's'}</dd></div>
      <div><dt>Value</dt><dd>${esc(money(p.value))}</dd></div>
    </dl>
    ${renderAttributes(p)}
    <div class="card-title">This season</div>
    ${renderSeasonLine(career, p)}
    <div class="card-title">Contract</div>
    ${renderContract(career, ui, p)}
  </section>`;
}

function renderRow(career: Career, p: Player): string {
  const loaned = isLoaned(career, p.id);
  return `<tr class="${cls(p.injuryWeeks > 0 && 'row-out')}">
    <td class="num muted">${p.jersey}</td>
    <td class="name-cell"><button type="button" class="link-btn" data-action="player" data-id="${esc(p.id)}">${esc(playerName(p))}</button></td>
    <td>${esc(p.position)}</td>
    <td class="num">${p.age}</td>
    <td class="num"><strong>${p.overall}</strong></td>
    <td class="num">${conditionCell(p.condition)}</td>
    <td class="num hide-narrow">${p.contract.years}</td>
    <td class="num hide-narrow">${esc(money(p.contract.wage))}</td>
    <td class="flags">${playerFlags(p, loaned)}</td>
  </tr>`;
}

export function renderSquad(career: Career, ui: UiState): string {
  const selected = ui.squadPlayerId ? career.season.league.players[ui.squadPlayerId] : undefined;
  if (selected && selected.teamId === career.userTeamId) return renderDetail(career, ui, selected);
  const squad = squadForDisplay(career);
  const injured = squad.filter((p) => p.injuryWeeks > 0).length;
  return `<section class="card">
    <div class="card-title">Squad · ${squad.length} players${injured ? ` · ${injured} injured` : ''}</div>
    <p class="muted small">Tap a name for details, contracts and sales. HG = ${esc('homegrown')}.</p>
    <div class="table-wrap">
      <table class="data-table squad-table">
        <thead><tr>
          <th class="num">#</th><th>Name</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Fit</th>
          <th class="num hide-narrow">Yrs</th><th class="num hide-narrow">Wage</th><th></th>
        </tr></thead>
        <tbody>${each(squad, (p) => renderRow(career, p))}</tbody>
      </table>
    </div>
  </section>`;
}

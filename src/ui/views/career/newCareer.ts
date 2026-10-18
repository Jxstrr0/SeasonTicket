/** New career: pick a difficulty and club, then brand it and set the career rules. */
import { C, money, type MatchMode, type TierId } from '../../../sim/career';
import { CLUBS, SEASON_TUNING } from '../../../sim/data';
import { cls, each, esc, safeColor } from '../../html';
import { thousands } from '../../format';
import type { NewCareerDraft } from '../../career/state';
import { CREST_ICONS, CREST_PATTERNS, CREST_SHAPES, renderCrest } from './crest';

export const MATCH_MODES: readonly { id: MatchMode; label: string; hint: string }[] = [
  { id: 'full', label: 'Full control', hint: 'You make every change. Play stops at half-time and for injuries and red cards.' },
  { id: 'bigCalls', label: 'Game plan + big calls', hint: 'The coach runs the match; play stops for goals, half-time and a 65th-minute call.' },
  { id: 'coach', label: 'Coach decides', hint: 'Watch only. The head coach makes every call.' },
];

function tierOrder(): TierId[] {
  return C.tiers.order as TierId[];
}

export function renderNewCareer(draft: NewCareerDraft): string {
  return draft.step === 'club' ? renderClubStep(draft) : renderBrandStep(draft);
}

function renderClubStep(draft: NewCareerDraft): string {
  const tier = C.tiers[draft.tier];
  const clubs = CLUBS.filter((c) => (tier.clubs as string[]).includes(c.id));
  return `<main class="shell new-career">
    <header class="screen-head">
      <button type="button" class="btn-secondary" data-action="to-title">Back</button>
      <h2>Choose your club</h2>
    </header>
    <div class="segmented" role="group" aria-label="Difficulty">
      ${each(tierOrder(), (id) => `<button type="button" class="${cls('seg', id === draft.tier && 'on')}" data-action="pick-tier" data-tier="${esc(id)}" aria-pressed="${id === draft.tier}">${esc(C.tiers[id].label)}</button>`)}
    </div>
    <p class="muted small tier-facts">Your fortune ${esc(money(tier.fortune))} · Club cash ${esc(money(tier.cash))} · Debt ${esc(money(tier.debt))}</p>
    <div class="club-grid">
      ${each(
        clubs,
        (c) => `<button type="button" class="club-card" data-action="pick-club" data-team="${esc(c.id)}" style="--c1:${safeColor(c.colors.primary)};--c2:${safeColor(c.colors.secondary)}">
          <span class="club-card-band" aria-hidden="true"></span>
          <span class="club-card-name">${esc(c.name)}</span>
          <span class="muted small">${esc(c.city)} · ${esc(c.stadiumName)} (${esc(thousands(c.stadiumCapacity))})</span>
          ${c.blurb ? `<span class="small">${esc(c.blurb)}</span>` : ''}
        </button>`,
      )}
    </div>
  </main>`;
}

function option(value: string, label: string, current: string): string {
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
}

export function renderCrestPreview(draft: NewCareerDraft): string {
  return renderCrest(draft.crest, 96, `${draft.branding.name} crest`);
}

function renderBrandStep(draft: NewCareerDraft): string {
  const b = draft.branding;
  const c = draft.crest;
  return `<main class="shell new-career">
    <header class="screen-head">
      <button type="button" class="btn-secondary" data-action="back-to-clubs">Back</button>
      <h2>Make it yours</h2>
    </header>
    <form data-form="start-career" class="brand-form">
      <div class="card brand-card">
        <div id="crest-preview" class="crest-preview">${renderCrestPreview(draft)}</div>
        <div class="field-grid">
          <label>Club name<input class="field" name="name" data-draft="name" maxlength="40" value="${esc(b.name)}" required></label>
          <label>Short name<input class="field" name="shortName" data-draft="shortName" maxlength="18" value="${esc(b.shortName)}" required></label>
          <label>City<input class="field" name="city" data-draft="city" maxlength="30" value="${esc(b.city)}" required></label>
          <label>Abbreviation<input class="field" name="abbr" data-draft="abbr" maxlength="3" value="${esc(b.abbr)}" required></label>
          <label>Main colour<input class="field colour" type="color" name="primary" data-draft="primary" value="${esc(safeColor(b.primary, '#223355'))}"></label>
          <label>Second colour<input class="field colour" type="color" name="secondary" data-draft="secondary" value="${esc(safeColor(b.secondary, '#ffffff'))}"></label>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Crest</div>
        <div class="field-grid">
          <label>Shape<select class="field" data-draft="shape">${each(CREST_SHAPES, (s) => option(s.id, s.label, c.shape))}</select></label>
          <label>Pattern<select class="field" data-draft="pattern">${each(CREST_PATTERNS, (s) => option(s.id, s.label, c.pattern))}</select></label>
          <label>Icon<select class="field" data-draft="icon">${each(CREST_ICONS, (s) => option(s.id, s.label, c.icon))}</select></label>
          <label>Initials<input class="field" data-draft="initials" maxlength="3" value="${esc(c.initials)}"></label>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Career rules</div>
        <label class="check"><input type="checkbox" name="homegrown" data-draft="homegrown"${draft.homegrown ? ' checked' : ''}> Homegrown rule: at least ${esc(SEASON_TUNING.homegrownMinimum)} Valmeran starters</label>
        <p class="muted small">Every club, yours included, must start enough Valmeran players. It is fixed for the whole career.</p>
        <div class="card-title">On match day</div>
        <div class="segmented stack" role="group" aria-label="Match mode">
          ${each(MATCH_MODES, (m) => `<button type="button" class="${cls('seg', m.id === draft.matchMode && 'on')}" data-action="pick-mode" data-mode="${esc(m.id)}" aria-pressed="${m.id === draft.matchMode}"><strong>${esc(m.label)}</strong><span class="small">${esc(m.hint)}</span></button>`)}
        </div>
        <p class="muted small">You can change this any time from the menu.</p>
        <label>World seed<input class="field" name="seed" data-draft="seed" inputmode="numeric" maxlength="15" value="${esc(draft.seed)}"></label>
        <p class="muted small">The same seed builds the same league, players and fixtures.</p>
      </div>
      <button type="submit" class="btn-big">Start the career</button>
    </form>
  </main>`;
}

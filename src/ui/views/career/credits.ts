/**
 * The Credits screen and CREDITS.md (Stage 7.6), both made from src/data/meta/credits.json
 * so the two can never disagree. `npm run credits` rewrites CREDITS.md after an edit.
 */
import CREDITS from '../../../data/meta/credits.json';
import { each, esc } from '../../html';
import { longlightMark } from '../../brand';
import { GAME_VERSION } from '../../career/report';

/** Turns `code` in a note into <code> (the only markup the notes use). */
function noteHtml(text: string): string {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** What the game sends, in the player's words (analytics are not on yet). */
export const SENDS_NOTHING =
  'The game sends nothing about you or your play anywhere. Your career is kept only in this browser.';

export function renderCredits(): string {
  return `<main class="shell credits-screen">
    <header class="help-head">
      <button type="button" class="btn-secondary" data-action="back">Back</button>
      <h1>Credits</h1>
    </header>
    <section class="card credits-studio">
      ${longlightMark()}
      <p class="brand-caps">${esc(CREDITS.studio)}</p>
      <p class="muted small">Season Ticket, version ${esc(GAME_VERSION)}. Every club, player, place and sponsor in the game is made up.</p>
    </section>
    <section class="card">
      <h2 class="card-title">What the game sends</h2>
      <p>${esc(SENDS_NOTHING)}</p>
      <button type="button" class="btn-secondary" data-action="contact">Report a problem or send feedback</button>
    </section>
    <section class="card">
      <h2 class="card-title">Models, textures, sound and music</h2>
      <p class="muted small">Every one is free to use (CC0, public domain). Thank you to their makers.</p>
      <ul class="credits-list">
        ${each(
          CREDITS.assets,
          (a) => `<li><strong>${esc(a.asset)}</strong>
            <span class="muted small">${esc(a.usedFor)}. <a class="link" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.source)}</a>, ${esc(a.licence)}.</span></li>`,
        )}
      </ul>
      ${each(CREDITS.notes, (n) => `<p class="muted small">${noteHtml(n)}</p>`)}
    </section>
    <section class="card">
      <h2 class="card-title">Built with</h2>
      <ul class="credits-list">
        ${each(CREDITS.libraries, (l) => `<li>${esc(l.name)} <span class="muted small">(${esc(l.licence)})</span></li>`)}
      </ul>
      <p class="muted small">Assets prepared with ${esc(CREDITS.tools.map((t) => t.name).join(', '))}.</p>
    </section>
    <p class="center"><button type="button" class="btn-secondary" data-action="back">Back</button></p>
  </main>`;
}

/** CREDITS.md, exactly. */
export function creditsMarkdown(): string {
  const row = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  const table = (head: string[], rows: string[][]): string =>
    [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
  return [
    '# Credits',
    '',
    `Season Ticket is made by ${CREDITS.studio}.`,
    '',
    '## Third-party assets',
    '',
    'Every asset shipped with the game is listed here with its source and licence.',
    '',
    table(
      ['Asset', 'Source', 'Licence', 'Used for'],
      CREDITS.assets.map((a) => [a.asset, `[${a.source}](${a.url})`, a.licence, a.usedFor]),
    ),
    '',
    CREDITS.notes.join('\n\n'),
    '',
    '## Libraries',
    '',
    table(['Library', 'Licence'], CREDITS.libraries.map((l) => [l.name, l.licence])),
    '',
    '## Asset tools (not shipped)',
    '',
    table(['Tool', 'Licence'], CREDITS.tools.map((t) => [t.name, t.licence])),
    '',
  ].join('\n');
}

/** "Report a problem or send feedback", and the version with what's new (Stage 7.5). */
import VERSION from '../../../data/meta/version.json';
import { each, esc } from '../../html';
import { CONTACT_URL, GAME_VERSION } from '../../career/report';

export function renderContact(report: string, hasCareer: boolean): string {
  return `<main class="shell contact-screen">
    <header class="help-head">
      <button type="button" class="btn-secondary" data-action="back">Back</button>
      <h1>Report a problem</h1>
    </header>
    <section class="card">
      <p>Found a bug, or have an idea? Tell us through the contact form on the Longlight website. The game sends nothing by itself.</p>
      <ol class="small">
        <li>Tap <strong>Copy report</strong>. It says which version and device you are on.</li>
        <li>Tap <strong>Open the contact form</strong>, paste the report into the message box, and add what happened.</li>
      </ol>
      <textarea id="report-text" class="field code-field" rows="6" readonly spellcheck="false" aria-label="Problem report">${esc(report)}</textarea>
      <div class="row-actions">
        <button type="button" data-action="contact-copy">Copy report</button>
        <a class="btn btn-secondary" href="${esc(CONTACT_URL)}" target="_blank" rel="noopener">Open the contact form</a>
      </div>
      ${hasCareer ? '<p class="muted small">Your save is too long for the form. If we ask to see it, Menu → Save code → Download .txt saves it as a file you can send.</p>' : ''}
    </section>
  </main>`;
}

export function renderWhatsNew(): string {
  return `<main class="shell whats-new">
    <header class="help-head">
      <button type="button" class="btn-secondary" data-action="back">Back</button>
      <h1>What's new</h1>
    </header>
    <section class="card">
      <p class="muted small">You are playing version ${esc(GAME_VERSION)}.</p>
      ${each(VERSION.notes, (n) => `<h2>Version ${esc(n.version)} <span class="muted small">${esc(n.date)}</span></h2>
        <ul>${each(n.lines, (l) => `<li>${esc(l)}</li>`)}</ul>`)}
    </section>
  </main>`;
}

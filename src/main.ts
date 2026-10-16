/**
 * Entry point. Stage 1 placeholder: proves the deploy works and the sim loads.
 * The Stage 1 season runner page replaces this once the sim modules land.
 */
import './ui/base.css';
import { Rng } from './sim/rng';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');

const seed = new Rng('season-ticket').int(1000, 9999);

app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <h1>Season Ticket</h1>
      <p class="tagline">Own the club. Run the business. Change the game.</p>
    </header>
    <section class="card">
      <p>Stage 1 is under construction: the match engine and league sim are being built.</p>
      <p class="muted">Build check seed: ${seed}. Rotate your phone to landscape for the best fit.</p>
    </section>
  </main>
`;

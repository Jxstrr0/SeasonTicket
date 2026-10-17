/**
 * The 2D replay screen. The pitch and its controls are one element kept by
 * src/ui/career/replayHost.ts and moved into the slot below after each render.
 */
import type { Career } from '../../../sim/career';
import type { UiState } from '../../career/state';
import { replayOf } from './home';

export function renderReplayScreen(career: Career, ui: UiState): string {
  if (!ui.replayId || !replayOf(career, ui.replayId)) {
    return `<main class="shell"><section class="card">
      <p class="muted">This match has no replay. Replays are kept for your club's matches this season and the latest round of the rest.</p>
      <button type="button" data-action="close-replay">Back</button>
    </section></main>`;
  }
  return '<main class="shell replay-screen"><div data-slot="replay-2d"></div></main>';
}

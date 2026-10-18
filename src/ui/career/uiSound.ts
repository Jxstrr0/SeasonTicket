/**
 * When the menus make a sound (Stage 7.2). Each render boils what is on screen down to a few
 * facts; comparing them with the last render's says what just appeared: a knock for a visitor,
 * the phone for a new offer or deadline-day call, a page for the newspaper and cameras for the
 * press pack. Pure, so it is tested without a browser.
 */
export interface CueState {
  /** A visitor's event card is open, or a visitor is waiting at the office door. */
  visitor: boolean;
  /** The press conference card is open. */
  press: boolean;
  /** Offers for the club's players waiting on the owner. */
  bids: number;
  /** Deadline-day calls waiting to be answered. */
  calls: number;
  /** The News tab is open. */
  news: boolean;
}

export type Cue = 'knock' | 'ring' | 'page' | 'cameras';

/** The sounds for what changed between two renders (none on the first). */
export function cuesFor(prev: CueState | null, next: CueState): Cue[] {
  if (!prev) return [];
  const out: Cue[] = [];
  if (next.press && !prev.press) out.push('cameras');
  else if (next.visitor && !prev.visitor) out.push('knock');
  if (next.bids > prev.bids || next.calls > prev.calls) out.push('ring');
  if (next.news && !prev.news) out.push('page');
  return out;
}

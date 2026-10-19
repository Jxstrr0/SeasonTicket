/**
 * Where the browser keeps the career's save code, and the crash lock. On their own so the
 * start-up script can use them without the save code's libraries.
 */
export const STORAGE_KEY = 'seasonticket.career';

let frozen = false;

/** After a crash nothing may overwrite the last good save (Stage 7.5). Tests pass false to undo. */
export function freezeSaves(on = true): void {
  frozen = on;
}

export function savesFrozen(): boolean {
  return frozen;
}

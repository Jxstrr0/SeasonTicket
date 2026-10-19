/**
 * Copies text, falling back to selecting it in a text box (some phones block the
 * clipboard). Resolves true if it was copied; on false the text is left selected so the
 * player can copy it by hand.
 */
export async function copyText(text: string, area: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the text box below.
  }
  if (!area) return false;
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

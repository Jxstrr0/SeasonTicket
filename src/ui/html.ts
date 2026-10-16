/**
 * Tiny helpers for building HTML strings safely. Every piece of text that
 * comes from data goes through esc(), and every colour through safeColor(),
 * so a club name or a branding colour can never inject markup.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A hex colour from data, or the fallback when it is not one. */
export function safeColor(value: string | undefined, fallback = 'var(--muted)'): string {
  return value && HEX_COLOR.test(value) ? value : fallback;
}

/** Joins class names, skipping falsy ones. */
export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** Renders a list of items and joins the HTML. */
export function each<T>(items: readonly T[], render: (item: T, index: number) => string): string {
  return items.map(render).join('');
}

/**
 * The studio's mark and colours (Stage 7.6): a copper half-sun resting on a bar, on
 * Longlight purple. The same shapes as the app icon (public/icons/icon.svg).
 */
export const BRAND = {
  purple: '#6F45B8',
  deepPurple: '#583696',
  copper: '#C2826A',
  ink: '#1C1820',
  paper: '#E1DED7',
} as const;

/** The mark alone (sun and bar, no background), sized by its container's font. */
export function longlightMark(className = 'longlight-mark'): string {
  return `<svg class="${className}" viewBox="116 172 280 168" aria-hidden="true" focusable="false">
    <path d="M146 292a110 110 0 0 1 220 0z" fill="${BRAND.copper}"/>
    <rect x="126" y="304" width="260" height="26" rx="4" fill="${BRAND.paper}"/>
  </svg>`;
}

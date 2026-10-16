/** The club crest as inline SVG, built from the crest builder's choices. */
import type { Crest, CrestIcon, CrestPattern, CrestShape } from '../../../sim/career';
import { esc, safeColor } from '../../html';

export const CREST_SHAPES: readonly { id: CrestShape; label: string }[] = [
  { id: 'shield', label: 'Shield' },
  { id: 'round', label: 'Round' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'banner', label: 'Banner' },
];

export const CREST_PATTERNS: readonly { id: CrestPattern; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'hoops', label: 'Hoops' },
  { id: 'halves', label: 'Halves' },
  { id: 'sash', label: 'Sash' },
  { id: 'chevron', label: 'Chevron' },
];

export const CREST_ICONS: readonly { id: CrestIcon; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'star', label: 'Star' },
  { id: 'crown', label: 'Crown' },
  { id: 'ball', label: 'Ball' },
  { id: 'wave', label: 'Wave' },
  { id: 'peak', label: 'Peak' },
  { id: 'tower', label: 'Tower' },
  { id: 'bird', label: 'Bird' },
];

const SHAPES: Record<CrestShape, string> = {
  shield: '<path d="M8 6 H92 V58 C92 88 50 114 50 114 C50 114 8 88 8 58 Z"/>',
  round: '<circle cx="50" cy="60" r="46"/>',
  diamond: '<path d="M50 4 L96 60 L50 116 L4 60 Z"/>',
  banner: '<path d="M12 4 H88 V114 L50 94 L12 114 Z"/>',
};

function patternSvg(pattern: CrestPattern, c2: string): string {
  switch (pattern) {
    case 'stripes':
      return [14, 38, 62, 86].map((x) => `<rect x="${x - 6}" y="0" width="12" height="120" fill="${c2}"/>`).join('');
    case 'hoops':
      return [22, 50, 78, 106].map((y) => `<rect x="0" y="${y - 7}" width="100" height="14" fill="${c2}"/>`).join('');
    case 'halves':
      return `<rect x="50" y="0" width="50" height="120" fill="${c2}"/>`;
    case 'sash':
      return `<path d="M-6 6 L106 126" stroke="${c2}" stroke-width="24"/>`;
    case 'chevron':
      return `<path d="M-4 38 L50 82 L104 38" stroke="${c2}" stroke-width="18" fill="none"/>`;
    case 'plain':
      return '';
  }
}

/** Icons are drawn in a 40 x 40 box. */
const ICONS: Record<Exclude<CrestIcon, 'none'>, string> = {
  star: '<path d="M20 2 L25 15 L39 15 L28 24 L32 38 L20 30 L8 38 L12 24 L1 15 L15 15 Z"/>',
  crown: '<path d="M3 32 L3 10 L12 20 L20 6 L28 20 L37 10 L37 32 Z"/>',
  ball: '<circle cx="20" cy="20" r="17"/><path d="M20 11 L28 17 L25 27 L15 27 L12 17 Z" class="crest-cut"/>',
  wave: '<path d="M1 26 C8 14 14 14 20 24 C26 34 32 34 39 22 L39 36 L1 36 Z"/>',
  peak: '<path d="M1 36 L15 10 L22 22 L28 14 L39 36 Z"/>',
  tower: '<path d="M10 38 L10 12 L7 12 L7 4 L13 4 L13 8 L17 8 L17 4 L23 4 L23 8 L27 8 L27 4 L33 4 L33 12 L30 12 L30 38 Z"/>',
  bird: '<path d="M2 20 C10 12 16 14 20 20 C24 14 30 12 38 20 C30 18 24 22 20 28 C16 22 10 18 2 20 Z"/>',
};

let crestIds = 0;

/** An SVG crest. `size` is the rendered width in px (height follows). */
export function renderCrest(crest: Crest, size = 48, label = ''): string {
  crestIds += 1;
  const id = `crest-clip-${crestIds}`;
  const c1 = safeColor(crest.primary, '#334');
  const c2 = safeColor(crest.secondary, '#eee');
  const shape = SHAPES[crest.shape] ?? SHAPES.shield;
  const initials = esc(crest.initials.slice(0, 3).toUpperCase());
  const hasIcon = crest.icon !== 'none' && ICONS[crest.icon];
  const icon = hasIcon ? `<g transform="translate(32 18) scale(0.9)" fill="${c2}" stroke="${c1}" stroke-width="2.5" paint-order="stroke">${ICONS[crest.icon as Exclude<CrestIcon, 'none'>]}</g>` : '';
  const textY = hasIcon ? 88 : 74;
  const fontSize = initials.length > 2 ? (hasIcon ? 24 : 30) : hasIcon ? 30 : 38;
  const role = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="crest" viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" ${role}>
    <defs><clipPath id="${id}">${shape}</clipPath></defs>
    <g clip-path="url(#${id})"><rect width="100" height="120" fill="${c1}"/>${patternSvg(crest.pattern, c2)}</g>
    <g fill="none" stroke="${c2}" stroke-width="4">${shape}</g>
    ${icon}
    <text x="50" y="${textY}" text-anchor="middle" font-size="${fontSize}" font-weight="800" font-family="system-ui, sans-serif" fill="${c2}" stroke="${c1}" stroke-width="5" paint-order="stroke" letter-spacing="1">${initials}</text>
  </svg>`;
}

/**
 * Is this a crest the game can draw? Kept in a file of its own, with no other code behind
 * it, because the start-up screen asks before the rest of the game has downloaded.
 *
 * The crest is drawn on the title screen before a career is opened. A crest the game could
 * not draw used to break that screen on every visit, with no way past it (1.2.6.0).
 */
import type { Crest } from '../sim/career/types';

const SHAPES: readonly string[] = ['shield', 'round', 'diamond', 'banner'] satisfies Crest['shape'][];
const PATTERNS: readonly string[] = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron'] satisfies Crest['pattern'][];
const ICONS: readonly string[] = ['none', 'star', 'crown', 'ball', 'wave', 'peak', 'tower', 'bird'] satisfies Crest['icon'][];

/** What is wrong with the crest, or null if it can be drawn. */
export function crestProblem(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'crest';
  const c = v as Record<string, unknown>;
  if (!SHAPES.includes(c.shape as string) || !PATTERNS.includes(c.pattern as string) || !ICONS.includes(c.icon as string)) return 'crest shape, pattern or icon';
  if (typeof c.primary !== 'string' || typeof c.secondary !== 'string' || typeof c.initials !== 'string') return 'crest colours or initials';
  return null;
}

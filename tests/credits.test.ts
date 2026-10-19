import { describe, expect, it } from 'vitest';
import CREDITS from '../src/data/meta/credits.json';
import { creditsMarkdown, renderCredits } from '../src/ui/views/career/credits';
import { envFlag, listFilesDeep, readSource, writeSource } from './helpers/node.mjs';

describe('credits (Stage 7.6)', () => {
  it('CREDITS.md is made from the same list as the Credits screen', () => {
    if (envFlag('UPDATE_CREDITS')) writeSource('CREDITS.md', creditsMarkdown());
    // Run `npm run credits` after editing src/data/meta/credits.json.
    expect(readSource('CREDITS.md')).toBe(creditsMarkdown());
  });

  it('every file in public/assets is credited', () => {
    const covered = CREDITS.assets.flatMap((a) => a.files);
    const missing = listFilesDeep('public/assets').filter((f) => !covered.some((c) => f.startsWith(c)));
    expect(missing).toEqual([]);
    // And no entry points at nothing.
    const files = listFilesDeep('public/assets');
    expect(covered.filter((c) => !files.some((f) => f.startsWith(c)))).toEqual([]);
  });

  it('the screen lists every asset and library', () => {
    const html = renderCredits();
    for (const a of CREDITS.assets) expect(html).toContain(a.url);
    expect(html).toContain('Longlight Interactive');
    expect(html).toContain('three.js');
  });
});

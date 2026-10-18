// First-load budget (docs/STAGE_7_POLISH.md, Budgets): the script a phone downloads before the
// title screen shows, compressed, must stay under 200 KB. Run after `npm run build`.
// It follows the entry script's static imports; chunks loaded with import() come later.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT_KB = 200;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/SeasonTicket\/(assets\/[^"]+\.js)"/)?.[1];
if (!entry) throw new Error('No entry script in dist/index.html');

const seen = new Set();
const walk = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(join(dist, file), 'utf8');
  // Static imports only: `import ... from"./x.js"` and bare `import"./x.js"`, never `import("./x.js")`.
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*"\.\/([^"]+\.js)"/g)) walk(join('assets', m[1]));
};
walk(entry);

let total = 0;
for (const file of seen) {
  const kb = gzipSync(readFileSync(join(dist, file))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${file}`);
}
console.log(`${total.toFixed(1).padStart(7)} KB  before the title screen (limit ${LIMIT_KB} KB, compressed)`);
if (total > LIMIT_KB) {
  console.error('First-load budget exceeded.');
  process.exit(1);
}

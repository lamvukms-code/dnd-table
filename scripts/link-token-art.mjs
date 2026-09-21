#!/usr/bin/env node
/**
 * Give bestiary stat blocks a token image from a folder of token art (e.g. a purchased
 * token pack): matches file names like "C_Alpengrendel_Large.webp" to stat block names,
 * copies each matched image into the server's uploads folder, and writes `imageUrl`.
 *
 *   node scripts/link-token-art.mjs <artFolder> <bestiary.json> [--uploads server/data/uploads] [--out file.json]
 *
 * Works in place on <bestiary.json> unless --out is given. Fuzzy (typo-tolerant) name match;
 * unmatched stat blocks are listed. Uploaded art is git-ignored — never commit purchased art.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const uploads = flag('--uploads', 'server/data/uploads');
const outArg = flag('--out');
const [artDir, bestiaryPath] = args;
if (!artDir || !bestiaryPath) {
  console.error('usage: link-token-art.mjs <artFolder> <bestiary.json> [--uploads dir] [--out file]');
  process.exit(1);
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const IMG = new Set(['.webp', '.png', '.jpg', '.jpeg']);
const art = readdirSync(artDir)
  .filter((f) => IMG.has(extname(f).toLowerCase()))
  .map((f) => {
    const base = f.slice(0, f.length - extname(f).length);
    const m = /^[A-Za-z]_(.+?)(?:_(?:Tiny|Small|Medium|Large|Huge|Gargantuan))?$/.exec(base);
    return { file: f, key: norm(m ? m[1] : base), npc: /^[A-Za-z]_NPC_/.test(base) };
  })
  .filter((a) => !a.npc);

const list = JSON.parse(readFileSync(bestiaryPath, 'utf8'));
mkdirSync(uploads, { recursive: true });
const missing = [];
let linked = 0;
for (const sb of list) {
  const key = norm(sb.name);
  let best = art.find((a) => a.key === key);
  if (!best) {
    const near = art.map((a) => ({ a, d: lev(a.key, key) })).sort((x, y) => x.d - y.d)[0];
    if (near && near.d <= Math.max(2, Math.floor(key.length * 0.15))) best = near.a;
  }
  if (!best) {
    missing.push(sb.name);
    continue;
  }
  const ext = extname(best.file).toLowerCase();
  const name = `art-${key}${ext}`;
  copyFileSync(join(artDir, best.file), join(uploads, name));
  sb.imageUrl = `/uploads/${name}`;
  linked++;
}
writeFileSync(outArg ?? bestiaryPath, JSON.stringify(list, null, 2));
console.log(`${linked}/${list.length} stat blocks got token art → ${uploads}`);
if (missing.length) console.log('no art for: ' + missing.join(', '));

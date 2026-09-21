#!/usr/bin/env node
/**
 * Import a purchased map pack (battlemaps, region maps, cutaways) into the server's map library.
 *
 *   node scripts/import-maps.mjs "<pack folder>" [--dest server/data/maps]
 *        [--titles "10=Chapter title;11=Another title"] [--variant gridless|gridded]
 *
 * Expected layout (e.g. the Crooked Moon digital map pack):
 *   Battlemaps/Gridless/Gridless WebP/GL_<chapter>_<n>_<Name>_<W>x<H>.webp   (preferred: light, no baked grid)
 *   Battlemaps/Gridded/Gridded WebP/G_<chapter>_<n>_<Name>_<W>x<H>.webp
 *   Region Maps/MAP_[<chapter>_<n>_]<Name>.jpeg     Cutaways/CUTAWAY_<Name>.jpeg
 * `WxH` in the file name is the size in grid squares → the app sets the board to exactly that many
 * cells. Files are copied (only if missing / changed) into <dest>, and <dest>/index.json is written;
 * the DM's "🗺 Bản đồ" library reads it. The images are book content: <dest> is git-ignored — never
 * commit them.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const dest = flag('--dest', 'server/data/maps');
const variant = flag('--variant', 'gridless');
const titles = Object.fromEntries(
  (flag('--titles', '') || '')
    .split(';')
    .map((s) => s.split('='))
    .filter((p) => p.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]),
);
const [pack] = args;
if (!pack) {
  console.error('usage: import-maps.mjs <pack folder> [--dest dir] [--titles "10=Title;…"] [--variant gridless|gridded]');
  process.exit(1);
}

function imageSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') {
      const v = b.readUInt32LE(21);
      return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9; ) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

const safe = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const pretty = (s) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const list = (dir, exts) =>
  existsSync(dir)
    ? readdirSync(dir).filter((f) => exts.includes(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
    : [];

mkdirSync(dest, { recursive: true });
const maps = [];
const chapterGroup = (n) => (titles[n] ? `Chương ${n} — ${titles[n]}` : `Chương ${n}`);

function add(srcDir, file, sub, meta) {
  const src = join(srcDir, file);
  const out = `${sub}/${safe(basename(file, extname(file)))}${extname(file).toLowerCase()}`;
  mkdirSync(join(dest, sub), { recursive: true });
  const dst = join(dest, out);
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
  const dims = imageSize(src);
  maps.push({ id: safe(basename(file, extname(file))), file: out, kb: Math.round(statSync(src).size / 1024), px: dims, ...meta });
  return dims;
}

// ---- battlemaps ----
const bmDir = join(pack, 'Battlemaps', variant === 'gridded' ? 'Gridded/Gridded WebP' : 'Gridless/Gridless WebP');
let pxPerCell = [];
for (const f of list(bmDir, ['.webp'])) {
  const base = basename(f, extname(f));
  const m = /^(?:GL?_)?(\d+)_(\d+)_(.+?)(?:_(\d+)x(\d+))?$/.exec(base);
  if (!m) continue;
  const [, ch, n, name, w, h] = m;
  const dims = imageSize(join(bmDir, f));
  if (w && dims) pxPerCell.push(dims[0] / Number(w));
  maps.push({ _pending: true, ch, n, name, w, h, f, dims });
}
pxPerCell = pxPerCell.sort((a, b) => a - b);
const ppc = pxPerCell.length ? pxPerCell[Math.floor(pxPerCell.length / 2)] : 140;
for (const p of maps.splice(0, maps.length).filter((x) => x._pending)) {
  const cols = p.w ? Number(p.w) : p.dims ? Math.round(p.dims[0] / ppc) : undefined;
  const rows = p.h ? Number(p.h) : p.dims ? Math.round(p.dims[1] / ppc) : undefined;
  add(bmDir, p.f, 'battlemaps', {
    group: chapterGroup(Number(p.ch)),
    order: Number(p.ch) * 100 + Number(p.n),
    name: `${p.n}. ${pretty(p.name)}`,
    cols,
    rows,
    grid: true,
  });
}

// ---- region maps & cutaways (no grid: sized by aspect ratio, long side ≈ 50 squares) ----
function extra(dirName, prefix, kind, groupOf) {
  const dir = join(pack, dirName);
  for (const f of list(dir, ['.jpeg', '.jpg', '.png', '.webp'])) {
    const base = basename(f, extname(f)).replace(new RegExp(`^${prefix}_`), '');
    const m = /^(\d+)_(\d+)_(.+)$/.exec(base);
    const chapter = m ? Number(m[1]) : undefined;
    const dims = imageSize(join(dir, f));
    const long = 50;
    const cols = dims ? (dims[0] >= dims[1] ? long : Math.round((long * dims[0]) / dims[1])) : long;
    const rows = dims ? (dims[0] >= dims[1] ? Math.round((long * dims[1]) / dims[0]) : long) : long;
    add(dir, f, kind, {
      group: groupOf(chapter),
      order: chapter ? chapter * 100 + Number(m[2]) + 50 : 9000,
      name: pretty(m ? m[3] : base) + (kind === 'cutaways' ? ' (mặt cắt)' : ' (bản đồ vùng)'),
      cols,
      rows,
      grid: false,
    });
  }
}
extra('Region Maps', 'MAP', 'regions', (ch) => (ch ? chapterGroup(ch) : 'Bản đồ vùng & thế giới'));
extra('Cutaways', 'CUTAWAY', 'cutaways', () => 'Mặt cắt (Cutaways)');

maps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
writeFileSync(join(dest, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), source: basename(pack), maps }, null, 1));
const groups = new Set(maps.map((m) => m.group));
const mb = maps.reduce((n, m) => n + m.kb, 0) / 1024;
console.log(`${maps.length} maps in ${groups.size} groups (${mb.toFixed(0)} MB, ~${Math.round(ppc)} px/square) → ${dest}/index.json`);

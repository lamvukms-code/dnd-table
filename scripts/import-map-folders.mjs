#!/usr/bin/env node
/**
 * Import a map pack laid out as one folder per adventure/chapter into the server's map library.
 *
 *   node scripts/import-map-folders.mjs "<pack folder>" --cell 100
 *        [--out-cell 70] [--quality 80] [--dest server/data/maps] [--prefix st]
 *        [--groups "Folder A;Folder B"] [--baked-grid]
 *
 *   <pack folder>/<Group name>/<any name>.webp|png|jpg      → one map each, grouped by folder
 *
 * --cell      source pixels per grid square (most VTT packs: 100, some 70/140). The board is
 *             sized to width/cell × height/cell squares, so tokens snap onto the map's own grid.
 * --out-cell  re-encode to this many px per square (default 70) with ffmpeg → WebP. Battle maps
 *             ship at 100–140 px/square and 5–25 MB each; players on a remote link download every
 *             map, so ~70 px keeps them sharp at normal zoom at a fraction of the size.
 * --baked-grid the images already have a grid drawn in → the app's grid overlay starts OFF.
 * --groups    folder order (default: alphabetical). Unlisted folders go last.
 * --prefix    id prefix so several packs can share one library; re-running replaces only
 *             entries with this prefix and keeps the rest of index.json.
 *
 * A file name containing "marked" is treated as the GM copy (room labels) of the same map.
 * A trailing " - Ab3dEf9" upload hash in a file name is dropped from the display name.
 *
 * Needs ffmpeg on PATH (or env FFMPEG). Output images are the pack's content: <dest> is
 * git-ignored — never commit them. This script contains no pack content.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const pack = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const cell = Number(flag('--cell', '0'));
if (!pack || !existsSync(pack) || !cell) {
  console.error('usage: import-map-folders.mjs <pack folder> --cell <px per square> [--out-cell 70] [--baked-grid] ...');
  process.exit(1);
}
const outCell = Number(flag('--out-cell', '70'));
const quality = flag('--quality', '80');
const dest = flag('--dest', 'server/data/maps');
const prefix = flag('--prefix', 'pack');
const bakedGrid = args.includes('--baked-grid');
const groupOrder = (flag('--groups', '') || '').split(';').map((s) => s.trim()).filter(Boolean);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

/** Pixel size of a WebP / PNG / JPEG from its header. */
function dims(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') {
      const v = b.readUInt32LE(21);
      return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
    }
  }
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}
const safe = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const groups = readdirSync(pack)
  .filter((d) => statSync(join(pack, d)).isDirectory())
  .sort((a, b) => {
    const ia = groupOrder.indexOf(a), ib = groupOrder.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });

const outDir = join(dest, prefix);
mkdirSync(outDir, { recursive: true });
const added = [];
groups.forEach((group, gi) => {
  const files = readdirSync(join(pack, group))
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  files.forEach((f, fi) => {
    const src = join(pack, group, f);
    const px = dims(src);
    if (!px) return console.warn('skip (unknown size):', src);
    const cols = Math.round(px[0] / cell);
    const rows = Math.round(px[1] / cell);
    const base = basename(f, extname(f));
    const marked = /marked/i.test(base);
    const clean = base.replace(/marked/i, '').replace(/\s+-\s+[A-Za-z0-9]{6,8}$/, '').replace(/^map\s+(?=\d)/i, '').trim();
    const name = `${/^\d+$/.test(clean) ? `Bản đồ ${clean}` : clean}${marked ? ' (GM — có đánh dấu)' : ''}`;
    const id = `${prefix}_${safe(group)}_${safe(base)}`;
    const out = `${prefix}/${id}.webp`;
    const target = join(dest, out);
    const outW = cols * outCell;
    if (!existsSync(target) || statSync(target).mtimeMs < statSync(src).mtimeMs) {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
        '-vf', `scale=${outW}:-1:flags=lanczos`, '-c:v', 'libwebp', '-quality', quality, target]);
    }
    added.push({
      id,
      file: out,
      kb: Math.round(statSync(target).size / 1024),
      px: [outW, rows * outCell],
      group,
      order: (gi + 1) * 100 + fi,
      name,
      cols,
      rows,
      grid: !bakedGrid,
    });
    console.log(`${group} / ${name}: ${cols}×${rows} ô, ${Math.round(statSync(src).size / 1024)}KB → ${added.at(-1).kb}KB`);
  });
});

const indexFile = join(dest, 'index.json');
const prev = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : { maps: [] };
const kept = (prev.maps ?? []).filter((m) => !m.id.startsWith(`${prefix}_`));
const maps = [...kept, ...added].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
writeFileSync(indexFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'import-map-folders.mjs', maps }, null, 2));
console.log(`\n${added.length} maps (${prefix}) + ${kept.length} kept → ${indexFile}`);

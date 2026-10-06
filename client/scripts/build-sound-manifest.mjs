// Scans client/public/sounds/** and writes client/src/data/soundManifest.json — a plain list of
// public URLs per folder, so the app can pick a random file per category without bundling audio
// through the JS module graph (public/ assets are served as-is, not import()-able).
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const soundsDir = join(clientDir, 'public', 'sounds');
const outFile = join(clientDir, 'src', 'data', 'soundManifest.json');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ogg|mp3|wav)$/i.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(soundsDir);
const manifest = {};
for (const f of files) {
  const rel = relative(soundsDir, f).split('\\').join('/'); // e.g. "combat/foo.ogg" or "ambience/forest/bar.mp3"
  const category = rel.split('/')[0];
  manifest[category] ??= [];
  manifest[category].push('/sounds/' + rel);
}

mkdirSync(join(clientDir, 'src', 'data'), { recursive: true });
writeFileSync(outFile, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${outFile}:`, Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.length])));

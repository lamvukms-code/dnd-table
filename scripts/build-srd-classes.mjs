#!/usr/bin/env node
/**
 * SRD 5.2.1 PDF → client/public/srd/classes.json (one entry per class feature).
 *
 *   node scripts/build-srd-classes.mjs <SRD_CC_v5.2.1.pdf> [out.json]
 *
 * The SRD is CC BY 4.0 (© Wizards of the Coast LLC), so the output may live in the repo
 * with attribution (shown in the "Tra cứu" panel). Needs Poppler/Xpdf `pdftotext`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [pdf, outArg] = process.argv.slice(2);
if (!pdf) {
  console.error('usage: build-srd-classes.mjs <SRD.pdf> [out.json]');
  process.exit(1);
}
const out = outArg ?? 'client/public/srd/classes.json';

const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const raw = execFileSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = raw
  .replace(/\r/g, '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^(\d+ )?System Reference Document 5\.2\.1( \d+)?$/.test(l) && !/^\d+$/.test(l));

// class chapter: first standalone "Barbarian" line, up to "Character Origins"
const chapterStart = lines.indexOf('Barbarian', 200);
const chapterEnd = lines.indexOf('Character Origins', chapterStart);
if (chapterStart < 0 || chapterEnd < 0) throw new Error('class chapter not found');

const heads = [];
let from = chapterStart;
for (const c of CLASSES) {
  const i = lines.indexOf(c, from);
  if (i < 0 || i > chapterEnd) throw new Error(`class ${c} not found`);
  heads.push({ c, i });
  from = i + 1;
}

const entries = [];
for (let k = 0; k < heads.length; k++) {
  const { c, i } = heads[k];
  let chunk = lines.slice(i + 1, k + 1 < heads.length ? heads[k + 1].i : chapterEnd);

  // drop the "<Class> Features" level table (ends at the level-20 row)
  const t = chunk.findIndex((l) => l === `${c} Features`);
  if (t >= 0) {
    const e = chunk.findIndex((l, j) => j > t && /^20 \+6 /.test(l));
    if (e > t) chunk = [...chunk.slice(0, t), ...chunk.slice(e + 1)];
  }

  let cur = { name: 'Core Traits', level: 0, body: [] };
  const push = () => {
    if (cur.body.length) entries.push({ class: c, level: cur.level, name: cur.name, text: tidy(cur.body) });
  };
  for (const l of chunk) {
    const m = /^Level (\d+): (.+)$/.exec(l);
    if (m) {
      push();
      cur = { name: m[2], level: Number(m[1]), body: [] };
    } else cur.body.push(l);
  }
  push();
}

function tidy(body) {
  let s = '';
  for (const l of body) {
    if (!s) s = l;
    else if (/[a-z]-$/.test(s) && /^[a-z]/.test(l)) s = s.slice(0, -1) + l; // de-hyphenate
    else if (/[.:)]$/.test(s) && /^[A-Z][A-Za-z' -]{2,45}\.\s/.test(l)) s += '\n' + l; // new sub-feature
    else s += ' ' + l;
  }
  return s.replace(/�/g, '•').replace(/[ \t]+/g, ' ').trim();
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(entries));
console.log(`${entries.length} class entries → ${out}`);

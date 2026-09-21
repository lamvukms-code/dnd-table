#!/usr/bin/env node
/**
 * Clean the per-column Tesseract output of a 2024-format Monster Manual (scripts/ocr-book.mjs) into one
 * text stream that scripts/extract-monsters.mjs `--text` can parse:
 *   - strips box borders / page footers, joins columns in reading order,
 *   - repairs the ability-score table (OCR turns "Con 19" into "Conl9", "CONT7", "CHa9d"),
 *     recomputing scores from modifiers and save proficiency from the save column,
 *   - normalises section headings (TRAITS → Traits, Bonus ACTIONS → Bonus Actions),
 *   - fixes monster names against the book's own table of contents (OCR slips like "Abo1eth"),
 *   - reports anything it could not repair.
 *
 *   node scripts/mm-clean.mjs <ocrDir> <out.txt> [--toc toc.txt]
 *
 * LOCAL ONLY (book text): keep in git-ignored .srd-src/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const tocFile = flag('--toc');
const pdfPath = flag('--pdf');
const [dir, out] = args;
if (!dir || !out) {
  console.error('usage: mm-clean.mjs <ocrDir> <out.txt> [--toc toc.txt]');
  process.exit(1);
}

// ── canonical monster names from the table of contents ("Abo1eth ......@12") ──
const OCR_FIX = { 1: 'l', 9: 'g', 8: 'B', 4: 'A', 2: 'Z', 0: 'O', 5: 'S' };
function fixWord(w) {
  if (!/[A-Za-z]/.test(w)) return w;
  // digits inside a word are OCR slips for letters (Abo1eth, Wyrm1in9, 8oar)
  return w.replace(/[0-9]/g, (d, i) => (i === 0 && /[A-Z]/.test(w[1] ?? '') ? { 8: 'B', 4: 'A', 2: 'Z', 0: 'O', 5: 'S', 1: 'I', 9: 'G' }[d] : OCR_FIX[d]));
}
const names = [];
if (tocFile) {
  for (const l of readFileSync(tocFile, 'utf8').split('\n')) {
    const m = /^([A-Za-z0-9' ,-]+?)\s*[.,_-]{3,}.*?@?\s*(\d*)\s*$/.exec(l.replace(/\s+/g, ' '));
    const raw = m?.[1] ?? /^([A-Za-z0-9' -]{3,40})$/.exec(l)?.[1];
    if (!raw) continue;
    const n = raw
      .trim()
      .split(' ')
      .map(fixWord)
      .join(' ')
      .replace(/\bl\b/g, 'I');
    if (n.length >= 3 && /^[A-Z]/.test(n)) names.push(n);
  }
}
const normKey = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const byKey = new Map(names.map((n) => [normKey(n), n]));
function canonicalName(raw) {
  const k = normKey(raw);
  if (byKey.has(k)) return { name: byKey.get(k), ok: true };
  let best = null;
  for (const [nk, n] of byKey) {
    const d = lev(k, nk);
    if (!best || d < best.d) best = { d, n };
  }
  if (best && best.d <= Math.max(1, Math.floor(k.length * 0.15))) return { name: best.n, ok: true, fuzzy: true };
  return { name: raw, ok: false };
}

// ── line cleanup ──
function isAbilityHeader(l) {
  const w = l.split(' ');
  if (w.length < 2 || !w.every((t) => /^[A-Z.']{1,5}$/.test(t))) return false;
  return w.filter((t) => lev(t, 'SAVE') <= 1 || lev(t, 'MOD') <= 1 || lev(t, 'MOD.') <= 1).length >= 2;
}
const junkLine = (l) =>
  isAbilityHeader(l) || // "MOD SAVE MC SAVE AOD SAVE"
  /^[A-Z][A-Z'’ ,-]{2,}\s+\d{1,3}$/.test(l) || // "BERSERKERS 37"
  /^\d{1,3}\s+[A-Z][A-Z'’ ,-]{2,}$/.test(l) || // "36 CHAPTER 1"
  /^(MONSTER MANUAL|Monster Manual|CHAPTER \d+.*)$/.test(l) ||
  /^[^A-Za-z0-9]*$/.test(l);
const clean = (l) =>
  l
    .replace(/^[|_¢\s]+/, '')
    .replace(/[|\s]+$/, '')
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const SECTION_FIX = [
  [/^Traits?$/i, 'Traits'],
  [/^Actions$/i, 'Actions'],
  [/^Bonus Actions$/i, 'Bonus Actions'],
  [/^Reactions?$/i, 'Reactions'],
  [/^Legendary Actions$/i, 'Legendary Actions'],
];

// ── ability table: "Str 19 +4 +7 Dex 14 +2 +2 Conl9 +4 +7" ──
// Labels get glued to (and mangled with) their digits: "Conl4", "Coni2", "CnHal0", "CHATS", "StrR".
// Only the modifier / save columns are reliable, so each group is [label token][score?][mod][save] and the
// score is taken from the OCR only when it agrees with the modifier (else the even score for that modifier —
// same modifier, which is all that matters at the table).
const CONFUSABLE = { I: '1', i: '1', l: '1', '|': '1', T: '1', O: '0', o: '0', S: '5', B: '8', g: '9', Z: '2', '&': '8', ']': '1' };
const digitsOf = (t) => t.replace(/[IilTOoSBgZ|&\]]/g, (c) => CONFUSABLE[c]).replace(/[^0-9]/g, '');
const modOf = (s) => Math.floor((s - 10) / 2);
const signedNum = (t = '') => {
  // "+4" "−1" "-]" (= -1), or a bare "43" where the "+" was read as "4"
  const s = t.replace(/[−–]/g, '-').replace(/\]/g, '1');
  let m = /^([+-])([0-9IilOo]{1,2})$/.exec(s);
  if (m) return Number(m[1] + digitsOf(m[2]));
  m = /^4(\d)$/.exec(s);
  if (m) return Number(m[1]);
  return NaN;
};
const isSignedTok = (t) => Number.isFinite(signedNum(t));

/** "Str 8 -1 -1 Dex 16 +3 +6 Conl4 +2 42" → 3 groups of { label, score?, mod, save } (or null if not a row). */
function parseAbilityRow(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const starts = [];
  tokens.forEach((t, i) => {
    if (/^[A-Za-z|]/.test(t) && !isSignedTok(t)) starts.push(i);
  });
  if (starts.length < 2 || tokens.filter(isSignedTok).length < 4) return null;
  const groups = [];
  for (let n = 0; n < starts.length; n++) {
    const label = tokens[starts[n]];
    const rest = tokens.slice(starts[n] + 1, starts[n + 1] ?? tokens.length);
    const signed = rest.filter(isSignedTok);
    const [mod, save] = signed.length >= 2 ? [signed.at(-2), signed.at(-1)] : [signed[0], signed[0]];
    // score: digits glued to the label ("Conl4"), else a leading non-signed token
    const glued = /([IilTOoSBgZ|&0-9]+)$/.exec(label.slice(3))?.[1];
    const lead = rest.find((t) => !isSignedTok(t) && /\d/.test(t));
    groups.push({ label, scoreTok: glued ?? lead ?? '', mod, save });
  }
  return groups.length >= 3 ? groups.slice(-3) : groups;
}

const report = { unnamed: [], abilityFallback: [], fuzzyNames: [], acGuess: [], rescued: [], rescanFailed: [], sizeGuess: [] };

/** Rebuild the two ability lines from the (up to) two OCR rows; `where` labels the report. */
function repairAbilities(rows, pb, where) {
  const groups = [...(rows[0] ?? []), ...(rows[1] ?? [])];
  const order = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'];
  const sg = (n) => (n >= 0 ? `+${n}` : `-${-n}`);
  const res = order.map((ab, k) => {
    const g = groups[k];
    let mod = g ? signedNum(g.mod) : NaN;
    const ocrScore = g?.scoreTok ? Number(digitsOf(g.scoreTok)) : NaN;
    let score;
    if (Number.isFinite(mod) && Math.abs(mod) <= 10) {
      const cands = [10 + 2 * mod, 11 + 2 * mod];
      score = cands.includes(ocrScore) ? ocrScore : cands[0];
      if (!cands.includes(ocrScore)) report.abilityFallback.push(`${where} ${ab}: score ${g?.scoreTok ?? '?'} ≠ mod ${mod} → ${score}`);
    } else if (Number.isFinite(ocrScore) && ocrScore >= 1 && ocrScore <= 30) {
      score = ocrScore;
      mod = modOf(score);
    } else {
      score = 10;
      mod = 0;
      report.abilityFallback.push(`${where} ${ab}: UNREADABLE → 10`);
    }
    // save: proficient when the save column equals mod + PB (or is nearer to it than to mod)
    let save = mod;
    const saveTok = g ? signedNum(g.save) : NaN;
    if (Number.isFinite(saveTok) && Math.abs(saveTok - (mod + pb)) < Math.abs(saveTok - mod) && Math.abs(saveTok - (mod + pb)) <= 1) save = mod + pb;
    return `${ab} ${score} ${sg(mod)} ${sg(save)}`;
  });
  return [res.slice(0, 3).join(' '), res.slice(3).join(' ')];
}

// ── assemble ──
const files = readdirSync(dir).filter((f) => /^p\d+-[01]\.txt$/.test(f)).sort();
const outLines = [];
for (const f of files) {
  const page = Number(/p(\d+)/.exec(f)[1]);
  for (const raw of readFileSync(join(dir, f), 'utf8').replace(/\r/g, '').split('\n')) {
    const l = clean(raw);
    if (!l || junkLine(l)) continue;
    outLines.push({ l, page });
  }
}

// ── rescue for garbled header lines: re-OCR that page at 300 dpi (psm 6) and read the line from there ──
const GS = process.env.GS ?? 'C:/Program Files/VietOCR/gs10.07.1/bin/gswin64c.exe';
const TESS = process.env.TESSERACT ?? 'D:/Tesseract OCR/tesseract.exe';
const rescanCache = new Map();
function rescan(page) {
  if (!pdfPath) return [];
  if (rescanCache.has(page)) return rescanCache.get(page);
  const id = String(page).padStart(3, '0');
  const dir = join(dirname(out), 'mm-ocr300');
  mkdirSync(dir, { recursive: true });
  const txt = (i) => join(dir, `p${id}-${i}.txt`);
  if (!existsSync(txt(1))) {
    const png = join(dir, `p${id}.png`);
    const crop = join(dir, 'crop.ps1');
    writeFileSync(
      crop,
      'param($src,$dst)\nAdd-Type -AssemblyName System.Drawing\n$img=[System.Drawing.Bitmap]::FromFile($src)\n$half=[int]($img.Width/2)\nforeach($i in 0,1){\n  $wd=$half; if($i -eq 1){$wd=$img.Width-$half}\n  $r=New-Object System.Drawing.Rectangle(($i*$half),0,$wd,$img.Height)\n  $c=$img.Clone($r,$img.PixelFormat); $c.Save("$dst-$i.png",[System.Drawing.Imaging.ImageFormat]::Png); $c.Dispose()\n}\n$img.Dispose()\n',
    );
    try {
      execFileSync(GS, ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', '-r300', `-dFirstPage=${page}`, `-dLastPage=${page}`, `-sOutputFile=${png}`, pdfPath]);
      execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', crop, '-src', png, '-dst', join(dir, `c${id}`)]);
      for (const i of [0, 1]) {
        execFileSync(TESS, [join(dir, `c${id}-${i}.png`), join(dir, `p${id}-${i}`), '--psm', '6'], { stdio: 'ignore' });
        rmSync(join(dir, `c${id}-${i}.png`), { force: true });
      }
      rmSync(png, { force: true });
    } catch (e) {
      report.rescanFailed.push(`p${page}: ${String(e.message).split('\n')[0]}`);
    }
  }
  const lines = [0, 1].flatMap((i) => (existsSync(txt(i)) ? readFileSync(txt(i), 'utf8').split('\n') : [])).map(clean).filter(Boolean);
  rescanCache.set(page, lines);
  return lines;
}
/** The line after (or containing) the block's "Initiative +N (M)" signature in the 300-dpi rescan. */
function rescanNear(page, acLine, want) {
  const ini = /Initiative\s+([+-]\d+)\s+\((\d+)\)/.exec(acLine);
  if (!ini) return null;
  const lines = rescan(page);
  const sig = `Initiative ${ini[1]} (${ini[2]})`;
  const idx = lines.findIndex((x) => x.replace(/lnitiative/, 'Initiative').includes(sig));
  if (idx < 0) return null;
  if (want === 'AC') return /(?:AC\s*)(\d{1,2})\b/.exec(lines[idx])?.[1] ?? null;
  for (let k = idx + 1; k <= idx + 3; k++) if (/^HP\s*[\dIlO]+\s*\(/.test(lines[k] ?? '')) return lines[k];
  return null;
}

const final = [];
for (let i = 0; i < outLines.length; i++) {
  let { l, page } = outLines[i];
  // section headings
  const sec = SECTION_FIX.find(([re]) => re.test(l));
  if (sec) {
    final.push(sec[1]);
    continue;
  }
  // "Bonus ACTIONS" written half in caps
  if (/^Bonus\s+actions$/i.test(l)) {
    final.push('Bonus Actions');
    continue;
  }
  // "sity, Chaotic Evil": the first half of the size/type line was lost — rebuild it (size is a guess: flagged)
  if (/^[a-z]{2,8},\s*(Lawful|Chaotic|Neutral|Unaligned|Any)\b/.test(l) && /^AC\b/.test(outLines[i + 1]?.l ?? '')) {
    const TYPE_TAIL = { sity: 'Monstrosity', ration: 'Aberration', tion: 'Aberration', ntal: 'Elemental', ial: 'Celestial', ead: 'Undead', ruct: 'Construct', ast: 'Beast', iend: 'Fiend', noid: 'Humanoid', lant: 'Plant', ooze: 'Ooze', gon: 'Dragon', iant: 'Giant', ey: 'Fey' };
    const head = l.split(',')[0];
    const type = Object.entries(TYPE_TAIL).find(([t]) => head.endsWith(t))?.[1];
    if (type) {
      report.sizeGuess.push(`p${page}: "${l}" → Medium ${type} (size unread — verify)`);
      l = `Medium ${type}, ${l.split(',').slice(1).join(',').trim()}`;
    }
  }
  // stat block: size line followed (within 3 lines) by "AC n"
  if (/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*,\s*[A-Za-z ,()-]+$/.test(l) && /^AC\s*[\dIl|]+/.test(outLines[i + 1]?.l ?? '')) {
    // name = closest preceding ALLCAPS-ish heading
    let name = final.at(-1) ?? '';
    const isHeading = /^[A-Za-z][A-Za-z'’ ,-]{2,50}$/.test(name) && (name === name.toUpperCase() || /[A-Z]{3,}/.test(name));
    if (!isHeading) {
      name = '';
      for (let j = final.length - 1; j >= Math.max(0, final.length - 40); j--) {
        if (/^[A-Z][A-Z'’ ,-]{2,50}$/.test(final[j])) {
          name = final[j];
          break;
        }
      }
      if (name) final.push(name);
    }
    const key = name.replace(/\s+/g, ' ');
    const cn = canonicalName(key.toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase()));
    if (!name || !cn.ok) report.unnamed.push(`p${page}: "${name || '?'}"`);
    else if (cn.fuzzy) report.fuzzyNames.push(`p${page}: ${name} → ${cn.name}`);
    if (final.length && final.at(-1) === name) final.pop();
    final.push((cn.name || `UNKNOWN p${page}`).toUpperCase());
    final.push(l);
    continue;
  }
  // ability rows: "Str 19 +4 +7 Dex …" — rebuild both rows from the OCR. The box is sometimes read with the
  // Int/Wis/Cha row first ("str" in lowercase, etc.), so key off the "Speed" line just above and sort by label.
  if (parseAbilityRow(l) && final.slice(-4).some((x) => /^Speed\b/.test(x)) && !/^(Skills|Senses|Gear|Languages|Immun|Resist|Vulner)/.test(l)) {
    let pb = 2; // PB from the CR line further down
    for (let j = i; j < Math.min(outLines.length, i + 30); j++) {
      const m = /PB\s*[+t]?\s*(\d)/.exec(outLines[j].l);
      if (m) {
        pb = Number(m[1]);
        break;
      }
    }
    const found = [{ row: parseAbilityRow(l), text: l }];
    let used = 0;
    for (let k = 1; k <= 3 && found.length < 2; k++) {
      const t = outLines[i + k]?.l ?? '';
      const r = parseAbilityRow(t);
      if (r && !/^(Skills|Senses|Gear|Languages|Immun|Resist|Vulner)/.test(t)) {
        found.push({ row: r, text: t });
        used = k;
      }
    }
    // the Str/Dex/Con row starts with a label beginning "S"/"s"; the Int/Wis/Cha row with "I"/"i"/"l"
    found.sort((a, b) => Number(/^[Ii|l]/.test(a.text)) - Number(/^[Ii|l]/.test(b.text)));
    const [a1, b1] = repairAbilities(found.map((f) => f.row), pb, `p${page}`);
    final.push(a1, b1);
    i += used;
    continue;
  }
  // frequent single-glyph confusions in the stat-line keywords
  l = l
    .replace(/^lnitiative\b/, 'Initiative')
    .replace(/\bInitiative\s+/, 'Initiative ')
    .replace(/^AC\s*([Il|])(\d)/, 'AC 1$2')
    .replace(/^(HP|AC|Speed)[.:,;]+\s*/, '$1 ')
    .replace(/^Speed\s/, 'Speed ')
    .replace(/^Challenge\s+(?=[\dOIl/])/i, 'CR ')
    .replace(/^CR\s*([0-9OoIl/]+)\s*\(/, (m, n) => `CR ${n.replace(/[Oo]/g, '0').replace(/[Il]/g, '1')} (`)
    .replace(/^HP\s*([0-9OoIl]+)\s*\(/, (m, n) => `HP ${n.replace(/[Oo]/g, '0').replace(/[Il]/g, '1')} (`);
  // "/act Initiative +0 (10)": the "AC n" got mangled — keep the block, flag it, and guess from Initiative (10 + mod)
  if (/^[^A-Za-z]?[A-Za-z/|]{0,4}\s*(?:Initiative|lnitiative)\s+[+-]\d+/.test(l) && !/^AC\b/.test(l) && /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.test(final.at(-1) ?? '')) {
    // "ACIS" → 15, "ACB" → 8: read what digits survive, else fall back to 10
    const glued = /^[^A-Za-z]*(?:AC|ac|jac|}ac)([A-Za-z0-9]{1,3})/i.exec(l)?.[1] ?? '';
    const n = Number(digitsOf(glued));
    const who = final.at(-2) ?? '';
    const rescued = Number(rescanNear(page, l, 'AC'));
    let ac;
    if (rescued >= 5 && rescued <= 30) {
      ac = rescued;
      report.rescued.push(`p${page} ${who}: AC ${ac} (300-dpi rescan)`);
    } else {
      ac = n >= 5 && n <= 25 ? n : 10;
      report.acGuess.push(`p${page} ${who}: "${l}" → AC ${ac} (verify)`);
    }
    l = l.replace(/^.*?(Initiative)/, `AC ${ac} $1`);
  }
  // header without a readable HP line ("Se Yee (tac + 52)"): read it from a 300-dpi rescan
  if (/^AC\s+\d+.*Initiative/.test(l) && /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.test(final.at(-1) ?? '')) {
    const nx = (outLines[i + 1]?.l ?? '').replace(/^(HP|AC|Speed)[.:,;]+\s*/, '$1 ');
    if (!/^HP\s*[\dIlO]+\s*\(/.test(nx) && !/^HP\s*[\dIlO]+\s*$/.test(nx)) {
      const hp = rescanNear(page, l, 'HP');
      const who = final.at(-2) ?? '';
      if (hp) {
        final.push(l, hp.replace(/^HP\s*([0-9OoIl]+)\s*\(/, (m, n) => `HP ${n.replace(/[Oo]/g, '0').replace(/[Il]/g, '1')} (`));
        if (!/^Speed\b/.test(nx)) i += 1; // drop the garbled line
        report.rescued.push(`p${page} ${who}: HP line (300-dpi rescan)`);
        continue;
      }
      report.acGuess.push(`p${page} ${who}: HP line unreadable ("${nx}") — needs manual check`);
    }
  }
  final.push(l);
}

// ── some boxes are read out of order ("Skills…/Senses…" before "AC …"): put every stat block header in canonical order ──
const SIZE_LINE = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*,\s*[A-Za-z ,()-]+$/;
const SECTION_LINE = /^(Traits|Actions|Bonus Actions|Reactions|Legendary Actions)$/;
const META_KEY = /^(Skills|Saving Throws|Resistances|Immunities|Vulnerabilities|Senses|Languages|Gear)\b/;
for (let s = 0; s < final.length; s++) {
  if (!SIZE_LINE.test(final[s])) continue;
  let e = s + 1;
  while (e < final.length && e < s + 40 && !SECTION_LINE.test(final[e]) && !SIZE_LINE.test(final[e])) e++;
  if (e >= final.length || !SECTION_LINE.test(final[e])) continue;
  const win = final.slice(s + 1, e);
  const ac = win.filter((l) => /^AC\b/.test(l));
  const hp = win.filter((l) => /^HP\b/.test(l));
  const sp = win.filter((l) => /^Speed\b/.test(l));
  const ab = win.filter((l) => /^(Str|Dex|Con|Int|Wis|Cha) \d/.test(l));
  const cr = win.filter((l) => /^CR\b/.test(l));
  if (!ac.length || !hp.length || !cr.length) continue;
  // meta entries (with wrapped continuation lines) in original order
  const meta = [];
  const taken = new Set([...ac, ...hp, ...sp, ...ab, ...cr]);
  for (const l of win) {
    if (taken.has(l)) continue;
    if (META_KEY.test(l) || !meta.length) meta.push(l);
    else meta[meta.length - 1] += ' ' + l;
  }
  const rebuilt = [ac[0], hp[0], ...sp, ...ab, ...meta, cr[0]];
  if (rebuilt.join('\n') !== win.join('\n')) final.splice(s + 1, win.length, ...rebuilt);
}
writeFileSync(out, final.join('\n'));
console.log(`${final.length} lines → ${out}; TOC names: ${names.length}`);
console.log(`unnamed: ${report.unnamed.length}, fuzzy names: ${report.fuzzyNames.length}, ability fallbacks: ${report.abilityFallback.length}`);
writeFileSync(out.replace(/\.txt$/, '.report.txt'), Object.entries(report).map(([k, v]) => `## ${k}\n${v.join('\n')}`).join('\n\n'));

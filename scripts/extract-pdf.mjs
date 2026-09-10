#!/usr/bin/env node
/**
 * Extract a PDF to plain text, page by page, with an OCR fallback for pages that
 * have no text layer (chapter-splash art, scanned tables, decorative pages).
 *
 *   node scripts/extract-pdf.mjs <input.pdf> [outDir] [--ocr] [--json path.json]
 *
 * Outputs (in <outDir>, default "<pdf dir>/extract"):
 *   <name>.txt          full text, each page prefixed with "[[page N]]"
 *   <name>.pages.json   [{ page, chars, ocr }]
 *   <name>.lorebook.json  { source, generatedAt, pages: [{ page, text }] }
 *
 * Tools (looked up on PATH, then common Windows install dirs, then env):
 *   pdftotext   — Poppler        (env PDFTOTEXT)
 *   gs          — Ghostscript    (env GS_BIN)      — only for --ocr
 *   tesseract   — Tesseract OCR  (env TESSERACT)   — only for --ocr
 *
 * NOTE: the extracted text is whatever is in YOUR PDF. If the book is
 * copyrighted, keep the output out of the repo (it is git-ignored under
 * client/src/data/). This script contains no book content.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const MIN_CHARS = 40; // a page with fewer non-space chars is treated as "no text layer"

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const jsonAt = (() => {
  const i = args.indexOf('--json');
  return i >= 0 ? args[i + 1] : null;
})();

const pdf = positional[0];
if (!pdf || !existsSync(pdf)) {
  console.error('Usage: node scripts/extract-pdf.mjs <input.pdf> [outDir] [--ocr] [--json path.json]');
  process.exit(1);
}
const name = basename(pdf, extname(pdf)).replace(/[^\w.-]+/g, '_');
const outDir = positional[1] || join(dirname(pdf), 'extract');
mkdirSync(outDir, { recursive: true });

function which(bin, envVar, winDirs) {
  if (process.env[envVar] && existsSync(process.env[envVar])) return process.env[envVar];
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
    for (const e of exts) {
      const p = join(dir, bin + e);
      if (p && existsSync(p)) return p;
    }
  }
  for (const d of winDirs || []) if (existsSync(d)) return d;
  return null;
}

const PDFTOTEXT = which('pdftotext', 'PDFTOTEXT', ['C:/Program Files/Git/mingw64/bin/pdftotext.exe']);
if (!PDFTOTEXT) {
  console.error('pdftotext not found. Install Poppler (Git for Windows bundles it in mingw64/bin).');
  process.exit(1);
}

console.log(`pdftotext: ${PDFTOTEXT}`);
const full = execFileSync(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', pdf, '-'], {
  maxBuffer: 512 * 1024 * 1024,
}).toString('utf8');
const pages = full.split('\f');
// pdftotext appends a trailing form-feed; drop an empty tail element
if (pages.length && pages[pages.length - 1].trim() === '') pages.pop();
console.log(`pages: ${pages.length}`);

let GS = null;
let TESS = null;
if (flags.has('--ocr')) {
  GS = which('gswin64c', 'GS_BIN', [
    'C:/Program Files/gs/bin/gswin64c.exe',
    'C:/Program Files/VietOCR/gs10.07.1/bin/gswin64c.exe',
  ]) || which('gs', 'GS_BIN', []);
  TESS = which('tesseract', 'TESSERACT', ['C:/Program Files/Tesseract-OCR/tesseract.exe', 'D:/Tesseract OCR/tesseract.exe']);
  console.log(`ghostscript: ${GS || '(missing — OCR skipped)'}`);
  console.log(`tesseract:   ${TESS || '(missing — OCR skipped)'}`);
}

function ocrPage(n) {
  if (!GS || !TESS) return '';
  const png = join(tmpdir(), `extractpdf_${process.pid}_${n}.png`);
  try {
    execFileSync(GS, [
      '-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', '-r300',
      `-dFirstPage=${n}`, `-dLastPage=${n}`, `-sOutputFile=${png}`, pdf,
    ], { stdio: 'ignore' });
    const out = execFileSync(TESS, [png, 'stdout', '-l', 'eng', '--psm', '1'], {
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString('utf8');
    return out.trim();
  } catch {
    return '';
  } finally {
    rmSync(png, { force: true });
  }
}

const meta = [];
const chunks = [];
const parts = [];
pages.forEach((text, i) => {
  const page = i + 1;
  const solid = text.replace(/\s/g, '').length;
  let ocr = false;
  let body = text;
  if (solid < MIN_CHARS && flags.has('--ocr')) {
    const o = ocrPage(page);
    if (o.replace(/\s/g, '').length > solid) {
      body = o;
      ocr = true;
    }
  }
  const chars = body.replace(/\s/g, '').length;
  meta.push({ page, chars, ocr });
  parts.push(`\n\n[[page ${page}]]\n\n${body.trimEnd()}\n`);
  if (chars >= MIN_CHARS) chunks.push({ page, text: body.replace(/[ \t]+\n/g, '\n').trim() });
  if (page % 50 === 0) process.stdout.write(`  …page ${page}\n`);
});

writeFileSync(join(outDir, `${name}.txt`), parts.join('').trimStart() + '\n');
writeFileSync(join(outDir, `${name}.pages.json`), JSON.stringify(meta, null, 1));
const lorebook = {
  source: basename(pdf),
  generatedAt: new Date().toISOString(),
  pageCount: pages.length,
  pages: chunks,
};
writeFileSync(join(outDir, `${name}.lorebook.json`), JSON.stringify(lorebook));
if (jsonAt) {
  mkdirSync(dirname(jsonAt), { recursive: true });
  writeFileSync(jsonAt, JSON.stringify(lorebook));
}

const ocrCount = meta.filter((m) => m.ocr).length;
const emptyCount = meta.filter((m) => m.chars < MIN_CHARS).length;
console.log(
  `\ndone → ${outDir}\n  ${chunks.length} pages with text` +
    (flags.has('--ocr') ? `, ${ocrCount} recovered by OCR` : '') +
    `, ${emptyCount} still empty (art / blank)`,
);
if (jsonAt) console.log(`  lore-book data → ${jsonAt}`);

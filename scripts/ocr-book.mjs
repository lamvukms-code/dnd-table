#!/usr/bin/env node
/**
 * Re-OCR a scanned two-column rulebook PDF page by page (Ghostscript render → left/right column crop →
 * Tesseract), writing `<out>/pNNN-0.txt` (left column) and `pNNN-1.txt` (right column).
 * The PDF's own OCR layer is too noisy for stat blocks; this gives clean digits and reading order.
 *
 *   node scripts/ocr-book.mjs <book.pdf> <outDir> [--from 1] [--to 391] [--jobs 6] [--dpi 200]
 *
 * Windows paths for Ghostscript / Tesseract are configurable via GS and TESSERACT env vars.
 * LOCAL ONLY: the output is book text — keep it in a git-ignored folder (.srd-src/), never commit it.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const from = Number(flag('--from', 1));
const to = Number(flag('--to', 9999));
const jobs = Number(flag('--jobs', 6));
const dpi = Number(flag('--dpi', 200));
const [pdf, out] = args;
if (!pdf || !out) {
  console.error('usage: ocr-book.mjs <book.pdf> <outDir> [--from n] [--to n] [--jobs n] [--dpi n]');
  process.exit(1);
}
const GS = process.env.GS ?? 'C:/Program Files/VietOCR/gs10.07.1/bin/gswin64c.exe';
const TESS = process.env.TESSERACT ?? 'D:/Tesseract OCR/tesseract.exe';
mkdirSync(out, { recursive: true });
const tmp = join(out, '_tmp');
mkdirSync(tmp, { recursive: true });

const CROP = `
param($src,$dst)
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile($src)
$half=[int]($img.Width/2)
foreach($i in 0,1){
  $wd=$half; if($i -eq 1){$wd=$img.Width-$half}
  $r=New-Object System.Drawing.Rectangle(($i*$half),0,$wd,$img.Height)
  $c=$img.Clone($r,$img.PixelFormat); $c.Save("$dst-$i.png",[System.Drawing.Imaging.ImageFormat]::Png); $c.Dispose()
}
$img.Dispose()
`;
const cropScript = join(tmp, 'crop.ps1');
writeFileSync(cropScript, CROP);

// total pages
const info = await run(GS, ['-q', '-dNODISPLAY', '-dNOSAFER', '-c', `(${pdf}) (r) file runpdfbegin pdfpagecount = quit`]);
const total = Math.min(to, Number(info.stdout.trim()));
const pages = [];
for (let p = from; p <= total; p++) if (!existsSync(join(out, `p${String(p).padStart(3, '0')}-1.txt`))) pages.push(p);
console.log(`${pages.length} pages to OCR (of ${total})`);

async function doPage(p) {
  const id = String(p).padStart(3, '0');
  const png = join(tmp, `p${id}.png`);
  await run(GS, ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', `-r${dpi}`, `-dFirstPage=${p}`, `-dLastPage=${p}`, `-sOutputFile=${png}`, pdf]);
  const base = join(tmp, `c${id}`);
  await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cropScript, '-src', png, '-dst', base]);
  for (const i of [0, 1]) {
    await run(TESS, [`${base}-${i}.png`, join(out, `p${id}-${i}`), '--psm', '4']).catch(() => {});
    rmSync(`${base}-${i}.png`, { force: true });
  }
  rmSync(png, { force: true });
}

let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < pages.length) {
      const p = pages[next++];
      try {
        await doPage(p);
      } catch (e) {
        console.error(`page ${p}: ${e.message.split('\n')[0]}`);
      }
      if (++done % 20 === 0) console.log(`${done}/${pages.length}`);
    }
  }),
);
rmSync(tmp, { recursive: true, force: true });
console.log('done');

#!/usr/bin/env node
/**
 * Finalize the OCR'd Monster Manual stat blocks (scripts/mm-clean.mjs → extract-monsters.mjs --text):
 * resolves names the OCR lost (from the book's table of contents + creature names used in the block's own
 * text), drops what the SRD already ships (client/public/srd/monsters.json), de-duplicates, validates the numbers
 * (HP average, damage average vs dice, proficiency bonus vs CR, attack bonus vs ability modifiers) and fixes the
 * clear one-digit OCR slips. Writes the importable bestiary JSON plus a Markdown checklist of what to double-check.
 *
 *   node scripts/mm-finalize.mjs <mm-raw.json> <toc.txt> <out.bestiary.json> [--srd client/public/srd/monsters.json]
 *
 * LOCAL ONLY (book content): never commit the output.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(n);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const srdPath = flag('--srd', 'client/public/srd/monsters.json');
const [rawPath, tocPath, outPath] = args;
if (!rawPath || !tocPath || !outPath) {
  console.error('usage: mm-finalize.mjs <mm-raw.json> <toc.txt> <out.json> [--srd file]');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const srd = JSON.parse(readFileSync(srdPath, 'utf8'));
const key = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const srdKeys = new Set(srd.map((m) => key(m.name)));

// ── canonical names (TOC) ──
const OCR = { 1: 'l', 9: 'g', 8: 'B', 4: 'A', 2: 'Z', 0: 'O', 5: 'S' };
const fixWord = (w) =>
  !/[A-Za-z]/.test(w) ? w : w.replace(/[0-9]/g, (d, i) => (i === 0 && /[A-Z]/.test(w[1] ?? '') ? { 8: 'B', 4: 'A', 2: 'Z', 0: 'O', 5: 'S', 1: 'I', 9: 'G' }[d] : OCR[d]));
const tocNames = [];
for (const l of readFileSync(tocPath, 'utf8').split('\n')) {
  const m = /^([A-Za-z0-9' ,-]+?)\s*[.,_-]{3,}.*?@?\s*(\d*)\s*$/.exec(l.replace(/\s+/g, ' '));
  if (!m) continue;
  const n = m[1].trim().split(' ').map(fixWord).join(' ').replace(/\bl\b/g, 'I').replace(/([a-z])([A-Z])/g, (x, a, b) => (b === 'Z' ? a + 'z' : x));
  if (n.length >= 3 && /^[A-Z]/.test(n) && !/^(Habitat|App)/.test(n)) tocNames.push(n);
}
const NAME_FIX = {
  // TOC OCR slips / known oddities
  'mezzoloth': 'Mezzoloth', 'psychicgrayooze': 'Psychic Gray Ooze', 'fiendcuitist': 'Fiend Cultist',
  'yuantiinfiltrator': 'Yuan-ti Infiltrator', 'yuantiinfiltrator ': 'Yuan-ti Infiltrator',
  'willowisp': "Will-o'-Wisp", 'gnollfangofyeenoghu': 'Gnoll Fang of Yeenoghu',
};
const tocSet = new Map();
for (const n of tocNames) tocSet.set(key(n), NAME_FIX[key(n)] ?? n);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const known = new Map([...tocSet, ...srd.map((m) => [key(m.name), m.name])]);
function nearestKnown(name) {
  const k = key(name);
  if (known.has(k)) return known.get(k);
  let best = null;
  for (const [kk, n] of known) {
    const d = lev(k, kk);
    if (!best || d < best.d) best = { d, n };
  }
  return best && best.d <= (k.length >= 8 ? 2 : 1) ? best.n : null;
}

const srdBySig = new Map(srd.map((m) => [`${m.size}|${m.cr}|${m.ac}|${m.maxHp}`, m]));
const textOf = (m) => [...(m.traits ?? []).map((t) => t.description), ...(m.actions ?? []).map((a) => a.description)].join(' ').toLowerCase();
const notes = []; // human-review log

// 1. resolve names
const claimed = new Set();
const resolved = [];
// OCR slips inside names: "GargoyIe" "OwI" "PIanetar" (capital I for l), "Remorha 2" (2 for z)
const cleanName = (n) =>
  n
    .replace(/(?<=[A-Za-z])I(?=[a-z])/g, 'l')
    .replace(/(?<=[a-z])I\b/g, 'l')
    .replace(/(?<=[a-z]) ?2\b/g, 'z')
    .replace(/\s+/g, ' ')
    .trim();
for (const m of raw) {
  m.name = cleanName(m.name);
  let name = nearestKnown(m.name);
  resolved.push({ m, name });
  if (name) claimed.add(key(name));
}
// A second stat block under the same heading ("Grick" ×2, "Faerie Dragon Youth" ×2): its own name is missing, so
// take an unclaimed table-of-contents name that starts with the same word(s).
{
  const seen = new Map();
  for (const r of resolved) {
    if (!r.name) continue;
    const k = key(r.name);
    if (!seen.has(k)) {
      seen.set(k, r);
      continue;
    }
    if (srdKeys.has(k)) continue;
    const first = r.name.split(' ')[0].toLowerCase();
    const cands = [...tocSet].filter(([kk, n]) => !srdKeys.has(kk) && !claimed.has(kk) && n.toLowerCase().startsWith(first + ' '));
    if (cands.length >= 1) {
      const [kk, n] = cands[0];
      notes.push(`Second block under "${r.name}" named from the table of contents: ${n}${cands.length > 1 ? ' (ambiguous: ' + cands.map((c) => c[1]).join(' / ') + ')' : ''}`);
      r.name = n;
      claimed.add(kk);
    }
  }
}
// a heading that still looks like a monster name (the OCR'd table of contents is incomplete, so not every real name is in it)
const looksLikeName = (n) =>
  /^[A-Z][A-Za-z'’-]+(?: (?:of|the|[A-Z][A-Za-z'’-]+)){0,3}$/.test(n) &&
  !/^(A|An|And|The|We|To|It|Are|Account|Fantastic|Unknown)\b/i.test(n) &&
  !/\b(Lairs?|Secrets?|Negotiations?|Metamorphoses|Modrons|Spies|Priests|Dragons|Animals|Spread|Summons|Cataclysm|Anathemas)$/i.test(n);
// headings the OCR picked up wrongly, identified from the block's own traits/actions
const RAW_NAME_OVERRIDES = { Aod: 'Yuan-ti Malison' };
const unclaimed = () => [...tocSet].filter(([k]) => !srdKeys.has(k) && !claimed.has(k)).map(([, n]) => n);
for (const r of resolved) {
  if (RAW_NAME_OVERRIDES[r.m.name]) {
    notes.push(`Heading "${r.m.name}" identified from the block's traits/actions: ${RAW_NAME_OVERRIDES[r.m.name]}`);
    r.name = RAW_NAME_OVERRIDES[r.m.name];
    continue;
  }
  if (r.name || looksLikeName(r.m.name)) continue; // only junk headings are guessed from the block text
  const text = textOf(r.m);
  const scored = unclaimed()
    .map((n) => {
      const nl = n.toLowerCase();
      const last = nl.split(' ').at(-1);
      const hits = (text.match(new RegExp(`\\b${nl.replace(/[-']/g, '.?')}\\b`, 'g')) ?? []).length + 0.5 * (text.match(new RegExp(`\\b${last}\\b`, 'g')) ?? []).length;
      return { n, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (scored.length && (scored.length === 1 || scored[0].hits > scored[1].hits)) {
    r.name = scored[0].n;
    claimed.add(key(r.name));
    notes.push(`Name recovered from block text: "${r.m.name}" → ${r.name}`);
  }
}

// 2. build entries: drop SRD dups + unresolved junk headings, de-duplicate
const PB_OF_CR = (cr) => {
  const v = cr.includes('/') ? Number(cr.split('/')[0]) / Number(cr.split('/')[1]) : Number(cr);
  return v < 5 ? 2 : v < 9 ? 3 : v < 13 ? 4 : v < 17 ? 5 : v < 21 ? 6 : v < 25 ? 7 : v < 29 ? 8 : 9;
};
const size = (n) => Math.floor((n - 1) / 2) - 4;
const byName = new Map();
const dropped = [];
for (const { m, name: resolvedName } of resolved) {
  let name = resolvedName;
  let unverified = false;
  if (!name) {
    // not in the (noisy) table of contents: keep it when it still looks like a monster name
    if (!looksLikeName(m.name)) {
      dropped.push(`${m.name} (no name match)`);
      continue;
    }
    // "Brazen Gorgon": a lore heading glued to an SRD monster's name → that SRD monster (already shipped)
    if ([...srdKeys].some((k) => k.length >= 5 && key(m.name).endsWith(k))) continue;
    name = m.name;
    unverified = true;
  }
  name = cleanName(name);
  if (/\b(Cataclysm|Lore)$/i.test(name)) {
    dropped.push(`${name} (section heading, not a monster)`);
    continue;
  }
  // already in the SRD database (exact, or one/two OCR slips away: "GargoyIe", "Bttercap")
  const kn = key(name);
  if ([...srdKeys].some((k) => k === kn || lev(k, kn) <= (kn.length >= 8 ? 2 : 1))) continue;
  // a heading glued to a monster the SRD already ships (Mummy, Blink Dog, Treant, Guard …): same size/CR/AC/HP
  const sig = `${m.size}|${m.cr}|${m.ac}|${m.maxHp}`;
  const twin = srdBySig.get(sig);
  const actionNames = (x) => new Set((x.actions ?? []).map((a) => a.name.toLowerCase().replace(/\s*\(.*$/, '')).filter((a) => a !== 'multiattack'));
  if (twin && twin.meta === m.meta && [...actionNames(m)].some((a) => actionNames(twin).has(a))) {
    notes.push(`Dropped "${name}": same size/CR/AC/HP and attacks as SRD ${twin.name}`);
    continue;
  }
  const score = (m.traits?.length ?? 0) + (m.actions?.length ?? 0);
  const prev = byName.get(key(name));
  if (prev && prev.score >= score) continue;
  byName.set(key(name), { m: { ...m, name, _unverified: unverified }, score });
}

// 3. validate + fix
const avg = (dice) => {
  const p = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(dice.replace(/\s+/g, ''));
  if (!p) return null;
  return Math.floor((Number(p[1]) * (Number(p[2]) + 1)) / 2) + (p[3] ? (p[3] === '-' ? -1 : 1) * Number(p[4]) : 0);
};
const abilMod = (s) => Math.floor((s - 10) / 2);
const out = [];
for (const { m } of [...byName.values()].sort((a, b) => a.m.name.localeCompare(b.m.name))) {
  // "Small Fey ( id), Chaotic Neutral": an unreadable "(Goblinoid)" tag → drop the garbage parentheses
  m.meta = m.meta.replace(/\(\s*[A-Za-z]{0,3}\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+,/g, ',');
  const flags = m._unverified ? ['name not in table of contents — verify'] : [];
  delete m._unverified;
  const id = `mm-${key(m.name).length ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : m.id}`;
  m.id = id;
  m.tags = ['mm2024'];
  m.source = 'Monster Manual (2024) — personal use, OCR-extracted';
  // PB from CR
  const pb = PB_OF_CR(m.cr || '0');
  if (m.cr && m.proficiencyBonus !== pb) {
    flags.push(`PB ${m.proficiencyBonus} → ${pb} (from CR ${m.cr})`);
    m.proficiencyBonus = pb;
  }
  // HP average vs formula
  if (m.hpFormula) {
    const a = avg(m.hpFormula);
    if (a != null && a !== m.maxHp) {
      const p = /^(\d+)d(\d+)([+-]\d+)?$/.exec(m.hpFormula);
      // one-digit slip in HP → trust the formula (dice + Con mod are printed together)
      const conMod = abilMod(m.abilities.con);
      const fromDice = p ? Math.floor((Number(p[1]) * (Number(p[2]) + 1)) / 2) + Number(p[1]) * conMod : null;
      if (fromDice === m.maxHp) {
        // formula's flat bonus = dice count × Con mod: the printed bonus is the slip
        const fixed = `${p[1]}d${p[2]}${p[1] * conMod ? (p[1] * conMod > 0 ? '+' : '') + p[1] * conMod : ''}`;
        flags.push(`HP formula ${m.hpFormula} → ${fixed}`);
        m.hpFormula = fixed;
      } else {
        flags.push(`HP ${m.maxHp} ≠ avg of ${m.hpFormula} (${a}) — check`);
      }
    }
  }
  // damage averages in actions
  for (const act of m.actions ?? []) {
    act.description = act.description.replace(/\b(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/g, (all, n, dice) => {
      const a = avg(dice);
      if (a == null || a === Number(n)) return all;
      // try to repair a one-digit dice-count / bonus slip so the average matches
      const p = /^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(dice);
      const cands = [];
      for (let c = 1; c <= 20; c++) {
        const d2 = `${c}d${p[2]}${p[3] ? p[3] + p[4] : ''}`;
        if (avg(d2) === Number(n) && Math.abs(c - Number(p[1])) <= 1) cands.push(d2);
      }
      if (p[3] || true) {
        for (let b = 0; b <= 20; b++) {
          const d2 = `${p[1]}d${p[2]}${b ? '+' + b : ''}`;
          if (avg(d2) === Number(n) && Math.abs(b - Number(p[4] ?? 0)) <= 1) cands.push(d2);
        }
      }
      if (cands.length === 1) {
        flags.push(`${act.name}: ${dice} → ${cands[0]} (avg ${n})`);
        return `${n} (${cands[0].replace(/([+-])/, ' $1 ')})`;
      }
      flags.push(`${act.name}: ${n} (${dice}) average mismatch — check`);
      return all;
    });
    // refresh the structured damage field from the (possibly repaired) text
    const main = /(?:Hit|Failure):\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/i.exec(act.description);
    if (main) act.damage = main[1].replace(/\s+/g, '');
  }
  // attack bonus should be PB + an ability modifier
  for (const act of m.actions ?? []) {
    if (typeof act.attackBonus !== 'number') continue;
    const need = act.attackBonus - m.proficiencyBonus;
    const mods = Object.values(m.abilities).map(abilMod);
    if (!mods.includes(need) && !mods.includes(need + m.proficiencyBonus)) flags.push(`${act.name}: attack ${act.attackBonus >= 0 ? '+' : ''}${act.attackBonus} matches no ability + PB — check`);
  }
  // swallowed lore / footers
  for (const act of m.actions ?? []) if (act.description.length > 900) flags.push(`${act.name}: long text (${act.description.length}) — lore may have leaked in`);
  if ((m.actions?.length ?? 0) === 0 && (m.traits?.length ?? 0) === 0) flags.push('no traits/actions parsed');
  if (flags.length) {
    m.notes = [m.notes, `[review] ${flags.join('; ')}`].filter(Boolean).join('\n');
    notes.push(`${m.name}: ${flags.join('; ')}`);
  }
  m._flags = flags.length;
  out.push(m);
}

for (const m of out) delete m._flags;
writeFileSync(outPath, JSON.stringify(out, null, 2));

// Markdown summary
const md = [
  '# Monster Manual (2024) — quái ngoài SRD (trích OCR, chỉ dùng cá nhân)',
  '',
  '> Nội dung sách có bản quyền, **chỉ dùng cá nhân, không thương mại, không đưa lên git**. Đã loại các quái đã có trong SRD 5.2.1 của app.',
  '',
  `Tổng: **${out.length}** stat block. Nhập vào app bằng Bestiary → Nhập file.`,
  '',
  '| Quái | CR | Loại | AC | HP |',
  '|---|---|---|---|---|',
  ...out.map((m) => `| ${m.name} | ${m.cr} | ${m.meta} | ${m.ac} | ${m.maxHp} |`),
  '',
  `## Cần kiểm tra lại (${notes.length})`,
  '',
  ...notes.map((n) => `- ${n}`),
  '',
  ...(dropped.length ? [`## Không xác định được tên (${dropped.length})`, '', ...dropped.map((d) => `- ${d}`)] : []),
];
writeFileSync(outPath.replace(/\.json$/, '.md'), md.join('\n'));
console.log(`${out.length} monsters (not in SRD) → ${outPath}; ${notes.length} with review notes; ${dropped.length} unnamed dropped`);

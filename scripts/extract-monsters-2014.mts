/**
 * PDF → bestiary JSON for classic (2014-style) 5e stat blocks:
 *   "<Name>\n<Size> <type>, <alignment>\nArmor Class 11 Hit Points 10 (3d6) Speed 30 ft. …
 *    STR … CHA … Saving Throws … Senses … Languages … Challenge 1/4 (50 XP)
 *    <traits> Actions … Bonus Actions … Reactions … Legendary Actions …"
 *
 *   npx tsx scripts/extract-monsters-2014.mts "<book>.pdf" <firstPage> <lastPage> <out.json>
 *       [--tag mybook] [--skip-names "Artist One;Artist Two"]
 *       [--tokens "<token folder>" --uploads server/data/uploads]
 *
 * Each block is turned into a 5etools-shaped object and run through the app's own
 * `convert5eToolsMonster`, so attack/damage/save parsing matches the 5etools importer.
 * Resistances with a condition ("…from nonmagical attacks that aren't silvered") are NOT applied
 * automatically (the app's Defenses have no such condition) — they become a "⚠ Kháng có điều
 * kiện" trait so the DM can apply them by hand.
 *
 * --tokens: match "<Monster_Name>_<Size>_<Type>_01.webp"-style token files (first match, skipping
 * "_A_" alternates) by name, copy into --uploads and set `imageUrl`.
 *
 * Needs Poppler's `pdftotext` (PATH or env PDFTOTEXT). Output contains book text — keep it out
 * of the repo (server/data is git-ignored). Best-effort: always eyeball a few results.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert5eToolsMonster } from '../shared/src/import5etools.ts';
import type { Statblock } from '../shared/src/types.ts';

type J = Record<string, unknown>;
const args = process.argv.slice(2);
const flag = (n: string, d = '') => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const [pdf, first, last, out] = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!pdf || !first || !last || !out) {
  console.error('usage: extract-monsters-2014.mts <book.pdf> <firstPage> <lastPage> <out.json> [--tag t] [--tokens dir --uploads dir]');
  process.exit(1);
}
const tag = flag('--tag', 'book');
const skipNames = new Set(flag('--skip-names').split(';').map((s) => s.trim()).filter(Boolean));
const pdftotext = process.env.PDFTOTEXT || 'pdftotext';

const raw = execFileSync(pdftotext, ['-f', first, '-l', last, '-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');
const rawText = raw
  .replace(/­/g, '')
  .replace(/[–—]/g, '-')
  .replace(/−/g, '-')
  .replace(/[‘’]/g, "'")
  ;
const lines: string[] = [];
const pageOf: number[] = []; // page index (within the extracted range) of each kept line
rawText.split('\f').forEach((page, pi) => {
  for (const l0 of page.split(/\r?\n/)) {
    const l = l0.trim();
    if (l && !/^\d{1,3}$/.test(l) && !skipNames.has(l)) {
      lines.push(l);
      pageOf.push(pi);
    }
  }
});

const SIZE_RE = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or (?:Tiny|Small|Medium|Large|Huge|Gargantuan))? ([^,]+), (.+)$/;
const starts: number[] = [];
for (let i = 1; i < lines.length - 1; i++) {
  if (SIZE_RE.test(lines[i]) && lines[i + 1].startsWith('Armor Class') && lines[i - 1].length < 60) starts.push(i - 1);
}

const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const DMG = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const META_KEYS = ['Saving Throws', 'Skills', 'Damage Vulnerabilities', 'Damage Resistances', 'Damage Immunities', 'Condition Immunities', 'Senses', 'Languages', 'Challenge', 'Proficiency Bonus'];
const SECTIONS: Record<string, string> = {
  actions: 'action',
  'bonus actions': 'bonus',
  reactions: 'reaction',
  'legendary actions': 'legendary',
  'mythic actions': 'legendary',
  'lair actions': 'lairAction',
};
const SIZE_CODE: Record<string, string> = { Tiny: 'T', Small: 'S', Medium: 'M', Large: 'L', Huge: 'H', Gargantuan: 'G' };
const RULES_TEXT =
  /saving throw|damage|hit points?|\bDC \d|attack roll|weapon attack|advantage|\bturns?\b|\d+ (feet|ft)|bonus action|reaction|^Hit:|\bspells?\b|\(\d+d\d+|condition|Recharge|legendary action|\d+\/day|truesight|this trait|Alternatively|replaced with|instead|^\d+(-\d+)?: /i;
const ENTRY_RE =/^([A-Z][A-Za-z0-9'’,()/ &+-]{1,60}?(?: \([^)]*\))?)\. (.*)$/;

/** Split "Damage Resistances x; y Damage Immunities z …" into keyed fields. */
function metaFields(text: string): Record<string, string> {
  const re = new RegExp(`(${META_KEYS.join('|')})\\s`, 'g');
  const hits = [...text.matchAll(re)];
  const outF: Record<string, string> = {};
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index! : text.length;
    outF[m[1]] = text.slice(m.index! + m[0].length, end).trim();
  });
  return outF;
}
/** Damage list → { plain types, conditional clauses }. */
function dmgList(s: string | undefined) {
  if (!s) return { types: [] as string[], conditional: [] as string[] };
  const types: string[] = [];
  const conditional: string[] = [];
  for (const part of s.split(';').map((p) => p.trim()).filter(Boolean)) {
    const found = DMG.filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(part));
    if (/\b(from|that|except|unless|while)\b/i.test(part)) conditional.push(part);
    else types.push(...found);
  }
  return { types, conditional };
}
function speedObj(s: string): J {
  const o: J = {};
  for (const part of s.split(',')) {
    const m = /(?:(\w+)\s+)?(\d+)\s*ft/.exec(part.trim());
    if (m) o[m[1] && m[1] !== 'Speed' ? m[1].toLowerCase() : 'walk'] = Number(m[2]);
  }
  return o;
}

const results: Statblock[] = [];
const errors: string[] = [];
for (let s = 0; s < starts.length; s++) {
  const st = starts[s];
  const name = lines[st];
  let end = s + 1 < starts.length ? starts[s + 1] : lines.length;
  // The next creature's lore section starts with its own name as a title — cut there.
  if (s + 1 < starts.length) {
    const nextName = lines[starts[s + 1]];
    for (let k = starts[s + 1] - 1; k > st + 3 && k > starts[s + 1] - 80; k--) if (lines[k] === nextName) end = k;
  }
  // A stat block never runs past the page after the one it starts on — stops the last block of a
  // chapter from swallowing the following chapter's text.
  const pageCap = lines.findIndex((_, i) => i > st && pageOf[i] > pageOf[st] + 1);
  if (pageCap > 0 && pageCap < end) end = pageCap;
  // In a two-column layout the creature's OWN lore (titled with its name again) can flow in
  // right after its stat block — cut there too.
  const selfTitle = lines.findIndex((l, i) => i > st + 3 && i < end && l === name);
  if (selfTitle > 0) end = selfTitle;
  const block = lines.slice(st + 1, end);
  try {
    const sz = SIZE_RE.exec(block[0])!;
    // header text up to the first ability row ("STR")
    const strIdx = block.findIndex((l) => /^STR\b/.test(l));
    const head = block.slice(1, strIdx).join(' ');
    const ac = /Armor Class (\d+)(?: \(([^)]*)\))?/.exec(head);
    const hp = /Hit Points (\d+)(?: \(([^)]+)\))?/.exec(head);
    const sp = /Speed (.*)$/.exec(head);
    // Abilities (first six "N (+m)" pairs after STR) and the meta lines (Saving Throws … Challenge)
    // can interleave in the column flow — e.g. a meta line lands between WIS and CHA — so collect
    // both in one pass until we have six scores AND the "Challenge N (XP)" line.
    let k = strIdx;
    const nums: number[] = [];
    const metaLines: string[] = [];
    const META_START = new RegExp(`(${META_KEYS.join('|')})\\s`);
    const done = () => nums.length >= 6 && /Challenge [\d/]+ \([\d,]+ XP\)/.test(metaLines.join(' '));
    while (k < block.length && !done()) {
      const l = block[k];
      const pairs = [...l.matchAll(/(\d+)\s*\(([+-]?\d+)\)/g)];
      if (pairs.length && !META_START.test(l)) for (const m of pairs) nums.length < 6 && nums.push(Number(m[1]));
      else if (META_START.test(l) || (metaLines.length && !/^(STR|DEX|CON|INT|WIS|CHA)\b/.test(l))) metaLines.push(l);
      k++;
    }
    if (/^Proficiency Bonus/.test(block[k] ?? '')) metaLines.push(block[k++]);
    if (nums.length < 6) throw new Error('abilities');
    const meta = metaFields(metaLines.join(' '));
    const cr = /^([\d/]+)/.exec(meta['Challenge'] ?? '')?.[1];
    if (!ac || !hp || !cr) throw new Error('missing AC/HP/CR');

    // traits + sections → entries
    const groups: Record<string, { name: string; text: string }[]> = { trait: [] };
    let cur = 'trait';
    let prevEnded = true;
    for (; k < block.length; k++) {
      const l = block[k];
      const sec = SECTIONS[l.toLowerCase()];
      if (sec) {
        cur = sec;
        groups[cur] ??= [];
        prevEnded = true;
        continue;
      }
      const list = groups[cur];
      const m = ENTRY_RE.exec(l);
      const isIntro = cur === 'legendary' && /can take \d+ legendary actions?/i.test(l);
      if (isIntro) {
        prevEnded = /[.:)"]$/.test(l);
        continue;
      }
      // A new "Name. text" entry only after the previous sentence ended (a wrapped line that
      // happens to start "King unconscious." is a continuation, not an entry).
      if (m && prevEnded) list.push({ name: m[1], text: m[2] });
      else if (!prevEnded && list.length) list[list.length - 1].text += (list[list.length - 1].text.endsWith('-') ? '' : ' ') + l;
      else if (/^(At will|\d+\/day|Cantrips|\d+(st|nd|rd|th)[- ]level|[•\-*] )/i.test(l) && list.length) list[list.length - 1].text += ` ${l}`;
      // Short unpunctuated line after a finished sentence = artist credit / running page title.
      else if ((l.length < 45 && !/[.:,;)]$/.test(l)) || /Original Design by/i.test(l)) continue;
      // A further paragraph of the same entry ("Hit: …" after "…one target.", "Additionally, …")
      // reads like rules text; a lore paragraph of the next creature (which can flow in BEFORE
      // that creature's title in two-column layouts) doesn't — skip it, but keep reading so any
      // stat-block entries after it are still picked up.
      else if (list.length && RULES_TEXT.test(l)) list[list.length - 1].text += ` ${l}`;
      else {
        if (process.env.DEBUG_STOP) console.error(`[skip] ${name} :: ${l.slice(0, 150)}`);
        prevEnded = true;
        continue;
      }
      prevEnded = /[.:)"]$/.test(l);
    }

    const res = dmgList(meta['Damage Resistances']);
    const imm = dmgList(meta['Damage Immunities']);
    const vul = dmgList(meta['Damage Vulnerabilities']);
    const toEntries = (g?: { name: string; text: string }[]) => (g ?? []).map((e) => ({ name: e.name, entries: [e.text] }));
    const trait = toEntries(groups.trait);
    const cond = [...res.conditional.map((c) => `kháng ${c}`), ...imm.conditional.map((c) => `miễn nhiễm ${c}`), ...vul.conditional.map((c) => `dễ tổn thương ${c}`)];
    if (cond.length) trait.unshift({ name: '⚠ Kháng có điều kiện (DM tự áp dụng)', entries: [cond.join('; ')] });
    if (ac[2]) trait.unshift({ name: 'AC', entries: [`${ac[1]} (${ac[2]})`] });

    const fiveE: J = {
      name,
      source: tag,
      size: [SIZE_CODE[sz[1]]],
      type: sz[2],
      alignment: [sz[3]],
      ac: [Number(ac[1])],
      hp: { average: Number(hp[1]), formula: (hp[2] ?? '').replace(/\s+/g, '') },
      speed: speedObj(sp?.[1] ?? '30 ft.'),
      ...Object.fromEntries(ABILS.map((a, i) => [a, nums[i]])),
      save: Object.fromEntries(
        (meta['Saving Throws'] ?? '').split(',').map((x) => x.trim().split(/\s+/)).filter((p) => p.length === 2).map(([a, b]) => [a.toLowerCase().slice(0, 3), b]),
      ),
      skill: Object.fromEntries(
        (meta['Skills'] ?? '').split(',').map((x) => /^(.+?)\s+([+-]\d+)/.exec(x.trim())).filter(Boolean).map((m) => [m![1].toLowerCase(), m![2]]),
      ),
      resist: res.types,
      immune: imm.types,
      vulnerable: vul.types,
      conditionImmune: (meta['Condition Immunities'] ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      senses: meta['Senses'] ? [meta['Senses'].replace(/,?\s*passive Perception \d+/i, '').trim()].filter(Boolean) : [],
      passive: Number(/passive Perception (\d+)/i.exec(meta['Senses'] ?? '')?.[1]) || undefined,
      languages: meta['Languages'] ? [meta['Languages']] : [],
      cr,
      trait,
      action: toEntries(groups.action),
      bonus: toEntries(groups.bonus),
      reaction: toEntries(groups.reaction),
      legendary: toEntries(groups.legendary),
      lairAction: toEntries(groups.lairAction),
    };
    const sb = convert5eToolsMonster(fiveE);
    sb.meta = `${sz[1]} ${sz[2]}, ${sz[3]}`;
    sb.source = `${tag} (local, extracted)`;
    sb.tags = [tag];
    sb.id = `${tag}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    if (results.some((r) => r.id === sb.id)) sb.id += `-${s}`;
    results.push(sb);
  } catch (e) {
    errors.push(`${name}: ${(e as Error).message}`);
  }
}

// ---- tokens ----
const tokenDir = flag('--tokens');
const uploads = flag('--uploads', 'server/data/uploads');
if (tokenDir && existsSync(tokenDir)) {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(webp|png)$/i.test(f) && !/_A_\d+\./.test(f)) files.push(p);
    }
  };
  walk(tokenDir);
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  const sizeWord = /_(Tiny|Small|Medium|Large|Huge|Gargantuan)_/;
  mkdirSync(uploads, { recursive: true });
  let matched = 0;
  for (const sb of results) {
    const key = norm(sb.name);
    const hit = files.find((p) => {
      const base = p.split(/[\\/]/).pop()!;
      const nm = base.split(sizeWord)[0];
      return norm(nm.replace(/_/g, ' ')) === key;
    });
    if (!hit) continue;
    const base = `${tag}-${hit.split(/[\\/]/).pop()!.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
    copyFileSync(hit, join(uploads, base));
    sb.imageUrl = `/uploads/${base}`;
    matched++;
  }
  console.log(`tokens matched: ${matched}/${results.length}`);
  const unmatched = results.filter((r) => !r.imageUrl).map((r) => r.name);
  if (unmatched.length) console.log('no token:', unmatched.join(', '));
}

writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.length} statblocks → ${out}`);
if (errors.length) console.log(`errors (${errors.length}):\n  ${errors.join('\n  ')}`);

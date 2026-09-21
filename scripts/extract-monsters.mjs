#!/usr/bin/env node
/**
 * PDF → bestiary JSON for 2024-format stat blocks ("AC 15 HP 85 (9d10 + 36) Speed …",
 * "Traits / Actions / Bonus Actions / Reactions / Legendary Actions").
 *
 *   node scripts/extract-monsters.mjs "<book>.pdf" <firstPage> <lastPage> [out.json] [--tag crooked-moon]
 *
 * Output is an array of the app's `Statblock` shape — import it in the Bestiary panel
 * ("Nhập file"). Needs Poppler's `pdftotext`. The output contains book text: keep it out
 * of the repo (the default output lives next to the PDF; *.local.json is git-ignored).
 * Best-effort: always eyeball a few results.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const tag = flag('--tag') ?? 'imported';
const sourceLabel = flag('--source');
const [pdf, first, last, outArg] = args;
if (!pdf || !first || !last) {
  console.error('usage: extract-monsters.mjs <pdf> <firstPage> <lastPage> [out.json] [--tag name]');
  process.exit(1);
}
const out = outArg ?? pdf.replace(/\.pdf$/i, '') + '.monsters.json';

const DAMAGE = ['bludgeoning', 'piercing', 'slashing', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic'];
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'];

const raw = execFileSync('pdftotext', ['-raw', '-f', first, '-l', last, pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const num = (s) => Number(String(s).replace(/[−–]/g, '-').replace(/\s/g, ''));
const junk = /^(Bestiary|Appendix [A-Z]|[A-Z]|\d+|CROOKED MOON MONSTERS|\d+ System Reference Document 5\.2\.1|System Reference Document 5\.2\.1 \d+|\f)$/;
const lines = raw
  .replace(/\r/g, '')
  .split('\n')
  .map((l) => l.replace(/\f/g, '').trim())
  .filter((l) => !junk.test(l));

const SIZE = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*,\s*[A-Za-z ,()-]+$/;
const CAPS = /^[A-Z][A-Z'’ ,-]{2,}$/;
const SECTION = { Traits: 'trait', Actions: 'action', 'Bonus Actions': 'bonus', Reactions: 'reaction', 'Legendary Actions': 'other' };

// ── find stat block starts: a name line, then the size line, then the "AC …" line ──
const starts = [];
for (let i = 1; i < lines.length - 1; i++) {
  if (SIZE.test(lines[i]) && lines[i + 1].startsWith('AC ') && lines[i - 1].length < 45) starts.push(i);
}

const TABLE_HDR = /^(MOD|SAVE| )+$/;
const blocks = starts.map((s, k) => {
  let end = k + 1 < starts.length ? starts[k + 1] - 1 : lines.length;
  for (let j = s + 1; j < end; j++) {
    if (CAPS.test(lines[j]) && !TABLE_HDR.test(lines[j])) {
      end = j; // ALLCAPS heading = the next monster's lore section (Crooked Moon layout)
      break;
    }
  }
  // drop trailing group headings ("Gold Dragons") that sit between two stat blocks
  while (end - 1 > s && /^[A-Z][A-Za-z' ,-]{2,40}$/.test(lines[end - 1]) && /[.)]$/.test(lines[end - 2] ?? '')) end--;
  // lore = text between the previous block's end and this heading (habitat + secret)
  const prevEnd = k ? Math.min(...[starts[k]].concat([])) : 0;
  return { name: lines[s - 1], size: lines[s], body: lines.slice(s + 1, end), headIdx: s - 1, prevEnd };
});

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SMALL = new Set(['of', 'the', 'in', 'a', 'and', 'to']);
const title = (n) =>
  n
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i && SMALL.has(w) ? w : w.replace(/(^|-)([a-z])/g, (m, p, c) => p + c.toUpperCase())))
    .join(' ');
const dmg = (s) => s.replace(/\s+/g, '');

function parseAction(name, text, actionType, id) {
  const a = { id, name, actionType, description: text, source: 'manual' };
  const hit = /Attack Roll:\s*([+-]\d+)/i.exec(text);
  if (hit) a.attackBonus = num(hit[1]);
  const reach = /reach (\d+ ft)/i.exec(text);
  const rng = /range (\d+(?:\/\d+)? ft)/i.exec(text);
  if (reach || rng) a.range = (reach ?? rng)[1];
  const main = /(?:Hit|Failure):\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/i.exec(text);
  if (main) {
    a.damage = dmg(main[1]);
    a.damageType = main[2].toLowerCase();
    const rest = text.slice(main.index + main[0].length);
    const extra = [...rest.matchAll(/plus\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/gi)];
    if (extra.length) a.extraDamage = extra.map((e) => ({ dice: dmg(e[1]), type: e[2].toLowerCase() }));
  }
  if (!main) {
    const flat = /(?:Hit|Failure):\s*(\d+)\s+(\w+)\s+damage/i.exec(text); // "Hit: 1 Piercing damage"
    if (flat) {
      a.damage = flat[1];
      a.damageType = flat[2].toLowerCase();
    }
  }
  const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i.exec(text);
  if (save) a.save = { ability: save[1].slice(0, 3).toLowerCase(), dc: Number(save[2]) };
  return a;
}

const ENTRY = /^([A-Z][A-Za-z'’-]*(?: (?:of|the|and|a|to|in|on|with|for|Attack|Action)|(?: [A-Z][A-Za-z'’-]*)){0,5}(?: \([^)]{1,40}\))?)\.\s+(.*)$/;

const results = [];
const problems = [];

for (const b of blocks) {
  const name = CAPS.test(b.name) ? title(b.name) : b.name;
  const body = b.body;
  const text = body.join('\n');
  try {
    // header
    const ac = /\bAC\s+(\d+)/.exec(text);
    const hp = /\bHP\s+(\d+)\s*\(([^)]+)\)/.exec(text);
    const spd = /\bSpeed\s+([^\n]+)/.exec(text);
    const cr = /\bCR\s+([\d/]+)\s*\([^)]*?PB\s*\+(\d+)\)/.exec(text);
    if (!ac || !hp || !cr) throw new Error('missing AC/HP/CR');

    // header block up to first meta line
    const metaIdx = body.findIndex((l) => /^(Skills|Saving Throws|Resistances|Immunities|Vulnerabilities|Senses|Languages|Gear|CR )/.test(l));
    const head = body.slice(0, metaIdx < 0 ? 12 : metaIdx).join(' ');
    const abilities = {};
    const saveProficiencies = [];
    // -raw mode keeps "Str 18 +4 +10" (score, mod, save) together on one line
    for (const m of head.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d{1,2})\s+([+−-]\d+)\s+([+−-]\d+)/g)) {
      const k = m[1].toLowerCase();
      abilities[k] = Number(m[2]);
      if (num(m[3]) !== num(m[4])) saveProficiencies.push(k);
    }
    for (const a of ABIL) if (!(a in abilities)) abilities[a] = 10;
    const initMod = /Initiative\s+([+−-]\d+)/.exec(text);

    // meta paragraph (Skills … CR) up to Traits/Actions heading
    const secStart = body.findIndex((l) => l in SECTION);
    const metaText = body.slice(Math.max(metaIdx, 0), secStart < 0 ? body.length : secStart).join(' ');
    const grab = (key, next) => {
      const m = new RegExp(`${key}\\s+(.*?)(?=\\s+(?:${next})\\s|\\s+CR\\s+[\\d/]+\\s*\\(|$)`).exec(metaText);
      return m ? m[1].trim() : '';
    };
    const KEYS = 'Skills|Saving Throws|Resistances|Immunities|Vulnerabilities|Senses|Languages|Gear';
    const skillsStr = grab('Skills', KEYS);
    const skills = [...skillsStr.matchAll(/([A-Za-z ]+?)\s+([+−-]\d+)/g)]
      .map((m) => ({ skill: m[1].trim().toLowerCase().replace(/\s+/g, '-'), bonus: num(m[2]) }))
      .filter((s) => SKILLS.includes(s.skill));
    const splitDamage = (s) => s.split(';')[0].split(',').map((x) => x.trim().toLowerCase()).filter((x) => DAMAGE.includes(x));
    const resStr = grab('Resistances', KEYS);
    const immStr = grab('Immunities', KEYS);
    const vulStr = grab('Vulnerabilities', KEYS);
    const condImm = immStr.includes(';') ? immStr.split(';').slice(1).join(';').trim() : '';
    const defenses = {
      resistances: splitDamage(resStr),
      immunities: splitDamage(immStr),
      vulnerabilities: splitDamage(vulStr),
      damageReduction: 0,
      critImmune: false,
    };
    const hasDef = defenses.resistances.length || defenses.immunities.length || defenses.vulnerabilities.length;

    // sections
    const traits = [];
    const actions = [];
    let section = null;
    let cur = null;
    let n = 0;
    const flush = () => {
      if (!cur) return;
      const desc = cur.text.trim();
      if (cur.section === 'trait') traits.push({ name: cur.name, description: desc });
      else actions.push(parseAction(cur.name, desc, cur.section, `${slug(name)}-${++n}`));
      cur = null;
    };
    for (const l of body.slice(secStart < 0 ? body.length : secStart)) {
      if (l in SECTION) {
        flush();
        section = SECTION[l];
        continue;
      }
      if (!section) continue;
      // A new entry starts after a finished sentence (PDF wraps lines; a wrapped line that
      // merely begins with a Capitalised phrase and a full stop must not split an entry).
      const m = !cur || /[.!?)"”:]$/.test(cur.text.trim()) ? ENTRY.exec(l) : null;
      if (m) {
        flush();
        cur = { section, name: m[1], text: m[2] };
      } else if (cur) cur.text = /[a-z]-$/.test(cur.text) && /^[a-z]/.test(l) ? cur.text.slice(0, -1) + l : `${cur.text} ${l}`;
      else cur = { section, name: section === 'other' ? 'Legendary Actions' : 'Note', text: l };
    }
    flush();
    if (condImm) traits.push({ name: 'Condition Immunities', description: condImm });

    const walk = spd ? Number(/(\d+)/.exec(spd[1])?.[1] ?? 30) : 30;
    const sizeWord = b.size.split(' ')[0].toLowerCase();
    // lore: Habitat + Secret paragraph found in the lines just before this stat block heading
    const before = lines.slice(Math.max(0, b.headIdx - 60), b.headIdx + 1).join('\n');
    const habitat = /Habitat:[^\n]*/.exec(before.split('\n' + b.name + '\n').slice(-2, -1)[0] ?? before);
    const secretAt = lines.slice(Math.max(0, b.headIdx - 60), b.headIdx).findIndex((l) => l.startsWith('Secret.'));
    let secret = null;
    if (secretAt >= 0) {
      const from = Math.max(0, b.headIdx - 60) + secretAt;
      const parts = [];
      for (let j = from; j < b.headIdx && parts.length < 6; j++) {
        if (!lines[j] || CAPS.test(lines[j]) || (j > from && /^(Habitat:)/.test(lines[j]))) break;
        parts.push(lines[j]);
      }
      secret = [parts.join(' ')];
    }

    results.push({
      id: `${slug(tag)}-${slug(name)}`,
      name,
      meta: b.size,
      cr: cr[1],
      size: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].includes(sizeWord) ? sizeWord : 'medium',
      ac: Number(ac[1]),
      maxHp: Number(hp[1]),
      hpFormula: hp[2].replace(/\s+/g, ''),
      speed: walk,
      speedNote: spd && /[,;]/.test(spd[1]) ? spd[1].split(/[,;]/).slice(1).join(',').trim() : undefined,
      abilities,
      proficiencyBonus: Number(cr[2]),
      saveProficiencies,
      skills,
      senses: /Senses\s+(.*?)(?=\s+(?:Languages|Gear|CR)\s)/.exec(metaText)?.[1]?.trim(),
      languages: /Languages\s+(.*?)(?=\s+(?:Gear|CR)\s+[\d/]*\s*\(?|\s+CR\s+[\d/]+\s*\()/.exec(metaText)?.[1]?.trim(),
      traits,
      actions,
      defenses: hasDef ? defenses : undefined,
      color: '#8e44ad',
      tags: [tag],
      notes: [habitat?.[0], secret?.[0]].filter(Boolean).join('\n'),
      source: sourceLabel ?? `${tag} (local, extracted)`,
      _init: initMod ? num(initMod[1]) : undefined,
    });
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
  }
}

for (const r of results) delete r._init;
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.length} stat blocks → ${out}`);
if (problems.length) console.log(`skipped ${problems.length}:\n  ` + problems.join('\n  '));

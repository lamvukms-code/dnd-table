import { DAMAGE_TYPES, SKILLS, emptyDefenses } from './types.js';
import type { Ability, ConditionalDefense, DamagePart, Defenses, SheetAction, Statblock, TokenSize, WeaponTrait } from './types.js';

/**
 * Convert a 5etools-format creature (or a list, or a `{ monster: [...] }` file)
 * into the app's `Statblock` shape. Best-effort: entry text is flattened and
 * de-tagged, and attack / save actions are parsed where the 2014/2024 wording
 * is recognisable. Intended for a DM importing monsters they own into their
 * (git-ignored) local bestiary.
 */

type J = Record<string, unknown>;

const SIZE: Record<string, TokenSize> = {
  T: 'tiny',
  S: 'small',
  M: 'medium',
  L: 'large',
  H: 'huge',
  G: 'gargantuan',
};
const ABILS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** 5etools skill keys → our `SKILLS` keys (spaces → hyphens, mostly). */
function skillKey(name: string): string | null {
  const k = name.trim().toLowerCase().replace(/\s+/g, '-');
  return k in SKILLS ? k : null;
}

/** CR → proficiency bonus (5e table). */
export function crToProficiency(cr: string): number {
  const n = cr.includes('/') ? 0 : Number(cr) || 0;
  if (n >= 29) return 9;
  if (n >= 25) return 8;
  if (n >= 21) return 7;
  if (n >= 17) return 6;
  if (n >= 13) return 5;
  if (n >= 9) return 4;
  if (n >= 5) return 3;
  return 2;
}

/** Strip 5etools `{@tag ...}` markup down to readable text. */
export function stripTags(s: string): string {
  let out = s;
  // {@h} = "Hit: ", {@hit 4} = "+4", {@dc 15} = "DC 15", {@recharge 5} = "(Recharge 5–6)"
  out = out.replace(/\{@h\}/g, 'Hit: ');
  out = out.replace(/\{@hit ([+-]?\d+)\}/g, (_m, n: string) => (n.startsWith('-') ? n : `+${n.replace('+', '')}`));
  out = out.replace(/\{@dc (\d+)\}/g, 'DC $1');
  out = out.replace(/\{@recharge(?: (\d))?\}/g, (_m, d) => (d ? `(Recharge ${d}– 6)` : '(Recharge 6)'));
  out = out.replace(/\{@atkr? ([^}]*)\}/g, '');
  // {@tag first|second|display} → display || first
  out = out.replace(/\{@\w+ ([^}]*)\}/g, (_m, body: string) => {
    const parts = body.split('|');
    return (parts[2] || parts[0] || '').trim();
  });
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Flatten a 5etools `entries` array (strings + nested objects) to plain text. */
export function flattenEntries(entries: unknown, depth = 0): string {
  if (entries == null) return '';
  if (typeof entries === 'string') return stripTags(entries);
  if (Array.isArray(entries)) {
    return entries
      .map((e) => flattenEntries(e, depth))
      .filter(Boolean)
      .join(depth === 0 ? '\n' : ' ');
  }
  const o = entries as J;
  if (Array.isArray(o.items)) {
    return (o.items as unknown[]).map((i) => `• ${flattenEntries(i, depth + 1)}`).join('\n');
  }
  if (o.entries != null) {
    const name = typeof o.name === 'string' ? `${o.name}. ` : '';
    return `${name}${flattenEntries(o.entries, depth + 1)}`.trim();
  }
  if (typeof o.entry === 'string') return stripTags(o.entry);
  return '';
}

function firstNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = firstNumber(x);
      if (typeof n === 'number') return n;
    }
  }
  if (v && typeof v === 'object') {
    const o = v as J;
    if (typeof o.ac === 'number') return o.ac;
    if (typeof o.number === 'number') return o.number;
  }
  return undefined;
}

/** Flatten 5etools resist/immune/vulnerable arrays (with nested {resist:[...]}) to strings. */
function flattenDmgList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') out.push(item.toLowerCase());
    else if (item && typeof item === 'object') {
      for (const key of ['resist', 'immune', 'vulnerable']) {
        const inner = (item as J)[key];
        if (Array.isArray(inner)) out.push(...flattenDmgList(inner));
      }
    }
  }
  return out;
}
const KNOWN_DMG = new Set<string>(DAMAGE_TYPES);
function keepDamageTypes(list: string[]): string[] {
  return [...new Set(list.filter((t) => KNOWN_DMG.has(t)))];
}

// "N (XdY + Z) type damage"; also "… bludgeoning and 9 (2d8) poison damage" (word "damage" once) and a
// choice of types ("acid, cold, or poison damage" → the first one; the description keeps the rest).
const DMG_RE = /(\d+)\s*\(\s*(\d+d\d+(?:\s*[+\-−]\s*\d+)?)\s*\)\s*([a-z]+)(?:(?:,\s*(?:or\s+)?[a-z]+)*\s+damage)?/gi;

/** Every "N (XdY + Z) type damage" in `text`, skipping alternatives ("… or 8 (1d10 + 3) slashing damage if
 *  used with two hands"). */
function damageParts(text: string): DamagePart[] {
  const parts: DamagePart[] = [];
  let prevEnd = 0;
  for (const m of text.matchAll(DMG_RE)) {
    const between = text.slice(prevEnd, m.index);
    prevEnd = m.index! + m[0].length;
    if (parts.length && /\bor\b/i.test(between)) continue;
    const type = m[3].toLowerCase();
    if (!KNOWN_DMG.has(type)) continue;
    parts.push({ dice: m[2].replace(/\s+/g, '').replace('−', '-'), type });
  }
  return parts;
}

function parseAction(raw: J): SheetAction {
  const name = String(raw.name ?? 'Action');
  const text = flattenEntries(raw.entries);
  const action: SheetAction = { id: '', name, actionType: 'action', description: text, source: 'manual' };

  const hit = /Attack Roll:\**\s*([+-]?\d+)|([+-]\d+)\s+to hit/i.exec(text);
  if (hit) action.attackBonus = Number(hit[1] ?? hit[2]);

  // 2024 "Strength Saving Throw: DC 13" or 2014 "DC 13 Strength saving throw".
  let save: { at: number; ability: string; dc: number } | null = null;
  const s24 = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:?\*?\s*DC\s*(\d+)/i.exec(text);
  const s14 = /DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i.exec(text);
  if (s24) save = { at: s24.index, ability: s24[1], dc: Number(s24[2]) };
  else if (s14) save = { at: s14.index, ability: s14[2], dc: Number(s14[1]) };
  const saveAt = save?.at ?? -1;
  if (save) action.save = { ability: save.ability.slice(0, 3).toLowerCase() as Ability, dc: save.dc };

  // Damage: on an attack, the parts of the "Hit:" clause (before any rider save); on a pure save
  // action, the damage the save is against.
  const hitAt = text.search(/Hit:?\**\s|On a hit,/i);
  let main: DamagePart[] = [];
  if (hitAt >= 0) {
    let clause = text.slice(hitAt);
    const cut = clause.search(/\.\s|,?\s+and the target must|,?\s+(?:it|the target) must make|\bIf the target\b/i);
    if (cut > 0) clause = clause.slice(0, cut);
    main = damageParts(clause);
    if (save && saveAt > hitAt) {
      const onFail = damageParts(text.slice(saveAt));
      if (onFail.length) action.saveDamage = onFail;
    }
  } else if (save) {
    main = damageParts(text.slice(Math.max(0, text.lastIndexOf('.', saveAt) + 1)));
  }
  if (main.length) {
    action.damage = main[0].dice;
    action.damageType = main[0].type;
    if (main.length > 1) action.extraDamage = main.slice(1);
  }
  return action;
}

function typeString(t: unknown): string {
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') {
    const o = t as J;
    const tags = Array.isArray(o.tags) ? ` (${(o.tags as string[]).join(', ')})` : '';
    return `${o.type ?? ''}${tags}`;
  }
  return '';
}
function alignmentString(a: unknown): string {
  if (!Array.isArray(a)) return '';
  const map: Record<string, string> = {
    L: 'Lawful',
    N: 'Neutral',
    C: 'Chaotic',
    G: 'Good',
    E: 'Evil',
    U: 'Unaligned',
    A: 'Any',
  };
  const parts: string[] = [];
  for (const x of a) {
    if (typeof x === 'string') parts.push(map[x] ?? x);
    else if (x && typeof x === 'object' && Array.isArray((x as J).alignment)) {
      parts.push(((x as J).alignment as string[]).map((c) => map[c] ?? c).join(' '));
    }
  }
  return parts.join(' ').replace('Neutral Neutral', 'Neutral');
}

/** Convert one 5etools creature object to a `Statblock`. */
export function convert5eToolsMonster(raw: J): Statblock {
  const name = String(raw.name ?? 'Unnamed');
  const source = typeof raw.source === 'string' ? raw.source : undefined;

  const sizeCode = Array.isArray(raw.size) ? String(raw.size[0]) : String(raw.size ?? 'M');
  const size = SIZE[sizeCode] ?? 'medium';

  const cr =
    typeof raw.cr === 'string'
      ? raw.cr
      : raw.cr && typeof raw.cr === 'object'
        ? String((raw.cr as J).cr ?? '')
        : '';

  const abilities = {} as Record<Ability, number>;
  for (const a of ABILS) abilities[a] = typeof raw[a] === 'number' ? (raw[a] as number) : 10;

  const speedObj = (raw.speed ?? {}) as J;
  const walk = firstNumber(speedObj.walk) ?? (typeof raw.speed === 'number' ? raw.speed : 30);
  const otherSpeeds = Object.entries(speedObj)
    .filter(([k]) => k !== 'walk')
    .map(([k, v]) => `${k} ${firstNumber(v) ?? ''}`.trim())
    .filter((s) => /\d/.test(s));

  const saveObj = (raw.save ?? {}) as J;
  const saveProficiencies = ABILS.filter((a) => a in saveObj);

  const skillObj = (raw.skill ?? {}) as J;
  const skills = Object.entries(skillObj)
    .map(([k, v]) => {
      const key = skillKey(k);
      return key ? { skill: key, bonus: Number(String(v).replace(/[^0-9+-]/g, '')) || 0 } : null;
    })
    .filter((s): s is { skill: string; bonus: number } => !!s);

  const senses = [
    ...(Array.isArray(raw.senses) ? (raw.senses as string[]) : []),
    typeof raw.passive === 'number' ? `passive Perception ${raw.passive}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const defenses: Defenses = {
    ...emptyDefenses(),
    resistances: keepDamageTypes(flattenDmgList(raw.resist)),
    immunities: keepDamageTypes(flattenDmgList(raw.immune)),
    vulnerabilities: keepDamageTypes(flattenDmgList(raw.vulnerable)),
  };
  const hasDefenses =
    defenses.resistances.length || defenses.immunities.length || defenses.vulnerabilities.length;

  const traitEntries = Array.isArray(raw.trait) ? (raw.trait as J[]) : [];
  const traits = traitEntries.map((t) => ({
    name: String(t.name ?? ''),
    description: flattenEntries(t.entries),
  }));
  const conditionImmune = flattenDmgList(raw.conditionImmune);
  if (conditionImmune.length) {
    traits.push({ name: 'Condition Immunities', description: conditionImmune.join(', ') });
  }

  const mkActions = (key: string, actionType: SheetAction['actionType']) =>
    (Array.isArray(raw[key]) ? (raw[key] as J[]) : []).map((a, i) => ({
      ...parseAction(a),
      id: `${key}-${i}`,
      actionType,
    }));
  const actions: SheetAction[] = [
    ...mkActions('action', 'action'),
    ...mkActions('bonus', 'bonus'),
    ...mkActions('reaction', 'reaction'),
  ];
  const legendaryActions = mkActions('legendary', 'legendary');
  const lairActions = mkActions('lairAction', 'lair'); // rarely present on the monster entry itself —
  // most sources key lair actions off a separate legendarygroup lookup this importer doesn't follow;
  // the DM can fill them in by hand in the bestiary editor.

  const meta = [`${size[0].toUpperCase()}${size.slice(1)}`, typeString(raw.type), alignmentString(raw.alignment)]
    .filter(Boolean)
    .join(' ');

  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${(source ?? '5et').toLowerCase()}`,
    name,
    meta,
    cr,
    size,
    ac: firstNumber(raw.ac) ?? 10,
    maxHp: firstNumber((raw.hp as J)?.average) ?? firstNumber(raw.hp) ?? 10,
    hpFormula: typeof (raw.hp as J)?.formula === 'string' ? String((raw.hp as J).formula) : '',
    speed: typeof walk === 'number' ? walk : 30,
    speedNote: otherSpeeds.join(', ') || undefined,
    abilities,
    proficiencyBonus: crToProficiency(cr),
    saveProficiencies,
    skills,
    senses: senses || undefined,
    languages: Array.isArray(raw.languages) ? (raw.languages as string[]).join(', ') : undefined,
    traits,
    actions,
    legendaryActionsPerRound: legendaryActions.length ? 3 : undefined,
    legendaryActions: legendaryActions.length ? legendaryActions : undefined,
    hasLairActions: lairActions.length ? true : undefined,
    lairActions: lairActions.length ? lairActions : undefined,
    defenses: hasDefenses ? defenses : undefined,
    color: '#8e44ad',
    tags: source ? [source] : [],
    notes: '',
    source: source ? `5etools (${source})` : '5etools',
  };
}

export interface Import5eResult {
  statblocks: Statblock[];
  errors: string[];
}

/** Parse a pasted 5etools payload: a creature, an array, or `{ monster: [...] }`. */
export function parse5eToolsBestiary(input: unknown): Import5eResult {
  let list: unknown[];
  if (Array.isArray(input)) list = input;
  else if (input && typeof input === 'object' && Array.isArray((input as J).monster)) {
    list = (input as J).monster as unknown[];
  } else if (input && typeof input === 'object' && typeof (input as J).name === 'string') {
    list = [input];
  } else {
    return { statblocks: [], errors: ['JSON không phải creature, mảng, hay { "monster": [...] }'] };
  }

  const statblocks: Statblock[] = [];
  const errors: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || typeof (item as J).name !== 'string') {
      errors.push('Bỏ qua 1 mục không có "name"');
      continue;
    }
    if ((item as J)._copy) {
      errors.push(`"${(item as J).name}" dùng _copy (kế thừa) — 5etools chưa resolve, bỏ qua`);
      continue;
    }
    try {
      statblocks.push(convert5eToolsMonster(item as J));
    } catch (e) {
      errors.push(`"${(item as J).name}": ${(e as Error).message}`);
    }
  }
  return { statblocks, errors };
}

/**
 * A stat block's conditional damage defence ("bludgeoning, piercing, and slashing from nonmagical attacks
 * that aren't silvered") as data the server can apply. null if no damage type is named.
 */
export function parseConditionalDefense(kind: ConditionalDefense['kind'], text: string): ConditionalDefense | null {
  const types = DAMAGE_TYPES.filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(text));
  if (!types.length) return null;
  const lower = text.toLowerCase();
  const bypassedBy = new Set<WeaponTrait>();
  let onlyIf: WeaponTrait[] | undefined;
  if (/\bnon-?magical\b/.test(lower)) bypassedBy.add('magical');
  else {
    // "from magical attacks", "from moongilded attacks", "from silvered or magical weapons" → only those.
    const only = /\bfrom ((?:magical|silvered|moongilded)(?:\s*(?:,|or|and)\s*(?:magical|silvered|moongilded))*)/.exec(lower)?.[1];
    if (only) onlyIf = (['magical', 'silvered', 'moongilded'] as WeaponTrait[]).filter((t) => only.includes(t));
  }
  const unless = /\b(?:aren['’]t|are not|not)\b(.*)$/.exec(lower)?.[1] ?? '';
  if (/silver/.test(unless)) bypassedBy.add('silvered');
  if (/moongild/.test(unless)) bypassedBy.add('moongilded');
  return { kind, types: [...types], bypassedBy: [...bypassedBy], ...(onlyIf ? { onlyIf } : {}), text: text.trim() };
}

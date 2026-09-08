import { DAMAGE_TYPES, SKILLS, emptyDefenses } from './types.js';
import type { Ability, Defenses, SheetAction, Statblock, TokenSize } from './types.js';

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

function parseAction(raw: J): SheetAction {
  const name = String(raw.name ?? 'Action');
  const text = flattenEntries(raw.entries);
  const action: SheetAction = { id: '', name, actionType: 'action', description: text, source: 'manual' };

  const hit = /Attack Roll:\**\s*([+-]?\d+)|([+-]\d+)\s+to hit/i.exec(text);
  if (hit) action.attackBonus = Number(hit[1] ?? hit[2]);

  const dmg = /Hit:?\**\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/i.exec(text);
  if (dmg) {
    action.damage = dmg[1].replace(/\s+/g, '');
    action.damageType = dmg[2].toLowerCase();
  }

  const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:?\*?\s*DC\s*(\d+)/i.exec(
    text,
  );
  if (save) {
    action.save = { ability: save[1].slice(0, 3).toLowerCase() as Ability, dc: Number(save[2]) };
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
    (Array.isArray(raw[key]) ? (raw[key] as J[]) : []).map((a) => ({
      ...parseAction(a),
      actionType,
    }));
  const actions: SheetAction[] = [
    ...mkActions('action', 'action'),
    ...mkActions('bonus', 'bonus'),
    ...mkActions('reaction', 'reaction'),
    ...mkActions('legendary', 'other'),
  ];

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

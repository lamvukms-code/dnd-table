import { CONDITIONS, type ConditionType, type DamagePart, type SheetAction } from './types.js';

/**
 * Helpers for running stat-block actions and leveled spells semi-automatically: limited-use
 * actions (Recharge / X per Day), Multiattack, the condition a failed save imposes, and
 * upcast scaling read from a spell's "Nâng ô: +1d6" guidance.
 */

// ---------------------------------------------------------------- limited-use actions

export type ActionLimit = { kind: 'recharge'; min: number } | { kind: 'perDay'; max: number };

/** "Frost Breath (Recharge 5-6)", "Recharge 6", "Hexed Lantern (1/Day)", "(2/Day each)". */
export function actionLimit(a: Pick<SheetAction, 'name' | 'description'>): ActionLimit | null {
  const name = a.name ?? '';
  const r = /\bRecharge\s+(\d)(?:\s*[–—-]\s*6)?\b/i.exec(name) ?? /^\s*\(?Recharge\s+(\d)(?:\s*[–—-]\s*6)?\)?/i.exec(a.description ?? '');
  if (r) {
    const min = Number(r[1]);
    if (min >= 2 && min <= 6) return { kind: 'recharge', min };
  }
  const d = /\((\d+)\s*\/\s*(?:Day(?:\s+each)?|Short Rest|Long Rest|Short or Long Rest)\)/i.exec(name);
  if (d && Number(d[1]) > 0) return { kind: 'perDay', max: Number(d[1]) };
  return null;
}

/** Whether a limited action can be used given how many times it was used since it last came back. */
export function actionAvailable(limit: ActionLimit | null, used: number): boolean {
  if (!limit) return true;
  return limit.kind === 'recharge' ? used < 1 : used < limit.max;
}

/** Recharge roll at the start of the monster's turn: d6 ≥ min brings the action back. */
export function rechargeSucceeds(limit: ActionLimit, d6: number): boolean {
  return limit.kind === 'recharge' && d6 >= limit.min;
}

// ---------------------------------------------------------------- multiattack

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, once: 1, twice: 2 };
const baseName = (s: string) => s.replace(/\(.*?\)/g, '').trim().toLowerCase();

export interface MultiattackStep {
  actionId: string;
  name: string;
  count: number;
}

/**
 * Read "The alpengrendel makes one Claws attack and one Tusks attack." into the attacks to roll.
 * Only actions with an attack bonus are used. "makes two attacks, using Claw or X" (a free
 * choice) falls back to N of the first listed attack. Returns [] when nothing can be resolved.
 */
export function parseMultiattack(description: string | undefined, actions: SheetAction[]): MultiattackStep[] {
  const desc = description ?? '';
  const attacks = actions.filter((a) => typeof a.attackBonus === 'number' && !/^multiattack/i.test(a.name));
  if (!attacks.length) return [];
  // Longest names first so "Crooked Claw" wins over "Claw".
  const byLen = [...attacks].sort((x, y) => baseName(y.name).length - baseName(x.name).length);
  const steps: MultiattackStep[] = [];
  const re = /\b(one|two|three|four|five|six|\d+)\s+([A-Za-z][A-Za-z' -]*?)\s+attacks?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) {
    const count = COUNT[m[1].toLowerCase()] ?? Number(m[1]);
    const phrase = m[2].toLowerCase();
    const hit = byLen.find((a) => phrase.endsWith(baseName(a.name)) || phrase === baseName(a.name));
    if (!hit || !count) continue;
    const prev = steps.find((s) => s.actionId === hit.id);
    if (prev) prev.count += count;
    else steps.push({ actionId: hit.id, name: hit.name, count });
  }
  if (steps.length) return steps;
  // 2014 wording: "makes three attacks: one with its bite and two with its claws"
  const sing = (w: string) => w.replace(/(?<=[a-z])s$/, '');
  const re2 = /\b(one|two|three|four|five|six|\d+)\s+with\s+(?:its|his|her|their)\s+([A-Za-z][A-Za-z' -]*?)(?=\s*(?:,|\.|;|\band\b|\bor\b|$))/gi;
  while ((m = re2.exec(desc))) {
    const count = COUNT[m[1].toLowerCase()] ?? Number(m[1]);
    const phrase = sing(m[2].trim().toLowerCase());
    const hit = byLen.find((x) => sing(baseName(x.name)) === phrase || phrase.endsWith(sing(baseName(x.name))));
    if (!hit || !count) continue;
    const prev = steps.find((st) => st.actionId === hit.id);
    if (prev) prev.count += count;
    else steps.push({ actionId: hit.id, name: hit.name, count });
  }
  if (steps.length) return steps;
  const n = /\bmakes\s+(two|three|four|five|\d+)\s+(?:melee\s+|ranged\s+)?attacks\b/i.exec(desc);
  if (n) {
    const count = COUNT[n[1].toLowerCase()] ?? Number(n[1]);
    // "using Claw or Putrid Emission": take the first named one, else the first attack.
    const pos = (a: SheetAction) => desc.search(new RegExp(`\\b${baseName(a.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    const named = attacks.filter((a) => pos(a) >= 0).sort((x, y) => pos(x) - pos(y))[0];
    const pick = named ?? attacks[0];
    return [{ actionId: pick.id, name: pick.name, count }];
  }
  return [];
}

// ---------------------------------------------------------------- condition on a failed save

/**
 * The condition a save action imposes on a failure: looks after "Failure:" (2024) or
 * "On a failed save" / "or be/become …" (2014). Exhaustion and "prone" count too.
 */
export function failCondition(description: string | undefined): ConditionType | undefined {
  const d = description ?? '';
  const after =
    /Failure:(.*?)(?:Success:|Failure or Success:|$)/is.exec(d)?.[1] ??
    /(?:on a failed save|fails? the save|or (?:be|become)|or (?:it|the target) (?:is|has the))(.*?)(?:\.\s|$)/is.exec(d)?.[1] ??
    '';
  const text = after.toLowerCase();
  for (const c of CONDITIONS) {
    if (new RegExp(`\\b${c}\\b`).test(text)) return c;
  }
  return undefined;
}

// ---------------------------------------------------------------- upcast

/** "Nâng ô: +1d6", "Nâng ô: +1 tia (+1d4+1)", "+2d4 mỗi cấp" → the dice added per slot level above the spell's. */
export function parseUpcast(guidance: string | undefined): string | undefined {
  const g = guidance ?? '';
  const i = g.search(/Nâng ô/i);
  if (i < 0) return undefined;
  const m = /\+\s*(\d+d\d+(?:\s*\+\s*\d+)?)/i.exec(g.slice(i));
  return m ? m[1].replace(/\s+/g, '') : undefined;
}

/** "1d4+1" × 3 → "3d4+3". */
export function scaleDice(dice: string, times: number): string {
  const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(dice.replace(/\s+/g, ''));
  if (!m || times <= 0) return '';
  const n = Number(m[1]) * times;
  const flat = m[3] ? Number(m[3]) * times : 0;
  return `${n}d${m[2]}${flat ? `+${flat}` : ''}`;
}

/** Extra damage part for casting `spellLevel` with a slot of `castAtLevel` (none when not upcast). */
export function upcastDamagePart(
  perLevel: string | undefined,
  spellLevel: number,
  castAtLevel: number | undefined,
  type: string | undefined,
): DamagePart | undefined {
  const extra = (castAtLevel ?? spellLevel) - spellLevel;
  if (!perLevel || spellLevel < 1 || extra <= 0) return undefined;
  const dice = scaleDice(perLevel, extra);
  return dice ? { dice, type: type ?? '', label: `Nâng ô +${extra}` } : undefined;
}

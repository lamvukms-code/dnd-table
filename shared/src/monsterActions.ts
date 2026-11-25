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
    // "makes three attacks, only one of which can be with its bite": 1 bite + the rest with another attack
    const only = /only one of which (?:can|may) be (?:with |a )?(?:its |his |her |their )?([A-Za-z' -]+?)(?:\s+attack)?(?=[,.;]|$)/i.exec(desc);
    if (only && count > 1) {
      const x = byLen.find((a) => sing(only[1].trim().toLowerCase()).endsWith(sing(baseName(a.name))));
      const other = attacks.find((a) => a !== x);
      if (x && other) return [{ actionId: x.id, name: x.name, count: 1 }, { actionId: other.id, name: other.name, count: count - 1 }];
    }
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


// ---------------------------------------------------------------- multiattack options, multi-target, summons

const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const clean = (n: string) => n.replace(/\(.*?\)/g, '').trim().toLowerCase();

/** Find a stat-block action by a name written in prose ("Talons", "a use of Snap Limb", "its tail"). */
export function actionByProse(prose: string, actions: SheetAction[]): SheetAction | undefined {
  const p = prose.toLowerCase().replace(/^(?:a use of|use of|its|his|her|their|a|an|one)\s+/, '').replace(/\s+attacks?$/, '').trim();
  const sing = (w: string) => w.replace(/(?<=[a-z])s$/, '');
  const byLen = [...actions].sort((x, y) => clean(y.name).length - clean(x.name).length);
  return byLen.find((a) => {
    const n = clean(a.name);
    return n === p || sing(n) === sing(p) || p.startsWith(n) || sing(p).startsWith(sing(n));
  });
}

/** What a Multiattack lets you swap in ("can replace one attack with X", "use X in place of one attack") and what it uses first. */
export function multiattackOptions(description: string | undefined, actions: SheetAction[]): { swaps: SheetAction[]; pre: SheetAction[] } {
  const d = description ?? '';
  const others = actions.filter((a) => !/^multiattack/i.test(a.name));
  const swaps: SheetAction[] = [];
  const add = (list: SheetAction[], a: SheetAction | undefined) => a && !list.includes(a) && list.push(a);
  for (const m of d.matchAll(/(?:replace|in place of|instead of)[^.]*?\b(?:with|of)\s+(?:a use of\s+|its\s+|an?\s+)?([A-Z][\w' -]+?)(?:\s+attacks?)?(?=,|\.|\s+if\b|\s+\(|$)/g)) add(swaps, actionByProse(m[1], others));
  for (const m of d.matchAll(/\buse (?:its |his |her )?([A-Z][\w' -]+?) in place of/g)) add(swaps, actionByProse(m[1], others));
  for (const m of d.matchAll(/\bcan use (?:its |his |her )?([A-Z][\w' -]+?) instead of/g)) add(swaps, actionByProse(m[1], others));
  // free choice ("makes three attacks", "makes two attacks, using Claw or Bite"): any of its attacks
  if (/\bmakes\s+(?:two|three|four|five|\d+)\s+(?:melee\s+|ranged\s+|weapon\s+)?attacks(?!\s*:)/i.test(d) && !/\b(?:one|two|three)\s+with\s+(?:its|his|her|their)\b/i.test(d))
    for (const a of others) if (typeof a.attackBonus === 'number') add(swaps, a);
  const pre: SheetAction[] = [];
  for (const m of d.matchAll(/\b(?:uses|can use) (?:its|his|her) ([A-Z][\w' -]+?)(?:\s*\(if available\))?(?:,|\.| and| then)/g)) {
    const a = actionByProse(m[1], others);
    if (a && !swaps.includes(a)) add(pre, a);
  }
  return { swaps, pre };
}

/** "makes a tentacle attack against up to five creatures" / "makes a melee spell attack against each" (up to N). */
export function multiTargetSpec(a: SheetAction, actions: SheetAction[]): { attack: SheetAction; max: number } | null {
  const d = a.description ?? '';
  const m = /make[s]? (?:a|an|one) ([\w' -]+?) attack against (?:up to |each of up to )?(two|three|four|five|six|\d+) (?:different )?(?:creatures|targets)/i.exec(d);
  if (m) {
    const atk = actionByProse(m[1], actions.filter((x) => typeof x.attackBonus === 'number' && x.id !== a.id));
    if (atk) return { attack: atk, max: WORDNUM[m[2].toLowerCase()] ?? Number(m[2]) };
  }
  const n = /chooses? up to (two|three|four|five|six|\d+) creatures[^.]*\.[^.]*attack[^.]*against each/i.exec(d);
  if (n && typeof a.attackBonus === 'number') return { attack: a, max: WORDNUM[n[1].toLowerCase()] ?? Number(n[1]) };
  return null;
}

/** "summons three hunting hounds (use the Wolf stat block)", "lets out 1d4 will-o'-wisps", "summons two Wights". */
export function summonSpec(a: SheetAction, bestiaryNames: string[]): { count: string; name: string } | null {
  const d = a.description ?? '';
  const re = /(?:summons?|creates?|calls? forth|lets? out)\s+(?:up to\s+)?(\d+d\d+|\d+|an?|one|two|three|four|five|six)\s+([\w' -]+?)(?:\s*\(use the ([\w' -]+?) stat block\))?(?=\s+(?:in|into|that|which|to|who|and)\b|,|\.|$)/gi;
  const sing = (w: string) => w.replace(/(?<=[a-z])s$/, '').replace(/-/g, ' ');
  const names = bestiaryNames.filter(Boolean);
  for (const m of d.matchAll(re)) {
    const want = (m[3] ?? m[2]).trim().toLowerCase();
    const hit =
      names.find((n) => n.toLowerCase() === want) ??
      names.find((n) => sing(n.toLowerCase()) === sing(want)) ??
      (m[3] || want.split(/\s+/).length > 3 ? undefined : names.find((n) => sing(want).endsWith(' ' + sing(n.toLowerCase()))));
    if (!hit) continue;
    const c = m[1].toLowerCase();
    return { count: /d/.test(c) ? c : String(WORDNUM[c] ?? Number(c)), name: hit };
  }
  return null;
}

// ---------------------------------------------------------------- monster spell lists

export interface MonsterSpellEntry {
  name: string;
  /** Casts per day (unset = at will). */
  perDay?: number;
  /** Leveled caster: spell slots of this level (shared by the spells of that level). */
  slotLevel?: number;
  slots?: number;
}

/**
 * Read a Spellcasting trait / action: "At Will: Detect Magic, Hold Person 1/Day Each: Polymorph",
 * "3/day each: fear, darkness", "1st level (4 slots): cure wounds, bless". `isSpell` checks a name
 * against the spell database, so prose glued after the last spell is dropped.
 */
export function parseSpellList(text: string | undefined, isSpell: (name: string) => boolean): { entries: MonsterSpellEntry[]; dc?: number; attack?: number } {
  const t = (text ?? '').replace(/\s+/g, ' ');
  const dc = /spell save DC (\d+)/i.exec(t);
  const atk = /([+-]\d+) to hit(?: with spell attacks)?/i.exec(t);
  // also the Vietnamese wording of hand-written stat blocks: "2/ngày mỗi phép:", "Cấp 1 (4 slot):"
  const marker = /(At Will|Cantrips?(?: \(at will\))?|(\d+)\s*\/\s*(?:day|ngày)(?: each| mỗi phép)?|(?:(\d+)(?:st|nd|rd|th) level|Cấp (\d+)) \((\d+) slots?\))\s*:\s*/gi;
  const hits = [...t.matchAll(marker)];
  const entries: MonsterSpellEntry[] = [];
  hits.forEach((h, i) => {
    const start = (h.index ?? 0) + h[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index ?? t.length : t.length;
    const chunk = t.slice(start, end);
    const items = chunk.split(/,\s*/);
    for (let k = 0; k < items.length; k++) {
      // prose after the list ("… Polymorph. Constitution Saving Throw: DC 17, …") ends it
      const stop = /[.:;]\s+\S/.test(items[k].replace(/\(.*?\)/g, ''));
      // private-use glyphs some book exports put after homebrew spell names
      let raw = items[k].replace(/\(.*?\)/g, '').replace(/[*†]/g, '').replace(/[\uE000-\uF8FF]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/g, '').trim();
      // the last item may carry the next sentence: keep the longest leading run of words that is a spell
      const words = raw.split(/\s+/);
      let name = '';
      for (let w = Math.min(words.length, 5); w >= 1; w--) {
        const cand = words.slice(0, w).join(' ').replace(/[.:;]+$/, '').trim();
        if (isSpell(cand)) {
          name = cand;
          break;
        }
      }
      if (!name) {
        // not in the spell database: keep short plain names (homebrew spells), drop prose
        const plain = raw.replace(/[.:;]+$/, '');
        if (!stop && plain.split(/\s+/).length <= 4 && !/\d|[.:;]/.test(plain)) name = plain;
        else break;
      }
      raw = name;
      const e: MonsterSpellEntry = { name: raw };
      if (h[2]) e.perDay = Number(h[2]);
      if (h[3] || h[4]) {
        e.slotLevel = Number(h[3] || h[4]);
        e.slots = Number(h[5]);
      }
      if (!entries.some((x) => x.name.toLowerCase() === raw.toLowerCase())) entries.push(e);
      if (stop) break;
    }
  });
  return { entries, dc: dc ? Number(dc[1]) : undefined, attack: atk ? Number(atk[1]) : undefined };
}

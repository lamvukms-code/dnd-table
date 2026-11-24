import type { Ability, CharacterSheet, ConditionType } from './types.js';
import { abilityMod, classLevelOf, spellAttackBonus, spellSaveDc } from './rules.js';

/**
 * "Feature action": a button a class/subclass/species feature (or an item) declares in the DM's
 * local data, run through the app's existing flows (attack roll, saving throw, area, effect,
 * temp HP, heal). The mechanics are generic; the feature text stays in the git-ignored data.
 *
 * Formulas (dice / amounts) may use: `pb`, `lvl` (level in the feature's class), `mod:str` … `mod:cha`,
 * and `N*term` ("2*lvl", "2*mod:con"). Example: "1d6+mod:str", "2*mod:con", "1d8+mod:wis".
 */
export interface FeatureAction {
  label: string;
  kind: 'attack' | 'damage' | 'save' | 'aoe' | 'effect' | 'tempHp' | 'heal';
  /** Action economy spent (default: none). */
  cost?: 'action' | 'bonus' | 'reaction';
  /** Spend one use of the feature's own `uses` pool (default true when the feature has one). */
  spendsUse?: boolean;
  /** 'self' = the character's own token; default the sheet's current target. */
  target?: 'self' | 'target';
  /** attack: 'spell' | an ability ('str', 'dex') + PB | 'finesse' (best of STR/DEX) + PB | a number. */
  attack?: 'spell' | 'finesse' | Ability | number;
  /** damage / heal / temp HP formula. */
  dice?: string;
  type?: string;
  /** save / aoe: the save the target rolls. `dc`: 'spell', 'dc:con' (8 + PB + CON), 'dc:int|con' (best), or a number. */
  save?: { ability: Ability; dc: string | number; halfOnSave?: boolean };
  /** aoe: template text ("cone 30", "15-foot cube", "cầu 10ft") and range in feet for point templates. */
  area?: string;
  rangeFeet?: number;
  range?: 'melee' | 'ranged';
  /** effect placed on the target (effect kind), or on a failed save (save / aoe). */
  effect?: { name?: string; condition?: ConditionType; note?: string; rounds?: number; acBonus?: number; repeat?: 'end-of-turn' | 'start-of-turn' };
}

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function termValue(term: string, sheet: CharacterSheet, classKey?: string): number | null {
  if (term === 'pb') return sheet.proficiencyBonus;
  if (term === 'lvl') return classKey ? classLevelOf(sheet, classKey) || sheet.level : sheet.level;
  const m = /^mod:(str|dex|con|int|wis|cha)$/.exec(term);
  return m ? abilityMod(sheet.abilities[m[1] as Ability]) : null;
}

/** Resolve a feature formula into plain dice notation ("1d6+mod:str" → "1d6+3", "2*lvl" → "10"). */
export function resolveFeatureFormula(expr: string, sheet: CharacterSheet, classKey?: string): string {
  let s = expr.replace(/\s+/g, '');
  s = s.replace(/(\d+)\*(pb|lvl|mod:[a-z]{3})/g, (_, n, t) => String(Number(n) * (termValue(t, sheet, classKey) ?? 0)));
  s = s.replace(/(pb|lvl|mod:[a-z]{3})/g, (t) => String(termValue(t, sheet, classKey) ?? 0));
  // fold constant terms: "1d6+3+-1" → "1d6+2"; "4+3" → "7"
  const parts = s.match(/[+-]?[^+-]+/g) ?? [];
  let flat = 0;
  const dice: string[] = [];
  for (const p of parts) {
    if (/d/i.test(p)) dice.push(p.startsWith('+') || p.startsWith('-') ? p : `+${p}`);
    else flat += Number(p) || 0;
  }
  const out = dice.join('').replace(/^\+/, '');
  if (!out) return String(Math.max(0, flat));
  return flat ? `${out}${flat > 0 ? '+' : ''}${flat}` : out;
}

/** Save DC for a feature: 'spell', 'dc:con', 'dc:int|con' (the better), or a fixed number. */
export function resolveFeatureDc(spec: string | number, sheet: CharacterSheet): number {
  if (typeof spec === 'number') return spec;
  if (spec === 'spell') return spellSaveDc(sheet) ?? 8 + sheet.proficiencyBonus;
  const m = /^dc:([a-z|]+)$/.exec(spec);
  if (m) {
    const best = Math.max(...m[1].split('|').filter((a): a is Ability => (ABILITIES as string[]).includes(a)).map((a) => abilityMod(sheet.abilities[a])));
    return 8 + sheet.proficiencyBonus + (Number.isFinite(best) ? best : 0);
  }
  return Number(spec) || 10;
}

/** Attack bonus for a feature attack. */
export function resolveFeatureAttack(spec: FeatureAction['attack'], sheet: CharacterSheet): number {
  if (typeof spec === 'number') return spec;
  if (spec === 'spell') return spellAttackBonus(sheet) ?? sheet.proficiencyBonus;
  if (spec === 'finesse') return Math.max(abilityMod(sheet.abilities.str), abilityMod(sheet.abilities.dex)) + sheet.proficiencyBonus;
  if (spec && (ABILITIES as string[]).includes(spec)) return abilityMod(sheet.abilities[spec]) + sheet.proficiencyBonus;
  return abilityMod(sheet.abilities.str) + sheet.proficiencyBonus;
}

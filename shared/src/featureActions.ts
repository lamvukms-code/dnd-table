import type { Ability, ActiveEffect, CharacterSheet, ConditionType } from './types.js';
import { abilityMod, classLevelOf, spellAttackBonus, spellSaveDc } from './rules.js';

/**
 * "Feature action": a button a class/subclass/species feature (or an item) declares in the DM's
 * local data, run through the app's existing flows (attack roll, saving throw, area, effect,
 * temp HP, heal). The mechanics are generic; the feature text stays in the git-ignored data.
 *
 * Formulas (dice / amounts) may use: `pb`, `lvl` (level in the feature's class), `mod:str` … `mod:cha`,
 * `N*term` ("2*lvl", "2*mod:con"), `term/N` (rounded down: "mod:wis/2", "lvl/3") and dice counts
 * from a term ("mod:cond8"). Example: "1d6+mod:str", "2*mod:con", "1d8+mod:wis".
 */
export interface FeatureAction {
  label: string;
  kind: 'attack' | 'damage' | 'save' | 'aoe' | 'effect' | 'tempHp' | 'heal' | 'summon';
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
  /** `dice` by class level ({ 3: '2*mod:con', 14: '3*mod:con' }) — wins over `dice`. */
  diceByLevel?: Record<number, string>;
  /** attack: a weapon-style strike — Rage, feature riders and armed riders apply as on a weapon row. */
  weapon?: boolean;
  /** summon: a token placed next to the character (controlled by its player). */
  summon?: { label: string; ac: string; hp: string; color?: string };
  type?: string;
  /** save / aoe: the save the target rolls. `dc`: 'spell', 'dc:con' (8 + PB + CON), 'dc:int|con' (best), or a number. */
  save?: { ability: Ability; dc: string | number; halfOnSave?: boolean };
  /** aoe: template text ("cone 30", "15-foot cube", "cầu 10ft") and range in feet for point templates. */
  area?: string;
  rangeFeet?: number;
  range?: 'melee' | 'ranged';
  /** effect placed on the target (effect kind), or on a failed save (save / aoe). */
  effect?: FeatureEffect;
}

/** An effect a feature button applies (formulas allowed for numbers and dice). */
export interface FeatureEffect {
  name?: string;
  condition?: ConditionType;
  note?: string;
  rounds?: number;
  repeat?: 'end-of-turn' | 'start-of-turn';
  /** AC bonus: a number or a formula ("mod:wis/2", "max1:lvl/3" = at least 1). */
  acBonus?: number | string;
  acMin?: number;
  /** Unarmored AC base (+ DEX), like Mage Armor's 13. */
  acBase?: number;
  resist?: string[];
  /** Extra damage on the bearer's own weapon hits while it lasts. */
  attackRiders?: { dice: string; type: string; label?: string; melee?: boolean }[];
  /** Damage dealt back to a creature that hits the bearer in melee. */
  retaliate?: { dice: string; type: string; always?: boolean };
  saveAdvantage?: Ability[];
  /** Ends when the bearer drops to 0 HP or is incapacitated. */
  endsWhenDown?: boolean;
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
  s = s.replace(/(pb|lvl|mod:[a-z]{3})\/(\d+)/g, (_, t, n) => String(Math.floor((termValue(t, sheet, classKey) ?? 0) / Number(n))));
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

/** A plain number from a formula ("mod:wis/2" → 1); "max1:" prefix = at least 1. */
export function resolveFeatureNumber(expr: number | string, sheet: CharacterSheet, classKey?: string): number {
  if (typeof expr === 'number') return expr;
  const min1 = expr.startsWith('max1:');
  const n = Number(resolveFeatureFormula(min1 ? expr.slice(5) : expr, sheet, classKey)) || 0;
  return min1 ? Math.max(1, n) : n;
}

/** The action's dice for the character's level (`diceByLevel` beats `dice`), resolved. */
export function featureActionDice(a: Pick<FeatureAction, 'dice' | 'diceByLevel'>, sheet: CharacterSheet, classKey?: string): string {
  let expr = a.dice;
  if (a.diceByLevel) {
    const lvl = classKey ? classLevelOf(sheet, classKey) || sheet.level : sheet.level;
    let bestKey = -1;
    for (const [k, v] of Object.entries(a.diceByLevel)) {
      const n = Number(k);
      if (n <= lvl && n > bestKey) {
        bestKey = n;
        expr = v;
      }
    }
  }
  return expr ? resolveFeatureFormula(expr, sheet, classKey) : '';
}

/** Build the ActiveEffect a feature button applies (formulas resolved against the caster's sheet). */
export function buildFeatureEffect(
  a: Pick<FeatureAction, 'label' | 'effect' | 'save' | 'kind'>,
  sheet: CharacterSheet,
  classKey: string | undefined,
  round: number,
  featureName: string,
): ActiveEffect | undefined {
  const e = a.effect;
  if (!e) return undefined;
  const acBonus = e.acBonus != null ? resolveFeatureNumber(e.acBonus, sheet, classKey) : undefined;
  return {
    id: '',
    name: e.name ?? a.label,
    sourceSheetId: sheet.id,
    condition: e.condition,
    note: e.note ?? featureName,
    acBonus: acBonus || undefined,
    acMin: e.acMin,
    acBase: e.acBase,
    resist: e.resist,
    attackRiders: e.attackRiders?.map((r) => ({
      dice: resolveFeatureFormula(r.dice, sheet, classKey),
      type: r.type,
      label: r.label ?? e.name ?? a.label,
      melee: r.melee,
    })),
    retaliate: e.retaliate ? { dice: resolveFeatureFormula(e.retaliate.dice, sheet, classKey), type: e.retaliate.type, always: e.retaliate.always } : undefined,
    saveAdvantage: e.saveAdvantage,
    endsWhenDown: e.endsWhenDown,
    expiresRound: e.rounds ? round + e.rounds : undefined,
    save:
      e.repeat && a.save
        ? { ability: a.save.ability, dc: resolveFeatureDc(a.save.dc, sheet), repeat: e.repeat }
        : undefined,
  };
}

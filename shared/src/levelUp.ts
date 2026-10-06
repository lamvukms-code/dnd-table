import { classDefaults } from './classDefaults.js';
import { abilityMod, sheetClasses, totalLevelOf } from './rules.js';
import type { CharacterSheet } from './types.js';

export const MAX_LEVEL = 20;

/** Hit die size of the class that would gain the level (null = unknown / no class chosen). */
export function levelUpDie(sheet: CharacterSheet, classIndex = 0): number | null {
  const c = sheetClasses(sheet)[classIndex];
  return classDefaults(c?.name)?.hitDie ?? null;
}

export interface LevelUpHp {
  die: number;
  conMod: number;
  first: number;
  /** Set when the first roll was a 1 → the pity reroll that REPLACES it (must be kept, even if lower). */
  second?: number;
  /** The die value actually used. */
  used: number;
  /** HP gained: used die + CON modifier, never less than 1 (5e). */
  gain: number;
}

/** Pity rule: a first roll of 1 is rerolled once and the second result stands. */
export const needsPityReroll = (first: number): boolean => first === 1;

export function levelUpHp(die: number, conScore: number, first: number, second?: number): LevelUpHp {
  const conMod = abilityMod(conScore);
  const pity = needsPityReroll(first) && typeof second === 'number';
  const used = pity ? (second as number) : first;
  return { die, conMod, first, second: pity ? second : undefined, used, gain: Math.max(1, used + conMod) };
}

/** +1 level in the chosen class (single-class sheets just bump `level`). HP / proficiency / slots are
 *  recomputed afterwards by `normalizeSheet`; the HP gain is applied by the caller. */
export function bumpLevel(sheet: CharacterSheet, classIndex = 0): CharacterSheet {
  if (sheet.classes && sheet.classes.length > 0) {
    return { ...sheet, classes: sheet.classes.map((c, i) => (i === classIndex ? { ...c, level: c.level + 1 } : c)) };
  }
  return { ...sheet, level: sheet.level + 1 };
}

export const hasToughFeat = (sheet: Pick<CharacterSheet, 'feats'>): boolean =>
  (sheet.feats ?? []).some((f) => /^\s*tough\b/i.test(f.name ?? ''));

/** Tough (2024): +2 max HP per character level — granted retroactively when the feat is taken and
 *  again for every level gained after. Tracks what it already granted in `toughBonus` so it is applied
 *  exactly once, and removed if the feat is. Pure. */
export function applyToughFeat(sheet: CharacterSheet): CharacterSheet {
  const want = hasToughFeat(sheet) ? 2 * totalLevelOf(sheet) : 0;
  const have = sheet.toughBonus ?? 0;
  if (want === have) return sheet;
  const delta = want - have;
  const maxHp = Math.max(1, sheet.maxHp + delta);
  return {
    ...sheet,
    toughBonus: want || undefined,
    maxHp,
    // gaining max HP also heals by that much; losing it only clamps
    currentHp: Math.min(maxHp, delta > 0 ? sheet.currentHp + delta : sheet.currentHp),
  };
}

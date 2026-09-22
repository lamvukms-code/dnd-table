import type { Ability, CharacterSheet } from './types.js';
import { abilityMod, sheetClasses } from './rules.js';

/**
 * Class rules a sheet can be filled in from (SRD 5.2.1, CC BY 4.0): hit die, saving-throw
 * proficiencies and the skill list a new character picks from. A player who only writes down
 * ability scores still gets correct saves / skills / HP once the class is known.
 */
export interface ClassDefaults {
  hitDie: number;
  saves: Ability[];
  /** How many skills the class lets you pick. */
  skillPick: number;
  /** Skill keys to pick from; null = any skill (Bard). */
  skillOptions: string[] | null;
}

const D = (
  hitDie: number,
  saves: [Ability, Ability],
  skillPick: number,
  skillOptions: string[] | null,
): ClassDefaults => ({ hitDie, saves, skillPick, skillOptions });

export const CLASS_DEFAULTS: Record<string, ClassDefaults> = {
  barbarian: D(12, ['str', 'con'], 2, ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival']),
  bard: D(8, ['dex', 'cha'], 3, null),
  cleric: D(8, ['wis', 'cha'], 2, ['history', 'insight', 'medicine', 'persuasion', 'religion']),
  druid: D(8, ['int', 'wis'], 2, ['animal-handling', 'arcana', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival']),
  fighter: D(10, ['str', 'con'], 2, ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'persuasion', 'perception', 'survival']),
  monk: D(8, ['str', 'dex'], 2, ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth']),
  paladin: D(10, ['wis', 'cha'], 2, ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion']),
  ranger: D(10, ['str', 'dex'], 3, ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival']),
  rogue: D(8, ['dex', 'int'], 4, ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleight-of-hand', 'stealth']),
  sorcerer: D(6, ['con', 'cha'], 2, ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion']),
  warlock: D(8, ['wis', 'cha'], 2, ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion']),
  wizard: D(6, ['int', 'wis'], 2, ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion']),
};

export function classDefaults(className: string | undefined): ClassDefaults | null {
  const key = (className ?? '').trim().toLowerCase();
  return CLASS_DEFAULTS[key] ?? null;
}

/** The character's first class' defaults (saving throws come from the starting class only). */
export function primaryClassDefaults(sheet: CharacterSheet): ClassDefaults | null {
  return classDefaults(sheetClasses(sheet)[0]?.name);
}

/**
 * What a class grants when it's a SECONDARY class (SRD 5.2.1 "Multiclassing" — each class' own "As a Multiclass
 * Character" bullet): a smaller slice of that class' normal starting proficiencies. Unlike the level-1 grant, this
 * never includes saving throws.
 */
export interface MulticlassProficiencies {
  /** Armor categories trained (shield counted separately). */
  armor: ('light' | 'medium' | 'heavy')[];
  shield: boolean;
  /** Weapon proficiency granted, as shown on the sheet ('' = none). */
  weapons: string;
  /** Extra skill proficiencies granted (0 for most classes). */
  skillPick: number;
  /** Pool the skill pick comes from; null = any skill (Bard, Cleric). Ignored when skillPick is 0. */
  skillOptions: string[] | null;
  /** A specific tool/instrument proficiency granted, if any. */
  tool?: string;
}

const M = (
  armor: MulticlassProficiencies['armor'],
  shield: boolean,
  weapons: string,
  skillPick = 0,
  skillOptions: string[] | null = null,
  tool?: string,
): MulticlassProficiencies => ({ armor, shield, weapons, skillPick, skillOptions, tool });

export const MULTICLASS_PROFICIENCIES: Record<string, MulticlassProficiencies> = {
  barbarian: M([], true, 'Vũ khí Martial'),
  bard: M(['light'], false, '', 1, null, 'Nhạc cụ (1 loại tuỳ chọn)'),
  cleric: M(['light', 'medium'], true, ''),
  druid: M(['light'], true, ''),
  fighter: M(['light', 'medium'], true, 'Vũ khí Martial'),
  monk: M([], false, ''),
  paladin: M(['light', 'medium'], true, 'Vũ khí Martial'),
  ranger: M(['light', 'medium'], true, 'Vũ khí Martial', 1, CLASS_DEFAULTS.ranger.skillOptions),
  rogue: M(['light'], false, '', 1, CLASS_DEFAULTS.rogue.skillOptions, "Bộ đồ nghề trộm (Thieves' Tools)"),
  sorcerer: M([], false, ''),
  warlock: M(['light'], false, ''),
  wizard: M([], false, ''),
};

export function multiclassProficiencies(className: string | undefined): MulticlassProficiencies | null {
  const key = (className ?? '').trim().toLowerCase();
  return MULTICLASS_PROFICIENCIES[key] ?? null;
}

/** HP by the fixed-average method: max die at level 1, then die/2 + 1 per level, + CON mod each. */
export function recommendedHp(sheet: CharacterSheet): number | null {
  const classes = sheetClasses(sheet).filter((c) => c.level > 0);
  if (classes.length === 0) return null;
  const conMod = abilityMod(sheet.abilities.con);
  let hp = 0;
  let first = true;
  for (const c of classes) {
    const def = classDefaults(c.name);
    if (!def) return null;
    for (let lvl = 1; lvl <= c.level; lvl++) {
      hp += (first ? def.hitDie : Math.floor(def.hitDie / 2) + 1) + conMod;
      first = false;
    }
  }
  return Math.max(1, hp);
}

/** Saving-throw proficiencies the class grants, merged into what the sheet already has. */
export function withClassSaves(sheet: CharacterSheet): Ability[] {
  const def = primaryClassDefaults(sheet);
  return def ? Array.from(new Set([...sheet.saveProficiencies, ...def.saves])) : sheet.saveProficiencies;
}

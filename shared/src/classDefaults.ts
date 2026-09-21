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

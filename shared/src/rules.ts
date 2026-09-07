import type { Ability, CharacterSheet } from './types.js';
import { SKILLS } from './types.js';

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function saveBonus(sheet: CharacterSheet, ability: Ability): number {
  const base = abilityMod(sheet.abilities[ability]);
  return base + (sheet.saveProficiencies.includes(ability) ? sheet.proficiencyBonus : 0);
}

export function skillBonus(sheet: CharacterSheet, skill: string): number {
  const ability = SKILLS[skill];
  const base = abilityMod(sheet.abilities[ability]);
  let bonus = base;
  if (sheet.skillExpertise.includes(skill)) bonus += sheet.proficiencyBonus * 2;
  else if (sheet.skillProficiencies.includes(skill)) bonus += sheet.proficiencyBonus;
  return bonus;
}

export function initiativeBonus(sheet: CharacterSheet): number {
  return abilityMod(sheet.abilities.dex) + sheet.initiativeMisc;
}

/** Suggested proficiency bonus by level (5e). */
export function proficiencyByLevel(level: number): number {
  return Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4) + 2;
}

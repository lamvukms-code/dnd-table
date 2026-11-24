import { describe, expect, it } from 'vitest';
import { applyLongRest, exhaustionPenalty, initiativeBonus, saveBonus, skillBonus, walkSpeed } from './rules.js';
import type { CharacterSheet } from './types.js';

const sheet = (exhaustion?: number): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'A', className: 'Fighter', level: 5, proficiencyBonus: 3,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    saveProficiencies: ['str', 'con'], skillProficiencies: ['athletics'], skillExpertise: [],
    maxHp: 40, currentHp: 20, tempHp: 5, armorClass: 16, speed: 30, initiativeMisc: 0,
    actions: [], damageRiders: [], resources: [], spellSlots: [], spells: [], feats: [], features: [], inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', exhaustion,
  }) as unknown as CharacterSheet;

describe('Exhaustion (2024)', () => {
  it('−2 per level, capped at 6', () => {
    expect(exhaustionPenalty(undefined)).toBe(0);
    expect(exhaustionPenalty(0)).toBe(0);
    expect(exhaustionPenalty(3)).toBe(-6);
    expect(exhaustionPenalty(9)).toBe(-12);
  });
  it('lowers saves, skills and initiative', () => {
    expect(saveBonus(sheet(), 'str')).toBe(6);
    expect(saveBonus(sheet(2), 'str')).toBe(2);
    expect(skillBonus(sheet(1), 'athletics')).toBe(4);
    expect(initiativeBonus(sheet(2))).toBe(-2);
  });
  it('−5 ft speed per level, never below 0', () => {
    expect(walkSpeed(30, undefined, false, 2)).toBe(20);
    expect(walkSpeed(undefined, 10, false, 3)).toBe(0);
    expect(walkSpeed(30, undefined, false)).toBe(30);
  });
  it('a long rest removes one level', () => {
    expect(applyLongRest(sheet(3)).exhaustion).toBe(2);
    expect(applyLongRest(sheet(0)).exhaustion).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { classDefaults, recommendedHp, withClassSaves } from './classDefaults.js';
import type { CharacterSheet } from './types.js';

const sheet = (over: Partial<CharacterSheet>): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className: 'Druid', level: 3, proficiencyBonus: 2,
    abilities: { str: 10, dex: 10, con: 16, int: 10, wis: 16, cha: 10 },
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 10, currentHp: 10, tempHp: 0,
    armorClass: 10, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], resources: [], spellSlots: [],
    spells: [], feats: [], features: [], inventory: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '',
    ...over,
  }) as CharacterSheet;

describe('class defaults', () => {
  it('knows the 2024 SRD classes case-insensitively', () => {
    expect(classDefaults('druid')?.saves).toEqual(['int', 'wis']);
    expect(classDefaults('Rogue')?.skillPick).toBe(4);
    expect(classDefaults('Homebrew')).toBeNull();
  });
  it('recommends HP: max die at level 1, average after, + CON each level', () => {
    // Druid d8, CON +3: 8+3 + 2 * (5+3) = 27
    expect(recommendedHp(sheet({}))).toBe(27);
    // Barbarian d12, CON +3, level 1
    expect(recommendedHp(sheet({ className: 'Barbarian', level: 1 }))).toBe(15);
    expect(recommendedHp(sheet({ className: 'Unknown' }))).toBeNull();
  });
  it('merges class saves into the existing ones', () => {
    expect(withClassSaves(sheet({ saveProficiencies: ['dex'] })).sort()).toEqual(['dex', 'int', 'wis']);
  });
});

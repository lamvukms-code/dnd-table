import { describe, expect, it } from 'vitest';
import { classDefaults, multiclassProficiencies, recommendedHp, withClassSaves } from './classDefaults.js';
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

describe('multiclass proficiencies (SRD 5.2.1 "As a Multiclass Character")', () => {
  it('grants a smaller slice than the level-1 class, never saving throws', () => {
    const fighter = multiclassProficiencies('Fighter')!;
    expect(fighter).toMatchObject({ armor: ['light', 'medium'], shield: true, weapons: 'Vũ khí Martial', skillPick: 0 });
    const barbarian = multiclassProficiencies('barbarian')!;
    expect(barbarian).toMatchObject({ armor: [], shield: true, weapons: 'Vũ khí Martial' }); // no armor training, shield only
    const monk = multiclassProficiencies('Monk')!;
    expect(monk).toMatchObject({ armor: [], shield: false, weapons: '', skillPick: 0 }); // Hit Point Die only
    expect(multiclassProficiencies('Homebrew')).toBeNull();
  });
  it('skill-granting classes: Bard (any skill), Ranger/Rogue (own list), count 1', () => {
    const bard = multiclassProficiencies('Bard')!;
    expect(bard.skillPick).toBe(1);
    expect(bard.skillOptions).toBeNull();
    expect(bard.tool).toMatch(/Nhạc cụ/);
    const rogue = multiclassProficiencies('Rogue')!;
    expect(rogue.skillPick).toBe(1);
    expect(rogue.skillOptions).toEqual(classDefaults('Rogue')!.skillOptions);
    expect(rogue.tool).toMatch(/Thieves/);
    const ranger = multiclassProficiencies('Ranger')!;
    expect(ranger.skillPick).toBe(1);
    expect(ranger.skillOptions).toEqual(classDefaults('Ranger')!.skillOptions);
  });
  it('casters with no armor/weapon multiclass grant (Sorcerer, Wizard) get nothing but the Hit Point Die', () => {
    for (const c of ['Sorcerer', 'Wizard']) {
      const p = multiclassProficiencies(c)!;
      expect(p).toMatchObject({ armor: [], shield: false, weapons: '', skillPick: 0, tool: undefined });
    }
  });
});

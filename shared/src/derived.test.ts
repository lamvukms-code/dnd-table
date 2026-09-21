import { describe, expect, it } from 'vitest';
import {
  computeSpeed,
  damageWithTempHp,
  effectiveArmorClass,
  grantTempHp,
  hitDicePools,
  npcArmorClass,
  regainHitDice,
  spendHitDie,
} from './derived.js';
import { applyLongRest } from './rules.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const sheet = (over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className: 'Rogue', level: 5, proficiencyBonus: 3,
    abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 40, currentHp: 40, tempHp: 0,
    armorClass: 10, acOverride: null, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], resources: [],
    spellSlots: [], spells: [], feats: [], features: [], inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', ...over,
  }) as CharacterSheet;
const armor = (armorBase: number, cat: 'light' | 'medium' | 'heavy'): InventoryItem =>
  ({ id: 'a', name: 'Armor', type: 'armor', quantity: 1, weight: 0, equipped: true, notes: '', armorBase, armorCategory: cat }) as InventoryItem;

describe('effective AC', () => {
  it('unarmored: 10 + DEX; Barbarian / Monk unarmored defense', () => {
    expect(effectiveArmorClass(sheet(), []).ac).toBe(13);
    expect(effectiveArmorClass(sheet({ className: 'Barbarian' }), []).ac).toBe(15); // 10 +3 DEX +2 CON
    expect(effectiveArmorClass(sheet({ className: 'Monk' }), []).ac).toBe(15); // 10 +3 DEX +2 WIS
  });
  it('armor beats unarmored defense; medium armor caps DEX', () => {
    expect(effectiveArmorClass(sheet({ className: 'Barbarian', inventory: [armor(14, 'medium')] }), []).ac).toBe(16);
  });
  it('Mage Armor (13 + DEX), Shield of Faith (+2), Barkskin (min 17)', () => {
    const mage = { id: 'e', name: 'Mage Armor', acBase: 13 };
    expect(effectiveArmorClass(sheet(), [mage]).ac).toBe(16);
    expect(effectiveArmorClass(sheet(), [{ id: 'e', name: 'Shield of Faith', acBonus: 2 }]).ac).toBe(15);
    expect(effectiveArmorClass(sheet(), [{ id: 'e', name: 'Barkskin', acMin: 17 }]).ac).toBe(17);
    // Mage Armor does nothing over worn armor
    expect(effectiveArmorClass(sheet({ inventory: [armor(16, 'heavy')] }), [mage]).ac).toBe(16);
  });
  it('NPC AC takes the same effects', () => {
    expect(npcArmorClass(12, [{ id: 'e', name: 'Shield', acBonus: 5 }])).toBe(17);
  });
});

describe('speed', () => {
  it('adds Barbarian Fast Movement and Monk Unarmored Movement', () => {
    expect(computeSpeed(sheet({ className: 'Barbarian', level: 5 })).speed).toBe(40);
    expect(computeSpeed(sheet({ className: 'Barbarian', level: 5, inventory: [armor(18, 'heavy')] })).speed).toBe(30);
    expect(computeSpeed(sheet({ className: 'Monk', level: 6 })).speed).toBe(45);
    expect(computeSpeed(sheet({ className: 'Monk', level: 6, inventory: [armor(12, 'light')] })).speed).toBe(30);
  });
});

describe('hit dice', () => {
  it('has one die of the class size per level, spends and regains half on a long rest', () => {
    let s = sheet({ className: 'Rogue', level: 5 });
    expect(hitDicePools(s)).toEqual([{ die: 8, max: 5, used: 0, left: 5 }]);
    for (let i = 0; i < 5; i++) s = spendHitDie(s, 8)!;
    expect(spendHitDie(s, 8)).toBeNull();
    expect(hitDicePools(s)[0].left).toBe(0);
    s = regainHitDice(s); // half of 5 = 2
    expect(hitDicePools(s)[0].left).toBe(2);
    expect(hitDicePools(applyLongRest(s))[0].left).toBe(4);
  });
  it('multiclass keeps separate die sizes, largest regained first', () => {
    const s = sheet({ className: 'x', classes: [{ name: 'Barbarian', level: 2 }, { name: 'Wizard', level: 2 }] } as never);
    expect(hitDicePools(s).map((p) => [p.die, p.max])).toEqual([[12, 2], [6, 2]]);
  });
});

describe('temp HP', () => {
  it('absorbs damage before HP and never below zero', () => {
    expect(damageWithTempHp(20, 5, 8)).toEqual({ hp: 17, temp: 0, absorbed: 5, applied: 3 });
    expect(damageWithTempHp(20, 10, 4)).toEqual({ hp: 20, temp: 6, absorbed: 4, applied: 0 });
    expect(damageWithTempHp(2, 0, 9)).toEqual({ hp: 0, temp: 0, absorbed: 0, applied: 2 });
  });
  it("doesn't stack — the larger pool wins", () => {
    expect(grantTempHp(5, 8)).toBe(8);
    expect(grantTempHp(9, 4)).toBe(9);
  });
});

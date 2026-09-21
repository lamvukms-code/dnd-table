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
import { allActions, applyLongRest, computeSpellSlots, isUnarmedAction, multiclassIssues, riderParts, spellAttackBonus, spellSaveDc } from './rules.js';
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

describe('Shillelagh imbue + Wood Wose', () => {
  const druid = (over: Partial<CharacterSheet> = {}) =>
    sheet({ className: 'Druid', level: 5, proficiencyBonus: 3, ...over });
  const shil = {
    id: 'e',
    name: 'Shillelagh',
    weaponImbue: { weapons: 'club|quarterstaff', dice: ['1d8', '1d10', '1d12', '2d6'] as [string, string, string, string] },
  };
  const staff = { id: 'w', name: 'Quarterstaff', type: 'weapon', quantity: 1, weight: 0, equipped: true, notes: '', damage: '1d6', damageType: 'bludgeoning', proficient: true } as InventoryItem;

  it('rewrites a matching weapon to WIS + PB and the scaled die', () => {
    const acts = allActions(druid({ inventory: [staff] }), [shil]);
    const a = acts.find((x) => x.id === 'weapon:w')!;
    expect(a.attackBonus).toBe(5); // WIS +2, PB +3
    expect(a.damage).toBe('1d10+2'); // level 5
    expect(allActions(druid({ level: 4, inventory: [staff] }), [shil]).find((x) => x.id === 'weapon:w')!.damage).toBe('1d8+2');
  });
  it('adds a ready-made attack when no club/staff is equipped, and does nothing without the effect', () => {
    expect(allActions(druid(), [shil]).some((x) => x.id === 'imbue:weapon')).toBe(true);
    expect(allActions(druid({ inventory: [staff] }), []).find((x) => x.id === 'weapon:w')!.damage).not.toContain('d10');
  });
  it('Wood Wose: unarmored AC 10 + DEX + WIS', () => {
    // DEX 16 (+3), WIS 14 (+2)
    expect(effectiveArmorClass(druid(), [{ id: 'e', name: 'Wood Wose', acBase: 12 }]).ac).toBe(15);
  });
});

describe('multiclass', () => {
  const mc = (classes: { name: string; level: number; subclass?: string }[], over: Partial<CharacterSheet> = {}) =>
    sheet({ classes, level: classes.reduce((n, c) => n + c.level, 0), className: 'x', ...over });

  it('level 1 + prerequisites (13+ in the primary ability of every class)', () => {
    const s = mc([{ name: 'Wizard', level: 3 }, { name: 'Rogue', level: 2 }], { abilities: { str: 8, dex: 16, con: 14, int: 10, wis: 10, cha: 10 } });
    expect(multiclassIssues(s)).toEqual(['Wizard: cần INT 13+']);
    expect(multiclassIssues(mc([{ name: 'Fighter', level: 1 }, { name: 'Monk', level: 1 }], { abilities: { str: 14, dex: 14, con: 10, int: 10, wis: 8, cha: 10 } }))).toEqual(['Monk: cần WIS 13+']);
    expect(multiclassIssues(mc([{ name: 'Rogue', level: 5 }]))).toEqual([]); // single class: nothing to check
  });
  it('hit dice pool by die type across classes', () => {
    const pools = hitDicePools(mc([{ name: 'Cleric', level: 5 }, { name: 'Paladin', level: 5 }, { name: 'Fighter', level: 2 }]));
    expect(pools.map((p) => [p.die, p.max])).toEqual([[10, 7], [8, 5]]);
  });
  it('spell slots: full levels + half (rounded UP) of Paladin/Ranger — SRD 5.2.1 example (Ranger 4 / Sorcerer 3 = 5)', () => {
    const slots = computeSpellSlots(mc([{ name: 'Ranger', level: 4 }, { name: 'Sorcerer', level: 3 }]));
    expect(slots.map((s) => [s.level, s.max])).toEqual([[1, 4], [2, 3], [3, 2]]); // caster level 5
    // Paladin 3 = 2 (rounded up) + Wizard 1 = caster level 3
    expect(computeSpellSlots(mc([{ name: 'Paladin', level: 3 }, { name: 'Wizard', level: 1 }])).map((s) => s.level)).toEqual([1, 2]);
  });
  it('each spell uses its own class ability + PB total level', () => {
    const s = mc([{ name: 'Wizard', level: 3 }, { name: 'Cleric', level: 2 }], { abilities: { str: 10, dex: 10, con: 10, int: 18, wis: 12, cha: 10 }, proficiencyBonus: 3 });
    expect(spellSaveDc(s, { castingClass: 'Wizard' })).toBe(8 + 3 + 4);
    expect(spellSaveDc(s, { castingClass: 'Cleric' })).toBe(8 + 3 + 1);
    expect(spellAttackBonus(s, { castingClass: 'Cleric' })).toBe(3 + 1);
  });
  it('unarmed riders ride unarmed strikes only', () => {
    const s = sheet({ damageRiders: [{ id: 'r', name: 'Fists', dice: '1d4', type: 'fire', enabled: true, scope: 'unarmed' }] });
    expect(riderParts(s, 'weapon').length).toBe(0);
    expect(riderParts(s, 'weapon', { unarmed: true }).map((p) => p.label)).toEqual(['Fists']);
    expect(riderParts(s, 'spell', { unarmed: true }).length).toBe(0);
    expect(isUnarmedAction({ id: 'unarmed' })).toBe(true);
    expect(isUnarmedAction({ id: 'weapon:x' })).toBe(false);
  });
});

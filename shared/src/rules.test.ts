import { describe, expect, it } from 'vitest';
import {
  allAttacks,
  carriedWeight,
  computeArmorClass,
  currencyInGp,
  derivedAttacks,
  emptyCurrency,
} from './rules.js';
import type { CharacterSheet, InventoryItem } from './types.js';

function sheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 's1',
    ownerId: 'p1',
    name: 'Test',
    className: 'Fighter',
    level: 3,
    proficiencyBonus: 2,
    abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 28,
    currentHp: 28,
    tempHp: 0,
    armorClass: 10,
    acOverride: null,
    speed: 30,
    initiativeMisc: 0,
    attacks: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
    ...over,
  };
}

function item(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    name: 'Item',
    type: 'gear',
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
    ...over,
  };
}

describe('computeArmorClass', () => {
  it('unarmored = 10 + DEX', () => {
    expect(computeArmorClass(sheet()).ac).toBe(12);
  });

  it('override wins', () => {
    expect(computeArmorClass(sheet({ acOverride: 17 })).ac).toBe(17);
  });

  it('medium armor caps DEX at +2, shield adds 2', () => {
    const s = sheet({
      abilities: { str: 16, dex: 18, con: 12, int: 10, wis: 10, cha: 8 },
      inventory: [
        item({ id: 'a', type: 'armor', equipped: true, armorBase: 14, armorCategory: 'medium' }),
        item({ id: 'sh', type: 'shield', equipped: true, armorBase: 2 }),
      ],
    });
    expect(computeArmorClass(s).ac).toBe(14 + 2 + 2);
  });

  it('heavy armor ignores DEX', () => {
    const s = sheet({
      inventory: [item({ id: 'a', type: 'armor', equipped: true, armorBase: 18, armorCategory: 'heavy' })],
    });
    expect(computeArmorClass(s).ac).toBe(18);
  });

  it('unequipped armor does not count', () => {
    const s = sheet({
      inventory: [item({ id: 'a', type: 'armor', equipped: false, armorBase: 18, armorCategory: 'heavy' })],
    });
    expect(computeArmorClass(s).ac).toBe(12);
  });
});

describe('derivedAttacks', () => {
  it('builds an attack from an equipped proficient weapon', () => {
    const s = sheet({
      inventory: [
        item({
          id: 'w',
          name: 'Longsword',
          type: 'weapon',
          equipped: true,
          weaponAbility: 'str',
          damage: '1d8',
          damageType: 'chém',
          proficient: true,
        }),
      ],
    });
    const [atk] = derivedAttacks(s);
    expect(atk.attackBonus).toBe(3 + 2); // STR +3, prof +2
    expect(atk.damage).toBe('1d8+3');
    expect(atk.source).toBe('weapon');
  });

  it('finesse uses the better of STR/DEX and adds magic bonus', () => {
    const s = sheet({
      abilities: { str: 10, dex: 18, con: 12, int: 10, wis: 10, cha: 8 },
      inventory: [
        item({
          id: 'd',
          name: 'Dagger +1',
          type: 'weapon',
          equipped: true,
          weaponAbility: 'finesse',
          damage: '1d4',
          proficient: true,
          attackBonusMisc: 1,
          damageBonusMisc: 1,
        }),
      ],
    });
    const [atk] = derivedAttacks(s);
    expect(atk.attackBonus).toBe(4 + 2 + 1); // DEX +4, prof +2, magic +1
    expect(atk.damage).toBe('1d4+5'); // DEX +4 + magic +1
  });

  it('allAttacks merges manual + derived', () => {
    const s = sheet({
      attacks: [{ id: 'm', name: 'Punch', attackBonus: 5, damage: '1d4', damageType: '' }],
      inventory: [item({ id: 'w', type: 'weapon', equipped: true, damage: '1d6', proficient: true })],
    });
    expect(allAttacks(s)).toHaveLength(2);
    expect(allAttacks(s)[0].source).toBe('weapon');
  });
});

describe('currency & weight', () => {
  it('sums currency in gp', () => {
    expect(currencyInGp({ pp: 1, gp: 2, ep: 0, sp: 5, cp: 10 })).toBeCloseTo(10 + 2 + 0.5 + 0.1);
  });

  it('carried weight includes items and coins at 50/lb', () => {
    const s = sheet({
      inventory: [item({ weight: 3, quantity: 2 })],
      currency: { pp: 0, gp: 100, ep: 0, sp: 0, cp: 0 },
    });
    expect(carriedWeight(s)).toBe(6 + 2); // 6 lb items + 100 coins / 50
  });
});

import { describe, expect, it } from 'vitest';
import type { Currency, EquipmentPreset } from './types.js';
import {
  addShopPurchase,
  formatCp,
  generateShopStock,
  maxRarityForLevel,
  parseCostCp,
  payFromPurse,
  presetPriceCp,
  purseCp,
  rarityKey,
  shopCandidates,
  shopPriceCp,
} from './shop.js';

const purse = (p: Partial<Currency>): Currency => ({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...p });
const item = (name: string, type: EquipmentPreset['type'], extra: Partial<EquipmentPreset> = {}): EquipmentPreset => ({ id: name, name, type, ...extra });

const CATALOG: EquipmentPreset[] = [
  item('Rope', 'gear', { cost: '1 gp' }),
  item('Torch', 'gear', { cost: '1 cp' }),
  item('Longsword', 'weapon', { cost: '15 gp' }),
  item('Chain Mail', 'armor', { cost: '75 gp' }),
  item('Shield', 'shield', { cost: '10 gp' }),
  item('Potion of Healing', 'consumable', { cost: '50 gp' }),
  item('Cloak of Protection', 'gear', { rarity: 'không phổ biến' }),
  item('Flame Tongue', 'weapon', { rarity: 'hiếm' }),
  item('Belt of Fire Giant Strength', 'gear', { rarity: 'rất hiếm' }),
  item('Vorpal Sword', 'weapon', { rarity: 'huyền thoại' }),
  item('Potion of Supreme Healing', 'consumable', { rarity: 'very rare' }),
  item('Unpriced trinket', 'gear'),
];

describe('shop prices', () => {
  it('parses and formats coin amounts', () => {
    expect([parseCostCp('15 gp'), parseCostCp('2 sp'), parseCostCp('1,500 gp'), parseCostCp(''), parseCostCp('free')]).toEqual([1500, 20, 150000, null, null]);
    expect([formatCp(1525), formatCp(3), formatCp(0)]).toEqual(['15 gp 2 sp 5 cp', '3 cp', '0 gp']);
  });
  it('reads rarity in English, Vietnamese and ranges', () => {
    expect(['uncommon', 'không phổ biến', 'hiếm', 'rất hiếm', 'Very Rare', 'huyền thoại', 'uncommon–legendary', 'phổ biến', 34, ''].map(rarityKey)).toEqual([
      'uncommon', 'uncommon', 'rare', 'veryRare', 'veryRare', 'legendary', 'uncommon', 'common', null, null,
    ]);
  });
  it('prices magic items by rarity, consumables at half', () => {
    expect(presetPriceCp(CATALOG[7])).toBe(4000 * 100);
    expect(presetPriceCp(CATALOG[10])).toBe(20000 * 100);
    expect(presetPriceCp(CATALOG[11])).toBeNull();
    expect(shopPriceCp({ markup: 150 }, { priceCp: 1000 })).toBe(1500);
  });
});

describe('shop stock by level', () => {
  it('caps rarity by tier', () => {
    expect([1, 4, 5, 10, 11, 17].map(maxRarityForLevel)).toEqual(['uncommon', 'uncommon', 'rare', 'rare', 'veryRare', 'legendary']);
    const names = (lvl: number) => shopCandidates(CATALOG, 'magic', lvl).map((p) => p.name).sort();
    expect(names(3)).toEqual(['Cloak of Protection']);
    expect(names(5)).toEqual(['Cloak of Protection', 'Flame Tongue']);
    expect(names(20)).toHaveLength(5);
  });
  it('sorts items into shop kinds', () => {
    const kinds = (k: string) => shopCandidates(CATALOG, k, 20).map((p) => p.name);
    expect(kinds('general')).toEqual(['Rope', 'Torch', 'Potion of Healing']);
    expect(kinds('weapons')).toEqual(['Longsword']);
    expect(kinds('armor')).toEqual(['Chain Mail', 'Shield']);
    expect(kinds('alchemist')).toEqual(['Potion of Healing', 'Potion of Supreme Healing']);
  });
  it('mundane shops carry everything with restockable stock; magic shops a handful, one each', () => {
    let n = 0;
    const rng = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const smith = generateShopStock(CATALOG, 'weapons', 3, { rng });
    expect(smith).toHaveLength(1);
    expect(smith[0].stock).toBe(smith[0].restock);
    expect(smith[0].stock).toBeGreaterThanOrEqual(5);
    const magic = generateShopStock(CATALOG, 'magic', 20, { rng, count: 3 });
    expect(magic).toHaveLength(3);
    expect(magic.every((i) => i.stock === 1 || /Potion/.test(i.preset.name))).toBe(true);
    expect(magic.map((i) => i.priceCp)).toEqual([...magic.map((i) => i.priceCp)].sort((a, b) => a - b));
  });
});

describe('paying and inventory', () => {
  it('pays exact, makes change, refuses when short', () => {
    expect(payFromPurse(purse({ gp: 20 }), 1500)).toEqual(purse({ gp: 5 }));
    expect(payFromPurse(purse({ gp: 1 }), 5)).toEqual(purse({ sp: 9, cp: 5 }));
    expect(payFromPurse(purse({ pp: 1, sp: 3 }), 250)).toEqual(purse({ gp: 7, sp: 8 }));
    expect(payFromPurse(purse({ gp: 1 }), 101)).toBeNull();
    const after = payFromPurse(purse({ pp: 2, gp: 3, ep: 1, sp: 7, cp: 9 }), 1234)!;
    expect(purseCp(after)).toBe(2000 + 300 + 50 + 70 + 9 - 1234);
    expect(Object.values(after).every((v) => v >= 0)).toBe(true);
  });
  it('stacks gear, adds weapons as separate rows', () => {
    let i = 0;
    const id = () => `n${i++}`;
    const rope = { id: 'r', preset: CATALOG[0], priceCp: 100 };
    const inv1 = addShopPurchase([], rope, 2, id);
    expect(inv1).toHaveLength(1);
    expect(addShopPurchase(inv1, rope, 3, id)[0].quantity).toBe(5);
    const sword = { id: 's', preset: CATALOG[2], priceCp: 1500 };
    const inv2 = addShopPurchase([], sword, 2, id);
    expect(inv2.map((x) => [x.name, x.quantity, x.type])).toEqual([['Longsword', 1, 'weapon'], ['Longsword', 1, 'weapon']]);
  });
});

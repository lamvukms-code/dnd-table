import { describe, expect, it } from 'vitest';
import { equipmentPresetFromDef, inventoryItemFromHomebrew, recognizeArmorItem } from './equipment.js';
import { computeArmorClass } from './rules.js';
import type { EquipmentPreset, HomebrewEntry } from './types.js';

const id = () => 'gen-id';

describe('equipmentPresetFromDef', () => {
  it('turns a weapon preset into a ready-to-use, proficient inventory item', () => {
    const def: EquipmentPreset = {
      id: 'p1', name: 'Longsword', type: 'weapon', weight: 3, cost: '15 gp',
      weaponAbility: 'str', damage: '1d8', damageType: 'slashing', rangeText: '5 ft',
    };
    expect(equipmentPresetFromDef(def, id)).toMatchObject({
      id: 'gen-id', name: 'Longsword', type: 'weapon', quantity: 1, weight: 3, equipped: false,
      weaponAbility: 'str', damage: '1d8', damageType: 'slashing', rangeText: '5 ft', proficient: true,
    });
  });
  it('defaults a weapon with no explicit ability to STR, and never marks non-weapons proficient', () => {
    const def: EquipmentPreset = { id: 'p2', name: 'Club', type: 'weapon', damage: '1d4' };
    expect(equipmentPresetFromDef(def, id).weaponAbility).toBe('str');
    const armor: EquipmentPreset = { id: 'p3', name: 'Chain Mail', type: 'armor', armorBase: 16, armorCategory: 'heavy' };
    const item = equipmentPresetFromDef(armor, id);
    expect(item.proficient).toBeUndefined();
    expect(item).toMatchObject({ type: 'armor', armorBase: 16, armorCategory: 'heavy' });
  });
  it('gear presets carry over weight/notes with no combat fields', () => {
    const def: EquipmentPreset = { id: 'p4', name: "Thieves' Tools", type: 'gear', weight: 1, notes: 'Proficiency lets you pick locks.' };
    const item = equipmentPresetFromDef(def, id);
    expect(item).toMatchObject({ type: 'gear', weight: 1, notes: 'Proficiency lets you pick locks.' });
    expect(item.damage).toBeUndefined();
    expect(item.armorBase).toBeUndefined();
  });
  it('carries over consumable fields (potion / scroll presets)', () => {
    const potion: EquipmentPreset = { id: 'p5', name: 'Potion of Healing', type: 'consumable', weight: 0.5, consumableKind: 'heal', healFormula: '2d4+2' };
    expect(equipmentPresetFromDef(potion, id)).toMatchObject({ type: 'consumable', consumableKind: 'heal', healFormula: '2d4+2' });
    const scroll: EquipmentPreset = { id: 'p6', name: 'Scroll of Cure Wounds', type: 'consumable', consumableKind: 'spell', scrollSpellName: 'Cure Wounds' };
    expect(equipmentPresetFromDef(scroll, id)).toMatchObject({ type: 'consumable', consumableKind: 'spell', scrollSpellName: 'Cure Wounds' });
    expect(equipmentPresetFromDef(scroll, id).proficient).toBeUndefined();
  });
  it('carries rarity, attunement and magic to-hit/damage bonuses (SRD magic item presets)', () => {
    const magicSword: EquipmentPreset = {
      id: 'p7', name: '+1 Longsword', type: 'weapon', weaponAbility: 'str', damage: '1d8', damageType: 'slashing',
      rarity: 'không phổ biến', attunementRequired: false, attackBonusMisc: 1, damageBonusMisc: 1,
    };
    expect(equipmentPresetFromDef(magicSword, id)).toMatchObject({
      rarity: 'không phổ biến', attunementRequired: false, attackBonusMisc: 1, damageBonusMisc: 1,
    });
    const ring: EquipmentPreset = { id: 'p8', name: 'Ring of Protection', type: 'gear', rarity: 'hiếm', attunementRequired: true };
    const item = equipmentPresetFromDef(ring, id);
    expect(item).toMatchObject({ rarity: 'hiếm', attunementRequired: true });
    expect(item.attuned).toBeUndefined();
  });
});

describe('inventoryItemFromHomebrew', () => {
  const entry = (over: Partial<HomebrewEntry> = {}): HomebrewEntry => ({
    id: 'hb1', name: 'Everflame Lantern', kind: 'item', status: 'live',
    description: 'A dented tin lantern whose flame never dies.', ...over,
  });

  it('folds description + mechanics into notes, unequipped, not yet attuned', () => {
    const item = inventoryItemFromHomebrew(
      entry({ mechanics: 'Bright light 20 ft.', rarity: 'uncommon', attunement: true }),
      id,
    );
    expect(item).toMatchObject({ id: 'gen-id', name: 'Everflame Lantern', type: 'gear', quantity: 1, equipped: false });
    expect(item.attuned).toBeUndefined();
    expect(item.notes).toContain('dented tin lantern');
    expect(item.notes).toContain('Bright light 20 ft.');
    expect(item.notes).toContain('(uncommon, cần điều hợp)');
  });
  it('works with just a description and no rarity/attunement tag', () => {
    const item = inventoryItemFromHomebrew(entry(), id);
    expect(item.notes).toBe('A dented tin lantern whose flame never dies.');
  });
});

describe('recognizeArmorItem', () => {
  const gear = (name: string) => ({ id: 'g', name, type: 'gear' as const, quantity: 1, weight: 0, equipped: true, notes: '' });
  it('turns a plain-gear line named after SRD armor / a shield into that armor', () => {
    expect(recognizeArmorItem(gear('Studded leather'))).toMatchObject({ type: 'armor', armorBase: 12, armorCategory: 'light' });
    expect(recognizeArmorItem(gear('Chain Mail Armor'))).toMatchObject({ type: 'armor', armorBase: 16, armorCategory: 'heavy', stealthDisadvantage: true });
    expect(recognizeArmorItem(gear('Shield'))).toMatchObject({ type: 'shield', armorBase: 2 });
  });
  it('leaves everything else alone (control: these must NOT become armor)', () => {
    for (const n of ['Leather pouch', 'Bộ đồ thợ săn (20 đạn chì, dao găm bạc)', "Healer's kit", 'Plate of food']) {
      expect(recognizeArmorItem(gear(n))).toEqual(gear(n));
    }
    const typed = { ...gear('Studded leather'), type: 'armor' as const, armorBase: 13 };
    expect(recognizeArmorItem(typed)).toBe(typed); // a real armor row keeps its own numbers
  });
  it('a DEX 19 character in studded leather gets 12 + 4 = 16, not the unarmored 14', () => {
    const base = { abilities: { str: 14, dex: 19, con: 13, int: 7, wis: 12, cha: 10 }, acOverride: null, className: 'Fighter', level: 3, feats: [] } as never as Parameters<typeof computeArmorClass>[0];
    const before = computeArmorClass({ ...base, inventory: [gear('Studded leather')] });
    const after = computeArmorClass({ ...base, inventory: [recognizeArmorItem(gear('Studded leather'))] });
    expect(before.ac).toBe(14);
    expect(after.ac).toBe(16);
  });
});

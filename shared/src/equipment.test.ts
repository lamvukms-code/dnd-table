import { describe, expect, it } from 'vitest';
import { equipmentPresetFromDef, inventoryItemFromHomebrew } from './equipment.js';
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

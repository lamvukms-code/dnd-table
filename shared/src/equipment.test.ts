import { describe, expect, it } from 'vitest';
import { equipmentPresetFromDef } from './equipment.js';
import type { EquipmentPreset } from './types.js';

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

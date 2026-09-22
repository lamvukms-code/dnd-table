import type { EquipmentPreset, InventoryItem } from './types.js';

/** Build a ready-to-add inventory item from an equipment preset (see `EquipmentPreset`). */
export function equipmentPresetFromDef(def: EquipmentPreset, newId: () => string): InventoryItem {
  return {
    id: newId(),
    name: def.name,
    type: def.type,
    quantity: 1,
    weight: def.weight ?? 0,
    equipped: false,
    notes: def.notes ?? '',
    weaponAbility: def.type === 'weapon' ? (def.weaponAbility ?? 'str') : undefined,
    damage: def.damage,
    damageType: def.damageType,
    rangeText: def.rangeText,
    armorBase: def.armorBase,
    armorCategory: def.armorCategory,
    stealthDisadvantage: def.stealthDisadvantage,
    // a preset is a real weapon/armor a class can train with — default to proficient, like a blank weapon row;
    // the player unchecks it if their class doesn't actually train with it
    proficient: def.type === 'weapon' ? true : undefined,
  };
}

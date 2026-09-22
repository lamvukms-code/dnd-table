import type { EquipmentPreset, HomebrewEntry, InventoryItem } from './types.js';

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
    consumableKind: def.consumableKind,
    healFormula: def.healFormula,
    scrollSpellName: def.scrollSpellName,
    consumableNote: def.consumableNote,
  };
}

/**
 * Build a ready-to-add inventory item from a homebrew 'item' entry (the "→ Túi đồ" shortcut, docs/LOREBOOK.md §3).
 * `InventoryItem` has no rarity/attunement-requirement/mechanics fields of its own, so those fold into `notes`
 * (the flag that actually matters mechanically, `attuned`, starts false either way — attuning is the player's
 * own action, not something a DM handout does for them).
 */
export function inventoryItemFromHomebrew(entry: HomebrewEntry, newId: () => string): InventoryItem {
  const body = [entry.description, entry.mechanics].filter(Boolean).join('\n\n');
  const tag = [entry.rarity, entry.attunement ? 'cần điều hợp' : ''].filter(Boolean).join(', ');
  return {
    id: newId(),
    name: entry.name,
    type: 'gear',
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: tag ? `${body}${body ? '\n' : ''}(${tag})` : body,
  };
}

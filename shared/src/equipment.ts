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
    attackBonusMisc: def.attackBonusMisc,
    damageBonusMisc: def.damageBonusMisc,
    weaponTraits: def.weaponTraits ? [...def.weaponTraits] : undefined,
    attackRange: def.attackRange,
    firearm: def.firearm ? { ...def.firearm, loaded: def.firearm.barrel, jammed: false } : undefined,
    armorBase: def.armorBase,
    armorCategory: def.armorCategory,
    stealthDisadvantage: def.stealthDisadvantage,
    rarity: def.rarity,
    attunementRequired: def.attunementRequired,
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

/** SRD 5.2.1 armor (CC-BY-4.0): base AC, category, Stealth disadvantage. Keys are lowercase names. */
const SRD_ARMOR: Record<string, { base: number; category: 'light' | 'medium' | 'heavy'; stealth?: boolean }> = {
  'padded': { base: 11, category: 'light', stealth: true },
  'leather': { base: 11, category: 'light' },
  'studded leather': { base: 12, category: 'light' },
  'hide': { base: 12, category: 'medium' },
  'chain shirt': { base: 13, category: 'medium' },
  'scale mail': { base: 14, category: 'medium', stealth: true },
  'breastplate': { base: 14, category: 'medium' },
  'half plate': { base: 15, category: 'medium', stealth: true },
  'ring mail': { base: 14, category: 'heavy', stealth: true },
  'chain mail': { base: 16, category: 'heavy', stealth: true },
  'splint': { base: 17, category: 'heavy', stealth: true },
  'plate': { base: 18, category: 'heavy', stealth: true },
};

/**
 * An inventory line typed as plain gear whose name is exactly an SRD armor or a shield ("Studded leather",
 * "Chain Mail Armor", "Shield") becomes that armor, with its AC numbers — a sheet made from text (PDF import,
 * typed by hand) otherwise wears it with no effect on AC. Anything else comes back unchanged.
 */
export function recognizeArmorItem(it: InventoryItem): InventoryItem {
  if (it.type !== 'gear' || it.armorBase != null) return it;
  const n = it.name.toLowerCase().replace(/\(.*?\)/g, '').replace(/\barmou?r\b/g, '').replace(/\s+/g, ' ').trim();
  if (n === 'shield' || n === 'khiên') return { ...it, type: 'shield', armorBase: 2 };
  const a = SRD_ARMOR[n];
  return a ? { ...it, type: 'armor', armorBase: a.base, armorCategory: a.category, stealthDisadvantage: a.stealth || undefined } : it;
}

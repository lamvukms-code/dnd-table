import type { CharacterSheet } from './types.js';
import { emptyCurrency } from './rules.js';

export function blankSheetForTests(ownerId: string, name: string): CharacterSheet {
  return {
    id: 'sheet-' + name,
    ownerId,
    name,
    className: 'Monk',
    level: 4,
    proficiencyBonus: 2,
    abilities: { str: 12, dex: 18, con: 13, int: 13, wis: 16, cha: 12 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 34,
    currentHp: 34,
    tempHp: 0,
    armorClass: 17,
    acOverride: null,
    speed: 30,
    initiativeMisc: 0,
    actions: [],
    damageRiders: [],
    resources: [],
    spellSlots: [],
    spells: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

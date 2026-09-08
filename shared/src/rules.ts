import type {
  Ability,
  CharacterSheet,
  Currency,
  InventoryItem,
  SheetAction,
} from './types.js';
import { COIN_TYPES, SKILLS } from './types.js';

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function saveBonus(sheet: CharacterSheet, ability: Ability): number {
  const base = abilityMod(sheet.abilities[ability]);
  return base + (sheet.saveProficiencies.includes(ability) ? sheet.proficiencyBonus : 0);
}

export function skillBonus(sheet: CharacterSheet, skill: string): number {
  const ability = SKILLS[skill];
  const base = abilityMod(sheet.abilities[ability]);
  let bonus = base;
  if (sheet.skillExpertise.includes(skill)) bonus += sheet.proficiencyBonus * 2;
  else if (sheet.skillProficiencies.includes(skill)) bonus += sheet.proficiencyBonus;
  return bonus;
}

export function initiativeBonus(sheet: CharacterSheet): number {
  return abilityMod(sheet.abilities.dex) + sheet.initiativeMisc;
}

/** Suggested proficiency bonus by level (5e). */
export function proficiencyByLevel(level: number): number {
  return Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4) + 2;
}

// ---------------------------------------------------------------------------
// Inventory / equipment derived values
// ---------------------------------------------------------------------------

export function emptyCurrency(): Currency {
  return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
}

/** Total value of a purse in gold pieces. */
export function currencyInGp(c: Currency): number {
  return c.pp * 10 + c.gp + c.ep * 0.5 + c.sp * 0.1 + c.cp * 0.01;
}

export function totalCoins(c: Currency): number {
  return COIN_TYPES.reduce((sum, k) => sum + (c[k] || 0), 0);
}

/** Total carried weight (lb), coins included at 50 per pound (5e). */
export function carriedWeight(sheet: CharacterSheet): number {
  const items = sheet.inventory.reduce(
    (sum, it) => sum + (it.weight || 0) * (it.quantity || 1),
    0,
  );
  const coins = totalCoins(sheet.currency) / 50;
  return Math.round((items + coins) * 100) / 100;
}

/** STR x 15 (lb). Nothing above this can be carried without special rules. */
export function carryCapacity(sheet: CharacterSheet): number {
  return sheet.abilities.str * 15;
}

function weaponAbilityUsed(sheet: CharacterSheet, it: InventoryItem): Ability {
  const strMod = abilityMod(sheet.abilities.str);
  const dexMod = abilityMod(sheet.abilities.dex);
  if (it.weaponAbility === 'dex') return 'dex';
  if (it.weaponAbility === 'finesse') return dexMod >= strMod ? 'dex' : 'str';
  return 'str';
}

/** Action-economy entries contributed by currently equipped weapons. */
export function derivedActions(sheet: CharacterSheet): SheetAction[] {
  return sheet.inventory
    .filter((it) => it.type === 'weapon' && it.equipped)
    .map((it) => {
      const ab = weaponAbilityUsed(sheet, it);
      const mod = abilityMod(sheet.abilities[ab]);
      const toHit =
        mod + (it.proficient ? sheet.proficiencyBonus : 0) + (it.attackBonusMisc || 0);
      const dmgMod = mod + (it.damageBonusMisc || 0);
      const base = it.damage || '1d4';
      const damage = dmgMod === 0 ? base : dmgMod > 0 ? `${base}+${dmgMod}` : `${base}${dmgMod}`;
      return {
        id: `weapon:${it.id}`,
        name: it.name,
        actionType: 'action' as const,
        attackBonus: toHit,
        damage,
        damageType: it.damageType || '',
        source: 'weapon' as const,
      };
    });
}

/** Equipped-weapon actions + the sheet's own actions, weapons first. */
export function allActions(sheet: CharacterSheet): SheetAction[] {
  return [
    ...derivedActions(sheet),
    ...sheet.actions.map((a) => ({ ...a, source: a.source ?? ('manual' as const) })),
  ];
}

// ---------------------------------------------------------------------------
// Rests
// ---------------------------------------------------------------------------

/** Restore short-rest resources / feature uses. Returns a new sheet. */
export function applyShortRest(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheet,
    resources: sheet.resources.map((r) => (r.recharge === 'short' ? { ...r, used: 0 } : r)),
    features: sheet.features.map((f) =>
      f.uses && f.uses.recharge === 'short' ? { ...f, uses: { ...f.uses, used: 0 } } : f,
    ),
  };
}

/** Restore everything a long rest gives back (HP, slots, short/long resources). */
export function applyLongRest(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheet,
    currentHp: sheet.maxHp,
    tempHp: 0,
    resources: sheet.resources.map((r) => (r.recharge === 'other' ? r : { ...r, used: 0 })),
    spellSlots: sheet.spellSlots.map((s) => ({ ...s, used: 0 })),
    features: sheet.features.map((f) =>
      f.uses && f.uses.recharge !== 'other' ? { ...f, uses: { ...f.uses, used: 0 } } : f,
    ),
  };
}

export interface AcResult {
  ac: number;
  source: string;
}

/** Effective AC: explicit override > equipped armor (+shield) > unarmored. */
export function computeArmorClass(sheet: CharacterSheet): AcResult {
  const dexMod = abilityMod(sheet.abilities.dex);
  if (sheet.acOverride != null) return { ac: sheet.acOverride, source: 'ghi đè' };

  const shield = sheet.inventory.find((it) => it.type === 'shield' && it.equipped);
  const shieldBonus = shield ? shield.armorBase ?? 2 : 0;

  const armor = sheet.inventory.find((it) => it.type === 'armor' && it.equipped);
  if (!armor) {
    return {
      ac: 10 + dexMod + shieldBonus,
      source: shield ? 'không giáp + khiên' : 'không giáp',
    };
  }
  const base = armor.armorBase ?? 10;
  let dexPart = dexMod;
  if (armor.armorCategory === 'medium') dexPart = Math.min(dexMod, 2);
  else if (armor.armorCategory === 'heavy') dexPart = 0;
  return {
    ac: base + dexPart + shieldBonus,
    source: shield ? `${armor.name} + khiên` : armor.name,
  };
}

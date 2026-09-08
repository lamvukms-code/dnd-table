import type {
  Ability,
  CharacterSheet,
  CoverLevel,
  Currency,
  DamagePart,
  Defenses,
  InventoryItem,
  SheetAction,
  Statblock,
  Token,
  TokenStatblock,
} from './types.js';
import { COIN_TYPES, DAMAGE_TYPE_VI, emptyDefenses, SKILLS } from './types.js';

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
        extraDamage: (it.weaponExtraDamage ?? []).map((p) => ({ ...p })),
        source: 'weapon' as const,
      };
    });
}

/**
 * Every damage component of an action: its primary damage, its own extra
 * damage parts, and any applicable standing rider (magic ring, feature…).
 */
export function actionDamageParts(sheet: CharacterSheet, action: SheetAction): DamagePart[] {
  const parts: DamagePart[] = [];
  if (action.damage) parts.push({ dice: action.damage, type: action.damageType || '' });
  for (const e of action.extraDamage ?? []) parts.push({ ...e });

  const isAttack = typeof action.attackBonus === 'number';
  // A "weapon" rider (e.g. a magic ring) rides every weapon attack — both the
  // equipped-weapon actions and manual attack entries a player types by hand.
  // "all" riders ride any attack. (Spell attacks aren't distinguished yet — turn
  // a rider off where it shouldn't apply, or use the action's own extra damage.)
  for (const r of sheet.damageRiders ?? []) {
    if (!r.enabled || !isAttack) continue;
    parts.push({ dice: r.dice, type: r.type, label: r.name });
  }
  return parts;
}

/**
 * Defences a character gets from what they're wearing/carrying — currently just
 * adamantine crit immunity from an equipped item. Returns undefined when the
 * sheet grants nothing, so it can be merged with a token's own `defenses`.
 */
export function derivedDefenses(sheet: CharacterSheet): Defenses | undefined {
  const critImmune = sheet.inventory.some((it) => it.equipped && it.grantsCritImmune);
  if (!critImmune) return undefined;
  return { ...emptyDefenses(), critImmune: true };
}

/** Merge two optional defence blocks (b's positives win / OR in). */
export function mergeDefenses(a: Defenses | undefined, b: Defenses | undefined): Defenses | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    resistances: [...new Set([...a.resistances, ...b.resistances])],
    immunities: [...new Set([...a.immunities, ...b.immunities])],
    vulnerabilities: [...new Set([...a.vulnerabilities, ...b.vulnerabilities])],
    damageReduction: Math.max(a.damageReduction, b.damageReduction),
    critImmune: a.critImmune || b.critImmune,
  };
}

/** Extra damage parts a target's own effects add when `attacker` hits it (Hex, Hunter's Mark). */
export function targetRiderParts(
  target: Pick<Token, 'effects'>,
  attacker: { sheetId?: string; tokenId?: string },
): DamagePart[] {
  return (target.effects ?? [])
    .filter(
      (e) =>
        e.rider &&
        ((attacker.sheetId && e.sourceSheetId === attacker.sheetId) ||
          (attacker.tokenId && e.sourceTokenId === attacker.tokenId)),
    )
    .map((e) => ({ dice: e.rider!.dice, type: e.rider!.type, label: e.name }));
}

/** Homebrew/5e-2024 concentration save DC after taking `damage`. */
export function concentrationDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

/** Preset spell riders for the quick "cast on target" control. */
export const RIDER_PRESETS: { name: string; rider: { dice: string; type: string }; concentration: boolean }[] = [
  { name: "Hunter's Mark", rider: { dice: '1d6', type: 'force' }, concentration: true },
  { name: 'Hex', rider: { dice: '1d6', type: 'necrotic' }, concentration: true },
];

/** Damage parts for a bare stat-block action (no sheet riders). */
export function statblockDamageParts(action: SheetAction): DamagePart[] {
  const parts: DamagePart[] = [];
  if (action.damage) parts.push({ dice: action.damage, type: action.damageType || '' });
  for (const e of action.extraDamage ?? []) parts.push({ ...e });
  return parts;
}

export interface PartOutcome {
  label: string;
  type: string;
  raw: number;
  final: number;
  notes: string[];
}

export interface MultiDamageOutcome {
  totalRaw: number;
  totalFinal: number;
  parts: PartOutcome[];
}

/** Apply per-type defences to each already-rolled damage part and total up. */
export function resolveDamageParts(
  rolled: { part: DamagePart; raw: number }[],
  def: Defenses | undefined,
): MultiDamageOutcome {
  let totalRaw = 0;
  let totalFinal = 0;
  const parts: PartOutcome[] = [];
  for (const { part, raw } of rolled) {
    const o = applyDamageDefenses(raw, part.type, def);
    totalRaw += o.raw;
    totalFinal += o.final;
    parts.push({
      label: part.label || typeName(part.type) || 'sát thương',
      type: part.type,
      raw: o.raw,
      final: o.final,
      notes: o.notes,
    });
  }
  return { totalRaw, totalFinal, parts };
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

// ---------------------------------------------------------------------------
// Homebrew: cover + damage-type defences
// ---------------------------------------------------------------------------

/** Cover benefit added to a target's AC (total cover handled separately). */
export function coverAcBonus(cover: CoverLevel | undefined): number {
  return cover === 'half' ? 2 : cover === 'threequarters' ? 5 : 0;
}
/** Same bonus applies to the target's Dexterity saving throws. */
export const coverDexSaveBonus = coverAcBonus;

export const COVER_LABEL: Record<CoverLevel, string> = {
  none: 'Không che',
  half: 'Nửa che (+2 AC)',
  threequarters: '3/4 che (+5 AC)',
  total: 'Che hoàn toàn',
};

export interface DamageOutcome {
  raw: number;
  final: number;
  notes: string[];
}

function typeName(t: string): string {
  return (DAMAGE_TYPE_VI as Record<string, string>)[t] ?? t;
}

/**
 * Apply damage-type defences to a rolled total.
 * Order: immunity → vulnerability (×2) → resistance (÷2 floor) → flat DR.
 */
export function applyDamageDefenses(
  raw: number,
  damageType: string | undefined,
  def: Defenses | undefined,
): DamageOutcome {
  const notes: string[] = [];
  let dmg = Math.max(0, Math.round(raw));
  const t = (damageType ?? '').toLowerCase();

  if (def && t) {
    if (def.immunities.includes(t)) {
      notes.push(`miễn nhiễm ${typeName(t)} (×0)`);
      return { raw, final: 0, notes };
    }
    if (def.vulnerabilities.includes(t)) {
      dmg *= 2;
      notes.push(`yếu điểm ${typeName(t)} (×2)`);
    }
    if (def.resistances.includes(t)) {
      dmg = Math.floor(dmg / 2);
      notes.push(`kháng ${typeName(t)} (÷2)`);
    }
  }
  if (def && def.damageReduction > 0) {
    const before = dmg;
    dmg = Math.max(0, dmg - def.damageReduction);
    if (before !== dmg) notes.push(`giảm ${def.damageReduction} (DR)`);
  }
  return { raw: Math.max(0, Math.round(raw)), final: dmg, notes };
}

/** Restore short-rest resources / feature uses. Returns a new sheet. */
export function applyShortRest(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheet,
    resources: sheet.resources.map((r) => (r.recharge === 'short' ? { ...r, used: 0 } : r)),
    pactSlots: sheet.pactSlots ? { ...sheet.pactSlots, used: 0 } : sheet.pactSlots,
    features: sheet.features.map((f) =>
      f.uses && f.uses.recharge === 'short' ? { ...f, uses: { ...f.uses, used: 0 } } : f,
    ),
  };
}

// ---------------------------------------------------------------------------
// Stat blocks
// ---------------------------------------------------------------------------

export function statblockInitiativeMod(sb: Statblock): number {
  return abilityMod(sb.abilities.dex);
}

/** The combat-relevant subset embedded on a token when a stat block is spawned. */
export function tokenStatblockFrom(sb: Statblock): TokenStatblock {
  return {
    name: sb.name,
    meta: sb.meta || undefined,
    abilities: { ...sb.abilities },
    proficiencyBonus: sb.proficiencyBonus,
    saveProficiencies: [...sb.saveProficiencies],
    skills: sb.skills.map((s) => ({ ...s })),
    initiativeMod: statblockInitiativeMod(sb),
    actions: sb.actions.map((a) => ({ ...a })),
    traits: sb.traits.map((t) => ({ ...t })),
    defenses: sb.defenses ? { ...sb.defenses } : undefined,
    notes: sb.notes || undefined,
    fromId: sb.id,
  };
}

/** A save-throw bonus for an NPC token (proficiency added when proficient). */
export function tokenSaveBonus(tsb: TokenStatblock, ability: Ability): number {
  return (
    abilityMod(tsb.abilities[ability]) +
    (tsb.saveProficiencies.includes(ability) ? tsb.proficiencyBonus : 0)
  );
}

/** Restore everything a long rest gives back (HP, slots, short/long resources). */
export function applyLongRest(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheet,
    currentHp: sheet.maxHp,
    tempHp: 0,
    resources: sheet.resources.map((r) => (r.recharge === 'other' ? r : { ...r, used: 0 })),
    spellSlots: sheet.spellSlots.map((s) => ({ ...s, used: 0 })),
    pactSlots: sheet.pactSlots ? { ...sheet.pactSlots, used: 0 } : sheet.pactSlots,
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

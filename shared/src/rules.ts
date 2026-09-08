import type {
  Ability,
  CasterType,
  CharacterSheet,
  ClassEntry,
  ConditionType,
  CoverLevel,
  Currency,
  DamagePart,
  Defenses,
  InventoryItem,
  RollMode,
  SheetAction,
  SpellSlots,
  Statblock,
  Token,
  TokenStatblock,
} from './types.js';
import { COIN_TYPES, CONDITION_VI, DAMAGE_TYPE_VI, emptyDefenses, SKILLS } from './types.js';

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
  const isWeapon = isAttack && (action.source === 'weapon' || action.source === 'manual' || !action.source);
  const primaryType = action.damageType || parts[0]?.type || '';

  // A "weapon" rider (e.g. a magic ring) rides every weapon attack — both the
  // equipped-weapon actions and manual attack entries a player types by hand.
  // "all" riders ride any attack. (Spell attacks aren't distinguished yet — turn
  // a rider off where it shouldn't apply, or use the action's own extra damage.)
  for (const r of sheet.damageRiders ?? []) {
    if (!r.enabled || !isAttack) continue;
    parts.push({ dice: r.dice, type: r.type, label: r.name });
  }

  // Barbarian: rage damage on a weapon attack while raging.
  if (sheet.raging && isWeapon) {
    const bonus = rageDamageBonus(sheet);
    if (bonus > 0) parts.push({ dice: String(bonus), type: primaryType, label: 'Rage' });
  }
  // Rogue: Sneak Attack armed for this attack (the sheet disarms it after the roll).
  if (sheet.sneakAttackArmed && isWeapon) {
    const dice = sneakAttackDice(sheet);
    if (dice > 0) parts.push({ dice: `${dice}d6`, type: primaryType, label: 'Sneak Attack' });
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
  // Barbarian: resistance to bludgeoning / piercing / slashing while raging.
  const raging = !!sheet.raging && barbarianLevel(sheet) > 0;
  if (!critImmune && !raging) return undefined;
  return {
    ...emptyDefenses(),
    critImmune,
    resistances: raging ? ['bludgeoning', 'piercing', 'slashing'] : [],
  };
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

// ---------------------------------------------------------------------------
// Spellcasting (5e 2024)
// ---------------------------------------------------------------------------

/** Full spellcasters — one class level = one caster level. */
const FULL_CASTERS = ['wizard', 'cleric', 'druid', 'bard', 'sorcerer'];
/** Half casters — spells from level 1 in the 2024 rules. */
const HALF_CASTERS = ['paladin', 'ranger', 'artificer'];
/** Subclasses that grant third-caster progression. */
const THIRD_CASTER_SUBCLASSES = ['eldritch knight', 'arcane trickster'];
/** Default spellcasting ability by class. */
const CLASS_SPELL_ABILITY: Record<string, Ability> = {
  wizard: 'int',
  cleric: 'wis',
  druid: 'wis',
  bard: 'cha',
  sorcerer: 'cha',
  paladin: 'cha',
  ranger: 'wis',
  warlock: 'cha',
  artificer: 'int',
};

/** The classes on a sheet: the multiclass list if present, else the single class. */
export function sheetClasses(sheet: CharacterSheet): ClassEntry[] {
  if (sheet.classes && sheet.classes.length > 0) return sheet.classes;
  return [{ name: sheet.className, subclass: sheet.subclass, level: sheet.level }];
}

/** Total character level (sum of class levels, else `level`). */
export function totalLevelOf(sheet: CharacterSheet): number {
  if (sheet.classes && sheet.classes.length > 0) {
    return sheet.classes.reduce((s, c) => s + Math.max(0, c.level), 0);
  }
  return sheet.level;
}

/** Total levels in classes whose name contains `key` (case-insensitive). */
export function classLevelOf(sheet: CharacterSheet, key: string): number {
  const k = key.toLowerCase();
  return sheetClasses(sheet)
    .filter((c) => (c.name ?? '').trim().toLowerCase().includes(k))
    .reduce((s, c) => s + Math.max(0, c.level), 0);
}
export const rogueLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'rogue');
export const barbarianLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'barbarian');
export const monkLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'monk');
export const warlockLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'warlock');
export const druidLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'druid');

/** Druid Wild Shape uses (2024): 2, then 3 at level 6, 4 at level 17. 0 below level 2. */
export function wildShapeMax(sheet: CharacterSheet): number {
  const lvl = druidLevel(sheet);
  if (lvl < 2) return 0;
  return lvl >= 17 ? 4 : lvl >= 6 ? 3 : 2;
}

/** Monk Martial Arts damage die (1d6 → 1d8 at 5 → 1d10 at 11 → 1d12 at 17). '' if not a Monk. */
export function martialArtsDie(sheet: CharacterSheet): string {
  const lvl = monkLevel(sheet);
  if (lvl <= 0) return '';
  return lvl >= 17 ? '1d12' : lvl >= 11 ? '1d10' : lvl >= 5 ? '1d8' : '1d6';
}
/** Monk Focus Points = Monk level (from level 2). */
export function monkFocusMax(sheet: CharacterSheet): number {
  const lvl = monkLevel(sheet);
  return lvl >= 2 ? lvl : 0;
}
/** Monk save DC for Stunning Strike etc: 8 + proficiency + WIS modifier. */
export function monkDc(sheet: CharacterSheet): number {
  return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities.wis);
}
/** The Monk's unarmed-strike action (Martial Arts die, DEX or STR — whichever is higher). */
export function monkUnarmedAction(sheet: CharacterSheet): SheetAction | null {
  const die = martialArtsDie(sheet);
  if (!die) return null;
  const abMod = Math.max(abilityMod(sheet.abilities.str), abilityMod(sheet.abilities.dex));
  const toHit = abMod + sheet.proficiencyBonus;
  const dmg = abMod === 0 ? die : abMod > 0 ? `${die}+${abMod}` : `${die}${abMod}`;
  return {
    id: 'monk-unarmed',
    name: 'Đánh không vũ khí (Martial Arts)',
    actionType: 'action',
    attackBonus: toHit,
    damage: dmg,
    damageType: 'bludgeoning',
    source: 'weapon',
  };
}

/** Rogue Sneak Attack dice = ⌈Rogue level / 2⌉ (0 if not a Rogue). */
export function sneakAttackDice(sheet: CharacterSheet): number {
  const lvl = rogueLevel(sheet);
  return lvl > 0 ? Math.ceil(lvl / 2) : 0;
}
/** Barbarian rage damage bonus: +2, then +3 at level 9, +4 at 16. */
export function rageDamageBonus(sheet: CharacterSheet): number {
  const lvl = barbarianLevel(sheet);
  if (lvl <= 0) return 0;
  return lvl >= 16 ? 4 : lvl >= 9 ? 3 : 2;
}
/** Barbarian rage uses per long rest (2024): 2 / 3 / 4 / 5 / 6. */
export function rageMax(sheet: CharacterSheet): number {
  const lvl = barbarianLevel(sheet);
  if (lvl <= 0) return 0;
  return lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2;
}

/** Caster type of one class (by name + subclass). */
export function casterTypeForClass(name: string, subclass?: string): CasterType {
  const sub = (subclass ?? '').trim().toLowerCase();
  if (THIRD_CASTER_SUBCLASSES.includes(sub)) return 'third';
  const cls = (name ?? '').trim().toLowerCase();
  if (cls.includes('warlock')) return 'pact';
  if (FULL_CASTERS.some((c) => cls.includes(c))) return 'full';
  if (HALF_CASTERS.some((c) => cls.includes(c))) return 'half';
  return 'none';
}

/** The caster type this sheet uses (override wins, else derived from its classes). */
export function casterTypeOf(sheet: CharacterSheet): CasterType {
  const classes = sheetClasses(sheet);
  if (classes.length === 1 && sheet.casterTypeOverride) return sheet.casterTypeOverride;
  const types = classes.map((c) => casterTypeForClass(c.name, c.subclass));
  if (types.some((t) => t === 'full' || t === 'half' || t === 'third')) {
    return classes.length === 1 ? types[0] : 'full';
  }
  if (types.includes('pact')) return 'pact';
  return 'none';
}

/** The spellcasting ability for this sheet, or null if it isn't a caster. */
export function spellcastingAbilityOf(sheet: CharacterSheet): Ability | null {
  if (sheet.spellcastingAbility) return sheet.spellcastingAbility;
  for (const c of sheetClasses(sheet)) {
    if (casterTypeForClass(c.name, c.subclass) === 'none') continue;
    const sub = (c.subclass ?? '').trim().toLowerCase();
    if (THIRD_CASTER_SUBCLASSES.includes(sub)) return 'int';
    const cls = (c.name ?? '').trim().toLowerCase();
    for (const [k, v] of Object.entries(CLASS_SPELL_ABILITY)) if (cls.includes(k)) return v;
  }
  return null;
}

/** 5e 2024 spell save DC: 8 + proficiency bonus + spellcasting ability modifier. */
export function spellSaveDc(sheet: CharacterSheet): number | null {
  const ab = spellcastingAbilityOf(sheet);
  if (!ab || casterTypeOf(sheet) === 'none') return null;
  return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities[ab]);
}

/** Spell attack modifier: proficiency bonus + spellcasting ability modifier. */
export function spellAttackBonus(sheet: CharacterSheet): number | null {
  const ab = spellcastingAbilityOf(sheet);
  if (!ab || casterTypeOf(sheet) === 'none') return null;
  return sheet.proficiencyBonus + abilityMod(sheet.abilities[ab]);
}

// ---------------------------------------------------------------------------
// Spell-slot progression (5e 2024) + multiclass
// ---------------------------------------------------------------------------

/** rows[level] = [1st-level slots, 2nd, …]. Index 0 unused. */
const FULL_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Paladin / Ranger (2024 — spells from level 1). */
const HALF_SLOTS: number[][] = [
  [],
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];
/** Eldritch Knight / Arcane Trickster (spells from level 3). */
const THIRD_SLOTS: number[][] = [
  [],
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];
/** Warlock Pact Magic: [count, slot level]. Index 0 unused. */
const PACT_SLOTS: [number, number][] = [
  [0, 0],
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

function tableFor(t: CasterType): number[][] {
  return t === 'half' ? HALF_SLOTS : t === 'third' ? THIRD_SLOTS : FULL_SLOTS;
}
function rowToSlots(row: number[]): SpellSlots[] {
  return row
    .map((max, i) => ({ level: i + 1, max, used: 0 }))
    .filter((s) => s.max > 0);
}

/** Max Vancian spell slots the character's classes grant (5e 2024, incl. multiclass). */
export function computeSpellSlots(sheet: CharacterSheet): SpellSlots[] {
  const classes = sheetClasses(sheet).filter((c) => c.level > 0);
  const casters = classes
    .map((c) => ({ ...c, t: casterTypeForClass(c.name, c.subclass) }))
    .filter((c) => c.t === 'full' || c.t === 'half' || c.t === 'third');

  if (casters.length === 0) {
    const ov = sheet.casterTypeOverride;
    if (classes.length <= 1 && (ov === 'full' || ov === 'half' || ov === 'third')) {
      return rowToSlots(tableFor(ov)[Math.min(20, totalLevelOf(sheet))] ?? []);
    }
    return [];
  }
  if (casters.length === 1) {
    return rowToSlots(tableFor(casters[0].t)[Math.min(20, casters[0].level)] ?? []);
  }
  // Multiclass: combined caster level indexes the full-caster table.
  let cl = 0;
  for (const c of casters) {
    cl += c.t === 'full' ? c.level : c.t === 'half' ? Math.floor(c.level / 2) : Math.floor(c.level / 3);
  }
  return rowToSlots(FULL_SLOTS[Math.min(20, cl)] ?? []);
}

/** Max Warlock Pact Magic slots, or null if the character has no Warlock levels. */
export function computePactSlots(sheet: CharacterSheet): SpellSlots | null {
  const classes = sheetClasses(sheet);
  let wl = classes
    .filter((c) => casterTypeForClass(c.name, c.subclass) === 'pact')
    .reduce((s, c) => s + Math.max(0, c.level), 0);
  if (wl === 0 && sheet.casterTypeOverride === 'pact' && classes.length <= 1) {
    wl = totalLevelOf(sheet);
  }
  if (wl <= 0) return null;
  const [count, slotLevel] = PACT_SLOTS[Math.min(20, wl)];
  return { level: slotLevel, max: count, used: 0 };
}

/** Recompute slot maxima from the class progression, keeping the `used` counts. */
export function applySpellProgression(sheet: CharacterSheet): CharacterSheet {
  if (casterTypeOf(sheet) === 'none') {
    return sheet.pactSlots ? { ...sheet, pactSlots: null } : sheet;
  }
  const target = computeSpellSlots(sheet);
  const spellSlots = target.map((t) => ({
    ...t,
    used: Math.min(t.max, sheet.spellSlots.find((s) => s.level === t.level)?.used ?? 0),
  }));
  const pact = computePactSlots(sheet);
  const pactSlots = pact
    ? { ...pact, used: Math.min(pact.max, sheet.pactSlots?.used ?? 0) }
    : null;
  return { ...sheet, spellSlots, pactSlots };
}

// ---------------------------------------------------------------------------
// Thin-auto conditions (only the combat-critical ones are wired into rolls)
// ---------------------------------------------------------------------------

const ATTACKER_DISADVANTAGE: ConditionType[] = [
  'blinded',
  'frightened',
  'poisoned',
  'prone',
  'restrained',
];
const TARGET_GRANTS_ADVANTAGE: ConditionType[] = [
  'blinded',
  'paralyzed',
  'restrained',
  'stunned',
  'unconscious',
];

/** The conditions currently on a token (from its active effects). */
export function tokenConditions(token: Pick<Token, 'effects'> | undefined): ConditionType[] {
  return (token?.effects ?? [])
    .map((e) => e.condition)
    .filter((c): c is ConditionType => !!c);
}

/** Advantage/disadvantage on an attack implied by the attacker's & target's conditions. */
export function conditionAttackMode(
  attackerConds: ConditionType[],
  targetConds: ConditionType[],
): { mode: RollMode; reasons: string[] } {
  const reasons: string[] = [];
  let adv = false;
  let dis = false;
  for (const c of attackerConds) {
    if (ATTACKER_DISADVANTAGE.includes(c)) {
      dis = true;
      reasons.push(`bạn ${CONDITION_VI[c]}`);
    }
  }
  for (const c of targetConds) {
    if (TARGET_GRANTS_ADVANTAGE.includes(c)) {
      adv = true;
      reasons.push(`mục tiêu ${CONDITION_VI[c]}`);
    }
  }
  // prone target: advantage in melee (our default), disadvantage at range — we
  // don't track range, so assume the common melee case.
  if (targetConds.includes('prone')) {
    adv = true;
    reasons.push('mục tiêu ngã (giả định cận chiến)');
  }
  const mode: RollMode = adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
  return { mode, reasons };
}

/** Paralyzed / unconscious targets are auto-crit when hit in melee. */
export function conditionAutoCrit(targetConds: ConditionType[]): boolean {
  return targetConds.includes('paralyzed') || targetConds.includes('unconscious');
}

/** Combine two roll modes the 5e way: many advantages don't stack, adv+dis cancel. */
export function combineRollModes(a: RollMode, b: RollMode): RollMode {
  const adv = a === 'advantage' || b === 'advantage';
  const dis = a === 'disadvantage' || b === 'disadvantage';
  return adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
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

/** Equipped-weapon actions + a Monk's unarmed strike + the sheet's own actions. */
export function allActions(sheet: CharacterSheet): SheetAction[] {
  const monk = monkUnarmedAction(sheet);
  return [
    ...derivedActions(sheet),
    ...(monk ? [monk] : []),
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
    // 2024 Barbarian: regain one expended Rage on a short rest.
    rageUsed: typeof sheet.rageUsed === 'number' ? Math.max(0, sheet.rageUsed - 1) : sheet.rageUsed,
    // 2024 Monk: all Focus Points return on a short (or long) rest.
    focusUsed: 0,
    // 2024 Druid: regain one expended Wild Shape on a short rest.
    wildShapeUsed:
      typeof sheet.wildShapeUsed === 'number'
        ? Math.max(0, sheet.wildShapeUsed - 1)
        : sheet.wildShapeUsed,
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
    rageUsed: 0,
    raging: false,
    focusUsed: 0,
    wildShapeUsed: 0,
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

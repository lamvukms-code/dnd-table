import type {
  Ability,
  ActiveEffect,
  AttackRange,
  CasterType,
  CharacterSheet,
  ClassEntry,
  ConditionType,
  CoverLevel,
  Currency,
  DamagePart,
  Defenses,
  InventoryItem,
  ItemType,
  RollMode,
  SheetAction,
  Spell,
  SpellSlots,
  Statblock,
  Token,
  TokenStatblock,
  WeaponImbue,
  ConditionalDefense,
  WeaponTrait,
} from './types.js';
import { COIN_TYPES, CONDITION_VI, DAMAGE_TYPE_VI, emptyDefenses, SKILLS, WEAPON_TRAIT_VI } from './types.js';

import { regainHitDice } from './derived.js';
import { magicItemActive } from './magicItems.js';
import { jaegerAfterRest, jaegerDamageParts } from './jaeger.js';
import { customExtraAttack } from './classDefaults.js';

/** Guess melee vs ranged from a range text: "5 ft", "Chạm", "reach 10 ft" → melee; "80/320 ft", "60ft" → ranged. */
export function inferAttackRange(range: string | undefined): AttackRange {
  const t = (range ?? '').toLowerCase().trim();
  if (!t || /chạm|touch|bản thân|self|reach/.test(t)) return 'melee';
  if (t.includes('/')) return 'ranged';
  const m = /(\d+)/.exec(t);
  return m && Number(m[1]) > 10 ? 'ranged' : 'melee';
}

/** The action's melee / ranged tag: the explicit one, else inferred from its range. */
export function attackRangeOf(a: { attackRange?: AttackRange; range?: string; description?: string }): AttackRange {
  if (a.attackRange) return a.attackRange;
  const d = (a.description ?? '').toLowerCase();
  if (/^ranged attack roll/.test(d)) return 'ranged'; // stat-block wording
  if (/^melee attack roll/.test(d) || /^melee or ranged/.test(d)) return 'melee';
  return inferAttackRange(a.range);
}

/** A ranged attack made against a target within 5 ft has Disadvantage (5e). */
export function rangedAtCloseQuarters(range: AttackRange, distanceFeet: number): boolean {
  return range === 'ranged' && distanceFeet <= 5;
}

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

/** Sum two purses coin-by-coin. */
export function addCurrency(a: Currency, b: Currency): Currency {
  const out = emptyCurrency();
  for (const k of COIN_TYPES) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

/** "1/4" / "1/2" / "5" → 0.25 / 0.5 / 5. */
export function crToNumber(cr: string): number {
  if (cr.includes('/')) {
    const [n, d] = cr.split('/').map(Number);
    return d ? n / d : 0;
  }
  return Number(cr) || 0;
}

/**
 * Homebrew quick coin loot scaled to a monster's CR — NOT the DMG hoard tables, just a fast,
 * reasonable starting purse so the DM doesn't have to hand-pick every amount. Coins only, on
 * purpose: magic items stay a manual DM call so a random roll can't hand out something that
 * unbalances the campaign.
 */
export function randomLootFor(cr: string): Currency {
  const n = crToNumber(cr);
  const baseGp =
    n < 1 ? 2 + n * 8
    : n <= 4 ? 8 + n * 12
    : n <= 10 ? 60 + (n - 4) * 45
    : n <= 16 ? 330 + (n - 10) * 130
    : 1110 + (n - 16) * 420;
  const gpValue = Math.max(1, Math.round(baseGp * (0.7 + Math.random() * 0.6)));

  const currency = emptyCurrency();
  if (n < 5) {
    currency.cp = Math.round((2 + Math.random() * 6) * (n + 1) * 3);
    currency.sp = Math.round((1 + Math.random() * 4) * (n + 1) * 2);
    currency.gp = gpValue;
  } else if (n <= 10) {
    currency.sp = Math.round(10 + Math.random() * 20);
    currency.ep = Math.round(Math.random() * 8);
    currency.gp = gpValue;
  } else {
    currency.gp = Math.round(gpValue * (0.5 + Math.random() * 0.3));
    currency.pp = Math.round((gpValue - currency.gp) / 10);
  }
  return currency;
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

/** Attunement slots a character has (5e: 3). */
export const ATTUNEMENT_SLOTS = 3;

/** Feet represented by one grid cell (5e standard). */
export const FEET_PER_CELL = 5;

/** Distance in feet between two grid positions (5e: every square is 5 ft — Chebyshev). */
export function gridFeet(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))) * FEET_PER_CELL;
}

/**
 * A point on the segment from `anchor` toward `target`, no farther than
 * `maxFeet` from the anchor (used to clamp a token's move to its speed).
 */
export function clampToRange(
  anchor: { x: number; y: number },
  target: { x: number; y: number },
  maxFeet: number,
): { x: number; y: number } {
  const feet = gridFeet(anchor, target);
  if (feet <= maxFeet) return { x: target.x, y: target.y };
  const cells = maxFeet / FEET_PER_CELL;
  const cheb = Math.max(Math.abs(target.x - anchor.x), Math.abs(target.y - anchor.y));
  const t = cheb === 0 ? 0 : cells / cheb;
  return { x: anchor.x + (target.x - anchor.x) * t, y: anchor.y + (target.y - anchor.y) * t };
}

/** Whether a token currently has the Grappled condition (from an effect). */
export function tokenIsGrappled(token: Pick<Token, 'effects'> | undefined): boolean {
  return (token?.effects ?? []).some(
    (e) => e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name),
  );
}

/** Resolve a token's walking speed (ft): linked sheet, else stat-block, else 30; 0 if grappled. */
export function walkSpeed(
  sheetSpeed: number | undefined,
  statblockSpeed: number | undefined,
  grappled: boolean,
): number {
  if (grappled) return 0;
  return sheetSpeed ?? statblockSpeed ?? 30;
}

/** Parse a range / reach string ("120 ft", "20/60 ft", "Nón 15ft", "Chạm") to feet. */
export function parseRangeFeet(text: string | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (/chạm|touch|bản thân|self/.test(t)) return 5;
  const m = t.match(/(\d+)\s*(?:\/\s*\d+)?\s*(?:ft|feet|foot|')/);
  if (m) return Number(m[1]);
  const n = t.match(/(\d+)/);
  return n ? Number(n[1]) : 0;
}

/** How many inventory items the character is currently attuned to. */
export function attunementCount(sheet: CharacterSheet): number {
  return sheet.inventory.reduce((n, it) => n + (it.attuned ? 1 : 0), 0);
}

/**
 * Item types you can only have ONE of equipped at a time — one suit of armor, one shield (5e RAW: "you can wear
 * only one suit of armor at a time" / one shield equipped). Weapons aren't capped here (dual-wielding, a quiver of
 * throwables, etc. are all normal); loose `gear` isn't slot-restricted either — a magic ring/cloak/pair of boots
 * bottlenecks on the Attunement cap instead (`ATTUNEMENT_SLOTS`), same as RAW.
 */
const SINGLE_EQUIP_TYPES: ItemType[] = ['armor', 'shield'];

/**
 * Apply a patch to one inventory item, then — if it ends up `equipped` and its type is single-equip
 * (armor/shield) — unequip every OTHER item of that same type, so a character can't end up wearing two suits of
 * armor or carrying two shields at once. Covers both "tick the equip box" and "change an item's type while it's
 * equipped"; harmless no-op for weapons/gear or a patch that doesn't touch `equipped`/`type`.
 */
export function equipInventoryItem(
  inventory: InventoryItem[],
  id: string,
  patch: Partial<InventoryItem>,
): InventoryItem[] {
  const next = inventory.map((it) => (it.id === id ? { ...it, ...patch } : it));
  const target = next.find((it) => it.id === id);
  if (!target?.equipped || !SINGLE_EQUIP_TYPES.includes(target.type)) return next;
  return next.map((it) =>
    it.id !== id && it.type === target.type && it.equipped ? { ...it, equipped: false } : it,
  );
}

/**
 * Spend one use of a consumable (potion, spell scroll…): `quantity` drops by 1, floored at 0. A spent item is
 * left at 0 rather than removed — same "don't silently delete the player's data" pattern as elsewhere (Wild
 * Shape / Rage charge trackers); the player deletes it by hand once it's truly gone.
 */
export function consumeInventoryItem(inventory: InventoryItem[], id: string): InventoryItem[] {
  return inventory.map((it) => (it.id === id ? { ...it, quantity: Math.max(0, it.quantity - 1) } : it));
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
        weaponTraits: it.weaponTraits?.length ? [...it.weaponTraits] : undefined,
        range: it.rangeText || '5 ft',
        source: 'weapon' as const,
        attackKind: 'weapon' as const,
        attackRange: it.attackRange ?? inferAttackRange(it.rangeText),
      };
    });
}

/**
 * The basic unarmed strike everyone has (5e 2024: 1 + STR modifier bludgeoning,
 * proficient). Monks get the stronger Martial Arts version instead
 * (`monkUnarmedAction`), so this is only added for non-Monks.
 */
export function unarmedAction(sheet: CharacterSheet): SheetAction {
  const strMod = abilityMod(sheet.abilities.str);
  return {
    id: 'unarmed',
    name: 'Đòn không vũ khí',
    actionType: 'action',
    attackBonus: strMod + sheet.proficiencyBonus,
    damage: String(Math.max(1, 1 + strMod)),
    damageType: 'bludgeoning',
    range: '5 ft',
    source: 'weapon',
    attackKind: 'weapon',
    attackRange: 'melee',
    description: '5e 2024: 1 + STR mod đập. Có thể thay bằng Grapple / Shove.',
  };
}

/**
 * The kind of attack a `SheetAction` is: a physical/weapon strike or a spell
 * attack. Drives which standing riders and class features (Rage, Sneak Attack)
 * apply. Explicit `action.attackKind` wins; equipped weapons are 'weapon';
 * everything else (manual rows) defaults to 'weapon' too.
 */
/** The unarmed strike rows: the basic one everyone has, and the Monk's Martial Arts versions
 *  (the Attack-action one, and the Bonus Action one — free strike or Flurry of Blows). */
export function isUnarmedAction(action: Pick<SheetAction, 'id'>): boolean {
  return action.id === 'unarmed' || action.id === 'monk-unarmed' || action.id === 'monk-unarmed-bonus';
}
export function attackKindOf(action: SheetAction): 'weapon' | 'spell' {
  return action.attackKind ?? 'weapon';
}

/**
 * Standing damage riders (magic ring, class feature…) that apply to an attack of
 * `kind`. A rider's `scope` is 'weapon' (default), 'spell', or 'any'. This is the
 * single place rider scoping is decided — `actionDamageParts` and
 * `spellAttackParts` both go through it.
 */
export function riderParts(
  sheet: CharacterSheet,
  kind: 'weapon' | 'spell',
  opts?: { unarmed?: boolean },
): DamagePart[] {
  return (sheet.damageRiders ?? [])
    .filter((r) => {
      if (!r.enabled) return false;
      const sc = r.scope ?? 'weapon';
      // 'unarmed' riders ride unarmed strikes only; an unarmed strike is a weapon-kind attack, so it also
      // still gets the ordinary 'weapon' / 'any' riders (no double counting: one rider, one scope)
      if (sc === 'unarmed') return kind === 'weapon' && !!opts?.unarmed;
      return sc === 'any' || sc === kind;
    })
    .map((r) => ({ dice: r.dice, type: r.type, label: r.name }));
}

/**
 * Every damage component of an action: its primary damage, its own extra
 * damage parts, applicable standing riders, and (for weapon attacks) Rage /
 * Sneak Attack. Spell-attack rows skip weapon-only riders and the weapon
 * features — see `attackKindOf`.
 */
/** Whether the effects give Advantage on a saving throw in `ability` (Oaken Resolve). */
export function effectSaveAdvantage(effects: ActiveEffect[] | undefined, ability: Ability): boolean {
  return (effects ?? []).some((e) => e.saveAdvantage?.includes(ability));
}

/** Extra damage the bearer's effects add to one of its attacks (Gnarled Thorns: melee weapon hits). */
export function effectAttackRiders(
  effects: ActiveEffect[] | undefined,
  action: Pick<SheetAction, 'attackKind' | 'attackRange' | 'range' | 'description'>,
): { dice: string; type: string; label: string }[] {
  if ((action.attackKind ?? 'weapon') !== 'weapon') return [];
  const melee = attackRangeOf(action) === 'melee';
  return (effects ?? []).flatMap((e) =>
    (e.attackRiders ?? []).filter((r) => !r.melee || melee).map((r) => ({ dice: r.dice, type: r.type, label: r.label })),
  );
}

export function actionDamageParts(
  sheet: CharacterSheet,
  action: SheetAction,
  effects?: ActiveEffect[],
  opts?: { monkFlurryActive?: boolean },
): DamagePart[] {
  const parts: DamagePart[] = [];
  if (action.damage) parts.push({ dice: action.damage, type: action.damageType || '' });
  for (const e of action.extraDamage ?? []) parts.push({ ...e });

  const isAttack = typeof action.attackBonus === 'number';
  if (!isAttack) return withAttackTraits(parts, action);

  const kind = attackKindOf(action);
  const primaryType = action.damageType || parts[0]?.type || '';

  for (const p of riderParts(sheet, kind, { unarmed: isUnarmedAction(action) })) parts.push(p);
  // effect-borne extra damage on the bearer's own attacks (Wood Wose · Gnarled Thorns)
  for (const p of effectAttackRiders(effects, action)) parts.push({ dice: p.dice, type: p.type, label: p.label });

  if (kind === 'weapon') {
    // Barbarian: rage damage on a weapon attack while raging.
    if (sheet.raging) {
      const bonus = rageDamageBonus(sheet);
      if (bonus > 0) parts.push({ dice: String(bonus), type: primaryType, label: 'Rage' });
    }
    // Rogue: Sneak Attack armed for this attack (the server disarms it on a hit).
    if (sheet.sneakAttackArmed) {
      const dice = sneakAttackDice(sheet);
      if (dice > 0) parts.push({ dice: `${dice}d6`, type: primaryType, label: 'Sneak Attack' });
    }
    // Warrior of the Pestilent Haze (Crooked Moon, lv3) — Contagious Discipline's Claws of
    // Pestilence: a hit landed "from Flurry of Blows" adds Necrotic damage equal to one roll of
    // the Martial Arts die. Scoped to the Bonus Action Unarmed Strike row AND only while Flurry
    // is active this turn (not the free single strike outside Flurry).
    if (action.id === 'monk-unarmed-bonus' && opts?.monkFlurryActive && isPestilentHazeMonk(sheet)) {
      const die = martialArtsDie(sheet);
      if (die) parts.push({ dice: die, type: 'necrotic', label: 'Claws of Pestilence' });
    }
    // Booming Blade armed for this melee weapon attack (the server disarms it on a hit,
    // same as Sneak Attack). The die count matches every other cantrip's 5/11/17 scaling.
    if (sheet.boomingBladeArmed) {
      const tier = totalLevelOf(sheet) >= 17 ? 4 : totalLevelOf(sheet) >= 11 ? 3 : totalLevelOf(sheet) >= 5 ? 2 : 1;
      parts.push({ dice: `${tier}d8`, type: 'thunder', label: 'Booming Blade' });
    }
    // Jaeger: an armed Finisher adds the held Momentum dice (the server expends them on a hit).
    parts.push(...jaegerDamageParts(sheet, primaryType));
  }
  return withAttackTraits(parts, action);
}

/** The traits an attack carries: a spell attack is magical; a weapon has what its item / row says. */
export function attackTraitsOf(action: Pick<SheetAction, 'attackKind' | 'weaponTraits' | 'description'>): WeaponTrait[] {
  const t = new Set<WeaponTrait>(action.weaponTraits ?? []);
  if (action.attackKind === 'spell' || /Spell Attack/i.test(action.description ?? '')) t.add('magical');
  return [...t];
}

/** Stamp the attack's traits on every part that doesn't carry its own. */
function withAttackTraits(parts: DamagePart[], action: SheetAction): DamagePart[] {
  const traits = attackTraitsOf(action);
  if (!traits.length) return parts;
  return parts.map((p) => (p.traits ? p : { ...p, traits }));
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
    conditional: [...(a.conditional ?? []), ...(b.conditional ?? [])],
  };
}

/** Does a conditional defence hold against an attack with these traits? */
export function conditionalDefenseApplies(c: ConditionalDefense, traits: WeaponTrait[] | undefined): boolean {
  const t = traits ?? [];
  if (c.onlyIf?.length && !c.onlyIf.some((x) => t.includes(x))) return false;
  return !c.bypassedBy.some((x) => t.includes(x));
}

/** Standing riders that ride a SPELL attack (scope 'spell' or 'any'). */
export function spellRiderParts(sheet: CharacterSheet): DamagePart[] {
  return riderParts(sheet, 'spell');
}

/**
 * The primary damage parts of a spell attack: its own damage + applicable spell riders + (2024) Agonizing Blast,
 * when the spell instance has it — "add your Charisma modifier to that spell's damage rolls" (SRD 5.2.1), added once
 * per cast regardless of how many dice the cantrip's own damage scaled into.
 */
export function spellAttackParts(
  sheet: CharacterSheet,
  spellDamage: DamagePart[] | undefined,
  spell?: Pick<Spell, 'agonizingBlast' | 'castingClass'>,
): DamagePart[] {
  const parts = [...(spellDamage ?? []).map((p) => ({ ...p })), ...spellRiderParts(sheet)];
  if (spell?.agonizingBlast && spellDamage?.length) {
    const ab = spellcastingAbilityOf(sheet, spell);
    const mod = ab ? abilityMod(sheet.abilities[ab]) : 0;
    if (mod) parts.push({ dice: String(mod), type: spellDamage[0].type, label: 'Agonizing Blast' });
  }
  return parts;
}

/**
 * A one-shot d20 bonus die sitting on a token for a roll of `scope` (Guidance =
 * 'check'). Returns the effect id + die so the caller can add it then clear it.
 */
export function pendingRollBonus(
  token: Pick<Token, 'effects'> | undefined,
  scope: 'check' | 'save' | 'attack',
): { id: string; name: string; dice: string } | undefined {
  const e = (token?.effects ?? []).find((x) => x.rollBonus?.scope === scope);
  return e && e.rollBonus ? { id: e.id, name: e.name, dice: e.rollBonus.dice } : undefined;
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
  if (lvl < 2) return 0;
  // Hood of Empowered Ki (homebrew): + proficiency-bonus extra ki points while worn and attuned.
  return lvl + (magicItemActive(sheet, 'hood-ki') ? sheet.proficiencyBonus : 0);
}

/** Circlet of Natural Rejuvenation (homebrew): temp HP gained each time a Wild Shape use is spent —
 *  proficiency bonus + Druid level. 0 when not worn / attuned or not a Druid. */
export function circletTempHp(sheet: CharacterSheet): number {
  if (!magicItemActive(sheet, 'circlet-rejuvenation')) return 0;
  const d = druidLevel(sheet);
  return d > 0 ? sheet.proficiencyBonus + d : 0;
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
    range: '5 ft',
    source: 'weapon',
    attackKind: 'weapon',
  };
}

/**
 * The Monk's Bonus Action Unarmed Strike row — same to-hit/damage as `monkUnarmedAction`, just
 * flagged as a Bonus Action. Covers both RAW options for that Bonus Action: the free single
 * strike Martial Arts always grants after the Attack action, and Flurry of Blows (spend 1 Focus
 * Point for 2 strikes instead, 3 from level 10 — Heightened Focus) — see `monkBonusUnarmedMax`
 * for which cap applies. One row, not two, because they're the same Bonus Action spent once;
 * the UI/economy layer (`spendEconomy` with `attack: true`) enforces the click cap.
 */
export function monkBonusUnarmedAction(sheet: CharacterSheet): SheetAction | null {
  const base = monkUnarmedAction(sheet);
  if (!base) return null;
  return { ...base, id: 'monk-unarmed-bonus', name: 'Đánh không vũ khí (Bonus Action)', actionType: 'bonus' };
}

/** How many times the Bonus Action Unarmed Strike row can be rolled this turn: 1 for the free
 *  Martial Arts strike, or 2 (3 from level 10 — Heightened Focus) once Flurry of Blows is active. */
export function monkBonusUnarmedMax(sheet: CharacterSheet, flurryActive: boolean): number {
  if (!flurryActive) return 1;
  return monkLevel(sheet) >= 10 ? 3 : 2;
}

/** Whether the sheet's Monk subclass is "Warrior of the Pestilent Haze" (The Crooked Moon). */
export function isPestilentHazeMonk(sheet: CharacterSheet): boolean {
  return sheetClasses(sheet).some(
    (c) => (c.name ?? '').toLowerCase().includes('monk') && /pestilent haze/i.test(c.subclass ?? ''),
  );
}

/** Whether the sheet's Barbarian subclass is "Path of the Experiment" (The Crooked Moon). */
export function isExperimentBarbarian(sheet: CharacterSheet): boolean {
  return sheetClasses(sheet).some(
    (c) => (c.name ?? '').toLowerCase().includes('barbarian') && /path of the experiment/i.test(c.subclass ?? ''),
  );
}

/**
 * 5e 2024 Unarmed Strike Grapple / Shove save DC: 8 + Proficiency Bonus + STR
 * modifier (a Monk may use DEX instead — we take the better of the two).
 */
export function grappleDc(sheet: CharacterSheet): number {
  const str = abilityMod(sheet.abilities.str);
  const best = monkLevel(sheet) > 0 ? Math.max(str, abilityMod(sheet.abilities.dex)) : str;
  return 8 + sheet.proficiencyBonus + best;
}

/** Whether the sheet has a feat by name (case/whitespace-insensitive — feats are free-text). */
export function hasFeat(sheet: CharacterSheet, name: string): boolean {
  const n = name.trim().toLowerCase();
  return sheet.feats.some((f) => f.name.trim().toLowerCase() === n);
}

/** Rogue Sneak Attack dice = ⌈Rogue level / 2⌉ (0 if not a Rogue). */
export function sneakAttackDice(sheet: CharacterSheet): number {
  const lvl = rogueLevel(sheet);
  if (lvl <= 0) return 0;
  // Necklace of Wolf Fangs (homebrew): + proficiency-bonus d6s while worn and attuned.
  return Math.ceil(lvl / 2) + (magicItemActive(sheet, 'wolf-fangs') ? sheet.proficiencyBonus : 0);
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

/** The spellcasting ability one class uses, or null if the class doesn't cast. */
export function classSpellAbility(c: ClassEntry): Ability | null {
  if (casterTypeForClass(c.name, c.subclass) === 'none') return null;
  const sub = (c.subclass ?? '').trim().toLowerCase();
  if (THIRD_CASTER_SUBCLASSES.includes(sub)) return 'int';
  const cls = (c.name ?? '').trim().toLowerCase();
  for (const [k, v] of Object.entries(CLASS_SPELL_ABILITY)) if (cls.includes(k)) return v;
  return null;
}

/** The sheet's classes that have Spellcasting / Pact Magic. */
export function castingClassesOf(sheet: CharacterSheet): ClassEntry[] {
  return sheetClasses(sheet).filter((c) => c.level > 0 && casterTypeForClass(c.name, c.subclass) !== 'none');
}

/**
 * The spellcasting ability for this sheet, or null if it isn't a caster. Multiclass (SRD 5.2.1): "each spell
 * you prepare is associated with one of your classes, and you use the spellcasting ability of that class" —
 * pass the spell to get its own class' ability.
 */
export function spellcastingAbilityOf(
  sheet: CharacterSheet,
  spell?: Pick<Spell, 'castingClass'>,
): Ability | null {
  const cc = spell?.castingClass?.trim().toLowerCase();
  if (cc) {
    const c = sheetClasses(sheet).find((x) => (x.name ?? '').trim().toLowerCase() === cc);
    const a = c ? classSpellAbility(c) : null;
    if (a) return a;
  }
  if (sheet.spellcastingAbility) return sheet.spellcastingAbility;
  for (const c of sheetClasses(sheet)) {
    const a = classSpellAbility(c);
    if (a) return a;
  }
  return null;
}

/** 5e 2024 spell save DC: 8 + proficiency bonus + spellcasting ability modifier. */
export function spellSaveDc(sheet: CharacterSheet, spell?: Pick<Spell, 'castingClass' | 'itemSource'>): number | null {
  if (spell?.itemSource) return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities[spellcastingAbilityOf(sheet) ?? 'cha']);
  const ab = spellcastingAbilityOf(sheet, spell);
  if (!ab || casterTypeOf(sheet) === 'none') return null;
  return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities[ab]);
}

/** Spell attack modifier: proficiency bonus + spellcasting ability modifier. */
export function spellAttackBonus(sheet: CharacterSheet, spell?: Pick<Spell, 'castingClass' | 'itemSource'>): number | null {
  if (spell?.itemSource) return sheet.proficiencyBonus + abilityMod(sheet.abilities[spellcastingAbilityOf(sheet) ?? 'cha']);
  const ab = spellcastingAbilityOf(sheet, spell);
  if (!ab || casterTypeOf(sheet) === 'none') return null;
  return sheet.proficiencyBonus + abilityMod(sheet.abilities[ab]);
}

// ---------------------------------------------------------------------------
// Multiclass (SRD 5.2.1)
// ---------------------------------------------------------------------------

/** Primary-ability requirements of each class for multiclassing (score 13+ in every listed ability; "either" = one of). */
const MULTICLASS_PREREQ: Record<string, { all?: Ability[]; either?: Ability[] }> = {
  barbarian: { all: ['str'] },
  bard: { all: ['cha'] },
  cleric: { all: ['wis'] },
  druid: { all: ['wis'] },
  fighter: { either: ['str', 'dex'] },
  monk: { all: ['dex', 'wis'] },
  paladin: { all: ['str', 'cha'] },
  ranger: { all: ['dex', 'wis'] },
  rogue: { all: ['dex'] },
  sorcerer: { all: ['cha'] },
  warlock: { all: ['cha'] },
  wizard: { all: ['int'] },
};

/**
 * Multiclass prerequisites: to have a class, the character needs 13+ in that class' primary ability, and
 * "your current classes" must qualify too — so every class of a multiclass character is checked. Returns
 * human-readable problems (empty for a single class, or when everything qualifies).
 */
export function multiclassIssues(sheet: CharacterSheet): string[] {
  const classes = sheetClasses(sheet).filter((c) => c.level > 0);
  if (classes.length < 2) return [];
  const issues: string[] = [];
  for (const c of classes) {
    const req = MULTICLASS_PREREQ[(c.name ?? '').trim().toLowerCase()];
    if (!req) continue;
    const low = (req.all ?? []).filter((a) => sheet.abilities[a] < 13);
    if (low.length) issues.push(`${c.name}: cần ${low.map((a) => a.toUpperCase() + ' 13+').join(' và ')}`);
    if (req.either && !req.either.some((a) => sheet.abilities[a] >= 13))
      issues.push(`${c.name}: cần ${req.either.map((a) => a.toUpperCase()).join(' hoặc ')} 13+`);
  }
  return issues;
}

/** Classes that grant Extra Attack at level 5 — several of them do NOT stack (max 2 attacks from the feature). */
const EXTRA_ATTACK_CLASSES = ['barbarian', 'fighter', 'monk', 'paladin', 'ranger'];
export function extraAttackClasses(sheet: CharacterSheet): string[] {
  return sheetClasses(sheet)
    .filter((c) => {
      const key = (c.name ?? '').trim().toLowerCase();
      if (c.level >= 5 && EXTRA_ATTACK_CLASSES.includes(key)) return true;
      return customExtraAttack(key).some(([lvl, n]) => n >= 2 && c.level >= lvl);
    })
    .map((c) => c.name);
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
    // SRD 5.2.1: all Bard/Cleric/Druid/Sorcerer/Wizard levels + half (round UP) of Paladin/Ranger levels
    cl += c.t === 'full' ? c.level : c.t === 'half' ? Math.ceil(c.level / 2) : Math.floor(c.level / 3);
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
  opts?: { range?: AttackRange; distanceFeet?: number },
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
  // Prone target: advantage if the attacker is within 5 ft, disadvantage from farther away. Without a
  // distance, fall back on the attack type (melee = close, ranged = far).
  if (targetConds.includes('prone')) {
    const close =
      typeof opts?.distanceFeet === 'number' ? opts.distanceFeet <= 5 : opts?.range !== 'ranged';
    if (close) {
      adv = true;
      reasons.push('mục tiêu ngã (đứng sát)');
    } else {
      dis = true;
      reasons.push('mục tiêu ngã (ở xa hơn 5ft)');
    }
  }
  const mode: RollMode = adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
  return { mode, reasons };
}

/** Paralyzed / unconscious targets: a hit is a Critical Hit if the attacker is within 5 ft (2024 RAW —
 *  ranged attacks included). Without a distance, fall back on the attack type (melee = within 5 ft). */
export function conditionAutoCrit(
  targetConds: ConditionType[],
  opts?: { range?: AttackRange; distanceFeet?: number },
): boolean {
  if (!targetConds.includes('paralyzed') && !targetConds.includes('unconscious')) return false;
  return typeof opts?.distanceFeet === 'number' ? opts.distanceFeet <= 5 : opts?.range !== 'ranged';
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

/** How many legendary actions an option costs: "(Costs 2 Actions)" in its name, else 1. */
export function legendaryActionCost(a: Pick<SheetAction, 'name'>): number {
  const m = /\(\s*Costs?\s+(\d+)\s+Actions?\s*\)/i.exec(a.name ?? '');
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** Damage parts for a bare stat-block action (no sheet riders). */
export function statblockDamageParts(action: SheetAction, sb?: Pick<Statblock, 'traits'>): DamagePart[] {
  const parts: DamagePart[] = [];
  if (action.damage) parts.push({ dice: action.damage, type: action.damageType || '' });
  for (const e of action.extraDamage ?? []) parts.push({ ...e });
  // "Magic Weapons" trait: the creature's weapon attacks are magical.
  const magicWeapons = sb?.traits?.some((t) => /^Magic(al)? Weapons?\b/i.test(t.name));
  const act = magicWeapons && typeof action.attackBonus === 'number'
    ? { ...action, weaponTraits: [...new Set([...(action.weaponTraits ?? []), 'magical' as const])] }
    : action;
  return withAttackTraits(parts, act);
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
    const o = applyDamageDefenses(raw, part.type, def, part.traits);
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

/**
 * Equipped-weapon actions + an unarmed strike (Monk's Martial Arts version if a
 * Monk, else the basic 1 + STR one everyone always has) + a Monk's Bonus Action
 * Unarmed Strike (free strike, or Flurry of Blows once activated) + the sheet's own actions.
 */
export function allActions(sheet: CharacterSheet, effects?: ActiveEffect[]): SheetAction[] {
  const unarmed = monkUnarmedAction(sheet) ?? unarmedAction(sheet);
  const bonusUnarmed = monkBonusUnarmedAction(sheet);
  const base = [
    ...derivedActions(sheet),
    unarmed,
    ...(bonusUnarmed ? [bonusUnarmed] : []),
    ...sheet.actions.map((a) => ({ ...a, source: a.source ?? ('manual' as const) })),
  ];
  return applyWeaponImbue(sheet, base, effects);
}

/** The damage die of a Shillelagh-style imbue at the sheet's total character level. */
export function imbueDie(imbue: WeaponImbue, charLevel: number): string {
  const [a, b, c, d] = imbue.dice;
  return charLevel >= 17 ? d : charLevel >= 11 ? c : charLevel >= 5 ? b : a;
}

/**
 * Shillelagh (and similar): while the caster's token carries an effect with `weaponImbue`, its
 * matching weapon attacks use the spellcasting ability + proficiency to hit and the scaled die +
 * spellcasting modifier to damage. If no equipped weapon matches (the club is not in the inventory),
 * a ready-made attack row is added so the spell still works.
 */
export function applyWeaponImbue(
  sheet: CharacterSheet,
  actions: SheetAction[],
  effects: ActiveEffect[] | undefined,
): SheetAction[] {
  const eff = effects?.find((e) => e.weaponImbue);
  const ab = spellcastingAbilityOf(sheet);
  if (!eff?.weaponImbue || !ab) return actions;
  const mod = abilityMod(sheet.abilities[ab]);
  const die = imbueDie(eff.weaponImbue, totalLevelOf(sheet));
  const dmg = mod === 0 ? die : mod > 0 ? `${die}+${mod}` : `${die}${mod}`;
  const re = new RegExp(eff.weaponImbue.weapons, 'i');
  const patch = {
    attackBonus: mod + sheet.proficiencyBonus,
    damage: dmg,
    attackKind: 'weapon' as const,
    attackRange: 'melee' as const,
  };
  let hit = false;
  const out = actions.map((a) => {
    if (!a.id.startsWith('weapon:') || !re.test(a.name)) return a;
    hit = true;
    return {
      ...a,
      ...patch,
      name: `${a.name} (${eff.name})`,
      description: `${eff.name}: dùng ${ab.toUpperCase()} để đánh và tính sát thương, tính là magic. Có thể gây bludgeoning hoặc force.`,
    };
  });
  if (hit) return out;
  return [
    {
      id: 'imbue:weapon',
      name: `Gậy / dùi cui (${eff.name})`,
      actionType: 'action',
      damageType: 'bludgeoning',
      range: '5 ft',
      source: 'weapon',
      description: `${eff.name}: dùng ${ab.toUpperCase()}, tính là magic; gây bludgeoning hoặc force.`,
      ...patch,
    },
    ...out,
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
  traits?: WeaponTrait[],
): DamageOutcome {
  const notes: string[] = [];
  let dmg = Math.max(0, Math.round(raw));
  const t = (damageType ?? '').toLowerCase();

  if (def && t) {
    // Conditional defences that hold against this attack (by its magical / silvered / moongilded traits).
    const cond = (def.conditional ?? []).filter((c) => c.types.includes(t) && conditionalDefenseApplies(c, traits));
    const tag = (kind: ConditionalDefense['kind']) => {
      const c = cond.find((x) => x.kind === kind);
      if (!c) return '';
      return c.onlyIf?.length
        ? ` (đòn ${c.onlyIf.map((x) => WEAPON_TRAIT_VI[x]).join('/')})`
        : c.bypassedBy.length
          ? ` (đòn không ${c.bypassedBy.map((x) => WEAPON_TRAIT_VI[x]).join('/')})`
          : '';
    };
    const has = (kind: ConditionalDefense['kind']) => cond.some((c) => c.kind === kind);
    if (def.immunities.includes(t) || has('immune')) {
      notes.push(`miễn nhiễm ${typeName(t)}${tag('immune')} (×0)`);
      return { raw, final: 0, notes };
    }
    if (def.vulnerabilities.includes(t) || has('vulnerable')) {
      dmg *= 2;
      notes.push(`yếu điểm ${typeName(t)}${tag('vulnerable')} (×2)`);
    }
    if (def.resistances.includes(t) || has('resist')) {
      dmg = Math.floor(dmg / 2);
      notes.push(`kháng ${typeName(t)}${tag('resist')} (÷2)`);
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
    jaeger: jaegerAfterRest(sheet, 'short'),
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
    speed: sb.speed,
    actions: sb.actions.map((a) => ({ ...a })),
    legendaryActionsPerRound: sb.legendaryActionsPerRound,
    legendaryActions: sb.legendaryActions?.map((a) => ({ ...a })),
    hasLairActions: sb.hasLairActions,
    lairActions: sb.lairActions?.map((a) => ({ ...a })),
    spellcasting: sb.spellcasting ? { ...sb.spellcasting, spellNames: [...sb.spellcasting.spellNames] } : undefined,
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
    jaeger: jaegerAfterRest(sheet, 'long'),
    wildShapeUsed: 0,
    subclassUses: {},
    speciesUses: {},
    hitDiceUsed: regainHitDice(sheet).hitDiceUsed,
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
    // Unarmored Defense: Barbarian 10 + DEX + CON (shield allowed), Monk 10 + DEX + WIS (no shield).
    let ac = 10 + dexMod + shieldBonus;
    let source = shield ? 'không giáp + khiên' : 'không giáp';
    for (const c of sheetClasses(sheet)) {
      const name = (c.name ?? '').trim().toLowerCase();
      if (name === 'barbarian') {
        const v = 10 + dexMod + abilityMod(sheet.abilities.con) + shieldBonus;
        if (v > ac) {
          ac = v;
          source = 'Unarmored Defense (Barbarian)' + (shield ? ' + khiên' : '');
        }
      } else if (name === 'monk' && !shield) {
        const v = 10 + dexMod + abilityMod(sheet.abilities.wis);
        if (v > ac) {
          ac = v;
          source = 'Unarmored Defense (Monk)';
        }
      }
    }
    return { ac, source };
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

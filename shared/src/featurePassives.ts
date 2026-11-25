import type { Ability, CharacterSheet, DamagePart, Defenses, SheetAction } from './types.js';
import { emptyDefenses } from './types.js';
import { derivedSubclassFeatures, type SubclassFeatureDef } from './classFeatures.js';
import { abilityMod, attackRangeOf, classLevelOf, isUnarmedAction } from './rules.js';
import { resolveFeatureFormula } from './featureActions.js';

/**
 * Passive (always-on) mechanics a class/subclass feature declares in the DM's local data, applied
 * automatically wherever the app computes the number: AC, speed, resistances, check bonuses, the
 * unarmed strike, extra attack, and extra damage on attacks. Generic: the feature text stays in
 * the git-ignored data file.
 *
 * Dice / amounts are feature formulas (see featureActions.ts): "1d8", "mod:wis", "2*mod:con".
 * `byLevel` maps a class level to the value from that level on ({ 3: '1d6', 6: '1d8' }).
 */
export interface FeaturePassive {
  /** Unarmored AC option: base + listed ability mods (e.g. 11 + DEX + CON). `shield`: may add a shield. */
  ac?: { base: number; add: Ability[]; shield?: boolean };
  /** Medium armor uses this ability (max +2) instead of DEX for AC, if better. */
  mediumArmorAbility?: Ability;
  /** AC can't be lower than this (an always-on barkskin). */
  acMin?: number;
  resist?: string[];
  immune?: string[];
  /** Walking speed bonus; `lightArmorOnly`: only in light armor or none. */
  speed?: { bonus: number; lightArmorOnly?: boolean };
  /** Add another ability's modifier to checks of an ability (incl. its skills), e.g. CON to STR checks. */
  checkAdd?: { ability: Ability; add: Ability; min1?: boolean }[];
  /** Add an ability modifier to one skill (e.g. INT to Medicine). */
  skillAdd?: { skill: string; add: Ability }[];
  /** Unarmed strikes deal this die (+ STR) instead of 1 + STR. */
  unarmed?: { byLevel: Record<number, string>; type?: string };
  /** Grants Extra Attack (two attacks per Attack action). */
  extraAttack?: boolean;
  /** Extra damage on the character's own attacks. */
  riders?: FeatureRider[];
}

export interface FeatureRider {
  label: string;
  dice?: string;
  byLevel?: Record<number, string>;
  type: string;
  /** Which attacks: weapon (default), melee / ranged weapon attacks, unarmed strikes, spell attacks, any. */
  scope?: 'weapon' | 'melee' | 'ranged' | 'unarmed' | 'spell' | 'any';
  /** Only while raging. */
  whileRaging?: boolean;
  /** Once-per-turn / spend-a-use riders: the player arms it on the sheet, it's disarmed once the damage is rolled. */
  armed?: boolean;
  /** Arming spends one use of the feature's own pool. */
  spendsUse?: boolean;
}

// ---------------------------------------------------------------------------
// Registry: the client registers its local subclass data; the server loads the same file.
// ---------------------------------------------------------------------------

let DEFS: SubclassFeatureDef[] = [];

export function registerFeatureDefs(defs: SubclassFeatureDef[]): void {
  DEFS = defs;
}

export function registeredFeatureDefs(): SubclassFeatureDef[] {
  return DEFS;
}

export interface ActivePassive {
  feature: SubclassFeatureDef;
  passive: FeaturePassive;
  /** Level in the feature's class (what `lvl` and `byLevel` read). */
  classLevel: number;
}

/** The passives the sheet has earned from the registered features. */
export function activePassives(sheet: CharacterSheet): ActivePassive[] {
  if (!DEFS.length) return [];
  return derivedSubclassFeatures(sheet, DEFS)
    .filter((f) => f.passive)
    .map((f) => ({ feature: f, passive: f.passive!, classLevel: classLevelOf(sheet, f.class) || sheet.level }));
}

/** Pick the value for a class level from a { level: value } table (highest key ≤ level). */
export function byLevel<T>(table: Record<number, T> | undefined, level: number): T | undefined {
  if (!table) return undefined;
  let best: T | undefined;
  let bestKey = -1;
  for (const [k, v] of Object.entries(table)) {
    const n = Number(k);
    if (n <= level && n > bestKey) {
      best = v;
      bestKey = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// AC / speed / defences / checks
// ---------------------------------------------------------------------------

/** Best unarmored AC a feature gives (null when none applies). */
export function passiveUnarmoredAc(sheet: CharacterSheet, shieldBonus: number): { ac: number; source: string } | null {
  let best: { ac: number; source: string } | null = null;
  for (const p of activePassives(sheet)) {
    const f = p.passive.ac;
    if (!f) continue;
    if (shieldBonus && !f.shield) continue;
    const ac = f.base + f.add.reduce((n, a) => n + abilityMod(sheet.abilities[a]), 0) + (f.shield ? shieldBonus : 0);
    if (!best || ac > best.ac) best = { ac, source: p.feature.name };
  }
  return best;
}

/** Medium-armor ability swap (Marauder Momentum: CON instead of DEX, max +2). */
export function passiveMediumArmorMod(sheet: CharacterSheet): { mod: number; source: string } | null {
  let best: { mod: number; source: string } | null = null;
  for (const p of activePassives(sheet)) {
    const a = p.passive.mediumArmorAbility;
    if (!a) continue;
    const mod = Math.min(2, abilityMod(sheet.abilities[a]));
    if (!best || mod > best.mod) best = { mod, source: p.feature.name };
  }
  return best;
}

export function passiveAcMin(sheet: CharacterSheet): { min: number; source: string } | null {
  let best: { min: number; source: string } | null = null;
  for (const p of activePassives(sheet)) {
    const m = p.passive.acMin;
    if (m != null && (!best || m > best.min)) best = { min: m, source: p.feature.name };
  }
  return best;
}

export function passiveSpeedBonus(sheet: CharacterSheet): { bonus: number; notes: string[] } {
  const armor = sheet.inventory.find((it) => it.type === 'armor' && it.equipped);
  let bonus = 0;
  const notes: string[] = [];
  for (const p of activePassives(sheet)) {
    const s = p.passive.speed;
    if (!s) continue;
    if (s.lightArmorOnly && armor && armor.armorCategory !== 'light') continue;
    bonus += s.bonus;
    notes.push(`${p.feature.name} +${s.bonus}`);
  }
  return { bonus, notes };
}

export function passiveDefenses(sheet: CharacterSheet): Defenses | undefined {
  const res = new Set<string>();
  const imm = new Set<string>();
  for (const p of activePassives(sheet)) {
    p.passive.resist?.forEach((t) => res.add(t));
    p.passive.immune?.forEach((t) => imm.add(t));
  }
  if (!res.size && !imm.size) return undefined;
  return { ...emptyDefenses(), resistances: [...res], immunities: [...imm] };
}

/** Extra bonus on a check of `ability` (and, with `skill`, on that skill). */
export function passiveCheckBonus(sheet: CharacterSheet, ability: Ability, skill?: string): number {
  let n = 0;
  for (const p of activePassives(sheet)) {
    for (const c of p.passive.checkAdd ?? []) {
      if (c.ability !== ability) continue;
      const m = abilityMod(sheet.abilities[c.add]);
      n += c.min1 ? Math.max(1, m) : m;
    }
    if (skill) for (const s of p.passive.skillAdd ?? []) if (s.skill === skill) n += abilityMod(sheet.abilities[s.add]);
  }
  return n;
}

export function passiveExtraAttack(sheet: CharacterSheet): boolean {
  return activePassives(sheet).some((p) => p.passive.extraAttack);
}

/** Unarmed strike damage die from a feature (Earthbreaker Overwhelming Power). */
export function passiveUnarmedDie(sheet: CharacterSheet): { die: string; type?: string; source: string } | null {
  for (const p of activePassives(sheet)) {
    const u = p.passive.unarmed;
    const die = u && byLevel(u.byLevel, p.classLevel);
    if (die) return { die, type: u!.type, source: p.feature.name };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Damage riders
// ---------------------------------------------------------------------------

/** Stable id of a rider (feature id + index) — what `sheet.featureRidersArmed` stores. */
export const riderId = (featureId: string, i: number) => `${featureId}#${i}`;

export interface ResolvedRider {
  id: string;
  featureId: string;
  label: string;
  dice: string;
  type: string;
  rider: FeatureRider;
  classKey: string;
}

/** Every rider the sheet has, with its formula resolved for the character's level. */
export function featureRiders(sheet: CharacterSheet): ResolvedRider[] {
  const out: ResolvedRider[] = [];
  for (const p of activePassives(sheet)) {
    (p.passive.riders ?? []).forEach((r, i) => {
      const expr = byLevel(r.byLevel, p.classLevel) ?? r.dice;
      if (!expr) return;
      const dice = resolveFeatureFormula(expr, sheet, p.feature.class);
      if (!dice || dice === '0') return;
      out.push({ id: riderId(p.feature.id, i), featureId: p.feature.id, label: r.label, dice, type: r.type, rider: r, classKey: p.feature.class });
    });
  }
  return out;
}

function riderFits(r: FeatureRider, kind: 'weapon' | 'spell', action: Pick<SheetAction, 'id' | 'attackRange' | 'range' | 'description'>): boolean {
  const scope = r.scope ?? 'weapon';
  if (scope === 'any') return true;
  if (scope === 'spell') return kind === 'spell';
  if (kind !== 'weapon') return false;
  if (scope === 'unarmed') return isUnarmedAction(action);
  if (scope === 'melee') return attackRangeOf(action) === 'melee';
  if (scope === 'ranged') return attackRangeOf(action) === 'ranged';
  return true;
}

/** Damage parts the sheet's feature riders add to one attack: standing ones always, armed ones when armed. */
export function featureRiderParts(
  sheet: CharacterSheet,
  kind: 'weapon' | 'spell',
  action: Pick<SheetAction, 'id' | 'attackRange' | 'range' | 'description'>,
  primaryType: string,
): DamagePart[] {
  const armed = new Set(sheet.featureRidersArmed ?? []);
  return featureRiders(sheet)
    .filter((r) => (!r.rider.armed || armed.has(r.id)) && (!r.rider.whileRaging || !!sheet.raging) && riderFits(r.rider, kind, action))
    .map((r) => ({ dice: r.dice, type: r.type === 'same' ? primaryType : r.type, label: r.label }));
}

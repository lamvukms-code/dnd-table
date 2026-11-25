import type { Ability, CharacterSheet, DamagePart, Defenses, SheetAction } from './types.js';
import { emptyDefenses } from './types.js';
import { derivedSubclassFeatures, type SubclassFeatureDef } from './classFeatures.js';
import { SRD_FEATS_DRAFT, type FeatDef } from './feats.draft.js';
import type { FeatureAction } from './featureActions.js';
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
  /** Ranged attacks with an enemy within 5 ft get no disadvantage. */
  noCloseRangedPenalty?: boolean;
  /** Ranged attacks ignore half cover and treat three-quarters cover as half. */
  rangedCoverReduce?: boolean;
  /** Ranged weapon attacks: normal and long range are multiplied by this. */
  rangeMultiplier?: number;
  /** Once per turn, a melee critical hit or dropping a creature to 0 HP grants one extra melee attack (reminder). */
  extraAttackOnCritOrKill?: boolean;
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
  /** Added to the attack roll while armed (e.g. −5 to hit, +10 damage). */
  attackMod?: number;
  /** Only with a Heavy weapon the character is proficient with. */
  heavyOnly?: boolean;
}

/** A feat from the DM's local data: the picker entry plus optional mechanics (like a subclass feature). */
export interface LocalFeatDef extends FeatDef {
  passive?: FeaturePassive;
  actions?: FeatureAction[];
  uses?: SubclassFeatureDef['uses'];
  /** Setting / book name shown in the picker. */
  source?: string;
}

// ---------------------------------------------------------------------------
// Registry: the client registers its local subclass data; the server loads the same file.
// ---------------------------------------------------------------------------

let DEFS: SubclassFeatureDef[] = [];
let FEATS: LocalFeatDef[] = [];

export function registerFeatureDefs(defs: SubclassFeatureDef[]): void {
  DEFS = defs;
}

/** Register local feats: they join the feat picker, and their passives / buttons / uses apply to
 *  every sheet that has a feat of that name. */
export function registerFeatDefs(defs: LocalFeatDef[]): void {
  FEATS = defs;
  const have = new Set(SRD_FEATS_DRAFT.map((f) => f.name.toLowerCase()));
  for (const f of defs) if (!have.has(f.name.toLowerCase())) SRD_FEATS_DRAFT.push(f);
}

export function localFeatDef(name: string): LocalFeatDef | undefined {
  const n = name.trim().toLowerCase();
  return FEATS.find((f) => f.name.toLowerCase() === n);
}

/** The sheet's local feats that carry mechanics, shaped like subclass features (id "feat:<id>",
 *  no class: `lvl` in formulas = character level) so the same UI / rest / rider code handles them. */
export function featFeatureDefs(sheet: CharacterSheet): SubclassFeatureDef[] {
  if (!FEATS.length) return [];
  const out: SubclassFeatureDef[] = [];
  for (const f of sheet.feats ?? []) {
    const d = localFeatDef(f.name);
    if (!d || (!d.passive && !d.actions && !d.uses)) continue;
    out.push({ id: `feat:${d.id}`, class: '', subclass: 'feat', level: 0, name: `${d.name} (feat)`, description: d.guidance, passive: d.passive, actions: d.actions, uses: d.uses });
  }
  return out;
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
  const sub = DEFS.length
    ? derivedSubclassFeatures(sheet, DEFS)
        .filter((f) => f.passive)
        .map((f) => ({ feature: f, passive: f.passive!, classLevel: classLevelOf(sheet, f.class) || sheet.level }))
    : [];
  const feats = featFeatureDefs(sheet)
    .filter((f) => f.passive)
    .map((f) => ({ feature: f, passive: f.passive!, classLevel: sheet.level }));
  return [...sub, ...feats];
}

/** Range multiplier for the sheet's ranged weapon attacks (1 = none). */
export function passiveRangeMultiplier(sheet: CharacterSheet | undefined): number {
  if (!sheet) return 1;
  return activePassives(sheet).reduce((m, p) => Math.max(m, p.passive.rangeMultiplier ?? 1), 1);
}

/** Whether the sheet gets an extra melee attack after a melee crit / a kill (reminder only). */
export function passiveExtraAttackOnCritOrKill(sheet: CharacterSheet | undefined): boolean {
  return !!sheet && activePassives(sheet).some((p) => p.passive.extraAttackOnCritOrKill);
}

/** Ranged attacks ignore the "enemy within 5 ft" disadvantage. */
export function passiveNoCloseRangedPenalty(sheet: CharacterSheet): boolean {
  return activePassives(sheet).some((p) => p.passive.noCloseRangedPenalty);
}

/** Cover-reducing feat: the target's cover against this sheet's ranged attacks. */
export function passiveRangedCover<C extends string>(sheet: CharacterSheet | undefined, cover: C): C | 'none' | 'half' {
  if (!sheet || !activePassives(sheet).some((p) => p.passive.rangedCoverReduce)) return cover;
  return cover === 'half' ? 'none' : cover === 'threequarters' ? 'half' : cover;
}

/** SRD weapons with the Heavy property — the fallback when an item doesn't say. */
const HEAVY_WEAPON = /great\s?(sword|axe)|maul|halberd|glaive|pike|heavy crossbow|longbow|lance/i;

/** Whether this attack row is a proficient Heavy weapon (equipped item behind a `weapon:<id>` row). */
export function isProficientHeavy(sheet: CharacterSheet, action: Pick<SheetAction, 'id'>): boolean {
  const it = sheet.inventory?.find((i) => `weapon:${i.id}` === action.id);
  if (!it || !it.proficient) return false;
  return it.heavy ?? HEAVY_WEAPON.test(it.name);
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

function riderFits(
  r: FeatureRider,
  kind: 'weapon' | 'spell',
  action: Pick<SheetAction, 'id' | 'attackRange' | 'range' | 'description'>,
  sheet?: CharacterSheet,
): boolean {
  if (r.heavyOnly && (kind !== 'weapon' || !sheet || !isProficientHeavy(sheet, action))) return false;
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
    .filter((r) => (!r.rider.armed || armed.has(r.id)) && (!r.rider.whileRaging || !!sheet.raging) && riderFits(r.rider, kind, action, sheet))
    .map((r) => ({ dice: r.dice, type: r.type === 'same' ? primaryType : r.type, label: r.label }));
}

/** Attack-roll change from armed riders that fit this attack (e.g. −5). */
export function featureAttackMod(
  sheet: CharacterSheet,
  kind: 'weapon' | 'spell',
  action: Pick<SheetAction, 'id' | 'attackRange' | 'range' | 'description'>,
): number {
  const armed = new Set(sheet.featureRidersArmed ?? []);
  return featureRiders(sheet)
    .filter((r) => r.rider.armed && r.rider.attackMod && armed.has(r.id) && (!r.rider.whileRaging || !!sheet.raging) && riderFits(r.rider, kind, action, sheet))
    .reduce((n, r) => n + (r.rider.attackMod ?? 0), 0);
}

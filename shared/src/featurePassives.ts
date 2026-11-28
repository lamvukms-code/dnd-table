import type { Ability, CharacterSheet, DamagePart, Defenses, SheetAction } from './types.js';
import { emptyDefenses } from './types.js';
import { classMechanicDefs, derivedSubclassFeatures, registerReplacingDefs, type SubclassFeatureDef } from './classFeatures.js';
import { SRD_FEATS_DRAFT, type FeatDef } from './feats.draft.js';
import { findInvocationDraft, WARLOCK_INVOCATIONS_DRAFT, type InvocationDef } from './invocations.draft.js';
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
  speed?: { bonus: number; lightArmorOnly?: boolean; noHeavyArmor?: boolean };
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
  /** Only while the character is in this form (`sheet.activeForm`, set by a 'form' button); '*' = any form. */
  whileForm?: string;
  /** Advantage on Constitution saves to keep concentration. */
  concentrationAdvantage?: boolean;
  /** Pact weapons (items marked `pactWeapon`) may use CHA for attack and damage, and are always proficient. */
  pactWeapon?: boolean;
  /** Attacks per Attack action while a pact weapon is equipped (2 = an extra attack). */
  pactExtraAttack?: number;
  /** Damaging cantrips (not self-range, not multi-beam ones) are cast this many times in one action
   *  instead of growing their dice: the character's cantrip tier (2 / 3 / 4 at levels 5 / 11 / 17). */
  cantripVolley?: boolean;
  /** Cantrip damage dice below this are rolled again once (the new roll stands). */
  cantripRerollBelow?: number;
  /** Ranged spell attacks: no disadvantage with an enemy within 5 ft. */
  spellNoCloseRangedPenalty?: boolean;
  /** Ranged spell attacks ignore half cover. */
  spellIgnoreHalfCover?: boolean;
  /** Ranged spell attacks: range multiplied by this. */
  spellRangeMultiplier?: number;
  /** A reaction the character may take when attacked (offered to its player before the roll). */
  reaction?: FeatureReaction;
  /** Advantage on these saving throws (Danger Sense: DEX), not while Incapacitated. */
  saveAdvantage?: Ability[];
  /** Proficiency in these saving throws, or all of them (Slippery Mind, Disciplined Survivor). */
  saveProficiency?: Ability[] | 'all';
  /** Advantage on Initiative rolls (Feral Instinct). */
  initiativeAdvantage?: boolean;
  /** Evasion: a DEX save for half takes none on a success, half on a failure (not while Incapacitated). */
  evasion?: boolean;
  /**
   * A floor on ability checks: `d20` = treat a lower d20 as this (Reliable Talent, with `proficientOnly`);
   * `score` = a STR check / save total below the ability score uses the score (Indomitable Might).
   */
  checkMin?: { d20?: number; proficientOnly?: boolean; score?: Ability };
  /** No attack roll against the character has Advantage unless it is Incapacitated (Elusive). */
  elusive?: boolean;
  /** Dropping to 0 HP while raging: a CON save (DC 10, +5 each time) to stay at 2 × Barbarian level HP. */
  relentlessRage?: boolean;
  /** The damage-reducing reaction works on any damage type (Deflect Energy). */
  deflectAnyType?: boolean;
  /** Add the Proficiency Bonus to Initiative (Alert). */
  initiativeProf?: boolean;
  /** Ranged weapon attacks ignore half and three-quarters cover (Sharpshooter). */
  rangedCoverIgnore?: boolean;
  /** Spell attacks ignore half and three-quarters cover (Spell Sniper). */
  spellIgnoreCover?: boolean;
  /** No disadvantage for attacking at long range (Sharpshooter). */
  noLongRangePenalty?: boolean;
  /** Advantage on death saving throws (Durable). */
  deathSaveAdvantage?: boolean;
  /** In heavy armor, bludgeoning / piercing / slashing damage from an attack is lower by the Proficiency Bonus. */
  heavyArmorReduce?: boolean;
  /** Medium armor adds DEX up to this instead of 2 (Medium Armor Master). */
  mediumArmorDexCap?: number;
  /** Once per turn, a weapon hit's damage dice are rolled twice and the higher total is used. */
  savageAttacker?: boolean;
  /** Artillery expert: proficient with artillery firearms, reloads them as a bonus action (until level 11
   *  only if not moved, then speed 0), artillery and its shot weigh half, double damage to objects. */
  artilleryExpert?: boolean;
  /** Once per turn a bludgeoning hit pushes 5 ft; a crit gives attacks against the target advantage. */
  crusher?: boolean;
  /** Once per turn a piercing hit rerolls its lowest die; a crit adds one more damage die. */
  piercer?: boolean;
  /** Once per turn a slashing hit cuts the target's speed by 10 ft; a crit gives it disadvantage on attacks. */
  slasher?: boolean;
  /** With a shield, a successful DEX save for half takes no damage (Shield Master). */
  shieldInterpose?: boolean;
  /** A creature this character damages saves to keep concentration with disadvantage (Mage Slayer). */
  mageSlayer?: boolean;
  /** Bonus Action d4 bludgeoning strike with a quarterstaff, spear or heavy reach weapon (Polearm Master). */
  polearmMaster?: boolean;
  /** The off-hand attack may use any one-handed melee weapon, as long as one is Light (Dual Wielder). */
  dualWielder?: boolean;
  /** Unarmed strikes reroll 1s on damage, once per turn push 5 ft (Tavern Brawler). */
  tavernBrawler?: boolean;
  /** An aura: the character and allies within `radius` feet (by class level) add this ability's modifier (min +1) to saves. */
  auraSave?: { ability: Ability; radius: Record<number, number> };
  /** Half the Proficiency Bonus on ability checks without proficiency, Initiative included (Jack of All Trades). */
  jackOfAllTrades?: boolean;
  /** Spells (by name) cast at will without a slot (Mask of Many Faces → Disguise Self…). */
  freeCast?: string[];
  /** Spells cast once per long rest without a slot (Gift of the Depths → Water Breathing). */
  freeCastDaily?: string[];
  /** Once per turn, a missed attack roll hits instead (Boon of Combat Prowess). */
  missToHit?: boolean;
  /** Maximum HP higher by this much (Boon of Fortitude). */
  maxHpBonus?: number;
  /** Bludgeoning / piercing / slashing damage ignores resistance; a natural 20 adds the STR/DEX score (Boon of Irresistible Offense). */
  irresistibleOffense?: boolean;
  /** Once per long rest, dropping to 0 HP leaves the character at 1 HP and heals half its maximum (Boon of Recovery). */
  lastStand?: boolean;
  /** Proficient in every skill (Boon of Skill). */
  allSkills?: boolean;
  /** A level 1–4 slot is kept when 1d4 matches its level (Boon of Spell Recall). */
  spellRecall?: boolean;
}

/** A reaction to being attacked in melee, answered by the player before the roll. */
export interface FeatureReaction {
  /**
   * counter / stepAway: answer a melee attack before it lands. halve: an attack that hits deals half
   * (Uncanny Dodge). reduce: an attack that hits deals `dice` less (Deflect Attacks) — `types` limits it.
   */
  kind: 'counter' | 'stepAway' | 'halve' | 'reduce' | 'parry';
  /** counter: damage of the counter-attack (a spell attack against the attacker). reduce: the reduction. */
  dice?: string;
  /** reduce: only attacks dealing one of these damage types. */
  types?: string[];
  type?: string;
  /** counter: a hit makes the attack fail and stuns the attacker until the end of its turn. */
  stunOnHit?: boolean;
  /** counter: the feature's use is spent only once the counter deals damage (else on use). */
  spendUseOnDamage?: boolean;
  /** stepAway: feet moved away (default 5). */
  feet?: number;
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
  /** Only with a pact weapon (item marked `pactWeapon`). */
  pactWeaponOnly?: boolean;
  /** Arming spends one Pact Magic slot (the dice may use `pslot1` = that slot's level + 1). */
  spendsPactSlot?: boolean;
  /** Spell scope: cantrips only. */
  cantripOnly?: boolean;
  /** Only while the character is in this form ('*' = any form). */
  whileForm?: string;
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
  registerReplacingDefs(defs);
}

/** Register local feats: they join the feat picker, and their passives / buttons / uses apply to
 *  every sheet that has a feat of that name. */
export function registerFeatDefs(defs: LocalFeatDef[]): void {
  FEATS = defs;
  const have = new Set(SRD_FEATS_DRAFT.map((f) => f.name.toLowerCase()));
  for (const f of defs) if (!have.has(f.name.toLowerCase())) SRD_FEATS_DRAFT.push(f);
}

/** Eldritch Invocations with mechanics: the built-in list plus the DM's local ones (which also join the picker). */
export function registerInvocationDefs(defs: InvocationDef[]): void {
  const have = new Set(WARLOCK_INVOCATIONS_DRAFT.map((f) => f.name.toLowerCase()));
  for (const d of defs) {
    const i = WARLOCK_INVOCATIONS_DRAFT.findIndex((x) => x.name.toLowerCase() === d.name.toLowerCase());
    if (i >= 0) WARLOCK_INVOCATIONS_DRAFT[i] = { ...WARLOCK_INVOCATIONS_DRAFT[i], ...d };
    else if (!have.has(d.name.toLowerCase())) WARLOCK_INVOCATIONS_DRAFT.push(d);
  }
}

/** The sheet's invocations (features of that name) that carry mechanics, shaped like Warlock features. */
export function invocationFeatureDefs(sheet: CharacterSheet): SubclassFeatureDef[] {
  const out: SubclassFeatureDef[] = [];
  const seen = new Set<string>();
  for (const f of sheet.features ?? []) {
    const d = findInvocationDraft(f.name);
    if (!d || seen.has(d.id) || (!d.passive && !d.actions && !d.uses && !d.forms)) continue;
    seen.add(d.id);
    out.push({ id: `inv:${d.id}`, class: 'warlock', subclass: 'invocation', level: 0, name: `${d.name} (invocation)`, description: d.guidance, passive: d.passive, actions: d.actions, uses: d.uses });
    // per-form passives (a summoned weapon's modes): one entry each, active only in that form
    for (const [form, p] of Object.entries(d.forms ?? {})) {
      const { note, ...passive } = p;
      out.push({ id: `inv:${d.id}:${form}`, class: 'warlock', subclass: 'invocation', level: 0, name: `${d.name} · ${form}`, description: note ?? '', passive: { ...passive, whileForm: form } });
    }
  }
  return out;
}

/** Does the sheet have this invocation (a feature of that name)? */
export function hasInvocation(sheet: CharacterSheet | undefined, name: string): boolean {
  const n = name.trim().toLowerCase();
  return !!sheet && (sheet.features ?? []).some((f) => f.name.trim().toLowerCase() === n);
}

export function localFeatDef(name: string): LocalFeatDef | undefined {
  const n = name.trim().toLowerCase();
  const local = FEATS.find((f) => f.name.toLowerCase() === n);
  if (local && (local.passive || local.actions || local.uses)) return local;
  // the built-in SRD feats carry their own mechanics (Great Weapon Master, Sharpshooter…)
  return SRD_FEATS_DRAFT.find((f) => f.name.toLowerCase() === n && (f.passive || f.actions || f.uses)) ?? local;
}

/** The sheet's local feats that carry mechanics, shaped like subclass features (id "feat:<id>",
 *  no class: `lvl` in formulas = character level) so the same UI / rest / rider code handles them. */
export function featFeatureDefs(sheet: CharacterSheet): SubclassFeatureDef[] {
  // base-class features and invocations with mechanics ride along (same UI / rest / rider code)
  const out: SubclassFeatureDef[] = [...classMechanicDefs(sheet), ...invocationFeatureDefs(sheet)];
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
    .map((f) => ({ feature: f, passive: f.passive!, classLevel: f.class ? classLevelOf(sheet, f.class) || sheet.level : sheet.level }));
  return [...sub, ...feats].filter((p) => formOk(sheet, p.passive.whileForm));
}

/** A `whileForm` condition against the sheet's current form ('*' = any form). */
export function formOk(sheet: CharacterSheet, whileForm: string | undefined): boolean {
  if (!whileForm) return true;
  const cur = sheet.activeForm ?? '';
  return whileForm === '*' ? !!cur : cur.toLowerCase() === whileForm.toLowerCase();
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
  if (!sheet) return cover;
  const ps = activePassives(sheet);
  // Sharpshooter: half and three-quarters cover don't count at all
  if (ps.some((p) => p.passive.rangedCoverIgnore)) return cover === 'half' || cover === 'threequarters' ? 'none' : cover;
  if (!ps.some((p) => p.passive.rangedCoverReduce)) return cover;
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
    if (s.noHeavyArmor && armor?.armorCategory === 'heavy') continue;
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
  if (r.pactWeaponOnly && (kind !== 'weapon' || !sheet || !isPactWeaponAction(sheet, action))) return false;
  if (r.cantripOnly && action.id !== 'cantrip') return false;
  if (r.whileForm && (!sheet || !formOk(sheet, r.whileForm))) return false;
  const scope = r.scope ?? 'weapon';
  if (scope === 'any') return true;
  if (scope === 'spell') return kind === 'spell';
  if (kind !== 'weapon') return false;
  if (scope === 'unarmed') return isUnarmedAction(action);
  if (scope === 'melee') return attackRangeOf(action) === 'melee';
  if (scope === 'ranged') return attackRangeOf(action) === 'ranged';
  return true;
}

/** Is this weapon row (or off-hand row) made with a pact weapon? */
export function isPactWeaponAction(sheet: CharacterSheet, action: Pick<SheetAction, 'id'>): boolean {
  const m = /^(?:weapon|offhand):(.+)$/.exec(action.id);
  return !!m && sheet.inventory.some((it) => it.id === m[1] && it.pactWeapon);
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

/** Any active passive with this flag set (pact weapon, concentration advantage, spell-attack tweaks…). */
export function passiveHas(
  sheet: CharacterSheet | undefined,
  key:
    | 'pactWeapon'
    | 'concentrationAdvantage'
    | 'cantripVolley'
    | 'spellNoCloseRangedPenalty'
    | 'spellIgnoreHalfCover'
    | 'initiativeAdvantage'
    | 'evasion'
    | 'elusive'
    | 'relentlessRage'
    | 'deflectAnyType'
    | 'initiativeProf'
    | 'spellIgnoreCover'
    | 'noLongRangePenalty'
    | 'deathSaveAdvantage'
    | 'heavyArmorReduce'
    | 'savageAttacker'
    | 'artilleryExpert'
    | 'crusher'
    | 'piercer'
    | 'slasher'
    | 'shieldInterpose'
    | 'mageSlayer'
    | 'polearmMaster'
    | 'dualWielder'
    | 'tavernBrawler'
    | 'jackOfAllTrades'
    | 'missToHit'
    | 'irresistibleOffense'
    | 'lastStand'
    | 'allSkills'
    | 'spellRecall',
): boolean {
  return !!sheet && activePassives(sheet).some((p) => !!p.passive[key]);
}

/** Highest number a passive gives for this key (attacks with a pact weapon, reroll threshold, range ×). */
export function passiveMax(sheet: CharacterSheet | undefined, key: 'pactExtraAttack' | 'cantripRerollBelow' | 'spellRangeMultiplier'): number {
  if (!sheet) return 0;
  return activePassives(sheet).reduce((m, p) => Math.max(m, p.passive[key] ?? 0), 0);
}

/** The reactions to melee attacks the sheet has now, with the feature they come from. */
export function passiveReactions(sheet: CharacterSheet): { featureId: string; name: string; reaction: FeatureReaction; classKey: string; uses?: SubclassFeatureDef['uses'] }[] {
  return activePassives(sheet)
    .filter((p) => p.passive.reaction)
    .map((p) => ({ featureId: p.feature.id, name: p.feature.name.replace(/\s*\((invocation|feat)\)$/, ''), reaction: p.passive.reaction!, classKey: p.feature.class, uses: p.feature.uses }));
}

/** Advantage on this save from a feature (Danger Sense). The caller checks Incapacitated. */
export function passiveSaveAdvantage(sheet: CharacterSheet | undefined, ability: Ability): string | null {
  if (!sheet) return null;
  const p = activePassives(sheet).find((x) => x.passive.saveAdvantage?.includes(ability));
  return p ? p.feature.name : null;
}

/** Proficient in this save through a feature (Slippery Mind, Disciplined Survivor). */
export function passiveSaveProficient(sheet: CharacterSheet, ability: Ability): boolean {
  return activePassives(sheet).some((x) => x.passive.saveProficiency === 'all' || (Array.isArray(x.passive.saveProficiency) && x.passive.saveProficiency.includes(ability)));
}

/**
 * Floors for one check / save: the lowest d20 that counts (Reliable Talent on a proficient check) and
 * the lowest total (Indomitable Might: the STR score).
 */
export function passiveCheckFloor(
  sheet: CharacterSheet | undefined,
  ability: Ability,
  opts: { proficient?: boolean; save?: boolean } = {},
): { d20Min?: number; totalMin?: number; why: string[] } {
  const out: { d20Min?: number; totalMin?: number; why: string[] } = { why: [] };
  if (!sheet) return out;
  for (const p of activePassives(sheet)) {
    const c = p.passive.checkMin;
    if (!c) continue;
    if (c.d20 && !opts.save && (!c.proficientOnly || opts.proficient)) {
      out.d20Min = Math.max(out.d20Min ?? 0, c.d20);
      out.why.push(p.feature.name);
    }
    if (c.score && c.score === ability) {
      out.totalMin = Math.max(out.totalMin ?? 0, sheet.abilities[ability]);
      out.why.push(p.feature.name);
    }
  }
  return out;
}

/** A save aura the sheet radiates now (Aura of Protection): its bonus and reach in feet. */
export function passiveAuraSave(sheet: CharacterSheet | undefined): { bonus: number; feet: number; name: string } | null {
  if (!sheet) return null;
  for (const p of activePassives(sheet)) {
    const a = p.passive.auraSave;
    if (!a) continue;
    const feet = byLevel(a.radius, p.classLevel) ?? 0;
    if (feet > 0) return { bonus: Math.max(1, abilityMod(sheet.abilities[a.ability])), feet, name: p.feature.name };
  }
  return null;
}

/**
 * The best save aura reaching `target` (a token on the map): the sheets' own tokens within reach,
 * on the same side, not Incapacitated. `sameSide` decides who counts as an ally.
 */
export function auraSaveBonusFor<T extends { id: string; x: number; y: number; size?: string; effects?: { condition?: string }[] }>(
  target: T,
  sources: { sheet: CharacterSheet; token: T }[],
  distanceFeet: (a: T, b: T) => number,
  sameSide: (a: T, b: T) => boolean,
): { bonus: number; name: string } | null {
  let best: { bonus: number; name: string } | null = null;
  for (const { sheet, token } of sources) {
    const aura = passiveAuraSave(sheet);
    if (!aura) continue;
    if ((token.effects ?? []).some((e) => e.condition && ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(e.condition))) continue;
    if (token.id !== target.id && (!sameSide(token, target) || distanceFeet(token, target) > aura.feet)) continue;
    if (!best || aura.bonus > best.bonus) best = { bonus: aura.bonus, name: `${aura.name} (${sheet.name})` };
  }
  return best;
}

/** A spell the sheet casts without a slot: 'atWill', 'daily' (once per long rest), or null. */
export function passiveFreeCast(sheet: CharacterSheet | undefined, spellName: string): 'atWill' | 'daily' | null {
  if (!sheet) return null;
  const n = spellName.trim().toLowerCase();
  const ps = activePassives(sheet);
  if (ps.some((p) => p.passive.freeCast?.some((x) => x.toLowerCase() === n))) return 'atWill';
  if (ps.some((p) => p.passive.freeCastDaily?.some((x) => x.toLowerCase() === n))) return 'daily';
  return null;
}

/** Extra maximum HP from features (Boon of Fortitude). */
export function passiveMaxHpBonus(sheet: CharacterSheet): number {
  return activePassives(sheet).reduce((n, p) => n + (p.passive.maxHpBonus ?? 0), 0);
}

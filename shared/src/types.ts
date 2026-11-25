import type { MadnessEntry } from './madness.js';
import type { FirearmProps } from './firearms.js';
import type { RollResult } from './dice.js';
import type { JaegerState } from './jaeger.js';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const SKILLS: Record<string, Ability> = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export interface Attack {
  id: string;
  name: string;
  attackBonus: number;
  damage: string; // dice notation, e.g. "1d8+3"
  damageType: string;
  source?: 'manual' | 'weapon'; // 'weapon' = derived from an equipped item
}

/** How an attack is delivered: a melee attack, or a ranged one (which may still be made at close quarters). */
export type AttackRange = 'melee' | 'ranged';

export type ActionType = 'action' | 'bonus' | 'reaction' | 'free' | 'other' | 'legendary' | 'lair';
export const ACTION_TYPES: ActionType[] = ['action', 'bonus', 'reaction', 'free', 'other'];
export type Recharge = 'short' | 'long' | 'other';

/** One damage component of an attack (its own dice + damage type). */
/** What an attack is made of / with — checked against "resistant to non-magical attacks that aren't
 *  silvered"-style defences. */
/** `godsBane` marks the party's God's Bane artifact weapon (homebrew, see `godsBane.ts`). It rides in
 *  `weaponTraits` so it reaches the server on every damage part, but it is NOT in `WEAPON_TRAITS` (the
 *  generic material picker) and no defence is bypassed by it. `divine` (homebrew, God's Bane rules) marks
 *  a weapon of divine make: attacking a creature within 5 ft of the God's Bane token with it has
 *  disadvantage. It bypasses no defence either. */
export type WeaponTrait = 'magical' | 'silvered' | 'moongilded' | 'divine' | 'godsBane';
export const WEAPON_TRAITS: WeaponTrait[] = ['magical', 'silvered', 'moongilded', 'divine'];
export const WEAPON_TRAIT_VI: Record<WeaponTrait, string> = {
  magical: 'phép',
  silvered: 'bạc',
  moongilded: 'moongilded',
  divine: 'thần thánh',
  godsBane: "God's Bane",
};

export interface DamagePart {
  dice: string; // "2d6" or "1d4+2"
  type: string; // a DamageType key, or free text
  label?: string; // "Ring of fire", "Flame Tongue"
  /** The attack's traits (magical / silvered / moongilded). Unset = an ordinary, non-magical attack. */
  traits?: WeaponTrait[];
}

/**
 * A defence that only holds for some attacks, e.g. "resistance to bludgeoning, piercing and slashing from
 * nonmagical attacks that aren't silvered" = { kind: 'resist', types: [b, p, s], bypassedBy: ['magical',
 * 'silvered'] }; "immunity … from magical attacks" = { kind: 'immune', types, bypassedBy: [], onlyIf:
 * ['magical'] }.
 */
export interface ConditionalDefense {
  kind: 'resist' | 'immune' | 'vulnerable';
  types: string[];
  /** The defence does NOT apply when the attack has any of these traits. */
  bypassedBy: WeaponTrait[];
  /** If set, the defence applies ONLY when the attack has one of these traits. */
  onlyIf?: WeaponTrait[];
  /** The book's wording, shown in the log. */
  text?: string;
}

/**
 * A standing extra-damage effect on a character (e.g. a magic ring that adds
 * 1d4 fire to attacks) that isn't part of any one weapon. Applies to every
 * attack action while enabled — toggle it off where it shouldn't count, or put
 * weapon-specific riders in that weapon's `weaponExtraDamage` instead.
 */
export interface DamageRider {
  id: string;
  name: string;
  dice: string;
  type: string;
  enabled: boolean;
  /** Which attacks it rides. 'weapon' (default) = weapon / manual attack rows;
   *  'melee' / 'ranged' = only melee / ranged weapon attacks; 'spell' = spell attacks only;
   *  'any' = both; 'unarmed' = unarmed strikes only. */
  scope?: 'weapon' | 'melee' | 'ranged' | 'spell' | 'any' | 'unarmed';
  /** One-shot (Divine Smite, a once-per-turn item): switched off after the next attack's damage roll. */
  once?: boolean;
}

/** An entry in the action economy: an attack, a utility roll, or just a note. */
export interface SheetAction {
  id: string;
  name: string;
  actionType: ActionType;
  attackBonus?: number; // present -> it's an attack roll vs AC
  damage?: string; // primary damage notation, e.g. "2d6+8"
  damageType?: string;
  extraDamage?: DamagePart[]; // additional damage sources on this action
  save?: { ability: Ability; dc: number }; // present -> it forces a saving throw
  /** Damage on a failed save when the action is an attack with a rider save ("Hit: … and the target must
   *  succeed on a DC 13 Constitution saving throw or take 7 (2d6) poison damage"). A pure save action
   *  keeps its damage in `damage` / `extraDamage`. */
  saveDamage?: DamagePart[];
  notation?: string; // a generic roll (healing / utility), e.g. "2d4+2"
  /** Reach / range text for display, e.g. "5 ft", "20/60 ft", "120 ft". */
  range?: string;
  description?: string;
  source?: 'manual' | 'weapon'; // 'weapon' = derived from an equipped item
  /** For attacks: whether it's a physical strike or a spell attack. Drives which
   *  standing riders + weapon features (Rage, Sneak Attack) apply. Default 'weapon'. */
  attackKind?: 'weapon' | 'spell';
  /** Melee / ranged tag. Unset = inferred from `range` (see `attackRangeOf`). */
  attackRange?: AttackRange;
  /** Magical / silvered / moongilded weapon (spell attacks always count as magical). */
  weaponTraits?: WeaponTrait[];
}

/** Limited-use class resource: Ki, Rage, Bardic Inspiration, Sorcery Points… */
export interface ClassResource {
  id: string;
  name: string;
  max: number;
  used: number;
  recharge: Recharge;
}

export interface SpellSlots {
  level: number; // 1..9
  max: number;
  used: number;
}

export interface Feat {
  id: string;
  name: string;
  description: string;
  /** Set when this feat was auto-granted by picking a Background (its `name`) — lets a later
   *  background swap cleanly remove it, the same way `Spell.fromSpecies` works for species. */
  fromBackground?: string;
}

export type HeirloomTier = 'rare' | 'veryRare' | 'legendary';

/** One property of a Fabled Heirloom (progression magic item) — gated behind `minLevel` so a
 *  player can't read ahead into effects their character hasn't grown into yet. */
export interface HeirloomFeature {
  name: string;
  tier: HeirloomTier;
  minLevel: number;
  text: string;
}

export interface HeirloomDef {
  id: string;
  name: string;
  description: string;
  source?: string;
  features: HeirloomFeature[];
}

/** Class / racial feature or ability, optionally with limited uses. */
export interface Feature {
  id: string;
  name: string;
  source: string; // "Fighter 3", "Wood Elf", …
  description: string;
  uses?: { max: number; used: number; recharge: Recharge };
}

export type ItemType = 'weapon' | 'armor' | 'shield' | 'gear' | 'consumable';

/** What using a consumable item does — see `InventoryItem`'s consumable fields. */
export type ConsumableKind = 'heal' | 'spell' | 'custom';

/**
 * A reusable equipment template for the "+ preset" picker on the Equipment tab (SRS FR-63g) — picking one adds a
 * ready-filled `InventoryItem`, the same idea as `CantripDef` → `Spell`. The repo ships an EMPTY starter list
 * (`client/public/srd/equipment.json`, fetched at runtime like `monsters.json`); populating it with the SRD 5.2.1
 * weapons/armor/gear tables is a separate, later task — until then players add items by hand as before.
 */
export interface EquipmentPreset {
  id: string;
  name: string;
  type: ItemType;
  weight?: number;
  /** Display-only cost ("15 gp") — not tracked as currency automatically. */
  cost?: string;
  notes?: string;
  /** Magic items only — common/uncommon/rare/very rare/legendary/artifact (free text). */
  rarity?: string;
  /** Magic items only — whether this item needs Attunement to use (SRS FR — see `ATTUNEMENT_SLOTS`).
   *  Purely informational on the preset/picker; the actual 3-slot cap is enforced generically on any
   *  `InventoryItem` with `attuned: true`, magic or not, the same way it already was before this field existed. */
  attunementRequired?: boolean;
  // weapon
  weaponAbility?: WeaponAbility;
  damage?: string;
  damageType?: string;
  rangeText?: string;
  /** Magic weapons (+1/+2/+3 …) — carried straight into the InventoryItem's to-hit/damage bonus. */
  attackBonusMisc?: number;
  damageBonusMisc?: number;
  weaponTraits?: WeaponTrait[];
  attackRange?: AttackRange;
  firearm?: FirearmProps;
  // armor / shield
  armorBase?: number;
  armorCategory?: ArmorCategory;
  stealthDisadvantage?: boolean;
  // consumable (potions, spell scrolls…) — see `InventoryItem`'s consumable fields
  consumableKind?: ConsumableKind;
  healFormula?: string;
  scrollSpellName?: string;
  consumableNote?: string;
}
export type ArmorCategory = 'light' | 'medium' | 'heavy';
/** How a weapon's attack/damage ability is chosen. */
export type WeaponAbility = 'str' | 'dex' | 'finesse';

export const COIN_TYPES = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
export type Coin = (typeof COIN_TYPES)[number];
export type Currency = Record<Coin, number>;

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  quantity: number;
  weight: number; // lb per unit
  equipped: boolean;
  notes: string;

  // weapon fields
  weaponAbility?: WeaponAbility;
  damage?: string; // base damage dice only, e.g. "1d8"
  damageType?: string;
  weaponExtraDamage?: DamagePart[]; // e.g. Flame Tongue's +2d6 fire
  /** Magical / silvered / moongilded weapon — bypasses matching conditional resistances. */
  weaponTraits?: WeaponTrait[];
  /** Reach / range text for the attack, e.g. "5 ft" (melee), "20/60 ft" (thrown). */
  rangeText?: string;
  /** Melee / ranged tag for this weapon (a thrown dagger: flip it to melee when stabbing). */
  attackRange?: AttackRange;
  /** Firearm: barrel / reload / loaded shots and gun properties (see firearms.ts). */
  firearm?: FirearmProps;
  /** Adamantine armour: while equipped, the wearer's token can't be crit. */
  grantsCritImmune?: boolean;
  /** Magic item the character is currently attuned to (max 3 — `ATTUNEMENT_SLOTS`). */
  attuned?: boolean;
  /** Informational only — this item needs Attunement to use its magic. Doesn't gate `attuned`
   *  itself; the 3-slot cap already applies to any item once `attuned` is set, same as before. */
  attunementRequired?: boolean;
  /** Magic items only — common/uncommon/rare/very rare/legendary/artifact (free text). */
  rarity?: string;
  proficient?: boolean;
  attackBonusMisc?: number; // magic / misc to hit
  damageBonusMisc?: number; // magic / misc to damage

  // armor / shield fields
  armorBase?: number; // armor base AC, or shield bonus (usually 2)
  armorCategory?: ArmorCategory;
  stealthDisadvantage?: boolean;

  // consumable fields (type === 'consumable'; `quantity` doubles as remaining charges — "Dùng" spends one)
  /** 'heal': roll `healFormula` and heal the linked token. 'spell': cast `scrollSpellName` (looked up in the SRD
   *  spell DB) through the normal casting flow. 'custom': no roll — just spends a charge (flavour in `notes`). */
  consumableKind?: ConsumableKind;
  /** 'heal': healing dice, e.g. "2d4+2" (Potion of Healing). */
  healFormula?: string;
  /** 'spell': the spell this scroll/wand casts, matched by name against the SRD spell DB at use-time
   *  (`findCantrip`) — if not found, "Dùng" still spends the charge but can't auto-roll it. */
  scrollSpellName?: string;
  /** 'custom': shown when used (no roll performed). */
  consumableNote?: string;
}

export interface CharacterSheet {
  id: string;
  ownerId: string; // participant id
  name: string;
  className: string;
  level: number;
  proficiencyBonus: number;
  subclass?: string;
  /** Multiclass breakdown. When set, it is the source of truth for class levels
   *  (and `level` / `proficiencyBonus` / `className` are kept in sync from it). */
  classes?: ClassEntry[];
  abilities: Record<Ability, number>;
  saveProficiencies: Ability[];
  skillProficiencies: string[];
  skillExpertise: string[];
  maxHp: number;
  currentHp: number;
  /** Exhaustion level 0–6 (2024): −2 × level to every d20 test, −5 ft × level Speed; 6 = death. */
  exhaustion?: number;
  /** Active madness effects (see madness.ts), plus `madnessHistory` for the escalation rule. */
  madness?: MadnessEntry[];
  madnessHistory?: MadnessEntry[];
  tempHp: number;
  /** Manual AC used only when no armor is equipped and no override is set. */
  armorClass: number;
  /** Explicit AC that wins over any computed value (e.g. Unarmored Defense). */
  acOverride?: number | null;
  /** 2024 Heroic Inspiration: gives Advantage on one D20 Test of the player's choice, spent when
   *  used. Tracked as a simple on/off flag — the player picks which roll to apply it to and
   *  toggles it off themselves (the app doesn't auto-consume it on a specific roll). */
  heroicInspiration?: boolean;
  speed: number;
  initiativeMisc: number;
  /** Action economy. Equipped weapons add derived entries at render time. */
  actions: SheetAction[];
  /** Standing extra-damage effects (magic ring, class feature…). */
  damageRiders: DamageRider[];
  resources: ClassResource[];
  spellSlots: SpellSlots[];
  /** Warlock Pact Magic — all slots one level, recharge on a short OR long rest.
   *  Kept separate from `spellSlots` (Vancian, long-rest only). */
  pactSlots?: SpellSlots | null;
  /** Known spells; level-1+ ones are cast only while `prepared`. */
  spells: Spell[];
  /** Override the caster type derived from class/subclass (null = derive). */
  casterTypeOverride?: CasterType | null;
  /** Override the spellcasting ability derived from class (null = derive). */
  spellcastingAbility?: Ability | null;
  // --- semi-automatic class-feature state ---
  /** Barbarian: currently raging (never auto-ends — toggled by the player). */
  raging?: boolean;
  /** Barbarian: rage uses spent (max is derived from Barbarian level). */
  rageUsed?: number;
  /** Rogue: Sneak Attack "armed" for the next attack (one-shot). */
  sneakAttackArmed?: boolean;
  /** Feature damage riders armed for the next attack (once per turn / spend a use) — ids from
   *  `featureRiders`; cleared once that attack's damage is rolled. */
  featureRidersArmed?: string[];
  /** Booming Blade "armed" for the next melee weapon attack (one-shot) — same idea as
   *  `sneakAttackArmed`: gated on knowing the cantrip, not on class. */
  boomingBladeArmed?: boolean;
  /** Monk: Focus Points spent (max is derived from Monk level). */
  focusUsed?: number;
  /** Jaeger class state: Focus Points, Momentum dice, armed Finisher, chosen Arts/Finishers. */
  jaeger?: JaegerState;
  /** Druid: Wild Shape uses spent (max is derived from Druid level). */
  wildShapeUsed?: number;
  /** Subclass-feature limited-use pools spent, keyed by feature id. */
  subclassUses?: Record<string, number>;
  /** Hit dice spent, keyed by die size ('d8'). */
  hitDiceUsed?: Record<string, number>;
  /** Chosen species (name); its traits are derived from the local species data. */
  species?: string;
  /** Limited-use species traits spent, keyed by trait id. */
  speciesUses?: Record<string, number>;
  /** Casting ability for species spells (INT / WIS / CHA). */
  speciesSpellAbility?: Ability;
  /** Chosen background (name); its granted feat/skills are derived from the local background data. */
  background?: string;
  /** Skill keys currently granted by the chosen background — lets swapping backgrounds cleanly
   *  remove only what the old one added, the same way `fromSpecies`/`fromBackground` work. */
  backgroundSkills?: string[];
  feats: Feat[];
  features: Feature[];
  inventory: InventoryItem[];
  currency: Currency;
  notes: string;
  tokenId?: string; // linked map token
  /** Max HP currently granted by the Tough feat (2 × level) — lets the server apply it exactly once
   *  and keep it in step as the character levels. Server-maintained. */
  toughBonus?: number;
  /** Present (true) only on the empty placeholder a player receives for ANOTHER player's sheet:
   *  id / owner / name / linked token survive, every stat is blanked. Never stored. */
  redacted?: boolean;
}

export type TokenSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export const DAMAGE_TYPES = [
  'bludgeoning',
  'piercing',
  'slashing',
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'psychic',
  'force',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const DAMAGE_TYPE_VI: Record<DamageType, string> = {
  bludgeoning: 'Đập',
  piercing: 'Xuyên',
  slashing: 'Chém',
  fire: 'Lửa',
  cold: 'Băng',
  lightning: 'Sét',
  thunder: 'Âm thanh',
  acid: 'Axit',
  poison: 'Độc',
  necrotic: 'Hoại tử',
  radiant: 'Thánh',
  psychic: 'Tâm linh',
  force: 'Lực',
};

/** Damage-type based defences + flat reduction + crit immunity (homebrew).
 *  The type arrays hold DamageType keys (kept as string[] for lenient input). */
export interface Defenses {
  resistances: string[]; // half damage
  immunities: string[]; // no damage
  vulnerabilities: string[]; // double damage
  damageReduction: number; // flat, subtracted after res/vuln
  critImmune: boolean; // e.g. adamantine armour — a crit hits as a normal hit
  /** Defences that depend on the attack (non-magical / non-silvered…). */
  conditional?: ConditionalDefense[];
}

export function emptyDefenses(): Defenses {
  return {
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    damageReduction: 0,
    critImmune: false,
  };
}

/** Battlefield cover (homebrew: benefit auto-applied to AC). */
export type CoverLevel = 'none' | 'half' | 'threequarters' | 'total';

/** The 5e (2024) conditions. */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type ConditionType = (typeof CONDITIONS)[number];
export const CONDITION_VI: Record<ConditionType, string> = {
  blinded: 'Mù',
  charmed: 'Mê hoặc',
  deafened: 'Điếc',
  frightened: 'Khiếp sợ',
  grappled: 'Bị ghì',
  incapacitated: 'Bất lực',
  invisible: 'Tàng hình',
  paralyzed: 'Tê liệt',
  petrified: 'Hóa đá',
  poisoned: 'Trúng độc',
  prone: 'Ngã',
  restrained: 'Bị trói',
  stunned: 'Choáng',
  unconscious: 'Bất tỉnh',
};

/**
 * An effect currently sitting on a token: a spell's condition, a rider that adds
 * damage when its source hits this token (Hex, Hunter's Mark), a recurring save,
 * or just a labelled note. Concentration ties an effect to its source token's
 * single concentration slot.
 */
/**
 * Shillelagh-style weapon imbue: matching weapon attacks use the spellcasting ability for attack and
 * damage, and the damage die scales with character level (d8 → d10 at 5, d12 at 11, 2d6 at 17).
 */
export interface WeaponImbue {
  /** Regex source matching the weapon names it applies to ("club|quarterstaff"). */
  weapons: string;
  /** Damage die table: [d8, d10, d12, 2d6] at character level 1 / 5 / 11 / 17. */
  dice: [string, string, string, string];
}

export interface ActiveEffect {
  id: string;
  name: string; // "Hex", "Hold Person", "Stunned"
  sourceTokenId?: string; // who applied it (for riders + concentration)
  sourceSheetId?: string;
  concentration?: boolean; // drops when the source loses concentration
  condition?: ConditionType; // advisory badge; a few are wired into rolls (Release B)
  rider?: { dice: string; type: string }; // + damage when source hits this token
  /** One-shot bonus die the target adds to its next d20 of this kind, then it clears
   *  (Guidance = 'check', Resistance = 'save'). Consumed client-side on the roll. */
  rollBonus?: { dice: string; scope: 'check' | 'save' | 'attack' };
  save?: {
    ability: Ability;
    dc: number;
    repeat: 'none' | 'start-of-turn' | 'end-of-turn'; // server rolls it silently
  };
  note?: string;
  expiresRound?: number; // auto-cleared at the start of this round
  /** AC modifiers (Shield of Faith +2, Shield +5). */
  acBonus?: number;
  /** AC floor (Barkskin: at least 17). */
  acMin?: number;
  /** Alternative base AC while no armor is worn (Mage Armor 13 + DEX). */
  acBase?: number;
  /** Melee attackers take this damage while the bearer has temp HP (Armor of Agathys); `always` = no temp HP needed. */
  retaliate?: { dice: string; type: string; always?: boolean };
  /** Reshapes the bearer's weapon attacks while active (Shillelagh). */
  weaponImbue?: WeaponImbue;
  /** Flat temp HP the bearer gains at the start of each of its turns (Rampant Growth). */
  turnTempHp?: number;
  /** Advantage on saving throws in these abilities while active (Oaken Resolve). */
  saveAdvantage?: Ability[];
  /** Extra damage on the bearer's own weapon attacks while active (Gnarled Thorns). */
  attackRiders?: { dice: string; type: string; label: string; melee?: boolean }[];
  /** Damage types the bearer resists while active (Mighty Trunk). */
  resist?: string[];
  /** Ends when the bearer drops to 0 HP or gains an incapacitating condition (Wood Wose). */
  endsWhenDown?: boolean;
  /** Auto-spends 1 Hit Die of this size at the start of each of the bearer's turns (and once
   *  immediately when the effect is applied), rolls it + CON mod, and heals for the total —
   *  Path of the Experiment's Reconstruction serum. Stops quietly once Hit Dice run out; excess
   *  above max HP is NOT banked as temp HP (a deliberate simplification, same as the plain
   *  "spend a Hit Die" button everyone already has). */
  hitDieHeal?: { die: number };
  /** Bracer of Brutality (homebrew cursed item): at the end of the bearer's turn, if it dealt
   *  no damage this turn (`TurnUsed.dealtDamageThisTurn` unset), it takes Necrotic damage equal
   *  to this ability's modifier (min 1) — applied straight to HP, bypassing resistance/immunity
   *  ("can't be reduced or prevented in any way"). */
  cursedNoHitSelfDamage?: { ability: Ability };
  /** Booming Blade: if the bearer willingly moves before the caster's next turn, it takes this
   *  Thunder damage once (normal resistance/immunity applies) and the effect ends. A
   *  simplification: any `updateToken` position change counts as "willingly moves" — this app
   *  doesn't distinguish that from forced movement (a shove, a push effect). */
  boomingBladeMoveTrigger?: { dice: string };
}

/** What a token is currently concentrating on (one at a time). */
export interface Concentration {
  name: string;
  since: number; // round it started
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/**
 * How much of a class level counts toward the Vancian spell-slot table.
 * `pact` is Warlock (its own short-rest table); `none` = not a spellcaster.
 */
export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none';

/** How a spell is used when cast at a target. */
export type SpellCastKind = 'attack' | 'save' | 'rider' | 'utility' | 'heal' | 'damage';

/** One class of a (possibly multiclassed) character. */
export interface ClassEntry {
  name: string;
  subclass?: string;
  level: number;
}

/** A spell on a character sheet — known, and (level 1+) optionally prepared. */
export interface Spell {
  id: string;
  /** Multiclass: which of the sheet's classes this spell is prepared through (its casting ability + DC come from that class). */
  castingClass?: string;
  name: string;
  level: number; // 0 = cantrip (always available, ignores `prepared`)
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
  prepared: boolean;
  /** Set when a species grants this spell (removed if the species changes). */
  fromSpecies?: string;
  /** Granted by a worn magic item (`MagicItemKey`) — removed automatically when it is taken off.
   *  Casts with the sheet's spellcasting ability, or Charisma if it has none. */
  itemSource?: string;
  castKind: SpellCastKind;
  actionType?: ActionType;
  /** 'save' spells: the save the target rolls. DC defaults to the sheet's spell save DC.
   *  `halfOnSave` = the target still takes half damage on a success (level 1+ AoE). */
  save?: {
    ability: Ability;
    dcOverride?: number;
    repeat?: 'none' | 'start-of-turn' | 'end-of-turn';
    halfOnSave?: boolean;
  };
  /** 'attack' / 'save' / 'damage' spells: damage parts (on a hit / failed save / always). */
  damage?: DamagePart[];
  /**
   * 2024 Eldritch Blast (and any future cantrip with the same scaling shape): instead of bigger
   * damage dice at higher levels, you get more separate beams — each its own attack roll, each
   * dealing the base `damage` dice. Set by `spellFromCantrip`/`rescaleCantripSpell` from
   * `CantripDef.multiAttack` + `cantripTier(level)`. Undefined/1 = a normal single attack roll.
   * All beams fire at the same clicked target — a different target per beam is still done by
   * hand (re-cast, or a manual roll).
   */
  beams?: number;
  /** 'heal' spells: healing dice; the spellcasting ability modifier is added automatically. */
  heal?: string;
  /** 'rider' spells (Hex, Hunter's Mark): + damage when the caster hits the target. */
  rider?: { dice: string; type: string };
  /** The effect placed on the target (condition / note); for save spells, on a failed save. */
  effect?: {
    name: string;
    condition?: ConditionType;
    note?: string;
    expiresInRounds?: number;
    /** One-shot d20 bonus die granted to the target (Guidance +1d4 to a check). */
    rollBonus?: { dice: string; scope: 'check' | 'save' | 'attack' };
    acBonus?: number;
    acMin?: number;
    acBase?: number;
    retaliate?: { dice: string; type: string };
    weaponImbue?: WeaponImbue;
  };
  /** Temp HP granted to the target: dice / number ('2d4+4', '5'). Doesn't stack. */
  tempHp?: string;
  range?: string;
  /** Area-of-effect template, for display (e.g. "cầu 20ft", "nón 15ft"). */
  area?: string;
  /**
   * 2024 Agonizing Blast: chosen per Warlock cantrip (repeatable — pick a different damaging cantrip each time you
   * gain the invocation again), not fixed to Eldritch Blast. When set, the spellcasting ability modifier is added
   * once to this cantrip's damage roll.
   */
  agonizingBlast?: boolean;
  /**
   * 2024 Repelling Blast: reworded to match Agonizing Blast's flexibility — chosen per Warlock
   * cantrip (any one that deals damage, repeatable across multiple cantrips), not fixed to
   * Eldritch Blast. When set, a hit with this cantrip can push the target 10 feet straight away
   * from the caster, once on the caster's own turn.
   */
  repellingBlast?: boolean;
  notes?: string;
}

export type HomebrewKind = 'item' | 'rule' | 'feature' | 'note';
export type HomebrewStatus = 'draft' | 'live' | 'retired';

/**
 * A homebrew item / house rule / feature / note the DM made up for this table (docs/LOREBOOK.md §3).
 * Lives in `RoomState.homebrew`, persisted with the rest of `room.json` (unlike the bestiary, which has
 * its own file). `secret: true` and `notes` (balance/reminders) are DM-only — stripped for players.
 */
export interface HomebrewEntry {
  id: string;
  name: string;
  kind: HomebrewKind;
  /** Free text — which character it's for ("Sabine (Rogue / Sinner)"), not an access grant. */
  forPlayer?: string;
  /** Items only (common/uncommon/rare/very rare/legendary/artifact — free text to match house naming). */
  rarity?: string;
  attunement?: boolean;
  status: HomebrewStatus;
  /** Player-facing flavour/summary. */
  description: string;
  /** The crunchy part (also player-facing). */
  mechanics?: string;
  /** true → hidden from players entirely. */
  secret?: boolean;
  /** DM-only balance notes / reminders — never sent to players. */
  notes?: string;
  createdRound?: number;
}

export interface StatblockTrait {
  name: string;
  description: string;
}

/** DM-entered monster spellcasting stats — see `Statblock.spellcasting`. */
export interface MonsterSpellcasting {
  spellSaveDc: number;
  spellAttackBonus: number;
  /** Scales cantrip damage dice like a PC's level would (unset = base/1st-tier die). */
  casterLevel?: number;
  /** Looked up by name against the SRD spell database at cast time. */
  spellNames: string[];
}

/** A reusable NPC / monster stat block in the DM's bestiary. */
export interface Statblock {
  id: string;
  name: string;
  meta: string; // "Small humanoid (goblinoid), neutral evil"
  cr: string; // challenge rating, e.g. "1/4"
  size: TokenSize;
  ac: number;
  acNote?: string;
  maxHp: number;
  hpFormula?: string; // "2d6"
  speed: number; // walking, ft
  speedNote?: string;
  abilities: Record<Ability, number>;
  proficiencyBonus: number;
  saveProficiencies: Ability[];
  skills: { skill: string; bonus: number }[];
  senses?: string;
  languages?: string;
  traits: StatblockTrait[];
  actions: SheetAction[];
  /** How many legendary actions it can spend between other creatures' turns (usually 3); regains at the
   *  start of its own turn. Unset/0 = not a legendary creature. */
  legendaryActionsPerRound?: number;
  legendaryActions?: SheetAction[];
  /** Has a lair action, usable on initiative count 20 (losing ties) each round while it's alive in its lair. */
  hasLairActions?: boolean;
  lairActions?: SheetAction[];
  /** Monster spellcasting — DC/attack bonus are stated directly (as printed stat blocks do),
   *  not derived from ability scores. Spells are matched by name against the same SRD spell
   *  database the character sheet picker uses (`findCantrip`), so the mechanics come from there —
   *  spell names that don't resolve just don't show up (no crunch to fall back on). */
  spellcasting?: MonsterSpellcasting;
  defenses?: Defenses;
  color: string;
  imageUrl?: string;
  tags: string[];
  notes: string;
  source?: string; // attribution
  /** God's Bane target tag — copied onto tokens spawned from this entry. */
  baneTag?: BaneTag;
  /** God's Bane "undying" trait (homebrew) — copied onto spawned tokens: at 0 HP it is only downed, not
   *  dead, unless the killing blow was a God's Bane attack; a long rest revives it. */
  undying?: boolean;
}

/** Combat-relevant subset embedded on a spawned token. */
export interface TokenStatblock {
  name: string;
  meta?: string;
  abilities: Record<Ability, number>;
  proficiencyBonus: number;
  saveProficiencies: Ability[];
  skills: { skill: string; bonus: number }[];
  initiativeMod: number;
  speed?: number; // walking speed, ft
  actions: SheetAction[];
  legendaryActionsPerRound?: number;
  legendaryActions?: SheetAction[];
  hasLairActions?: boolean;
  lairActions?: SheetAction[];
  spellcasting?: MonsterSpellcasting;
  traits: StatblockTrait[];
  defenses?: Defenses;
  notes?: string;
  fromId?: string; // bestiary entry it was spawned from
}

/** Coarse, spoiler-free health read-out players get for an enemy whose real HP is hidden. */
export type HealthTier = 'full' | 'hurt' | 'bloodied' | 'critical' | 'down';

export interface Token {
  id: string;
  label: string;
  // grid cell coordinates (can be fractional while dragging)
  x: number;
  y: number;
  size: TokenSize;
  color: string;
  imageUrl?: string;
  currentHp?: number;
  maxHp?: number;
  /** Temporary hit points (absorb damage first, never stack). */
  tempHp?: number;
  armorClass?: number;
  hidden: boolean; // DM-only visibility
  controllerId?: string; // participant allowed to move it besides DM
  statblock?: TokenStatblock; // NPC/monster stats (from the bestiary)
  defenses?: Defenses; // damage resist/immune/vuln, flat DR, crit immunity
  cover?: CoverLevel; // battlefield cover — benefit auto-applied
  effects?: ActiveEffect[]; // spell conditions, riders, recurring saves
  concentration?: Concentration | null; // the spell this token is concentrating on
  /** Movement tracker: position at the start of this token's current turn. */
  turnAnchor?: { x: number; y: number } | null;
  /** Extra movement feet this turn (Dash). Reset when the turn changes. */
  extraMove?: number;
  /** Action economy spent this turn (reset when this token's turn starts). */
  turnUsed?: TurnUsed;
  /** Legendary actions left to spend this round — resets to `statblock.legendaryActionsPerRound`
   *  at the start of this token's own turn. Undefined for non-legendary tokens. */
  legendaryActionsRemaining?: number;
  /** Stat-block actions with limited use (Recharge X–6, N/Day): times used since they last came back,
   *  keyed by action id. Recharge actions are rolled for at the start of the monster's turn. */
  actionUses?: Record<string, number>;
  /** Exhaustion level 0–6 for a token with no linked sheet (monsters). PCs keep it on the sheet. */
  exhaustion?: number;
  /** DM override: show this NPC/monster token's AC / HP / statblock to players. Default (unset) =
   *  hidden — the server strips them from what players receive (see `tokenForPlayers`). */
  revealStats?: boolean;
  /** Only ever present in a PLAYER's copy of a stat-hidden token (computed on the way out, never
   *  stored): the creature's rough condition in place of its HP numbers. */
  healthTier?: HealthTier;
  /** God's Bane target tag (DM-set; spawned from `Statblock.baneTag`; null = cleared by the DM). Never
   *  meaningful on a PC token. */
  baneTag?: BaneTag | null;
  /** God's Bane: divinity layers stripped so far (+1 per God's Bane attack on a `greatOne`). DM bookkeeping. */
  baneLayers?: number;
  /** God's Bane: immortality broken — hit by the blade, this creature can die for good until the DM resets it. */
  baneMortal?: boolean;
  /** God's Bane: the initiative round `baneStripCount` counts layers for (cap: 3 per round per creature). */
  baneStripRound?: number;
  baneStripCount?: number;
  /** God's Bane "undying" trait (DM-set; spawned from `Statblock.undying`). */
  undying?: boolean;
  /** An undying creature at 0 HP from a non-God's-Bane source: down, not dead — revived on a long rest. */
  downedUndying?: boolean;
  /** Killed for good by a God's Bane attack (undying or not). Visual state + log only. */
  baneSlain?: boolean;
  /** This token IS the awakened God's Bane blade: DM-moved only, no AC / HP, never a target. */
  godsBaneBlade?: boolean;
}

/** What a creature has spent of its action economy since its turn started. */
export interface TurnUsed {
  action?: boolean;
  bonus?: boolean;
  reaction?: boolean;
  /** Attack rolls made with the Attack action this turn (Extra Attack). */
  attacks?: number;
  /** Attack rolls made via a Bonus Action attack row this turn — mirrors `attacks` but for the
   *  Bonus Action (Monk's free Martial Arts Unarmed Strike, or Flurry of Blows once activated). */
  bonusAttacks?: number;
  /** Set for this turn once a Monk spends a Focus Point on Flurry of Blows — raises the
   *  bonus-action Unarmed Strike's cap from 1 (the free Martial Arts strike) to 2, or 3 from
   *  level 10 (Heightened Focus). Cleared automatically with the rest of `turnUsed`. */
  monkFlurryActive?: boolean;
  /** Repelling Blast (2024): "once on each of your turns" — set on the attacker once used. */
  repellingPush?: boolean;
  /** Set when this token dealt damage (>0, any target) via an attack/damage/spell-save action
   *  this turn — checked by `ActiveEffect.cursedNoHitSelfDamage` (Bracer of Brutality) at the
   *  end of the turn. A simplification of "a hostile creature": this app doesn't model
   *  faction/hostility, so any damage dealt counts. */
  dealtDamageThisTurn?: boolean;
  /** Grappler feat "Punch and Grab" (2024): damage + grapple on the same Unarmed Strike hit —
   *  "you can use this benefit only once per turn" — set on the attacker once used. A plain
   *  grapple attempt (no feat) still just spends an attack like any other attack roll. */
  grapplerComboUsed?: boolean;
}

export interface BattleMap {
  name: string;
  backgroundUrl?: string;
  gridSize: number; // px per cell on the reference image
  cols: number;
  rows: number;
  showGrid: boolean;
  /** Snap tokens to the grid on drop (hold Shift to place freely). */
  snap?: boolean;
}

/**
 * A DM-drawn rectangular region on a scene's map — e.g. "V4: Mayor's Home and Office" on the
 * Wickermoor Village map. Clicking it shows `readAloud`/`dmNotes` as a quick-reference popup, so
 * the DM doesn't have to flip through the book mid-session. DM-only: never sent to player clients
 * (stripped the same way `bestiary` is, see `RoomState.zones`).
 */
export interface MapZone {
  id: string;
  name: string; // "Mayor's Home and Office"
  code?: string; // the book's area label, e.g. "V4" — shown as a small chip on the map
  x: number; // grid cell coords, top-left corner (can be fractional)
  y: number;
  w: number; // width, in grid cells
  h: number; // height, in grid cells
  color: string;
  /** Verbatim/faithful "boxed text" read straight to players — shown in its own framed box,
   *  separate from `dmNotes`, so the DM can read it aloud without mechanics text mixed in. */
  readAloud?: string;
  /** Behind-the-screen notes: mechanics, DCs, secrets, monster reactions. Never confused with
   *  `readAloud` in the popup — shown below it in the normal (non-boxed) style. */
  dmNotes?: string;
  source?: string; // attribution, e.g. "The Crooked Moon — chương 11"
}

/**
 * A saved scene: its own battle map + token layout. Switching the active scene
 * only re-points `RoomState.map` / `RoomState.tokens`; character sheets and the
 * bestiary are room-global and never touched by a scene change.
 */
export interface Scene {
  id: string;
  name: string;
  map: BattleMap;
  tokens: Token[];
  zones: MapZone[];
}

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  tokenId?: string;
  isActive: boolean;
  hasGone: boolean;
  /** Sorts after every other entry with the same initiative (the God's Bane blade's fixed count 20). */
  loseTies?: boolean;
}

export interface Initiative {
  entries: InitiativeEntry[];
  round: number;
  turnIndex: number;
  running: boolean;
  /** Round number the lair-action prompt (initiative count 20) last fired in — avoids re-firing
   *  every turn once the active count has dropped below 20 for the round. */
  lastLairRound?: number;
}

/**
 * A yes/no combat prompt the server raises for the DM — "a legendary/lair action is available,
 * use it now?" — cleared by `dmPromptUse` (spend it, log it) or `dmPromptDismiss` (skip it).
 * DM-only: stripped from the state players receive (see server's `stateFor`).
 */
export type DmPrompt =
  | {
      kind: 'legendaryAction';
      tokenId: string;
      tokenName: string;
      remaining: number;
      options: SheetAction[];
      round: number;
    }
  | { kind: 'lairAction'; tokenId: string; tokenName: string; options: SheetAction[]; round: number };

export interface RollLogEntry {
  id: string;
  ts: number;
  actorId: string;
  actorName: string;
  label: string; // "Perception check", "Longsword attack", etc.
  result: RollResult;
  // optional attack resolution
  attack?: {
    targetTokenId?: string;
    targetName: string;
    /** Omitted from a player's copy when the target's AC is hidden from them. */
    targetAc?: number;
    hit: boolean;
    crit: boolean;
    fumble: boolean;
  };
  // optional damage applied to a target token
  damage?: {
    targetTokenId?: string;
    targetName: string;
    amount: number; // HP actually removed (after defences)
    raw?: number; // rolled total before defences
    damageType?: string;
    notes?: string[]; // "kháng lửa (÷2)", "giảm 3 (DR)", …
  };
  // homebrew: nat 20 / nat 1 on a skill / ability / save check
  checkNat?: 'success' | 'fail';
  private?: boolean; // DM-only roll
}

/** A roll resolved outside the server (e.g. by the dddice 3D engine). */
export interface ExternalRoll {
  total: number;
  faces: number[]; // kept die faces, for display
  d20Natural?: number; // natural value of the single d20, if this was a d20 roll
  source: 'dddice';
  rollUuid?: string;
}

export interface Participant {
  id: string;
  name: string;
  role: 'dm' | 'player';
  color: string;
  connected: boolean;
  lastSeen: number;
  /** Server-only proof that a reconnecting client really is this participant (stops anyone who
   *  merely reads another player's public id from taking over their identity and sheets).
   *  Persisted in room.json, stripped from every state sent to clients. */
  secret?: string;
}

export interface DiceTray {
  // transient dice shown on the battle map after a roll
  entries: {
    id: string;
    ts: number;
    actorName: string;
    notation: string;
    faces: number[];
    total: number;
  }[];
}

export interface DddiceConfig {
  // Whether rolls are routed through the dddice 3D engine.
  // API keys are NOT stored here — each client holds its own key locally.
  enabled: boolean;
  roomSlug?: string; // shared dddice room every client connects to
  theme?: string; // default dice theme slug (client may override locally)
}

/** A DM-opened "everyone may level up now" round. Each sheet claims it once (`claimed` = sheet ids). */
export interface LevelUpRound {
  id: string;
  ts: number;
  claimed: string[];
}

export interface RoomState {
  version: number; // schema version
  /** In-world clock (seconds since the campaign clock started). Combat rounds add 6 s; the DM
   *  passes time with "Qua giờ". Drives madness durations. */
  worldSeconds?: number;
  rev: number; // increments on every mutation
  name: string;
  participants: Participant[];
  /** Saved scenes. The active one's `map` / `tokens` are mirrored below. */
  scenes: Scene[];
  activeSceneId: string;
  /** The active scene's battle map — same object as `scenes[active].map`. */
  map: BattleMap;
  /** The active scene's tokens — same array as `scenes[active].tokens`. */
  tokens: Token[];
  /** The active scene's DM-only map zones — same array as `scenes[active].zones`. Stripped for
   *  players the same way `bestiary` is (see `index.ts`'s per-participant state filtering) since
   *  the description text is often spoiler-y (traps, secrets, DCs). */
  zones: MapZone[];
  initiative: Initiative;
  sheets: CharacterSheet[];
  rollLog: RollLogEntry[]; // capped, newest last
  diceTray: DiceTray;
  dddice: DddiceConfig;
  /** DM-only "use this legendary/lair action now?" prompt — see `DmPrompt`. */
  dmPrompt?: DmPrompt | null;
  /** Open level-up round, if any — players see a "Lên cấp" button on their sheet until they claim it. */
  levelUp?: LevelUpRound | null;
  /**
   * DM's NPC/monster stat block library. Persisted to a SEPARATE file
   * (BESTIARY_FILE, default server/data/bestiary.json — point it at OneDrive to
   * sync), not into room.json. Broadcast to everyone but only shown to the DM.
   */
  bestiary: Statblock[];
  /** House-made items / rules / features / notes (docs/LOREBOOK.md §3). Persisted in room.json (unlike bestiary). */
  homebrew: HomebrewEntry[];
  /** Homebrew God's Bane party artifact (see `godsBane.ts`). Unset / `enabled: false` = every hook is a no-op. */
  godsBane?: GodsBaneState;
}

/** God's Bane target categories: the god-like boss, its servants, and fallen hunters. */
export type BaneTag = 'greatOne' | 'minion' | 'fallen';
export const BANE_TAGS: BaneTag[] = ['greatOne', 'minion', 'fallen'];
export const BANE_TAG_VI: Record<BaneTag, string> = { greatOne: 'Great One', minion: 'Tay sai', fallen: 'Thợ săn sa ngã' };

/** One sworn party member. `rejections` counts how often the blade rejected them (0–3); a 4th makes them
 *  `oathbroken` for good (only a DM override clears it). */
export interface GodsBaneMember {
  rejected?: boolean;
  rejections: number;
  oathbroken?: boolean;
}

/** Party-wide God's Bane state (room-level, DM-edited). */
export interface GodsBaneState {
  enabled: boolean;
  /** N, "People's Will": communities saved + allies made. */
  will: number;
  /** Cleaving Causality pool (shared by the sworn party). */
  causality: number;
  /** Sworn members, keyed by character sheet id. */
  members: Record<string, GodsBaneMember>;
  /** The blade has awakened (DM toggle, default off): from then on it can have its own token, aura and
   *  initiative turn. Before that it only exists as the flagged weapon item. */
  awakened?: boolean;
  /** sheet id → turn key (`round:turnIndex`) People's Will damage was last added in (once per turn). */
  willUsed?: Record<string, string>;
  /** Cleaving Causality spent in advance, waiting for the next matching d20: `crit` = the sworn PC's own
   *  next d20 becomes a natural 20; `fumble` = the next enemy d20 becomes a natural 1. The pool is
   *  decremented when the roll is actually changed. */
  armed?: { sheetId: string; mode: 'crit' | 'fumble' }[];
}

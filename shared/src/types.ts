import type { RollResult } from './dice.js';

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

export type ActionType = 'action' | 'bonus' | 'reaction' | 'free' | 'other';
export const ACTION_TYPES: ActionType[] = ['action', 'bonus', 'reaction', 'free', 'other'];
export type Recharge = 'short' | 'long' | 'other';

/** One damage component of an attack (its own dice + damage type). */
export interface DamagePart {
  dice: string; // "2d6" or "1d4+2"
  type: string; // a DamageType key, or free text
  label?: string; // "Ring of fire", "Flame Tongue"
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
   *  'spell' = spell attacks only; 'any' = both. */
  scope?: 'weapon' | 'spell' | 'any';
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
  notation?: string; // a generic roll (healing / utility), e.g. "2d4+2"
  /** Reach / range text for display, e.g. "5 ft", "20/60 ft", "120 ft". */
  range?: string;
  description?: string;
  source?: 'manual' | 'weapon'; // 'weapon' = derived from an equipped item
  /** For attacks: whether it's a physical strike or a spell attack. Drives which
   *  standing riders + weapon features (Rage, Sneak Attack) apply. Default 'weapon'. */
  attackKind?: 'weapon' | 'spell';
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
}

/** Class / racial feature or ability, optionally with limited uses. */
export interface Feature {
  id: string;
  name: string;
  source: string; // "Fighter 3", "Wood Elf", …
  description: string;
  uses?: { max: number; used: number; recharge: Recharge };
}

export type ItemType = 'weapon' | 'armor' | 'shield' | 'gear';
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
  /** Reach / range text for the attack, e.g. "5 ft" (melee), "20/60 ft" (thrown). */
  rangeText?: string;
  /** Adamantine armour: while equipped, the wearer's token can't be crit. */
  grantsCritImmune?: boolean;
  /** Magic item the character is currently attuned to (max 3 — `ATTUNEMENT_SLOTS`). */
  attuned?: boolean;
  proficient?: boolean;
  attackBonusMisc?: number; // magic / misc to hit
  damageBonusMisc?: number; // magic / misc to damage

  // armor / shield fields
  armorBase?: number; // armor base AC, or shield bonus (usually 2)
  armorCategory?: ArmorCategory;
  stealthDisadvantage?: boolean;
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
  tempHp: number;
  /** Manual AC used only when no armor is equipped and no override is set. */
  armorClass: number;
  /** Explicit AC that wins over any computed value (e.g. Unarmored Defense). */
  acOverride?: number | null;
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
  /** Monk: Focus Points spent (max is derived from Monk level). */
  focusUsed?: number;
  /** Druid: Wild Shape uses spent (max is derived from Druid level). */
  wildShapeUsed?: number;
  /** Subclass-feature limited-use pools spent, keyed by feature id. */
  subclassUses?: Record<string, number>;
  feats: Feat[];
  features: Feature[];
  inventory: InventoryItem[];
  currency: Currency;
  notes: string;
  tokenId?: string; // linked map token
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
  name: string;
  level: number; // 0 = cantrip (always available, ignores `prepared`)
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
  prepared: boolean;
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
  };
  range?: string;
  notes?: string;
}

export interface StatblockTrait {
  name: string;
  description: string;
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
  defenses?: Defenses;
  color: string;
  imageUrl?: string;
  tags: string[];
  notes: string;
  source?: string; // attribution
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
  traits: StatblockTrait[];
  defenses?: Defenses;
  notes?: string;
  fromId?: string; // bestiary entry it was spawned from
}

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
 * A saved scene: its own battle map + token layout. Switching the active scene
 * only re-points `RoomState.map` / `RoomState.tokens`; character sheets and the
 * bestiary are room-global and never touched by a scene change.
 */
export interface Scene {
  id: string;
  name: string;
  map: BattleMap;
  tokens: Token[];
}

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number;
  tokenId?: string;
  isActive: boolean;
  hasGone: boolean;
}

export interface Initiative {
  entries: InitiativeEntry[];
  round: number;
  turnIndex: number;
  running: boolean;
}

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
    targetAc: number;
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

export interface RoomState {
  version: number; // schema version
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
  initiative: Initiative;
  sheets: CharacterSheet[];
  rollLog: RollLogEntry[]; // capped, newest last
  diceTray: DiceTray;
  dddice: DddiceConfig;
  /**
   * DM's NPC/monster stat block library. Persisted to a SEPARATE file
   * (BESTIARY_FILE, default server/data/bestiary.json — point it at OneDrive to
   * sync), not into room.json. Broadcast to everyone but only shown to the DM.
   */
  bestiary: Statblock[];
}

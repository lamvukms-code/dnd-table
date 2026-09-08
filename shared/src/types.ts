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

/** An entry in the action economy: an attack, a utility roll, or just a note. */
export interface SheetAction {
  id: string;
  name: string;
  actionType: ActionType;
  attackBonus?: number; // present -> it's an attack roll vs AC
  damage?: string; // full damage notation, e.g. "2d6+8"
  damageType?: string;
  save?: { ability: Ability; dc: number }; // present -> it forces a saving throw
  notation?: string; // a generic roll (healing / utility), e.g. "2d4+2"
  description?: string;
  source?: 'manual' | 'weapon'; // 'weapon' = derived from an equipped item
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
  resources: ClassResource[];
  spellSlots: SpellSlots[];
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

/** Damage-type based defences + flat reduction + crit immunity (homebrew). */
export interface Defenses {
  resistances: DamageType[]; // half damage
  immunities: DamageType[]; // no damage
  vulnerabilities: DamageType[]; // double damage
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
}

export interface BattleMap {
  name: string;
  backgroundUrl?: string;
  gridSize: number; // px per cell on the reference image
  cols: number;
  rows: number;
  showGrid: boolean;
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
  map: BattleMap;
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

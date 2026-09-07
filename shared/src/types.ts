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
  attacks: Attack[]; // manual attacks; equipped weapons add derived ones
  inventory: InventoryItem[];
  currency: Currency;
  notes: string;
  tokenId?: string; // linked map token
}

export type TokenSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

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
}

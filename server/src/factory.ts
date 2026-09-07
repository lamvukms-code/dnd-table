import { nanoid } from 'nanoid';
import type {
  Ability,
  CharacterSheet,
  RoomState,
  Token,
} from '@dnd-table/shared';

export const SCHEMA_VERSION = 1;
export const ROLL_LOG_CAP = 200;
export const DICE_TRAY_CAP = 12;

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function createRoomState(): RoomState {
  return {
    version: SCHEMA_VERSION,
    rev: 0,
    name: 'Bàn chơi của tôi',
    participants: [],
    map: {
      name: 'Bản đồ mới',
      backgroundUrl: undefined,
      gridSize: 70,
      cols: 24,
      rows: 16,
      showGrid: true,
    },
    tokens: [],
    initiative: { entries: [], round: 1, turnIndex: 0, running: false },
    sheets: [],
    rollLog: [],
    diceTray: { entries: [] },
  };
}

export function createBlankSheet(ownerId: string, name: string): CharacterSheet {
  const abilities: Record<Ability, number> = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  return {
    id: nanoid(8),
    ownerId,
    name,
    className: '',
    level: 1,
    proficiencyBonus: 2,
    abilities,
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    armorClass: 10,
    speed: 30,
    initiativeMisc: 0,
    attacks: [],
    notes: '',
  };
}

export function createToken(partial: Partial<Token>): Token {
  return {
    id: nanoid(8),
    label: partial.label ?? 'Token',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    size: partial.size ?? 'medium',
    color: partial.color ?? '#c0392b',
    imageUrl: partial.imageUrl,
    currentHp: partial.currentHp,
    maxHp: partial.maxHp,
    armorClass: partial.armorClass,
    hidden: partial.hidden ?? false,
    controllerId: partial.controllerId,
  };
}

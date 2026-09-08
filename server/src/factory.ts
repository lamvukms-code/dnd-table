import { nanoid } from 'nanoid';
import { emptyCurrency } from '@dnd-table/shared';
import type {
  Ability,
  CharacterSheet,
  RoomState,
  Token,
} from '@dnd-table/shared';

export const SCHEMA_VERSION = 4;
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
    dddice: { enabled: false, roomSlug: undefined, theme: 'dddice-standard' },
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
    acOverride: null,
    speed: 30,
    initiativeMisc: 0,
    actions: [],
    resources: [],
    spellSlots: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
  };
}

interface LegacyAttack {
  id: string;
  name: string;
  attackBonus: number;
  damage: string;
  damageType?: string;
  source?: 'manual' | 'weapon';
}

/** Backfill fields added in later schema versions onto an existing sheet. */
export function normalizeSheet(sheet: CharacterSheet): CharacterSheet {
  const legacy = sheet as CharacterSheet & { attacks?: LegacyAttack[] };
  const migratedActions =
    sheet.actions ??
    (legacy.attacks ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      actionType: 'action' as const,
      attackBonus: a.attackBonus,
      damage: a.damage,
      damageType: a.damageType ?? '',
      source: a.source ?? ('manual' as const),
    }));
  const next: CharacterSheet = {
    ...sheet,
    acOverride: sheet.acOverride ?? null,
    actions: migratedActions,
    resources: sheet.resources ?? [],
    spellSlots: sheet.spellSlots ?? [],
    feats: sheet.feats ?? [],
    features: sheet.features ?? [],
    inventory: sheet.inventory ?? [],
    currency: sheet.currency ?? emptyCurrency(),
  };
  delete (next as CharacterSheet & { attacks?: unknown }).attacks;
  return next;
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

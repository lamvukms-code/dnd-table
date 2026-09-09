import type {
  Ability,
  ActiveEffect,
  BattleMap,
  CharacterSheet,
  DamagePart,
  DddiceConfig,
  ExternalRoll,
  InitiativeEntry,
  RoomState,
  Statblock,
  Token,
} from './types.js';

export const PROTOCOL_VERSION = 5;

/** Actions sent client -> server. */
export type ClientAction =
  // `role` is a hint only; the server assigns roles (room creator becomes DM).
  | { t: 'join'; name: string; role?: 'dm' | 'player'; participantId?: string }
  | { t: 'setName'; name: string }
  | { t: 'setRole'; participantId: string; role: 'dm' | 'player' }
  | { t: 'roll'; label: string; notation: string; private?: boolean; external?: ExternalRoll }
  | {
      t: 'damage';
      label: string;
      damageParts: DamagePart[];
      targetTokenId: string;
      // per-part rolled totals (dddice); index-aligned with damageParts
      external?: number[];
      // attacker identity, so target-bound riders (Hex/Hunter's Mark) can apply
      attackerSheetId?: string;
      attackerTokenId?: string;
    }
  | {
      t: 'attack';
      label: string;
      attackNotation: string;
      damageParts: DamagePart[];
      targetTokenId: string;
      attackerSheetId?: string;
      attackerTokenId?: string;
      // When present, the client already rolled (via dddice). On a crit the
      // per-part totals are the homebrew-crit notation's roll.
      external?: {
        attack: ExternalRoll;
        crit?: boolean;
        partTotals?: number[]; // index-aligned with damageParts
      };
    }
  // spell / feature effects on a token (conditions, riders, recurring saves)
  | { t: 'applyEffect'; targetTokenId: string; effect: ActiveEffect }
  | { t: 'removeEffect'; tokenId: string; effectId: string }
  | { t: 'clearConcentration'; tokenId: string }
  // cast a save spell: the server rolls the target's save and, on a failure,
  // applies `effectOnFail` (a concentration effect ties to the caster's token).
  | {
      t: 'spellSave';
      targetTokenId: string;
      ability: Ability;
      dc: number;
      label: string;
      effectOnFail?: ActiveEffect;
      // damage dealt if the target fails the save (2024 cantrips: none on a success)
      damageOnFail?: DamagePart[];
      // level 1+ AoE: the target still takes half of `damageOnFail` on a success
      damageHalfOnSave?: boolean;
      sourceSheetId?: string;
      sourceTokenId?: string;
    }
  // heal a target token (adds HP, clamped to its max)
  | {
      t: 'heal';
      label: string;
      targetTokenId: string;
      notation: string;
      external?: number;
      sourceSheetId?: string;
    }
  | { t: 'clearLog' }
  | { t: 'updateMap'; patch: Partial<BattleMap> }
  // scenes (DM)
  | { t: 'sceneCreate'; name?: string }
  | { t: 'sceneActivate'; id: string }
  | { t: 'sceneRename'; id: string; name: string }
  | { t: 'sceneDuplicate'; id: string }
  | { t: 'sceneDelete'; id: string }
  | { t: 'updateDddice'; patch: Partial<DddiceConfig> }
  | { t: 'addToken'; token: Partial<Token> }
  | { t: 'copyToken'; id: string; x: number; y: number }
  | { t: 'updateToken'; id: string; patch: Partial<Token> }
  | { t: 'removeToken'; id: string }
  | { t: 'initSet'; entries: InitiativeEntry[] }
  | { t: 'initRollAll' }
  | { t: 'initNext' }
  | { t: 'initPrev' }
  | { t: 'initReset' }
  | { t: 'initStart' }
  // roll initiative for oneself from the character sheet (goes through dddice)
  | {
      t: 'rollInitiative';
      name: string;
      mod: number;
      tokenId?: string;
      external?: ExternalRoll;
    }
  // DM rolls initiative for a chosen group of tokens, silently (no dddice, no log)
  | { t: 'rollInitiativeGroup'; tokenIds: string[] }
  | { t: 'upsertSheet'; sheet: CharacterSheet }
  | { t: 'removeSheet'; id: string }
  // bestiary (DM only)
  | { t: 'bestiaryUpsert'; statblock: Statblock }
  | { t: 'bestiaryRemove'; id: string }
  | { t: 'bestiaryReplaceAll'; entries: Statblock[] }
  | { t: 'spawnStatblock'; id: string; x: number; y: number; rollHp?: boolean; hidden?: boolean };

/** Events sent server -> client. */
export type ServerEvent =
  | { t: 'welcome'; participantId: string; protocol: number; state: RoomState }
  | { t: 'state'; state: RoomState }
  | { t: 'error'; message: string };

export interface ClientEnvelope {
  id?: string;
  action: ClientAction;
}

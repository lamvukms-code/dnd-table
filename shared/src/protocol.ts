import type {
  BattleMap,
  CharacterSheet,
  DddiceConfig,
  ExternalRoll,
  InitiativeEntry,
  RoomState,
  Statblock,
  Token,
} from './types.js';

export const PROTOCOL_VERSION = 3;

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
      notation: string;
      targetTokenId: string;
      external?: ExternalRoll;
    }
  | {
      t: 'attack';
      label: string;
      attackNotation: string;
      damageNotation: string;
      targetTokenId: string;
      // When present, the client already rolled (via dddice) and the server
      // only resolves hit/crit vs AC and applies damage — it does not re-roll.
      external?: {
        attack: ExternalRoll;
        damage?: ExternalRoll;
      };
    }
  | { t: 'clearLog' }
  | { t: 'updateMap'; patch: Partial<BattleMap> }
  | { t: 'updateDddice'; patch: Partial<DddiceConfig> }
  | { t: 'addToken'; token: Partial<Token> }
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

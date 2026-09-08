import type {
  BattleMap,
  CharacterSheet,
  DddiceConfig,
  ExternalRoll,
  InitiativeEntry,
  RoomState,
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
  | { t: 'upsertSheet'; sheet: CharacterSheet }
  | { t: 'removeSheet'; id: string };

/** Events sent server -> client. */
export type ServerEvent =
  | { t: 'welcome'; participantId: string; protocol: number; state: RoomState }
  | { t: 'state'; state: RoomState }
  | { t: 'error'; message: string };

export interface ClientEnvelope {
  id?: string;
  action: ClientAction;
}

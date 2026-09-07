import type {
  BattleMap,
  CharacterSheet,
  InitiativeEntry,
  RoomState,
  Token,
} from './types.js';

export const PROTOCOL_VERSION = 1;

/** Actions sent client -> server. */
export type ClientAction =
  | { t: 'join'; name: string; role: 'dm' | 'player'; participantId?: string }
  | { t: 'setName'; name: string }
  | { t: 'roll'; label: string; notation: string; private?: boolean }
  | {
      t: 'attack';
      label: string;
      attackNotation: string;
      damageNotation: string;
      targetTokenId: string;
    }
  | { t: 'clearLog' }
  | { t: 'updateMap'; patch: Partial<BattleMap> }
  | { t: 'addToken'; token: Partial<Token> }
  | { t: 'updateToken'; id: string; patch: Partial<Token> }
  | { t: 'removeToken'; id: string }
  | { t: 'initSet'; entries: InitiativeEntry[] }
  | { t: 'initRollAll' } // roll initiative for all tokens with linked sheets
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

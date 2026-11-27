import type { MadnessTier } from './madness.js';
import type {
  Ability,
  ActiveEffect,
  RollMode,
  SceneLight,
  TurnUsed,
  AttackRange,
  BattleMap,
  CharacterSheet,
  DamagePart,
  DddiceConfig,
  ExternalRoll,
  HomebrewEntry,
  Shop,
  InitiativeEntry,
  MapZone,
  RoomState,
  Statblock,
  Token,
  ConditionType,
  Hazard,
} from './types.js';
import type { GodsBaneOp, GodsBaneRoomOp } from './godsBane.js';

import type { StatePatch } from './statePatch.js';

export const PROTOCOL_VERSION = 8;

/** Actions sent client -> server. */
export type ClientAction =
  // `role` is a hint only; the server assigns roles (room creator becomes DM).
  | {
      t: 'join';
      name: string;
      role?: 'dm' | 'player';
      participantId?: string;
      secret?: string;
      /** The DM's recording / stream window: joins with the DM's identity but gets the PLAYER view,
       *  can't act, and doesn't count as a connection of that participant. */
      stream?: boolean;
      /** The client applies `patch` events (only what changed since its last push); older clients get full `state`. */
      patch?: boolean;
    }
  | { t: 'setName'; name: string }
  | { t: 'setRole'; participantId: string; role: 'dm' | 'player' }
  /** DM: drop an offline participant from the room list (their sheets stay; they can come back). */
  | { t: 'removeParticipant'; participantId: string }
  | { t: 'roll'; label: string; notation: string; private?: boolean; external?: ExternalRoll }
  /** DM: madness saving throw (WIS + INT mod) for these tokens; a failure stuns and rolls the tier's table. */
  | { t: 'madnessSave'; targetTokenIds: string[]; dc: number; tier: MadnessTier; label?: string }
  /** DM: roll a madness effect straight onto a sheet (no save). */
  | { t: 'madnessRoll'; sheetId: string; tier: MadnessTier }
  /** DM: advance the in-world clock (expires timed madness). */
  | { t: 'passTime'; seconds: number }
  | {
      t: 'damage';
      label: string;
      damageParts: DamagePart[];
      targetTokenId: string;
      // per-part rolled totals + individual die faces (dddice); index-aligned with damageParts
      external?: { total: number; faces: number[] }[];
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
      /** Melee or ranged delivery (drives Armor of Agathys retaliation, ranged-in-melee). */
      attackRange?: AttackRange;
      /** Weapon strike or spell attack (cover-reducing feats only apply to weapons). Unset = weapon. */
      attackKind?: 'weapon' | 'spell';
      /** Stat-block action used (monster mechanics tied to one attack: crit range, grapple on hit…). */
      actionName?: string;
      /** Spell attack forced movement on a hit (`save`: only if the target fails it). */
      moveOnHit?: {
        feet?: number;
        dir: 'push' | 'pull' | 'adjacent';
        save?: { ability: Ability; dc: number; largeAdvantage?: boolean };
        collideCondition?: ConditionType;
      };
      /** Effect placed on the target on a critical hit (stunned until your next turn…). */
      effectOnCrit?: ActiveEffect;
      /** Repelling Blast (2024): on a hit, push the target this many feet straight away from the
       *  attacker. Gated server-side to once per attacker turn via `turnUsed.repellingPush`. */
      pushFeetOnHit?: number;
      /** Grappler feat "Punch and Grab" (2024): on a hit, also attempt to grapple the target
       *  (same save-vs-DC resolution as the standalone 'grapple' action). Client gates this to
       *  once per turn via `turnUsed.grapplerComboUsed`; the server doesn't re-check the feat. */
      grappleOnHit?: { dc: number };
      // When present, the client already rolled (via dddice). On a crit the
      // per-part totals are the homebrew-crit notation's roll.
      external?: {
        attack: ExternalRoll;
        crit?: boolean;
        partTotals?: { total: number; faces: number[] }[]; // index-aligned with damageParts
      };
    }
  // spell / feature effects on a token (conditions, riders, recurring saves)
  | { t: 'applyEffect'; targetTokenId: string; effect: ActiveEffect }
  | { t: 'removeEffect'; tokenId: string; effectId: string }
  | { t: 'setTurnUsed'; tokenId: string; patch: Partial<TurnUsed> }
  /** Test-only: fully clears a token's `turnUsed` (Action/Bonus/Reaction/attack counters/etc.) in
   *  one step — `setTurnUsed`'s patch only merges fields in, it can't clear ones already set. */
  | { t: 'resetTurnUsed'; tokenId: string }
  | { t: 'clearConcentration'; tokenId: string }
  /** DM opens / closes a level-up round (see `RoomState.levelUp`). */
  | { t: 'levelUpOpen' }
  /** DM: turn a monster stance / transformation on or off. */
  | { t: 'stance'; tokenId: string; name: string; on: boolean }
  /** Scene light (no tokenId) or one token's light override (null = follow the scene). DM only. */
  | { t: 'setLight'; light: SceneLight | null; tokenId?: string }
  /**
   * Where a token is while it is being dragged — shown to the other viewers only, never stored.
   * The drop is an ordinary `updateToken` (rules, movement budget, saving). Kept tiny on purpose:
   * relaying the whole room state ~20x/s per drag swamped slow / far-away connections.
   */
  | { t: 'dragPreview'; id: string; x: number; y: number }
  /** DM: set a monster's remaining limbs. */
  | { t: 'setLimbs'; tokenId: string; limbs: number }
  /** DM answers a monster reaction offer: `use` spends the reaction and runs its save / damage on the trigger creature. */
  | { t: 'reactResolve'; id: string; use: boolean }
  /** Try to escape a grapple effect (Athletics / Acrobatics vs its escape DC). */
  | { t: 'escapeGrapple'; tokenId: string; effectId: string }
  /** Answer a pick-a-point request: a cell, or `skip`. */
  | { t: 'resolvePick'; id: string; x?: number; y?: number; skip?: boolean }
  /** Place / remove a lingering spell area. */
  | { t: 'addHazard'; hazard: Omit<Hazard, 'id' | 'hitThisTurn'> }
  | { t: 'removeHazard'; id: string }
  /** Answer an Opportunity Attack offer (`used` = the reaction was spent on it). */
  | { t: 'oaResolve'; id: string; used: boolean }
  /** DM: raise a setting moon (null = no moon / it set). */
  | { t: 'setMoon'; moon: { key: string; name: string } | null }
  | { t: 'levelUpClose' }
  /** A player claims their level-up: +1 level in `classIndex` (default: first class) and a rolled HP
   *  gain. `external` carries the dddice dice (the 2nd one only when the 1st was a 1 — pity reroll). */
  | { t: 'levelUp'; sheetId: string; classIndex?: number; external?: { first: ExternalRoll; second?: ExternalRoll } }
  // 2024 Unarmed Strike Grapple: server rolls the target's STR/DEX save (its
  // better modifier) vs `dc`; on a failure it gains the Grappled condition from
  // the grappler. `release: true` removes the grapple instead.
  | {
      t: 'grapple';
      targetTokenId: string;
      dc: number;
      label: string;
      sourceSheetId?: string;
      sourceTokenId?: string;
      release?: boolean;
    }
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
      /** Same id on every target of one AoE cast → the damage dice are rolled once. */
      aoeId?: string;
      sourceSheetId?: string;
      sourceTokenId?: string;
      /** Forced roll mode for this save (e.g. disadvantage within 5 ft); effects' save advantage still applies. */
      rollMode?: RollMode;
      /** The save is against a spell / magical effect (Magic Resistance). */
      fromSpell?: boolean;
      /** Stat-block action that forced the save (monster mechanics on a failure: swallow…). */
      actionName?: string;
      /** On a failed save: push / pull the target relative to `fromTokenId` (the caster). */
      moveOnFail?: { feet?: number; dir: 'push' | 'pull' | 'adjacent'; fromTokenId: string };
      /** On a failed save: the caster picks a point within `maxFeet` of `fromTokenId` and the target lands there. */
      teleportOnFail?: { maxFeet: number; fromTokenId: string };
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
  // grant temporary HP (dice or a number); temp HP never stack — the larger pool wins
  | {
      t: 'grantTempHp';
      targetTokenId: string;
      notation: string;
      label: string;
      external?: number;
      sourceSheetId?: string;
      sourceTokenId?: string;
    }
  // spend one hit die (Short Rest): the server rolls 1dX + CON and heals the sheet
  | { t: 'spendHitDie'; sheetId: string; die: number }
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
  // movement tracker: snap a token back to its turn-start position / grant Dash
  | { t: 'resetTokenMove'; id: string }
  | { t: 'tokenDash'; id: string }
  /** Standard actions of a turn (the client spends the economy): Dodge, Disengage, Hide (a Stealth roll vs
   *  DC 15; `external` = dddice result of `notation`) and Help (an ally's next attack on `targetTokenId`
   *  has advantage). */
  | {
      t: 'turnAction';
      tokenId: string;
      kind: 'dodge' | 'disengage' | 'hide' | 'help';
      targetTokenId?: string;
      notation?: string;
      external?: ExternalRoll;
    }
  | { t: 'initSet'; entries: InitiativeEntry[] }
  | { t: 'initRollAll' }
  | { t: 'initNext' }
  | { t: 'initPrev' }
  | { t: 'initReset' }
  /** Swap two ADJACENT player-character entries' turn order (drag & drop on the initiative bar).
   *  Any participant can call this (not just the DM) — the server only allows it between two
   *  entries that are both linked to a character sheet and sit next to each other, so a monster's
   *  turn timing relative to the party can never be reordered this way. */
  | { t: 'initSwapAdjacent'; entryIdA: string; entryIdB: string }
  | { t: 'initStart' }
  // DM answers the "use this legendary/lair action?" prompt (see `DmPrompt`)
  | { t: 'dmPromptUse'; actionId?: string }
  | { t: 'dmPromptDismiss' }
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
  // `base`: the server copy the edit started from — fields unchanged from it keep the server's value
  | { t: 'upsertSheet'; sheet: CharacterSheet; base?: CharacterSheet }
  | { t: 'removeSheet'; id: string }
  // bestiary (DM only)
  | { t: 'bestiaryUpsert'; statblock: Statblock }
  | { t: 'bestiaryRemove'; id: string }
  | { t: 'bestiaryReplaceAll'; entries: Statblock[] }
  | { t: 'homebrewUpsert'; entry: HomebrewEntry }
  | { t: 'homebrewRemove'; id: string }
  // shops: the DM edits / restocks, players buy from open ones (see shop.ts)
  | { t: 'shopUpsert'; shop: Shop }
  | { t: 'shopRemove'; id: string }
  | { t: 'shopRestock'; id: string }
  | { t: 'shopBuy'; shopId: string; itemId: string; sheetId: string; qty: number }
  /** Voice activity from the sender's own mic (relayed, never stored). */
  | { t: 'speaking'; on: boolean }
  /** Hide / show my real name on the speaker cards. */
  | { t: 'setAnon'; anon: boolean }
  | { t: 'spawnStatblock'; id: string; x: number; y: number; rollHp?: boolean; hidden?: boolean }
  /** A monster's summon action: roll `count`, place that many of the stat block around it and
   *  (in combat) give them the summoner's initiative, acting right after it. DM only. */
  | { t: 'summon'; tokenId: string; statblockId: string; count: string; label?: string; hidden?: boolean }
  /** Drag a character sheet's chip onto the map: reuses its existing token if that token is
   *  already on the active scene, otherwise spawns a fresh one there (e.g. after switching maps)
   *  and re-links the sheet to it. DM or the sheet's own owner only. */
  | { t: 'placeSheetToken'; sheetId: string; x: number; y: number }
  // map zones (DM only) — a drawn region on the active scene's map + its read-aloud/DM text
  | { t: 'zoneUpsert'; zone: MapZone }
  | { t: 'zoneRemove'; id: string }
  /** Homebrew God's Bane party artifact — DM config / membership, the blade token, Cleaving Causality. */
  | { t: 'godsBane'; op: GodsBaneOp | GodsBaneRoomOp };

/** Events sent server -> client. */
export type ServerEvent =
  | { t: 'welcome'; participantId: string; secret?: string; protocol: number; state: RoomState }
  | { t: 'state'; state: RoomState }
  /** Slow-changing, large collections (bestiary: DM only; homebrew: role-filtered) are NOT part of
   *  every `state` push — they ride in their own event, sent before the first state and again only when
   *  they actually change. `state.bestiary` / `state.homebrew` arrive empty; the client splices these in. */
  | { t: 'static'; bestiary?: Statblock[]; homebrew?: HomebrewEntry[] }
  | { t: 'dragPreview'; id: string; x: number; y: number }
  /** Who is talking right now (participant ids), sent whenever it changes. */
  | { t: 'speaking'; ids: string[] }
  /** Only what changed since this client's last push (see statePatch.ts). */
  | ({ t: 'patch' } & StatePatch)
  | { t: 'error'; message: string };

export interface ClientEnvelope {
  id?: string;
  action: ClientAction;
}

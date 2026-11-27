import { create } from 'zustand';
import {
  abilityMod,
  combineRollModes,
  conditionAttackMode,
  conditionAutoCrit,
  coverAcBonus,
  d20Check,
  derivedDefenses,
  homebrewCritDamage,
  mergeDefenses,
  rollNotation,
  levelUpDie,
  needsPityReroll,
  spellAttackBonus,
  spellAttackParts,
  spellcastingAbilityOf,
  spellSaveDc,
  inferAttackRange,
  rangedAtCloseQuarters,
  passiveNoCloseRangedPenalty,
  gridFeet,
  type AttackRange,
  effectiveArmorClass,
  npcArmorClass,
  parseArea,
  defaultAnchor,
  parseRangeFeet,
  type AreaAnchor,
  type AreaSpec,
  tokenConditions,
  type ActiveEffect,
  type Token,
  type ClientAction,
  type DamagePart,
  type ExternalRoll,
  type Participant,
  type RollMode,
  type RoomState,
  type ServerEvent,
  type Spell,
  findCantrip,
  monsterMechanics,
  mechanicAttackAdvantage,
  lightAt,
  activeLightRules,
  defenseDisadvantageWhy,
  acBonusByHp,
  mechanicsOfKind,
  edgeFeet,
  tokenSpan,
  passiveRangeMultiplier,
  rangeBand,
  passiveRangedCover,
  upcastEffect,
  burstDice,
  aoeTokenIds,
  recastOf,
  economyKindOf,
  spendEconomy as spendEconomyRule,
  spendSpellSlot,
  woodWoseEffect,
  oldWaysClass,
  wildShapeMax,
  WOOD_WOSE,
  type CharacterSheet,
  type EconomyKind,
  parseUpcast,
  scaleDice,
  upcastDamagePart,
  casterTypeOf,
} from '@dnd-table/shared';
import { PROTOCOL_VERSION, applyPatch } from '@dnd-table/shared';
import {
  getLocalKey,
  rollEquation as dddiceRollEquation,
  setLocalKey as persistDddiceKey,
} from './dddice.js';
import { shareStructure } from './share.js';

const PID_KEY = 'dnd-table.participantId';
const SECRET_KEY = 'dnd-table.secret';
const IDENTITY_KEY = 'dnd-table.identity';

/** This window is the DM's recording / stream view (`?stream=1`, opened from the DM screen): it joins
 *  with the DM's stored identity but receives the PLAYER view and sends nothing. */
export const STREAM_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('stream');

/** The id + secret this browser holds (the recording window proves it is the DM's with them). */
export function storedCredentials(): { participantId: string | null; secret: string | null } {
  try {
    return { participantId: localStorage.getItem(PID_KEY), secret: localStorage.getItem(SECRET_KEY) };
  } catch {
    return { participantId: null, secret: null };
  }
}

interface Identity {
  name: string;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name ? { name: parsed.name } : null;
  } catch {
    return null;
  }
}

interface AttackParams {
  label: string;
  /** Pre-built notation (freeform box). Ignored when `attackBonus` is given. */
  attackNotation?: string;
  /** When given, the notation is built here, folding in condition advantage/disadvantage. */
  attackBonus?: number;
  rollMode?: RollMode;
  damageParts: DamagePart[];
  targetTokenId: string;
  attackerSheetId?: string;
  attackerTokenId?: string;
  /** Melee / ranged tag of the attack (ranged at ≤5 ft ⇒ Disadvantage). */
  attackRange?: AttackRange;
  /** Weapon strike or spell attack. Unset = weapon. */
  attackKind?: 'weapon' | 'spell';
  /** Spell attack forced movement on a hit. */
  moveOnHit?: Extract<ClientAction, { t: 'attack' }>['moveOnHit'];
  /** Effect placed on a critical hit. */
  effectOnCrit?: ActiveEffect;
  /** Weapon range text ("80/320 ft", "range 30/120 ft."): long range = disadvantage, beyond it asks first. */
  rangeText?: string;
  /** Stat-block action name (monster mechanics tied to one attack). */
  actionName?: string;
  /** Repelling Blast (2024): on a hit, push the target this many feet from the attacker. */
  pushFeetOnHit?: number;
  /** Grappler feat "Punch and Grab" (2024): on a hit, also attempt to grapple the target. */
  grappleOnHit?: { dc: number };
}

export interface AoeMode {
  label: string;
  spec: AreaSpec;
  anchor: AreaAnchor;
  /** Token the template is anchored on / measured from (never hit by its own template). */
  casterTokenId?: string;
  /** Casting range for point-anchored templates (0 = none). */
  rangeFeet?: number;
  onConfirm: (targetIds: string[], aoeId: string) => void;
}

interface StoreState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  participantId: string | null;
  identity: Identity | null;
  room: RoomState | null;
  /** Tokens someone else is dragging right now (where they are mid-drag), by token id. */
  dragPreviews: Record<string, { x: number; y: number; ts: number }>;
  /** Participants talking right now (from their own mic's voice detector). */
  speaking: string[];
  error: string | null;
  dddiceKey: string | null;
  dddiceConnected: boolean;
  join: (identity: Identity) => void;
  send: (action: ClientAction) => void;
  setDddiceKey: (key: string | null) => void;
  setDddiceConnected: (connected: boolean) => void;
  /** Roll dice — via the dddice 3D engine when enabled, else server RNG. */
  rollDice: (label: string, notation: string, opts?: { private?: boolean }) => Promise<void>;
  /** Attack a token — rolls (dddice or server) then lets the server resolve vs AC. */
  attackRoll: (params: AttackParams) => Promise<void>;
  /** Level-up round keys (`<roundId>:<sheetId>`) already claimed from this browser — hides the button at once. */
  levelUpPending: string[];
  levelUpOpen: () => void;
  levelUpClose: () => void;
  claimLevelUp: (sheetId: string, classIndex?: number) => Promise<void>;
  /** Roll damage parts and subtract the (post-defence) total from a target's HP. */
  damageRoll: (
    label: string,
    damageParts: DamagePart[],
    targetTokenId: string,
    attacker?: { sheetId?: string; tokenId?: string },
  ) => Promise<void>;
  /** Roll a healing formula and add the (clamped) total to a target token's HP. */
  healRoll: (
    label: string,
    notation: string,
    targetTokenId: string,
    sourceSheetId?: string,
  ) => Promise<void>;
  /** Put a spell/feature effect on a target token (condition, rider, save). */
  applyEffect: (targetTokenId: string, effect: ActiveEffect) => void;
  removeEffect: (tokenId: string, effectId: string) => void;
  clearConcentration: (tokenId: string) => void;
  /** Point-click spell casting: arm a spell, then click a token on the map. `castAtLevel`
   *  (Vancian upcast only) picks which slot level to burn — the spell's own effect/damage
   *  is unaffected (still adjusted by hand, per this codebase's spell-math convention). */
  castingSpell: { sheetId: string; spell: Spell; castAtLevel?: number; repeat?: boolean } | null;
  /** `repeat`: re-use a spell that lasts (Call Lightning…) — `spell` is already its `recastForm`;
   *  only the action economy is paid, no slot, no new concentration. */
  beginCast: (sheetId: string, spell: Spell, castAtLevel?: number, repeat?: boolean) => void;
  /** Same point-click flow as `castingSpell`, but the caster is a monster token (DM only) — the
   *  fixed spell attack bonus travels with it since a token has no ability scores to derive it from. */
  castingMonsterSpell: { tokenId: string; spell: Spell; spellAttackBonus: number } | null;
  beginMonsterCast: (tokenId: string, spell: Spell, spellAttackBonus: number) => void;
  resolveMonsterCastOnToken: (targetTokenId: string, opts?: { aoeId?: string; skipConc?: boolean }) => Promise<void>;
  /**
   * Spend Action / Bonus Action / Reaction for a token (only while initiative is running). Returns false when the
   * player declines to go on after a "already spent" warning. Attack rows count against Extra Attack.
   */
  spendEconomy: (tokenId: string | undefined, kind: EconomyKind, opts?: { attack?: boolean; maxAttacks?: number }) => boolean;
  /** Circle of the Old Ways: turn on Wood Wose (effect + Rampant Growth temp HP). Pays 1 Wild Shape when asked to. */
  activateWoodWose: (sheet: CharacterSheet, opts?: { spendWildShape?: boolean }) => boolean;
  cancelCast: () => void;
  /** Bestiary entry the DM asked to open from a token (null = none). */
  bestiaryFocus: string | null;
  openBestiary: (id: string | null) => void;
  resolveCastOnToken: (targetTokenId: string, opts?: { aoeId?: string; skipConc?: boolean; paid?: boolean }) => Promise<void>;
  /** Spend the action economy + spell slot for one cast (asks before casting without a slot). false = cancelled. */
  payCast: (sheetId: string, spell: Spell, castAtLevel?: number, repeat?: boolean) => boolean;
  /** Armed AoE template awaiting placement on the map. */
  aoe: AoeMode | null;
  /** Waiting for a click on the map to answer a pick-a-point request. */
  pickPoint: { promptId: string; label: string; anchorTokenId: string; maxFeet: number } | null;
  setPickPoint: (p: { promptId: string; label: string; anchorTokenId: string; maxFeet: number } | null) => void;
  beginAoe: (mode: AoeMode) => void;
  cancelAoe: () => void;
  confirmAoe: (targetIds: string[]) => void;
  /** Roll initiative (via dddice) and put the result on the top initiative bar. */
  rollInitiativeForMe: (
    name: string,
    mod: number,
    tokenId?: string,
    mode?: 'normal' | 'advantage' | 'disadvantage',
  ) => Promise<void>;
  /** DM: silently roll initiative for a group of tokens straight onto the bar. */
  rollInitiativeGroup: (tokenIds: string[]) => void;
  setRole: (participantId: string, role: 'dm' | 'player') => void;
  removeParticipant: (participantId: string) => void;
  /** Snap a token back to where it was at the start of its turn. */
  resetTokenMove: (id: string) => void;
  /** Grant the token an extra Speed of movement this turn (Dash). */
  tokenDash: (id: string) => void;
  /** Dodge / Disengage / Help of a token (economy spent by the caller). */
  turnAction: (tokenId: string, kind: 'dodge' | 'disengage' | 'help', targetTokenId?: string) => void;
  /** Hide: a Stealth check (dddice when on) vs DC 15, resolved by the server. */
  hideAction: (tokenId: string, stealthBonus: number, mode?: RollMode) => Promise<void>;
  /** 2024 Unarmed Strike Grapple: server rolls the target's save, applies Grappled. */
  grapple: (p: {
    targetTokenId: string;
    dc: number;
    label: string;
    sourceSheetId?: string;
    sourceTokenId?: string;
    release?: boolean;
  }) => void;
  me: () => Participant | undefined;
  isDm: () => boolean;
  dddiceActive: () => boolean;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
// The bestiary / homebrew arrive in their own `static` events (see protocol.ts) and are spliced into
// every `room` the store holds, so the rest of the app keeps reading `room.bestiary` / `room.homebrew`.
let staticBestiary: RoomState['bestiary'] = [];
let staticHomebrew: RoomState['homebrew'] = [];

export const useStore = create<StoreState>((set, get) => {
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    set({ status: 'connecting' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws`);

    socket.onopen = () => {
      set({ status: 'open' });
      const identity = get().identity;
      if (STREAM_MODE) {
        const c = storedCredentials();
        socket?.send(
          JSON.stringify({ action: { t: 'join', name: 'stream', stream: true, patch: true, participantId: c.participantId ?? undefined, secret: c.secret ?? undefined } }),
        );
      } else if (identity) {
        const stored = localStorage.getItem(PID_KEY) ?? undefined;
        rawSend({
          t: 'join',
          patch: true,
          name: identity.name,
          participantId: stored,
          secret: localStorage.getItem(SECRET_KEY) ?? undefined,
        });
      }
    };

    socket.onmessage = (ev) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (event.t === 'static') {
        if (event.bestiary) staticBestiary = event.bestiary;
        if (event.homebrew) staticHomebrew = event.homebrew;
        set((st) =>
          st.room ? { room: { ...st.room, bestiary: staticBestiary, homebrew: staticHomebrew } } : {},
        );
      } else if (event.t === 'speaking') {
        set({ speaking: event.ids });
      } else if (event.t === 'welcome') {
        // the server runs a newer build than this tab: load it (once, so a mismatch can't loop)
        if (event.protocol > PROTOCOL_VERSION) {
          try {
            if (sessionStorage.getItem('dnd.reloadedFor') !== String(event.protocol)) {
              sessionStorage.setItem('dnd.reloadedFor', String(event.protocol));
              location.reload();
              return;
            }
          } catch {
            /* storage blocked: keep going with this build */
          }
        }
        if (!STREAM_MODE) localStorage.setItem(PID_KEY, event.participantId);
        if (event.secret && !STREAM_MODE) localStorage.setItem(SECRET_KEY, event.secret);
        const room = { ...event.state, bestiary: staticBestiary, homebrew: staticHomebrew };
        set({ participantId: event.participantId, room, error: null });
      } else if (event.t === 'dragPreview') {
        set((st) => ({ dragPreviews: { ...st.dragPreviews, [event.id]: { x: event.x, y: event.y, ts: Date.now() } } }));
        schedulePreviewPurge();
      } else if (event.t === 'state' || event.t === 'patch') {
        set((st) => {
          // a patch carries only what changed since our last push (see statePatch.ts)
          if (event.t === 'patch' && !st.room) return {};
          const next =
            event.t === 'patch'
              ? applyPatch(st.room!, event)
              : { ...event.state, bestiary: staticBestiary, homebrew: staticHomebrew };
          // a dragged token whose position changed in the state has landed: drop its preview
          let previews = st.dragPreviews;
          if (Object.keys(previews).length) {
            previews = { ...previews };
            for (const id of Object.keys(previews)) {
              const was = st.room?.tokens.find((t) => t.id === id);
              const now = next.tokens.find((t) => t.id === id);
              if (!now || (was && (was.x !== now.x || was.y !== now.y)) || Date.now() - previews[id].ts > PREVIEW_TTL) delete previews[id];
            }
          }
          return { room: shareStructure(st.room, next), dragPreviews: previews };
        });
      } else if (event.t === 'error') {
        set({ error: event.message, levelUpPending: [] });
      }
    };

    socket.onclose = () => {
      set({ status: 'closed' });
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    socket.onerror = () => socket?.close();
  }

  // A preview nobody refreshes (the drop was rejected, or landed back where it started) fades out.
  const PREVIEW_TTL = 1500;
  let purgeTimer = 0;
  function schedulePreviewPurge() {
    if (purgeTimer) return;
    purgeTimer = window.setTimeout(() => {
      purgeTimer = 0;
      const live = Object.entries(get().dragPreviews).filter(([, p]) => Date.now() - p.ts <= PREVIEW_TTL);
      if (live.length !== Object.keys(get().dragPreviews).length) set({ dragPreviews: Object.fromEntries(live) });
      if (live.length) schedulePreviewPurge();
    }, 500);
  }

  function rawSend(action: ClientAction) {
    if (STREAM_MODE) return; // the recording window only watches
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action }));
    }
  }

  function dddiceActive(): boolean {
    const { room, dddiceKey } = get();
    return Boolean(room?.dddice.enabled && room.dddice.roomSlug && dddiceKey);
  }

  async function externalRoll(notation: string): Promise<ExternalRoll | null> {
    if (!dddiceActive()) return null;
    try {
      return await dddiceRollEquation(notation);
    } catch (err) {
      set({ error: `dddice: ${(err as Error).message} — dùng xúc xắc server` });
      return null;
    }
  }

  return {
    status: 'idle',
    participantId: null,
    identity: loadIdentity(),
    room: null,
    dragPreviews: {},
    speaking: [],
    error: null,
    dddiceKey: getLocalKey(),
    dddiceConnected: false,
    castingSpell: null,
    castingMonsterSpell: null,
    levelUpPending: [],

    join: (identity) => {
      if (!STREAM_MODE) localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      set({ identity });
      if (get().status === 'open') {
        rawSend({
          t: 'join',
          patch: true,
          name: identity.name,
          participantId: localStorage.getItem(PID_KEY) ?? undefined,
          secret: localStorage.getItem(SECRET_KEY) ?? undefined,
        });
      } else {
        connect();
      }
    },

    send: (action) => rawSend(action),

    setRole: (participantId, role) => rawSend({ t: 'setRole', participantId, role }),
    removeParticipant: (participantId) => rawSend({ t: 'removeParticipant', participantId }),
    resetTokenMove: (id) => rawSend({ t: 'resetTokenMove', id }),
    tokenDash: (id) => rawSend({ t: 'tokenDash', id }),
    turnAction: (tokenId, kind, targetTokenId) => rawSend({ t: 'turnAction', tokenId, kind, targetTokenId }),
    hideAction: async (tokenId, stealthBonus, mode = 'normal') => {
      const notation = d20Check(stealthBonus, mode);
      const external = await externalRoll(notation);
      rawSend({ t: 'turnAction', tokenId, kind: 'hide', notation, external: external ?? undefined });
    },
    grapple: (p) => rawSend({ t: 'grapple', ...p }),

    damageRoll: async (label, damageParts, targetTokenId, attacker) => {
      let external: { total: number; faces: number[] }[] | undefined;
      if (dddiceActive()) {
        // all damage dice of one hit go together (piercing + psychic land side by side)
        external = await Promise.all(
          damageParts.map(async (p) => {
            const ext = await externalRoll(p.dice);
            return ext ? { total: ext.total, faces: ext.faces } : { total: rollNotation(p.dice).total, faces: [] };
          }),
        );
      }
      rawSend({
        t: 'damage',
        label,
        damageParts,
        targetTokenId,
        external,
        attackerSheetId: attacker?.sheetId,
        attackerTokenId: attacker?.tokenId,
      });
    },

    healRoll: async (label, notation, targetTokenId, sourceSheetId) => {
      const ext = await externalRoll(notation);
      rawSend({
        t: 'heal',
        label,
        notation,
        targetTokenId,
        external: ext ? ext.total : undefined,
        sourceSheetId,
      });
    },

    rollInitiativeForMe: async (name, mod, tokenId, mode = 'normal') => {
      const external = await externalRoll(d20Check(mod, mode));
      rawSend({ t: 'rollInitiative', name, mod, tokenId, external: external ?? undefined });
    },

    rollInitiativeGroup: (tokenIds) => rawSend({ t: 'rollInitiativeGroup', tokenIds }),

    setDddiceKey: (key) => {
      persistDddiceKey(key);
      set({ dddiceKey: key, dddiceConnected: false });
    },

    setDddiceConnected: (connected) => set({ dddiceConnected: connected }),

    rollDice: async (label, notation, opts) => {
      const external = await externalRoll(notation);
      rawSend({ t: 'roll', label, notation, private: opts?.private, external: external ?? undefined });
    },

    attackRoll: async ({
      label,
      attackNotation,
      attackBonus,
      rollMode,
      damageParts,
      targetTokenId,
      attackerSheetId,
      attackerTokenId,
      attackRange,
      attackKind,
      moveOnHit,
      effectOnCrit,
      rangeText,
      actionName,
      pushFeetOnHit,
      grappleOnHit,
    }) => {
      const room = get().room;
      // Fold condition-implied advantage/disadvantage into the manual roll mode.
      let notation = attackNotation ?? '1d20';
      let condNote = '';
      if (typeof attackBonus === 'number') {
        const atkTok = attackerTokenId
          ? room?.tokens.find((t) => t.id === attackerTokenId)
          : attackerSheetId
            ? room?.tokens.find(
                (t) => room?.sheets.find((s) => s.id === attackerSheetId)?.tokenId === t.id,
              )
            : undefined;
        const tgtTok = room?.tokens.find((t) => t.id === targetTokenId);
        const cm = conditionAttackMode(tokenConditions(atkTok), tokenConditions(tgtTok), {
          range: attackRange,
          distanceFeet: atkTok && tgtTok ? gridFeet(atkTok, tgtTok) : undefined,
        });
        const reasons = [...cm.reasons];
        let mode = cm.mode;
        // Turn actions on the target: Dodge (attacks against it at disadvantage while it can act), Help (an ally's next attack has advantage).
        const tgtFx = tgtTok?.effects ?? [];
        const tgtDown = tokenConditions(tgtTok).some((c) => ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c));
        if (!tgtDown && tgtFx.some((e) => e.attackersDisadvantage)) {
          mode = combineRollModes(mode, 'disadvantage');
          reasons.push('mục tiêu đang Dodge');
        }
        const help = tgtFx.find((e) => e.attackersAdvantage && e.sourceTokenId !== atkTok?.id);
        if (help) {
          mode = combineRollModes(mode, 'advantage');
          reasons.push(help.name.replace(/^Bị Help nhắm/, 'Help'));
        }
        // Ranged attack made at close quarters (target within 5 ft): Disadvantage.
        const atkSheet = attackerSheetId ? room?.sheets.find((s) => s.id === attackerSheetId) : undefined;
        if (
          attackRange === 'ranged' &&
          atkTok &&
          tgtTok &&
          rangedAtCloseQuarters('ranged', gridFeet(atkTok, tgtTok)) &&
          !(atkSheet && passiveNoCloseRangedPenalty(atkSheet)) // feat: no close-range penalty
        ) {
          mode = combineRollModes(mode, 'disadvantage');
          reasons.push('tầm xa trong tầm cận chiến');
        }
        // Monster mechanics (Pack Tactics, Blood Frenzy, vs grappled / deafened…): advantage when they hold.
        if (atkTok?.statblock && !atkSheet && tgtTok && room) {
          const mechs = monsterMechanics(atkTok.statblock);
          if (mechs.length) {
            const playerSide = (t: Token) => !!t.controllerId || room.sheets.some((s) => s.tokenId === t.id);
            const able = (t: Token) =>
              !(typeof t.currentHp === 'number' && t.currentHp <= 0) &&
              !tokenConditions(t).some((c) => ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(c));
            const near = (a: Token, b: Token) => edgeFeet(a, tokenSpan(a), b, tokenSpan(b)) <= 5;
            const why = mechanicAttackAdvantage(mechs, {
              melee: attackRange === 'melee',
              allyAdjacentToTarget: room.tokens.some((t) => t.id !== atkTok.id && t.id !== tgtTok.id && playerSide(t) === playerSide(atkTok) && able(t) && near(t, tgtTok)),
              targetAdjacentToItsAlly: room.tokens.some((t) => t.id !== tgtTok.id && t.id !== atkTok.id && playerSide(t) === playerSide(tgtTok) && able(t) && near(t, tgtTok)),
              targetGrappledBySelf: !!tgtTok.effects?.some((e) => (e.condition === 'grappled' || /grapple|bị ghì/i.test(e.name)) && e.sourceTokenId === atkTok.id),
              targetDamaged: typeof tgtTok.currentHp === 'number' && typeof tgtTok.maxHp === 'number' && tgtTok.currentHp < tgtTok.maxHp,
              targetConditions: tokenConditions(tgtTok),
            });
            if (why.length) {
              mode = combineRollModes(mode, 'advantage');
              reasons.push(...why);
            }
          }
        }
        // Light where the attacker stands (Sunlight Sensitivity…) and Aversion-style effects: disadvantage.
        if (atkTok && room) {
          const lightWhy = atkTok.statblock && !atkSheet ? activeLightRules(monsterMechanics(atkTok.statblock), lightAt(room, atkTok)).attack : [];
          const fxWhy = (atkTok.effects ?? []).filter((e) => e.rollDisadvantage?.includes('attack')).map((e) => e.name);
          if (lightWhy.length || fxWhy.length) {
            mode = combineRollModes(mode, 'disadvantage');
            reasons.push(...lightWhy, ...fxWhy);
          }
        }
        // Its target's traits (ranged weapon attacks against it have disadvantage).
        if (tgtTok?.statblock && room && !room.sheets.some((s) => s.tokenId === tgtTok.id)) {
          const why = defenseDisadvantageWhy(monsterMechanics(tgtTok.statblock), { ranged: attackRange === 'ranged', spell: attackKind === 'spell' });
          if (why.length) {
            mode = combineRollModes(mode, 'disadvantage');
            reasons.push(...why);
          }
        }
        // +1 attack and damage per other creature of its kind nearby (hive traits).
        if (atkTok?.statblock && !atkSheet && room) {
          for (const h of mechanicsOfKind(monsterMechanics(atkTok.statblock), 'hiveBonus')) {
            const n = Math.min(
              h.max,
              room.tokens.filter(
                (t) => t.id !== atkTok.id && t.statblock?.name === atkTok.statblock?.name && !(typeof t.currentHp === 'number' && t.currentHp <= 0) && edgeFeet(t, tokenSpan(t), atkTok, tokenSpan(atkTok)) <= h.radiusFt,
              ).length,
            );
            if (n > 0) {
              attackBonus += n;
              damageParts = [...damageParts, { dice: String(n), type: damageParts[0]?.type ?? '', label: h.from ?? 'hive' }];
              reasons.push(`${h.from ?? 'hive'} +${n}`);
            }
          }
        }
        // Ranged weapon: beyond normal range = disadvantage, beyond long range = can't (asks first).
        if (attackRange === 'ranged' && attackKind !== 'spell' && atkTok && tgtTok) {
          const mult = passiveRangeMultiplier(atkSheet);
          const band = rangeBand(rangeText, gridFeet(atkTok, tgtTok), mult);
          if (band === 'out' && !window.confirm(`Mục tiêu ở ${gridFeet(atkTok, tgtTok)}ft — ngoài tầm tối đa (${rangeText?.match(/\d+\s*\/\s*\d+/)?.[0]}${mult > 1 ? ` ×${mult}` : ''}). Vẫn đánh?`)) return;
          if (band === 'long') {
            mode = combineRollModes(mode, 'disadvantage');
            reasons.push('tầm xa');
          }
        }
        const finalMode = combineRollModes(rollMode ?? 'normal', mode);
        notation = d20Check(attackBonus, finalMode);
        if (mode !== 'normal') condNote = ` [${mode === 'advantage' ? 'lợi thế' : 'bất lợi'}: ${reasons.join(', ')}]`;
        else if (reasons.length) condNote = ` [${reasons.join(', ')}]`;
      }
      const finalLabel = label + condNote;
      const plain = () =>
        rawSend({
          t: 'attack',
          label: finalLabel,
          attackNotation: notation,
          damageParts,
          targetTokenId,
          attackerSheetId,
          attackerTokenId,
          attackRange,
          attackKind,
          moveOnHit,
          effectOnCrit,
          actionName,
          pushFeetOnHit,
          grappleOnHit,
        });
      if (!dddiceActive()) return plain();
      const attack = await externalRoll(notation);
      if (!attack) return plain();

      const token = room?.tokens.find((tk) => tk.id === targetTokenId);
      const linked = room?.sheets.find((s) => s.tokenId === targetTokenId);
      // An enemy whose AC is hidden from this player: we cannot pre-resolve hit/crit here, so send just
      // the d20 and let the server (which knows the AC) decide and roll the damage.
      if ((token && !linked && typeof token.armorClass !== 'number') || linked?.redacted) {
        return rawSend({
          t: 'attack',
          label: finalLabel,
          attackNotation: notation,
          damageParts,
          targetTokenId,
          attackerSheetId,
          attackerTokenId,
          attackRange,
          attackKind,
          moveOnHit,
          effectOnCrit,
          actionName,
          pushFeetOnHit,
          grappleOnHit,
          external: { attack },
        });
      }
      const ac =
        (linked
          ? effectiveArmorClass(linked, token?.effects).ac
          : npcArmorClass(token?.armorClass ?? 10, token?.effects) + acBonusByHp(monsterMechanics(token?.statblock), token?.currentHp)) +
        coverAcBonus(
          attackRange === 'ranged' && attackKind !== 'spell'
            ? passiveRangedCover(attackerSheetId ? room?.sheets.find((s) => s.id === attackerSheetId) : undefined, token?.cover ?? 'none')
            : token?.cover,
        );
      const def = mergeDefenses(
        token?.defenses,
        linked ? derivedDefenses(linked) : undefined,
      );
      const critImmune = def?.critImmune ?? false;
      const targetConds = tokenConditions(token);
      const atkTok2 = attackerTokenId ? room?.tokens.find((t) => t.id === attackerTokenId) : undefined;
      const autoCrit = conditionAutoCrit(targetConds, {
        range: attackRange,
        distanceFeet: atkTok2 && token ? gridFeet(atkTok2, token) : undefined,
      });
      const nat20 = attack.d20Natural === 20;
      const fumble = attack.d20Natural === 1;
      const hit = nat20 || (!fumble && attack.total >= ac);
      const effectiveCrit = (nat20 || (hit && autoCrit)) && !critImmune;
      let partTotals: { total: number; faces: number[] }[] | undefined;
      if (hit) {
        // the d20 has landed (externalRoll waits for it); now this hit's damage dice, all together
        partTotals = await Promise.all(
          damageParts.map(async (p) => {
            const n = effectiveCrit ? homebrewCritDamage(p.dice) : p.dice;
            const ext = await externalRoll(n);
            return ext ? { total: ext.total, faces: ext.faces } : { total: rollNotation(n).total, faces: [] };
          }),
        );
      }
      rawSend({
        t: 'attack',
        label: finalLabel,
        attackNotation: notation,
        damageParts,
        targetTokenId,
        attackerSheetId,
        attackerTokenId,
        attackRange,
        attackKind,
        moveOnHit,
        effectOnCrit,
        actionName,
        pushFeetOnHit,
        grappleOnHit,
        external: { attack, crit: effectiveCrit, partTotals },
      });
    },

    levelUpOpen: () => rawSend({ t: 'levelUpOpen' }),
    levelUpClose: () => rawSend({ t: 'levelUpClose' }),
    claimLevelUp: async (sheetId, classIndex = 0) => {
      const { room, levelUpPending } = get();
      const round = room?.levelUp;
      const sheet = room?.sheets.find((x) => x.id === sheetId);
      if (!round || !sheet) return;
      const key = `${round.id}:${sheetId}`;
      if (levelUpPending.includes(key) || round.claimed.includes(sheetId)) return;
      const die = levelUpDie(sheet, classIndex);
      if (!die) {
        set({ error: 'Chọn class cho nhân vật trước khi lên cấp' });
        return;
      }
      // The button vanishes immediately, before any dice finish rolling.
      set({ levelUpPending: [...levelUpPending, key] });
      // dddice: the 3D die decides the HP; a 1 triggers one more die (pity rule) whose result stands.
      let external: { first: ExternalRoll; second?: ExternalRoll } | undefined;
      if (dddiceActive()) {
        const first = await externalRoll(`1d${die}`);
        if (first) {
          const second = needsPityReroll(first.total) ? ((await externalRoll(`1d${die}`)) ?? undefined) : undefined;
          external = { first, second };
        }
      }
      rawSend({ t: 'levelUp', sheetId, classIndex, external });
    },

    applyEffect: (targetTokenId, effect) =>
      rawSend({ t: 'applyEffect', targetTokenId, effect }),
    removeEffect: (tokenId, effectId) => rawSend({ t: 'removeEffect', tokenId, effectId }),
    clearConcentration: (tokenId) => rawSend({ t: 'clearConcentration', tokenId }),

    spendEconomy: (tokenId, kind, opts) => {
      const room = get().room;
      const tok = tokenId ? room?.tokens.find((t) => t.id === tokenId) : undefined;
      if (!room || !tok || !room.initiative.running) return true; // economy only matters in combat
      const r = spendEconomyRule(tok.turnUsed, kind, opts);
      if (r.warning && !window.confirm(r.warning + '. Vẫn thực hiện?')) return false;
      rawSend({ t: 'setTurnUsed', tokenId: tok.id, patch: r.used });
      return true;
    },
    activateWoodWose: (sheet, opts) => {
      const room = get().room;
      const tok = room?.tokens.find((t) => t.id === sheet.tokenId);
      const ww = room ? woodWoseEffect(sheet, room.initiative.round ?? 1) : null;
      if (!room || !tok || !ww) {
        set({ error: 'Wood Wose cần nhân vật Circle of the Old Ways gắn với token trên bản đồ.' });
        return false;
      }
      if ((tok.effects ?? []).some((e) => e.name === WOOD_WOSE)) return false;
      const used = sheet.wildShapeUsed ?? 0;
      if (opts?.spendWildShape) {
        if (used >= wildShapeMax(sheet)) {
          set({ error: 'Hết lần Wild Shape.' });
          return false;
        }
        rawSend({ t: 'upsertSheet', sheet: { ...sheet, wildShapeUsed: used + 1 }, base: sheet });
      }
      rawSend({ t: 'applyEffect', targetTokenId: tok.id, effect: { id: '', ...ww.effect } });
      rawSend({ t: 'grantTempHp', targetTokenId: tok.id, notation: String(ww.tempHp), label: 'Rampant Growth (HP tạm)', sourceSheetId: sheet.id });
      return true;
    },
    beginCast: (sheetId, spell, castAtLevel, repeat) => {
      // Save spells with a parseable template: place the area on the map instead of clicking one target.
      const spec = spell.castKind === 'save' ? parseArea(spell.area) : null;
      const casterTokenId = get().room?.sheets.find((s) => s.id === sheetId)?.tokenId;
      if (spec && casterTokenId) {
        const selfRange = /bản thân|self/i.test(spell.range ?? '');
        const rangeFeet = selfRange ? 0 : parseRangeFeet(spell.range);
        set({
          castingSpell: null,
          aoe: {
            label: spell.name,
            spec,
            anchor: defaultAnchor(spec, rangeFeet, selfRange),
            casterTokenId,
            rangeFeet,
            onConfirm: (ids, aoeId) => {
              // Pay once for the whole area — cancelling (no slot) or lacking the action must stop
              // the cast for EVERY target, not just the first one.
              if (!get().payCast(sheetId, spell, castAtLevel, repeat)) return;
              ids.forEach((id, i) => {
                set({ castingSpell: { sheetId, spell, castAtLevel, repeat } });
                void get().resolveCastOnToken(id, { aoeId, skipConc: i > 0, paid: true });
              });
            },
          },
        });
        return;
      }
      set({ castingSpell: { sheetId, spell, castAtLevel, repeat } });
    },
    cancelCast: () => set({ castingSpell: null, castingMonsterSpell: null, aoe: null }),
    beginMonsterCast: (tokenId, spell, spellAttackBonus) => {
      // Save spells with a parseable area template: place the AoE on the map instead of
      // clicking one target, same as a player casting the same spell would.
      const spec = spell.castKind === 'save' ? parseArea(spell.area) : null;
      if (spec) {
        const selfRange = /bản thân|self/i.test(spell.range ?? '');
        const rangeFeet = selfRange ? 0 : parseRangeFeet(spell.range);
        set({
          castingMonsterSpell: null,
          aoe: {
            label: spell.name,
            spec,
            anchor: defaultAnchor(spec, rangeFeet, selfRange),
            casterTokenId: tokenId,
            rangeFeet,
            onConfirm: (ids, aoeId) => {
              ids.forEach((id, i) => {
                set({ castingMonsterSpell: { tokenId, spell, spellAttackBonus } });
                void get().resolveMonsterCastOnToken(id, { aoeId, skipConc: i > 0 });
              });
            },
          },
        });
        return;
      }
      set({ castingMonsterSpell: { tokenId, spell, spellAttackBonus }, castingSpell: null });
    },
    aoe: null,
    pickPoint: null,
    setPickPoint: (p) => set({ pickPoint: p }),
    beginAoe: (mode) => set({ aoe: mode, castingSpell: null }),
    cancelAoe: () => set({ aoe: null }),
    confirmAoe: (targetIds) => {
      const mode = get().aoe;
      if (!mode) return;
      set({ aoe: null });
      if (targetIds.length === 0) {
        set({ error: 'Không có token nào trong vùng — hủy.' });
        return;
      }
      mode.onConfirm(targetIds, `aoe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
    },
    bestiaryFocus: null,
    openBestiary: (id) => set({ bestiaryFocus: id }),
    payCast: (sheetId, spell, castAtLevel, repeat) => {
      const sheet = get().room?.sheets.find((s) => s.id === sheetId);
      if (!sheet) return false;
      const econ = economyKindOf(spell.actionType);
      if (econ && !get().spendEconomy(sheet.tokenId, econ)) return false;
      if (repeat) return true; // re-use of a lasting spell: the first cast paid the slot
      const slot = spendSpellSlot(sheet, spell.level, castAtLevel);
      // remember the slot level so later recasts roll that level's dice
      const keepLevel =
        spell.level > 0 && recastOf(spell)
          ? { spells: (sheet.spells ?? []).map((s) => (s.id === spell.id ? { ...s, lastCastLevel: castAtLevel ?? spell.level } : s)) }
          : {};
      if (!slot.available) {
        if (!window.confirm(`${slot.reason}. Vẫn ra phép? (không trừ spell slot)`)) return false;
        if (keepLevel.spells) rawSend({ t: 'upsertSheet', sheet: { ...sheet, ...keepLevel }, base: sheet });
      } else if (Object.keys(slot.patch).length > 0 || keepLevel.spells) {
        rawSend({ t: 'upsertSheet', sheet: { ...sheet, ...slot.patch, ...keepLevel }, base: sheet });
      }
      return true;
    },
    resolveCastOnToken: async (targetTokenId, opts) => {
      const cast = get().castingSpell;
      const room = get().room;
      if (!cast || !room) return;
      const { sheetId, spell } = cast;
      const sheet = room.sheets.find((s) => s.id === sheetId);
      set({ castingSpell: null });
      if (!sheet) return;
      const castAtLevel = cast.castAtLevel && cast.castAtLevel > spell.level ? cast.castAtLevel : undefined;
      const pactLvl = spell.level > 0 && casterTypeOf(sheet) === 'pact' ? sheet.pactSlots?.level : undefined;
      const shownLvl = pactLvl && pactLvl > spell.level ? pactLvl : castAtLevel;
      const label = `${sheet.name} · ${spell.name}${shownLvl ? ` (ô cấp ${shownLvl})` : ''}${cast.repeat ? ' (lặp lại)' : ''}`;
      // An AOE cast resolves once per target hit (see `beginCast`'s aoe.onConfirm) — economy
      // and the spell slot must only be spent once per cast, on the first target.
      const firstTarget = !opts?.skipConc;
      if (firstTarget && !opts?.paid && !get().payCast(sheetId, spell, cast.castAtLevel, cast.repeat)) return;

      // Upcast: extra dice per slot level above the spell's own, read from the spell DB's
      // "Nâng ô: +1d6" guidance. Pact Magic always casts at the Pact slot level.
      const effLevel =
        spell.level > 0 && casterTypeOf(sheet) === 'pact' && sheet.pactSlots
          ? Math.max(spell.level, sheet.pactSlots.level)
          : (cast.castAtLevel ?? spell.level);
      const perLevel = spell.level > 0 ? parseUpcast(findCantrip(spell.name)?.guidance) : undefined;
      const upPart = upcastDamagePart(perLevel, spell.level, effLevel, spell.damage?.[0]?.type);
      const spellDamage = spell.damage && upPart ? [...spell.damage, upPart] : spell.damage;
      const healExtra = perLevel && effLevel > spell.level ? scaleDice(perLevel, effLevel - spell.level) : '';
      const atkBonus = spellAttackBonus(sheet, spell) ?? 0;
      const dc = spell.save?.dcOverride ?? spellSaveDc(sheet, spell) ?? 10;
      const castAbil = spellcastingAbilityOf(sheet, spell);
      const castMod = castAbil ? abilityMod(sheet.abilities[castAbil]) : 0;

      // Concentration spells whose branch places the concentration effect on the
      // TARGET establish concentration there; the rest (pure damage / attack /
      // saved-with-no-effect) need a marker on the CASTER's own token.
      const placesConcOnTarget =
        spell.castKind === 'rider' ||
        ((spell.castKind === 'save' || spell.castKind === 'utility') && !!spell.effect);
      if (spell.concentration && !placesConcOnTarget && sheet.tokenId && !opts?.skipConc) {
        rawSend({
          t: 'applyEffect',
          targetTokenId: sheet.tokenId,
          effect: {
            id: '',
            name: `Đang tập trung: ${spell.name}`,
            sourceSheetId: sheetId,
            concentration: true,
            note: spell.notes,
          },
        });
      }

      if (spell.castKind === 'heal' && spell.heal) {
        const mod = castMod >= 0 ? `+${castMod}` : `${castMod}`;
        await get().healRoll(`${label} (hồi máu)`, `${spell.heal}${healExtra ? `+${healExtra}` : ''}${castMod ? mod : ''}`, targetTokenId, sheetId);
        return;
      }
      if (spell.castKind === 'damage') {
        // Auto-hit damage spell (Magic Missile): no attack roll.
        await get().damageRoll(
          `${label} (phép)`,
          spellAttackParts(sheet, spellDamage, spell),
          targetTokenId,
          { sheetId, tokenId: sheet.tokenId },
        );
        // …and a save for its rider effect (Electrify: CON or stunned; Graviturgic Smite: STR or slowed)
        const fs = spell.followSave ?? findCantrip(spell.name)?.followSave;
        if (fs) {
          rawSend({
            t: 'spellSave',
            fromSpell: true,
            targetTokenId,
            ability: fs.ability,
            dc,
            label: `${label} (save)`,
            sourceSheetId: sheetId,
            effectOnFail: {
              id: '',
              name: fs.effect.name,
              sourceSheetId: sheetId,
              concentration: spell.concentration,
              condition: fs.effect.condition,
              note: fs.effect.note,
              expiresRound: fs.effect.expiresInRounds ? (room.initiative.round ?? 1) + fs.effect.expiresInRounds : undefined,
            },
          });
        }
        return;
      }

      if (spell.castKind === 'rider' && spell.rider) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: spell.name,
            sourceSheetId: sheetId,
            concentration: spell.concentration,
            rider: spell.rider,
          },
        });
        return;
      }
      if (spell.castKind === 'save' && spell.save) {
        // creatures within N ft of the caster save with disadvantage
        const within = spell.saveDisadvantageWithin ?? findCantrip(spell.name)?.saveDisadvantageWithin;
        const casterTok = room.tokens.find((t) => t.id === sheet.tokenId);
        const tgtTok = room.tokens.find((t) => t.id === targetTokenId);
        const closeDis = within != null && casterTok && tgtTok && tgtTok.id !== casterTok.id && gridFeet(casterTok, tgtTok) <= within;
        const sfx = spell.effect ? upcastEffect(spell.effect, spell.level, effLevel) : undefined;
        rawSend({
          t: 'spellSave',
            fromSpell: true,
          targetTokenId,
          ability: spell.save.ability,
          dc,
          label,
          sourceSheetId: sheetId,
          rollMode: closeDis ? 'disadvantage' : undefined,
          teleportOnFail:
            (spell.teleportOnFail ?? findCantrip(spell.name)?.teleportOnFail) && casterTok
              ? { maxFeet: (spell.teleportOnFail ?? findCantrip(spell.name)!.teleportOnFail!).maxFeet, fromTokenId: casterTok.id }
              : undefined,
          moveOnFail:
            (spell.moveOnFail ?? findCantrip(spell.name)?.moveOnFail) && casterTok
              ? { ...(spell.moveOnFail ?? findCantrip(spell.name)!.moveOnFail!), fromTokenId: casterTok.id }
              : undefined,
          damageOnFail:
            spellDamage && spellDamage.length
              ? spell.agonizingBlast && castMod
                ? [...spellDamage, { dice: String(castMod), type: spellDamage[0].type, label: 'Agonizing Blast' }]
                : spellDamage
              : undefined,
          damageHalfOnSave: spell.save.halfOnSave,
          aoeId: opts?.aoeId,
          effectOnFail: spell.effect
            ? {
                id: '',
                name: spell.effect.name || spell.name,
                sourceSheetId: sheetId,
                concentration: spell.concentration,
                condition: spell.effect.condition,
                note: spell.effect.note,
                save:
                  spell.save.repeat && spell.save.repeat !== 'none'
                    ? { ability: spell.save.ability, dc, repeat: spell.save.repeat }
                    : undefined,
                turnDamage: sfx?.turnDamage,
                charges: sfx?.charges,
                expiresRound: spell.effect.expiresInRounds
                  ? (room.initiative.round ?? 1) + spell.effect.expiresInRounds
                  : undefined,
              }
            : undefined,
        });
        return;
      }
      if (spell.castKind === 'attack') {
        // Eldritch Blast (2024): more levels = more separate beams (each its own attack roll),
        // not bigger dice — `spell.beams` is set by spellFromCantrip/rescaleCantripSpell.
        // Casting is still one Action; the beams themselves don't spend extra economy.
        // Leveled multi-ray spells (Scorching Ray: "3 tia, mỗi tia … 2d6"): one attack roll per ray,
        // each dealing the per-ray dice, +1 ray per slot level above when the DB says "Nâng ô: +1 tia".
        const guide = spell.level > 0 ? (findCantrip(spell.name)?.guidance ?? '') : '';
        const ray = /(\d+)\s*tia,\s*mỗi tia[^.]*?(\d+d\d+)/i.exec(guide);
        // "Nâng ô: +2d8 mỗi tia" adds to every ray; "+1 tia" adds rays instead (Scorching Ray)
        const rayDamage =
          ray && spell.damage?.length
            ? [{ ...spell.damage[0], dice: ray[2] }, ...(upPart && !/Nâng ô:\s*\+1 tia/i.test(guide) ? [upPart] : []), ...spell.damage.slice(1)]
            : undefined;
        const beams = ray
          ? Number(ray[1]) + (/Nâng ô:\s*\+1 tia(?!\s*\()/i.test(guide) ? Math.max(0, effLevel - spell.level) : 0)
          : spell.beams && spell.beams > 1 ? spell.beams : 1;
        // forced movement on a hit (a pull, or a push behind a save) and crit riders
        const mvDef = spell.moveOnHit ?? findCantrip(spell.name)?.moveOnHit;
        const mvHit = mvDef
          ? { feet: mvDef.feet, dir: mvDef.dir, save: mvDef.save ? { ability: mvDef.save, dc, largeAdvantage: mvDef.largeAdvantage } : undefined, collideCondition: mvDef.collideCondition }
          : undefined;
        const critDef = spell.critEffect ?? findCantrip(spell.name)?.critEffect;
        const critFx: ActiveEffect | undefined = critDef
          ? {
              id: '',
              name: critDef.name,
              sourceSheetId: sheetId,
              condition: critDef.condition,
              note: critDef.note,
              expiresRound: critDef.expiresInRounds ? (room.initiative.round ?? 1) + critDef.expiresInRounds : undefined,
            }
          : undefined;
        for (let i = 0; i < beams; i++) {
          await get().attackRoll({
            label: beams > 1 ? `${label} (phép, tia ${i + 1}/${beams})` : `${label} (phép)`,
            attackBonus: atkBonus,
            rollMode: 'normal',
            damageParts: spellAttackParts(sheet, rayDamage ?? spellDamage, spell),
            targetTokenId,
            attackerSheetId: sheetId,
            attackerTokenId: sheet.tokenId,
            attackRange: inferAttackRange(spell.range),
            attackKind: 'spell',
            moveOnHit: mvHit,
            effectOnCrit: critFx,
            pushFeetOnHit: spell.repellingBlast ? 10 : undefined,
          });
        }
        // burst spells: hit or miss, the area bursts — save-for-half for everyone around the target
        const burst = spell.burst ?? findCantrip(spell.name)?.burst;
        const tgt = burst ? get().room?.tokens.find((t) => t.id === targetTokenId) : undefined;
        if (burst && tgt) {
          const span = (t: { size: string }) => ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as Record<string, number>)[t.size] ?? 1;
          const cur = get().room!;
          const caught = aoeTokenIds(
            { shape: 'sphere', size: burst.radiusFt },
            'point',
            { x: tgt.x + span(tgt) / 2, y: tgt.y + span(tgt) / 2 },
            { x: tgt.x + span(tgt) / 2, y: tgt.y + span(tgt) / 2 },
            cur.tokens.filter((t) => !t.hidden).map((t) => ({ id: t.id, x: t.x, y: t.y, span: span(t) })),
          );
          const aoeId = `burst-${Date.now().toString(36)}`;
          const dice = burstDice(burst, spell.level, effLevel);
          for (const id of caught) {
            rawSend({
              t: 'spellSave',
            fromSpell: true,
              targetTokenId: id,
              ability: burst.save,
              dc,
              label: `${label} (nổ ${burst.radiusFt}ft)`,
              sourceSheetId: sheetId,
              damageOnFail: [{ dice, type: burst.type, label: `${spell.name} (nổ)` }],
              damageHalfOnSave: burst.halfOnSave,
              aoeId,
            });
          }
          if (burst.lingers) {
            rawSend({
              t: 'addHazard',
              hazard: {
                magical: true,
                label: `${spell.name} (vùng)`,
                cx: tgt.x + span(tgt) / 2,
                cy: tgt.y + span(tgt) / 2,
                radiusFt: burst.radiusFt,
                save: burst.save,
                dc,
                dice,
                type: burst.type,
                halfOnSave: burst.halfOnSave,
                sourceTokenId: sheet.tokenId,
                sourceSheetId: sheetId,
              },
            });
          }
        }
        return;
      }
      // utility: temp HP (False Life, Armor of Agathys) and/or a plain effect (Mage Armor, Shield of Faith…)
      if (spell.tempHp) {
        rawSend({
          t: 'grantTempHp',
          targetTokenId,
          notation: spell.tempHp,
          label: `${label} (HP tạm)`,
          sourceSheetId: sheetId,
        });
      }
      // Circle of the Old Ways: Shillelagh can also switch on Wood Wose (1 Wild Shape, no extra action)
      if (
        spell.name === 'Shillelagh' &&
        sheet.tokenId === targetTokenId &&
        oldWaysClass(sheet) &&
        (sheet.wildShapeUsed ?? 0) < wildShapeMax(sheet) &&
        !(room.tokens.find((t) => t.id === targetTokenId)?.effects ?? []).some((e) => e.name === WOOD_WOSE) &&
        window.confirm('Circle of the Old Ways: tốn 1 lần Wild Shape để bật Wood Wose luôn (AC = 10 + DEX + WIS, HP tạm, lợi thế save STR/CON)?')
      ) {
        get().activateWoodWose(sheet, { spendWildShape: true });
      }
      // Spells added before an effect was wired (e.g. Shillelagh) fall back to the DB definition.
      // the DB definition fills fields the sheet's copy predates (it may be older than a data update)
      const dbFx = findCantrip(spell.name)?.effect;
      const fx0: Spell['effect'] = spell.effect ? { ...(dbFx ?? {}), ...spell.effect } as Spell['effect'] : spell.name === 'Shillelagh' ? findCantrip('Shillelagh')?.effect : undefined;
      // scaling effects: dice and charges grow with the slot
      const fx = fx0 ? upcastEffect(fx0, spell.level, effLevel) : undefined;
      const fxConc = spell.concentration && !(fx?.upcast?.noConcentrationAt && effLevel >= fx.upcast.noConcentrationAt);
      if (fx) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: fx.name || spell.name,
            sourceSheetId: sheetId,
            concentration: fxConc,
            condition: fx.condition,
            note: fx.charges != null ? `${fx.note ?? ''} · còn ${fx.charges} lần`.replace(/^ · /, '') : fx.note,
            charges: fx.charges,
            turnDamage: fx.turnDamage,
            rollBonus: fx.rollBonus,
            acBonus: fx.acBonus,
            acMin: fx.acMin,
            acBase: fx.acBase,
            retaliate: fx.retaliate,
            weaponImbue: fx.weaponImbue,
            attackRiders: fx.attackRiders,
            resist: fx.resist,
            saveAdvantage: fx.saveAdvantage,
            deathSaveAdvantage: fx.deathSaveAdvantage,
            expiresRound: fx.expiresInRounds
              ? (room.initiative.round ?? 1) + fx.expiresInRounds
              : undefined,
          },
        });
      }
    },

    /** Monster spell cast, resolved against `targetTokenId` — mirrors `resolveCastOnToken` but the
     *  caster is a token with fixed DC/attack bonus (no ability scores, no multiclass, no wild
     *  shape special-cases) instead of a character sheet. */
    resolveMonsterCastOnToken: async (targetTokenId, opts) => {
      const cast = get().castingMonsterSpell;
      const room = get().room;
      if (!cast || !room) return;
      const { tokenId, spell, spellAttackBonus } = cast;
      const caster = room.tokens.find((t) => t.id === tokenId);
      set({ castingMonsterSpell: null });
      if (!caster) return;
      const label = `${caster.label} · ${spell.name}`;
      const dc = spell.save?.dcOverride ?? 10;

      // Concentration spells whose branch places the concentration effect on the TARGET
      // (rider, or save+effect) establish concentration there — see effectOnFail /
      // the rider branch below. Only the rest need a separate marker on the caster's own
      // token. Applying BOTH (as this used to) makes two differently-named concentration
      // records fight over the caster's single `.concentration` slot, endlessly dropping
      // and re-adding each other on every re-apply.
      const placesConcOnTarget = spell.castKind === 'rider' || (spell.castKind === 'save' && !!spell.effect);
      if (spell.concentration && !placesConcOnTarget && tokenId && !opts?.skipConc) {
        rawSend({
          t: 'applyEffect',
          targetTokenId: tokenId,
          effect: { id: '', name: `Đang tập trung: ${spell.name}`, sourceTokenId: tokenId, concentration: true, note: spell.notes },
        });
      }

      if (spell.castKind === 'heal' && spell.heal) {
        await get().healRoll(`${label} (hồi máu)`, spell.heal, targetTokenId, undefined);
        return;
      }
      if (spell.castKind === 'damage') {
        await get().damageRoll(`${label} (phép)`, spell.damage ?? [], targetTokenId, { tokenId });
        return;
      }
      if (spell.castKind === 'rider' && spell.rider) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: { id: '', name: spell.name, sourceTokenId: tokenId, concentration: spell.concentration, rider: spell.rider },
        });
        return;
      }
      if (spell.castKind === 'save' && spell.save) {
        rawSend({
          t: 'spellSave',
            fromSpell: true,
          targetTokenId,
          ability: spell.save.ability,
          dc,
          label,
          sourceTokenId: tokenId,
          damageOnFail: spell.damage && spell.damage.length ? spell.damage : undefined,
          damageHalfOnSave: spell.save.halfOnSave,
          aoeId: opts?.aoeId,
          effectOnFail: spell.effect
            ? {
                id: '',
                name: spell.effect.name || spell.name,
                sourceTokenId: tokenId,
                concentration: spell.concentration,
                condition: spell.effect.condition,
                note: spell.effect.note,
                save:
                  spell.save.repeat && spell.save.repeat !== 'none'
                    ? { ability: spell.save.ability, dc, repeat: spell.save.repeat }
                    : undefined,
                expiresRound: spell.effect.expiresInRounds ? (room.initiative.round ?? 1) + spell.effect.expiresInRounds : undefined,
              }
            : undefined,
        });
        return;
      }
      if (spell.castKind === 'attack') {
        await get().attackRoll({
          label: `${label} (phép)`,
          attackBonus: spellAttackBonus,
          rollMode: 'normal',
          damageParts: spell.damage ?? [],
          targetTokenId,
          attackerTokenId: tokenId,
          attackRange: inferAttackRange(spell.range),
          attackKind: 'spell',
        });
        return;
      }
      // utility: temp HP and/or a plain effect
      if (spell.tempHp) {
        rawSend({ t: 'grantTempHp', targetTokenId, notation: spell.tempHp, label: `${label} (HP tạm)`, sourceTokenId: tokenId });
      }
      if (spell.effect) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: spell.effect.name || spell.name,
            sourceTokenId: tokenId,
            concentration: spell.concentration,
            condition: spell.effect.condition,
            note: spell.effect.note,
            rollBonus: spell.effect.rollBonus,
            acBonus: spell.effect.acBonus,
            acMin: spell.effect.acMin,
            acBase: spell.effect.acBase,
            retaliate: spell.effect.retaliate,
            weaponImbue: spell.effect.weaponImbue,
            expiresRound: spell.effect.expiresInRounds ? (room.initiative.round ?? 1) + spell.effect.expiresInRounds : undefined,
          },
        });
      }
    },

    me: () => {
      const { room, participantId } = get();
      return room?.participants.find((p) => p.id === participantId);
    },

    isDm: () => !STREAM_MODE && get().me()?.role === 'dm',
    dddiceActive,
  };
});

// auto-connect if identity already known (the recording window always connects, as the DM's viewer)
if (STREAM_MODE) {
  useStore.getState().join({ name: 'stream' });
} else if (loadIdentity()) {
  useStore.getState().join(loadIdentity()!);
}

/** Show a toast even when the same message is already the current error (the toast only reacts to a change). */
export function flashError(message: string): void {
  useStore.setState({ error: null });
  setTimeout(() => useStore.setState({ error: message }), 0);
}

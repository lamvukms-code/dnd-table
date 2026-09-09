import { create } from 'zustand';
import {
  combineRollModes,
  conditionAttackMode,
  coverAcBonus,
  d20Check,
  derivedDefenses,
  homebrewCritDamage,
  mergeDefenses,
  rollNotation,
  spellAttackBonus,
  spellSaveDc,
  tokenConditions,
  type ActiveEffect,
  type ClientAction,
  type DamagePart,
  type ExternalRoll,
  type Participant,
  type RollMode,
  type RoomState,
  type ServerEvent,
  type Spell,
} from '@dnd-table/shared';
import {
  getLocalKey,
  rollEquation as dddiceRollEquation,
  setLocalKey as persistDddiceKey,
} from './dddice.js';

const PID_KEY = 'dnd-table.participantId';
const IDENTITY_KEY = 'dnd-table.identity';

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
}

interface StoreState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  participantId: string | null;
  identity: Identity | null;
  room: RoomState | null;
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
  /** Roll damage parts and subtract the (post-defence) total from a target's HP. */
  damageRoll: (
    label: string,
    damageParts: DamagePart[],
    targetTokenId: string,
    attacker?: { sheetId?: string; tokenId?: string },
  ) => Promise<void>;
  /** Put a spell/feature effect on a target token (condition, rider, save). */
  applyEffect: (targetTokenId: string, effect: ActiveEffect) => void;
  removeEffect: (tokenId: string, effectId: string) => void;
  clearConcentration: (tokenId: string) => void;
  /** Point-click spell casting: arm a spell, then click a token on the map. */
  castingSpell: { sheetId: string; spell: Spell } | null;
  beginCast: (sheetId: string, spell: Spell) => void;
  cancelCast: () => void;
  resolveCastOnToken: (targetTokenId: string) => Promise<void>;
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
  me: () => Participant | undefined;
  isDm: () => boolean;
  dddiceActive: () => boolean;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;

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
      if (identity) {
        const stored = localStorage.getItem(PID_KEY) ?? undefined;
        rawSend({ t: 'join', name: identity.name, participantId: stored });
      }
    };

    socket.onmessage = (ev) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (event.t === 'welcome') {
        localStorage.setItem(PID_KEY, event.participantId);
        set({ participantId: event.participantId, room: event.state, error: null });
      } else if (event.t === 'state') {
        set({ room: event.state });
      } else if (event.t === 'error') {
        set({ error: event.message });
      }
    };

    socket.onclose = () => {
      set({ status: 'closed' });
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    socket.onerror = () => socket?.close();
  }

  function rawSend(action: ClientAction) {
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
    error: null,
    dddiceKey: getLocalKey(),
    dddiceConnected: false,
    castingSpell: null,

    join: (identity) => {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
      set({ identity });
      if (get().status === 'open') {
        rawSend({
          t: 'join',
          name: identity.name,
          participantId: localStorage.getItem(PID_KEY) ?? undefined,
        });
      } else {
        connect();
      }
    },

    send: (action) => rawSend(action),

    setRole: (participantId, role) => rawSend({ t: 'setRole', participantId, role }),

    damageRoll: async (label, damageParts, targetTokenId, attacker) => {
      let external: number[] | undefined;
      if (dddiceActive()) {
        external = [];
        for (const p of damageParts) {
          const ext = await externalRoll(p.dice);
          external.push(ext ? ext.total : rollNotation(p.dice).total);
        }
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
        const cm = conditionAttackMode(tokenConditions(atkTok), tokenConditions(tgtTok));
        const finalMode = combineRollModes(rollMode ?? 'normal', cm.mode);
        notation = d20Check(attackBonus, finalMode);
        if (cm.mode !== 'normal') condNote = ` [${cm.mode === 'advantage' ? 'lợi thế' : 'bất lợi'}: ${cm.reasons.join(', ')}]`;
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
        });
      if (!dddiceActive()) return plain();
      const attack = await externalRoll(notation);
      if (!attack) return plain();

      const token = room?.tokens.find((tk) => tk.id === targetTokenId);
      const linked = room?.sheets.find((s) => s.tokenId === targetTokenId);
      const ac = (token?.armorClass ?? 10) + coverAcBonus(token?.cover);
      const def = mergeDefenses(
        token?.defenses,
        linked ? derivedDefenses(linked) : undefined,
      );
      const critImmune = def?.critImmune ?? false;
      const targetConds = tokenConditions(token);
      const autoCrit =
        targetConds.includes('paralyzed') || targetConds.includes('unconscious');
      const nat20 = attack.d20Natural === 20;
      const fumble = attack.d20Natural === 1;
      const hit = nat20 || (!fumble && attack.total >= ac);
      const effectiveCrit = (nat20 || (hit && autoCrit)) && !critImmune;
      let partTotals: number[] | undefined;
      if (hit) {
        partTotals = [];
        for (const p of damageParts) {
          const n = effectiveCrit ? homebrewCritDamage(p.dice) : p.dice;
          const ext = await externalRoll(n);
          partTotals.push(ext ? ext.total : rollNotation(n).total);
        }
      }
      rawSend({
        t: 'attack',
        label: finalLabel,
        attackNotation: notation,
        damageParts,
        targetTokenId,
        attackerSheetId,
        attackerTokenId,
        external: { attack, crit: effectiveCrit, partTotals },
      });
    },

    applyEffect: (targetTokenId, effect) =>
      rawSend({ t: 'applyEffect', targetTokenId, effect }),
    removeEffect: (tokenId, effectId) => rawSend({ t: 'removeEffect', tokenId, effectId }),
    clearConcentration: (tokenId) => rawSend({ t: 'clearConcentration', tokenId }),

    beginCast: (sheetId, spell) => set({ castingSpell: { sheetId, spell } }),
    cancelCast: () => set({ castingSpell: null }),
    resolveCastOnToken: async (targetTokenId) => {
      const cast = get().castingSpell;
      const room = get().room;
      if (!cast || !room) return;
      const { sheetId, spell } = cast;
      const sheet = room.sheets.find((s) => s.id === sheetId);
      set({ castingSpell: null });
      if (!sheet) return;
      const label = `${sheet.name} · ${spell.name}`;
      const atkBonus = spellAttackBonus(sheet) ?? 0;
      const dc = spell.save?.dcOverride ?? spellSaveDc(sheet) ?? 10;

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
        rawSend({
          t: 'spellSave',
          targetTokenId,
          ability: spell.save.ability,
          dc,
          label,
          sourceSheetId: sheetId,
          damageOnFail: spell.damage && spell.damage.length ? spell.damage : undefined,
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
                expiresRound: spell.effect.expiresInRounds
                  ? (room.initiative.round ?? 1) + spell.effect.expiresInRounds
                  : undefined,
              }
            : undefined,
        });
        return;
      }
      if (spell.castKind === 'attack') {
        await get().attackRoll({
          label,
          attackBonus: atkBonus,
          rollMode: 'normal',
          damageParts: spell.damage ?? [],
          targetTokenId,
          attackerSheetId: sheetId,
          attackerTokenId: sheet.tokenId,
        });
        return;
      }
      // utility: drop a plain effect if the spell defines one
      if (spell.effect) {
        rawSend({
          t: 'applyEffect',
          targetTokenId,
          effect: {
            id: '',
            name: spell.effect.name || spell.name,
            sourceSheetId: sheetId,
            concentration: spell.concentration,
            condition: spell.effect.condition,
            note: spell.effect.note,
          },
        });
      }
    },

    me: () => {
      const { room, participantId } = get();
      return room?.participants.find((p) => p.id === participantId);
    },

    isDm: () => get().me()?.role === 'dm',
    dddiceActive,
  };
});

// auto-connect if identity already known
if (loadIdentity()) {
  useStore.getState().join(loadIdentity()!);
}

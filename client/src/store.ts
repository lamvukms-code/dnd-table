import { create } from 'zustand';
import {
  coverAcBonus,
  d20Check,
  homebrewCritDamage,
  rollNotation,
  type ClientAction,
  type DamagePart,
  type ExternalRoll,
  type Participant,
  type RoomState,
  type ServerEvent,
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
  attackNotation: string;
  damageParts: DamagePart[];
  targetTokenId: string;
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
  damageRoll: (label: string, damageParts: DamagePart[], targetTokenId: string) => Promise<void>;
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

    damageRoll: async (label, damageParts, targetTokenId) => {
      let external: number[] | undefined;
      if (dddiceActive()) {
        external = [];
        for (const p of damageParts) {
          const ext = await externalRoll(p.dice);
          external.push(ext ? ext.total : rollNotation(p.dice).total);
        }
      }
      rawSend({ t: 'damage', label, damageParts, targetTokenId, external });
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

    attackRoll: async ({ label, attackNotation, damageParts, targetTokenId }) => {
      const plain = () =>
        rawSend({ t: 'attack', label, attackNotation, damageParts, targetTokenId });
      if (!dddiceActive()) return plain();
      const attack = await externalRoll(attackNotation);
      if (!attack) return plain();

      const token = get().room?.tokens.find((tk) => tk.id === targetTokenId);
      const ac = (token?.armorClass ?? 10) + coverAcBonus(token?.cover);
      const critImmune = token?.defenses?.critImmune ?? false;
      const nat20 = attack.d20Natural === 20;
      const fumble = attack.d20Natural === 1;
      const effectiveCrit = nat20 && !critImmune;
      const hit = nat20 || (!fumble && attack.total >= ac);
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
        label,
        attackNotation,
        damageParts,
        targetTokenId,
        external: { attack, crit: effectiveCrit, partTotals },
      });
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

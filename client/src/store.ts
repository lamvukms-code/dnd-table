import { create } from 'zustand';
import {
  doubleDiceCounts,
  rollNotation,
  type ClientAction,
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
  role: 'dm' | 'player';
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

interface AttackParams {
  label: string;
  attackNotation: string;
  damageNotation: string;
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
        rawSend({ t: 'join', name: identity.name, role: identity.role, participantId: stored });
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
          role: identity.role,
          participantId: localStorage.getItem(PID_KEY) ?? undefined,
        });
      } else {
        connect();
      }
    },

    send: (action) => rawSend(action),

    setDddiceKey: (key) => {
      persistDddiceKey(key);
      set({ dddiceKey: key, dddiceConnected: false });
    },

    setDddiceConnected: (connected) => set({ dddiceConnected: connected }),

    rollDice: async (label, notation, opts) => {
      const external = await externalRoll(notation);
      rawSend({ t: 'roll', label, notation, private: opts?.private, external: external ?? undefined });
    },

    attackRoll: async ({ label, attackNotation, damageNotation, targetTokenId }) => {
      if (!dddiceActive()) {
        rawSend({ t: 'attack', label, attackNotation, damageNotation, targetTokenId });
        return;
      }
      const attack = await externalRoll(attackNotation);
      if (!attack) {
        rawSend({ t: 'attack', label, attackNotation, damageNotation, targetTokenId });
        return;
      }
      const token = get().room?.tokens.find((tk) => tk.id === targetTokenId);
      const ac = token?.armorClass ?? 10;
      const crit = attack.d20Natural === 20;
      const fumble = attack.d20Natural === 1;
      const hit = crit || (!fumble && attack.total >= ac);
      let damage: ExternalRoll | undefined;
      if (hit) {
        const dmgNotation = crit ? doubleDiceCounts(damageNotation) : damageNotation;
        damage = (await externalRoll(dmgNotation)) ?? undefined;
        // dddice hiccup mid-attack: fall back to a local damage roll so the
        // server still has values to apply.
        if (!damage) {
          const r = rollNotation(dmgNotation);
          damage = { total: r.total, faces: [], source: 'dddice' };
        }
      }
      rawSend({
        t: 'attack',
        label,
        attackNotation,
        damageNotation,
        targetTokenId,
        external: { attack, damage },
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

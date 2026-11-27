// Thin wrapper around dddice-js: one shared 3D engine bound to a canvas, plus
// helpers to log in (activation code or guest), join the table's room and roll an
// equation. Works like the dddice extension for Owlbear Rodeo: every player uses
// their OWN dddice account and rolls with a theme from their own dice box; the DM
// only picks the shared room. API keys live only in this browser (localStorage).
// dddice-js pulls in three.js (~1 MB) — load it lazily so the base app stays light.
import type { ThreeDDice as ThreeDDiceType } from 'dddice-js';
import { normalizeNotation, type ExternalRoll } from '@dnd-table/shared';

type DddiceModule = typeof import('dddice-js');
let modulePromise: Promise<DddiceModule> | null = null;
function loadModule(): Promise<DddiceModule> {
  if (!modulePromise) modulePromise = import('dddice-js');
  return modulePromise;
}

const KEY_LS = 'dnd-table.dddice.apiKey';
const THEME_LS = 'dnd-table.dddice.theme';

export function getLocalKey(): string | null {
  try {
    return localStorage.getItem(KEY_LS);
  } catch {
    return null;
  }
}
export function setLocalKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_LS, key);
    else localStorage.removeItem(KEY_LS);
  } catch {
    /* ignore */
  }
}
export function getLocalThemeOverride(): string | null {
  try {
    return localStorage.getItem(THEME_LS);
  } catch {
    return null;
  }
}
export function setLocalThemeOverride(theme: string | null): void {
  try {
    if (theme) localStorage.setItem(THEME_LS, theme);
    else localStorage.removeItem(THEME_LS);
  } catch {
    /* ignore */
  }
}

interface EngineState {
  engine: ThreeDDiceType;
  canvas: HTMLCanvasElement;
  apiKey: string;
  roomSlug: string;
  /** The themes in this player's dice box (loading starts at connect; a roll waits for it). */
  boxThemes: Promise<string[]>;
}

export interface TablePresence {
  name: string;
  color?: string;
}

let current: EngineState | null = null;

// Rolls whose 3D dice have settled on this screen, and the rollers waiting for that. A roll only
// resolves once its dice land, so a sequence (attack → damage → next attack) plays out in order
// instead of every die of a Multiattack tumbling at once.
const settled = new Set<string>();
const waiters = new Map<string, () => void>();
function onRollFinished(roll: { uuid?: string }) {
  if (!roll?.uuid) return;
  const w = waiters.get(roll.uuid);
  if (w) {
    waiters.delete(roll.uuid);
    w();
  } else {
    settled.add(roll.uuid);
    if (settled.size > 50) settled.delete(settled.values().next().value as string);
  }
}
// When each roll's dice first appeared here (RollCreated: dddice's websocket echo of the roll, after
// its theme is loaded) — only to log where the time goes between "click" and "dice on screen".
const appeared = new Map<string, number>();
function onRollCreated(roll: { uuid?: string }) {
  if (!roll?.uuid) return;
  appeared.set(roll.uuid, performance.now());
  if (appeared.size > 50) appeared.delete(appeared.keys().next().value as string);
}

/** Which theme this player rolls with: their pick if it is still in their dice box, then the box's first. */
function themeOrder(box: string[]): string[] {
  const picked = getLocalThemeOverride();
  return [...new Set([picked && (!box.length || box.includes(picked)) ? picked : null, box[0], picked].filter((t): t is string => !!t))];
}

/** Wait for a roll's dice to land (or `maxMs`, in case the animation never reports back). */
function untilSettled(uuid: string, maxMs = 6000): Promise<void> {
  if (settled.delete(uuid)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters.delete(uuid);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    waiters.set(uuid, done);
  });
}

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
  const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
}

/** (Re)connect the 3D engine. Safe to call repeatedly; no-ops if unchanged. */
export async function connect(
  canvas: HTMLCanvasElement,
  apiKey: string,
  roomSlug: string,
  me?: TablePresence,
): Promise<boolean> {
  if (current && current.canvas === canvas && current.apiKey === apiKey && current.roomSlug === roomSlug) {
    return true;
  }
  teardown();
  try {
    const { ThreeDDice, ThreeDDiceRollEvent } = await loadModule();
    // Become a participant of the table's room first (a fresh account/guest isn't one yet),
    // under this player's table name + colour so their dice are labelled/outlined as them.
    await joinRoom(apiKey, roomSlug, me);
    sizeCanvas(canvas);
    const engine = new ThreeDDice(canvas, apiKey, { autoClear: 3 } as never);
    engine.start();
    engine.connect(roomSlug);
    engine.on(ThreeDDiceRollEvent.RollFinished, onRollFinished as never);
    engine.on(ThreeDDiceRollEvent.RollCreated, onRollCreated as never);
    const boxThemes = listThemes(apiKey)
      .then((t) => t.map((x) => x.id))
      .catch(() => [] as string[]);
    current = { engine, canvas, apiKey, roomSlug, boxThemes };
    // Load this player's dice theme (definition, meshes, textures, sounds) now, not on the first roll:
    // otherwise the first throw of the session waits for all of it before any die shows up.
    void boxThemes.then(async (box) => {
      const id = themeOrder(box)[0];
      if (!id || current?.engine !== engine) return;
      try {
        const { ThreeDDiceAPI } = await loadModule();
        const theme = ((await new ThreeDDiceAPI(apiKey, 'dnd-table').theme.get(id)) as { data: Parameters<ThreeDDiceType['loadTheme']>[0] }).data;
        if (current?.engine !== engine) return;
        engine.loadTheme(theme);
        engine.loadThemeResources(theme.id);
      } catch {
        /* the first roll loads it instead */
      }
    });
    return true;
  } catch (err) {
    console.error('dddice connect failed', err);
    teardown();
    return false;
  }
}

export function teardown(): void {
  if (!current) return;
  try {
    current.engine.disconnect();
    current.engine.stop();
  } catch {
    /* ignore */
  }
  current = null;
}

export function resizeCurrent(): void {
  if (!current) return;
  sizeCanvas(current.canvas);
  try {
    current.engine.resize(current.canvas.width, current.canvas.height);
  } catch {
    /* ignore */
  }
}

export function isConnected(): boolean {
  return current != null;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10) || 0;
  if (Array.isArray(v)) return toNumber(v[0]);
  return 0;
}

/** dddice-js errors are axios errors: the reason dddice gives is in the response body, not `message`. */
export function dddiceErrorText(err: unknown): string {
  const e = err as { message?: string; response?: { status?: number; data?: { message?: string; errors?: Record<string, string[] | string> } } };
  const status = e.response?.status;
  const data = e.response?.data;
  const detail = [data?.message, ...Object.values(data?.errors ?? {}).flat()].filter(Boolean).join(' · ');
  if (status) return `lỗi ${status}${detail ? `: ${detail}` : ''}`;
  return e.message ?? String(err);
}

/**
 * Roll an equation through dddice (animates on every connected client) and
 * return the resolved values in our ExternalRoll shape — once the dice have landed here.
 */
export async function rollEquation(notation: string): Promise<ExternalRoll> {
  if (!current) throw new Error('dddice chưa kết nối');
  const { parseRollEquation } = await loadModule();
  // Always this player's own dice: their pick if it is still in their dice box, else the first
  // theme of the box. (Rolling with a theme the account doesn't own is a 400 from dddice.)
  const themes = themeOrder(await current.boxThemes);
  if (!themes.length) {
    throw new Error('hộp xúc xắc dddice của bạn đang trống: vào dddice.com thêm một bộ xúc xắc (có bộ miễn phí) rồi thử lại');
  }
  let res: unknown;
  const t0 = performance.now();
  for (let i = 0; ; i++) {
    const { dice, operator } = parseRollEquation(normalizeNotation(notation), themes[i]);
    try {
      res = await current.engine.roll(dice, { operator });
      break;
    } catch (err) {
      // a theme that no longer works: try the next one before giving up
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 400 && i + 1 < themes.length) continue;
      throw new Error(dddiceErrorText(err));
    }
  }
  const roll = (res as { data: unknown }).data as {
    uuid: string;
    total_value: unknown;
    values: { value: number; is_dropped: boolean; type: string }[];
  };
  // A flat modifier (e.g. the "+4" in "1d8+4") comes back as its own entry with
  // type 'mod' — a fixed-value placeholder token for the 3D scene, not a rolled die.
  // Excluding it keeps `faces` to only the physical dice, matching what the roll
  // log's per-die breakdown ("8, 4" for 2d6) is meant to show.
  const kept = roll.values.filter((v) => !v.is_dropped && v.type !== 'mod' && typeof v.value === 'number');
  const d20 = roll.values.find((v) => v.type === 'd20' && !v.is_dropped);
  const tApi = performance.now();
  if (roll.uuid) await untilSettled(roll.uuid);
  const shown = roll.uuid ? appeared.get(roll.uuid) : undefined;
  const sec = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
  console.info(
    `[dddice] ${notation}: máy chủ dddice trả lời sau ${sec(tApi - t0)}` +
      (shown ? `, xúc xắc hiện ra sau ${sec(shown - t0)}` : ', không thấy xúc xắc hiện ra') +
      `, dừng lăn sau ${sec(performance.now() - t0)}`,
  );
  return {
    total: toNumber(roll.total_value),
    faces: kept.map((v) => v.value),
    d20Natural: d20 ? d20.value : undefined,
    source: 'dddice',
    rollUuid: roll.uuid,
  };
}

/** Create an anonymous guest API key (no dddice account needed). */
export async function createGuestKey(): Promise<string> {
  const { ThreeDDiceAPI } = await loadModule();
  const api = new ThreeDDiceAPI(undefined, 'dnd-table');
  const res = await api.user.guest();
  return (res as { data: string }).data;
}

export interface Activation {
  code: string;
  expiresAt: string;
  /** Resolves with the new API key once the player approves the code on dddice.com. */
  apiKey: Promise<string | undefined>;
}

/** Log in with a dddice account, like the Owlbear extension: show `code`, the player enters
 *  it at https://dddice.com/activate, and `apiKey` resolves (dddice-js polls every 5 s). */
export async function startActivation(): Promise<Activation> {
  const { ThreeDDiceAPI } = await loadModule();
  const api = new ThreeDDiceAPI(undefined, 'dnd-table');
  const res = await api.user.activate();
  return { code: res.code, expiresAt: res.expiresAt, apiKey: res.apiKey as Promise<string | undefined> };
}

/** Who this key belongs to (for the "đã kết nối: …" line). */
export async function whoAmI(apiKey: string): Promise<{ name: string; guest: boolean }> {
  const json = await apiGet<{ data: { name?: string; username?: string; has_external_accounts?: boolean } }>('/user', apiKey);
  const u = json.data ?? {};
  const name = u.username || u.name || '?';
  return { name, guest: /^guest/i.test(name) || /^guest/i.test(u.name ?? '') };
}

/** Join the room (no-op error if already in it), then set our name/colour there. */
export async function joinRoom(apiKey: string, slug: string, me?: TablePresence): Promise<void> {
  const { ThreeDDiceAPI } = await loadModule();
  const api = new ThreeDDiceAPI(apiKey, 'dnd-table');
  let room: { participants?: { id: number; user?: { uuid: string } }[] } | undefined;
  try {
    room = ((await api.room.join(slug)) as { data: typeof room }).data;
  } catch {
    try {
      room = ((await api.room.get(slug)) as { data: typeof room }).data;
    } catch (err) {
      console.warn('dddice: could not join room', slug, err);
      return;
    }
  }
  if (!me || !room?.participants) return;
  try {
    const user = ((await api.user.get()) as { data: { uuid: string } }).data;
    const p = room.participants.find((x) => x.user?.uuid === user.uuid);
    if (p) await api.room.updateParticipant(slug, p.id, { username: me.name, ...(me.color ? { color: me.color } : {}) });
  } catch {
    /* cosmetic only */
  }
}

/** Create a fresh dddice room with the given key; returns its slug. */
export async function createRoom(apiKey: string): Promise<string> {
  const { ThreeDDiceAPI } = await loadModule();
  const api = new ThreeDDiceAPI(apiKey, 'dnd-table');
  try {
    const res = await api.room.create();
    return (res as { data: { slug: string } }).data.slug;
  } catch (err) {
    // Free / guest accounts get 402 here.
    const msg = String((err as Error).message || err);
    if (/402|payment|subscription/i.test(msg)) {
      throw new Error(
        'Tài khoản dddice free không tạo được room qua API. Hãy tạo room trên dddice.com rồi dán slug, hoặc chọn room có sẵn bên dưới.',
      );
    }
    throw err;
  }
}

const API_BASE = 'https://dddice.com/api/1.0';

async function apiGet<T>(path: string, apiKey: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`dddice API ${r.status}`);
  return (await r.json()) as T;
}

export interface DddiceTheme {
  id: string;
  name: string;
}

/** Themes this API key is actually allowed to roll with. */
export async function listThemes(apiKey: string): Promise<DddiceTheme[]> {
  const json = await apiGet<{ data: { id: string; name?: string }[] }>('/dice-box', apiKey);
  return (json.data ?? []).map((t) => ({ id: t.id, name: t.name || t.id }));
}

export interface DddiceRoom {
  slug: string;
  name: string;
}

/** Rooms this API key can already roll in. */
export async function listRooms(apiKey: string): Promise<DddiceRoom[]> {
  const json = await apiGet<{ data: { slug: string; name?: string }[] }>('/room', apiKey);
  return (json.data ?? []).map((r) => ({ slug: r.slug, name: r.name || r.slug }));
}

// Thin wrapper around dddice-js: one shared 3D engine bound to a canvas, plus
// helpers to create a guest key / room and to roll an equation and read back the
// resolved values. API keys live only in this browser (localStorage).
// dddice-js pulls in three.js (~1 MB) — load it lazily so the base app stays light.
import type { ThreeDDice as ThreeDDiceType } from 'dddice-js';
import type { ExternalRoll } from '@dnd-table/shared';

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
  theme: string;
}

let current: EngineState | null = null;

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
  theme: string,
): Promise<boolean> {
  if (
    current &&
    current.canvas === canvas &&
    current.apiKey === apiKey &&
    current.roomSlug === roomSlug
  ) {
    if (current.theme !== theme) current.theme = theme;
    return true;
  }
  teardown();
  try {
    const { ThreeDDice } = await loadModule();
    sizeCanvas(canvas);
    const engine = new ThreeDDice(canvas, apiKey, { autoClear: 3 } as never);
    engine.start();
    engine.connect(roomSlug);
    current = { engine, canvas, apiKey, roomSlug, theme };
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

/**
 * Roll an equation through dddice (animates on every connected client) and
 * return the resolved values in our ExternalRoll shape.
 */
export async function rollEquation(notation: string): Promise<ExternalRoll> {
  if (!current) throw new Error('dddice chưa kết nối');
  const { parseRollEquation } = await loadModule();
  const theme = getLocalThemeOverride() || current.theme || 'dddice-standard';
  const { dice, operator } = parseRollEquation(notation, theme);
  const res = await current.engine.roll(dice, { operator });
  const roll = (res as { data: unknown }).data as {
    uuid: string;
    total_value: unknown;
    values: { value: number; is_dropped: boolean; type: string }[];
  };
  const kept = roll.values.filter((v) => !v.is_dropped && typeof v.value === 'number');
  const d20 = roll.values.find((v) => v.type === 'd20' && !v.is_dropped);
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

/** Create a fresh dddice room with the given key; returns its slug. */
export async function createRoom(apiKey: string): Promise<string> {
  const { ThreeDDiceAPI } = await loadModule();
  const api = new ThreeDDiceAPI(apiKey, 'dnd-table');
  const res = await api.room.create();
  return (res as { data: { slug: string } }).data.slug;
}

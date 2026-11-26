import type { RollLogEntry, RoomState } from './types.js';

/**
 * Delta sync for state pushes. A full `state` push re-sends everything after every action — mostly
 * the 200-line roll log, unchanged — and every client re-parses and re-compares all of it. Instead
 * the server remembers, per socket, the JSON it last sent for each top-level key and sends only the
 * keys whose JSON changed; the roll log goes as "drop the N oldest, append these" when it only grew
 * at the end (the usual case). The client applies the patch onto the room it holds.
 *
 * The JSON fragments are compared as strings, so this is exact whether the server mutated an object
 * in place or replaced it.
 */

/** Per-key JSON of one client's view of the room (what it was / will be sent). */
export interface ViewJson {
  keys: Map<string, string>;
  /** Roll log entries, by position: ids and JSON. */
  logIds: string[];
  logJson: string[];
}

export interface StatePatch {
  /** Keys whose value changed (full new value). */
  set?: Partial<RoomState>;
  /** Keys that are gone. */
  unset?: string[];
  /** Roll log: drop the `drop` oldest entries, then append `add`. */
  log?: { drop: number; add: RollLogEntry[] };
}

/** JSON of every top-level key of a view (the roll log entry by entry). */
export function viewJson(state: RoomState): ViewJson {
  const keys = new Map<string, string>();
  for (const [k, v] of Object.entries(state)) {
    if (k === 'rollLog' || v === undefined) continue;
    keys.set(k, JSON.stringify(v));
  }
  const log = state.rollLog ?? [];
  return { keys, logIds: log.map((e) => e.id), logJson: log.map((e) => JSON.stringify(e)) };
}

/** A copy of `base` with some keys replaced (e.g. a player's own `sheets`) — no re-stringify of the rest. */
export function withKeys(base: ViewJson, replace: Record<string, string>): ViewJson {
  const keys = new Map(base.keys);
  for (const [k, v] of Object.entries(replace)) keys.set(k, v);
  return { keys, logIds: base.logIds, logJson: base.logJson };
}

/** How the new log follows from the old one: entries dropped from the front, then appended (null = not that shape). */
export function logDelta(prevIds: string[], prevJson: string[], ids: string[], json: string[]): { drop: number; add: number } | null {
  if (!prevIds.length) return ids.length ? { drop: 0, add: ids.length } : { drop: 0, add: 0 };
  if (!ids.length) return null;
  const drop = prevIds.indexOf(ids[0]);
  if (drop < 0) return null;
  const kept = prevIds.length - drop;
  if (kept > ids.length) return null;
  for (let i = 0; i < kept; i++) if (ids[i] !== prevIds[drop + i] || json[i] !== prevJson[drop + i]) return null;
  return { drop, add: ids.length - kept };
}

/**
 * The `patch` event (as a JSON string) that turns what the client got last (`prev`) into `next`, or
 * null when nothing changed. Built from the cached fragments — nothing is stringified again.
 */
export function patchMessage(prev: ViewJson, next: ViewJson): string | null {
  const set: string[] = [];
  for (const [k, v] of next.keys) if (prev.keys.get(k) !== v) set.push(`${JSON.stringify(k)}:${v}`);
  const unset: string[] = [];
  for (const k of prev.keys.keys()) if (!next.keys.has(k)) unset.push(k);
  let log = '';
  const d = logDelta(prev.logIds, prev.logJson, next.logIds, next.logJson);
  if (!d) set.push(`"rollLog":[${next.logJson.join(',')}]`);
  else if (d.drop || d.add) log = `{"drop":${d.drop},"add":[${next.logJson.slice(next.logJson.length - d.add).join(',')}]}`;
  if (!set.length && !unset.length && !log) return null;
  const parts = ['"t":"patch"'];
  if (set.length) parts.push(`"set":{${set.join(',')}}`);
  if (unset.length) parts.push(`"unset":${JSON.stringify(unset)}`);
  if (log) parts.push(`"log":${log}`);
  return `{${parts.join(',')}}`;
}

/** Client side: the room after a patch (unchanged keys keep their identity). */
export function applyPatch(room: RoomState, patch: StatePatch): RoomState {
  const next = { ...room, ...(patch.set ?? {}) } as RoomState & Record<string, unknown>;
  for (const k of patch.unset ?? []) delete next[k];
  if (patch.log) next.rollLog = room.rollLog.slice(patch.log.drop).concat(patch.log.add);
  return next;
}

import type { CharacterSheet } from './types.js';

/** Structural equality for plain JSON values (sheets only hold JSON data). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    // undefined and a missing key are the same thing once the sheet goes through JSON
    return a === undefined && b === undefined;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!jsonEqual(ao[k], bo[k])) return false;
  return true;
}

/**
 * Three-way merge of a client's sheet edit (field by top-level field). `base` is the server copy the
 * client's edit started from. A field the client did not touch (incoming == base) keeps the server's
 * current value, so a stale draft can't undo what the server changed meanwhile (damage taken, a rider
 * disarmed on a hit, a level-up). A field the client did change wins, as before.
 */
export function mergeSheetEdit(server: CharacterSheet, base: CharacterSheet, incoming: CharacterSheet): CharacterSheet {
  const out: Record<string, unknown> = { ...server };
  const inc = incoming as unknown as Record<string, unknown>;
  const bas = base as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(inc), ...Object.keys(bas)]);
  for (const k of keys) {
    if (jsonEqual(inc[k], bas[k])) continue;
    if (inc[k] === undefined) delete out[k];
    else out[k] = inc[k];
  }
  return out as unknown as CharacterSheet;
}

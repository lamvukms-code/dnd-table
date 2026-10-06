/**
 * Structural sharing for freshly parsed server state: wherever `next` is deeply equal to `prev`,
 * return the `prev` object itself. Every WebSocket push is parsed into brand-new objects, which
 * would otherwise make every selector (`s.room.sheets`, `s.room.tokens`, …) look "changed" and
 * re-render its component even when that slice did not change. With sharing, a token drag only
 * produces a new `tokens` array — sheets, homebrew, the roll log etc. keep their identity, so
 * components subscribed to them (and `React.memo` children) skip rendering entirely.
 */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (prev === null || next === null || typeof prev !== 'object' || typeof next !== 'object') return next;

  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      // Entities carry an `id`: match by id so inserting/removing one element doesn't defeat sharing for the rest.
      let hit: unknown = prev[i];
      if (item && typeof item === 'object' && 'id' in item) {
        const id = (item as { id?: unknown }).id;
        // Same position almost always matches (appends / in-place edits); only scan on a miss.
        if (!(hit && typeof hit === 'object' && (hit as { id?: unknown }).id === id)) {
          hit = prev.find((p) => p && typeof p === 'object' && (p as { id?: unknown }).id === id);
        }
      }
      const shared = shareStructure(hit, item);
      if (shared !== prev[i]) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }

  if (Array.isArray(prev)) return next;
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const nKeys = Object.keys(n);
  let same = Object.keys(p).length === nKeys.length;
  const out: Record<string, unknown> = {};
  for (const k of nKeys) {
    const shared = shareStructure(p[k], n[k]);
    if (shared !== p[k]) same = false;
    out[k] = shared;
  }
  return (same ? prev : out) as T;
}

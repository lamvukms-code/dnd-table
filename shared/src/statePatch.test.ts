import { describe, expect, it } from 'vitest';
import type { RollLogEntry, RoomState } from './types.js';
import { applyPatch, logDelta, patchMessage, viewJson, withKeys, type StatePatch } from './statePatch.js';

const entry = (id: string, label = id): RollLogEntry =>
  ({ id, ts: 1, actorId: 'a', actorName: 'A', label, result: { notation: '1d20', terms: [], total: 10 } }) as RollLogEntry;

const room = (extra: Record<string, unknown> = {}): RoomState =>
  ({
    rev: 1,
    name: 'Bàn',
    participants: [],
    tokens: [{ id: 't1', label: 'Goblin', x: 1, y: 1 }],
    sheets: [],
    rollLog: [entry('e1'), entry('e2')],
    ...extra,
  }) as unknown as RoomState;

const parse = (msg: string | null) => (msg ? (JSON.parse(msg) as StatePatch & { t: string }) : null);

describe('state patches', () => {
  it('sends only changed keys and appended log lines', () => {
    const a = room();
    const b = room({ rev: 2, rollLog: [entry('e1'), entry('e2'), entry('e3')] });
    const p = parse(patchMessage(viewJson(a), viewJson(b)))!;
    expect(p.t).toBe('patch');
    expect(Object.keys(p.set!)).toEqual(['rev']);
    expect(p.log).toEqual({ drop: 0, add: [entry('e3')] });
    const out = applyPatch(a, p);
    expect(out).toEqual(b);
    expect(out.tokens).toBe(a.tokens); // untouched keys keep their identity
  });

  it('handles the capped log (oldest dropped), edits in place, removed keys, and no-ops', () => {
    expect(logDelta(['a', 'b', 'c'], ['A', 'B', 'C'], ['b', 'c', 'd'], ['B', 'C', 'D'])).toEqual({ drop: 1, add: 1 });
    expect(logDelta(['a', 'b'], ['A', 'B'], ['a', 'b'], ['A', 'B2'])).toBeNull(); // an entry was edited
    expect(logDelta(['a', 'b'], ['A', 'B'], ['x'], ['X'])).toBeNull(); // replaced
    expect(logDelta([], [], ['a'], ['A'])).toEqual({ drop: 0, add: 1 });
    const a = room({ recording: { since: 5 } });
    const b = room({ rollLog: [entry('e1'), entry('e2', 'edited')] });
    const p = parse(patchMessage(viewJson(a), viewJson(b)))!;
    expect(p.unset).toEqual(['recording']);
    expect(p.set?.rollLog).toEqual(b.rollLog); // not an append: full log
    expect(applyPatch(a, p)).toEqual(b);
    expect(patchMessage(viewJson(b), viewJson(room({ rollLog: b.rollLog })))).toBeNull();
  });

  it('per-player views swap one key without re-stringifying', () => {
    const base = viewJson(room());
    const mine = withKeys(base, { sheets: JSON.stringify([{ id: 's1' }]) });
    expect(base.keys.get('sheets')).toBe('[]');
    expect(mine.keys.get('sheets')).toBe('[{"id":"s1"}]');
    expect(mine.keys.get('tokens')).toBe(base.keys.get('tokens'));
  });

  it('random edits: the client always ends up with exactly the server state', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let server = room();
    let client = JSON.parse(JSON.stringify(server)) as RoomState;
    let sent = viewJson(server);
    let n = 3;
    for (let step = 0; step < 400; step++) {
      const s = JSON.parse(JSON.stringify(server)) as RoomState & Record<string, unknown>;
      const r = rnd();
      if (r < 0.35) s.rollLog = [...s.rollLog, entry(`e${n++}`)].slice(-5); // roll, capped at 5
      else if (r < 0.5 && s.rollLog.length) s.rollLog[Math.floor(rnd() * s.rollLog.length)].label = `x${step}`; // edit a line
      else if (r < 0.7) (s.tokens[0] as { x: number }).x = Math.floor(rnd() * 20); // token move
      else if (r < 0.8) s.recording = rnd() < 0.5 ? { since: step } : undefined;
      else if (r < 0.9) s.rollLog = []; // log cleared
      s.rev = step + 2;
      const nextView = viewJson(s);
      const msg = patchMessage(sent, nextView);
      if (msg) client = applyPatch(client, JSON.parse(msg));
      sent = nextView;
      server = JSON.parse(JSON.stringify(s));
      expect(JSON.parse(JSON.stringify(client))).toEqual(server);
    }
  });
});

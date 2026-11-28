import { useEffect, useRef } from 'react';
import type { RollLogEntry } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nativeDiceEnabled } from '../dice3d/hold.js';
import type { DieSpec } from '../dice3d/stage.js';

/**
 * Native 3D dice: every new roll in the log (the server's result) is thrown over the map for everyone
 * who can see that roll, landing on its real numbers. Renders nothing itself — the 3D stage is a
 * canvas over the map, loaded (with three.js) only once dice are first needed. When the table uses
 * dddice, dddice draws the dice instead.
 * Mounted before the effects layer so the hit / spell effects wait for the dice to land.
 */
type Stage = typeof import('../dice3d/stage.js');
let stage: Stage | null = null;
let loading: Promise<Stage> | null = null;
function loadStage(): Promise<Stage> {
  loading ??= import('../dice3d/stage.js').then((m) => (stage = m));
  return loading;
}

function diceOf(entry: RollLogEntry): DieSpec[] {
  const out: DieSpec[] = [];
  for (const t of entry.result?.terms ?? []) {
    if (t.kind !== 'dice') continue;
    for (const r of t.rolls ?? []) out.push({ sides: r.sides, value: r.value, dropped: !r.kept });
  }
  return out;
}

export function DiceLayer() {
  const log = useStore((s) => s.room?.rollLog);
  const participants = useStore((s) => s.room?.participants);
  const dddice = useStore((s) => s.dddiceActive());
  const seen = useRef<Set<string> | null>(null);

  // warm the 3D code up front so the first roll isn't late
  useEffect(() => {
    if (nativeDiceEnabled() && !dddice) void loadStage();
  }, [dddice]);

  useEffect(() => {
    if (!log) return;
    if (!seen.current) {
      seen.current = new Set(log.map((l) => l.id));
      return;
    }
    const fresh = log.filter((l) => !seen.current!.has(l.id));
    for (const l of fresh) seen.current.add(l.id);
    if (seen.current.size > 400) seen.current = new Set(log.map((l) => l.id));
    if (dddice || !nativeDiceEnabled()) return;
    for (const entry of fresh) {
      if (Date.now() - entry.ts > 8000) continue;
      const dice = diceOf(entry);
      if (!dice.length) continue;
      const color = participants?.find((p) => p.id === entry.actorId)?.color ?? '#8a6a3a';
      if (stage) stage.throwDice(dice, color);
      else void loadStage().then((m) => m.throwDice(dice, color));
    }
  }, [log, dddice, participants]);

  return null;
}

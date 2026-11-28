import { useEffect, useRef, useState } from 'react';
import type { Token, TokenSize } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { eventsFor, fxDelay, playFx, vfxEnabled, type Element, type FxEvent } from '../sfx.js';

/**
 * Visual effects on the battle map for each attack / spell / heal in the roll log: a projectile
 * from the attacker for shots and spells, a cue-shaped mark on the target (slash, claw rake, bite,
 * impact star, thrust), an element burst, the damage number, "Trượt" on a miss, a flash on a crit.
 * The same events feed the sound queue (sfx.ts), and each visual waits for its sound.
 */

const SPAN: Record<TokenSize, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ff7a1a',
  cold: '#8fe3ff',
  lightning: '#c9b8ff',
  thunder: '#7aa0ff',
  acid: '#9be564',
  poison: '#5fd068',
  necrotic: '#8a4fd0',
  radiant: '#ffe680',
  force: '#d0a8ff',
  psychic: '#ff7ad9',
};

interface Vfx {
  key: string;
  e: FxEvent;
  /** Target centre and attacker centre (px). */
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  size: number;
}

export function VfxLayer({ cell, tokens, visible }: { cell: number; tokens: Token[]; visible: (t: Token) => boolean }) {
  const log = useStore((s) => s.room?.rollLog);
  const [items, setItems] = useState<Vfx[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const visRef = useRef(visible);
  visRef.current = visible;

  useEffect(() => {
    if (!log) return;
    // first render: what is already in the log has happened before we arrived
    if (!seen.current) {
      seen.current = new Set(log.map((l) => l.id));
      return;
    }
    const fresh = log.filter((l) => !seen.current!.has(l.id));
    for (const l of fresh) seen.current.add(l.id);
    if (seen.current.size > 400) seen.current = new Set(log.map((l) => l.id));
    for (const entry of fresh) {
      if (Date.now() - entry.ts > 8000) continue;
      for (const e of eventsFor(entry)) {
        const toks = tokensRef.current;
        const tgt = toks.find((t) => t.id === e.to);
        const src = toks.find((t) => t.id === e.from);
        // nothing this viewer can see: no sound, no picture
        if (!(tgt && visRef.current(tgt)) && !(src && visRef.current(src))) continue;
        playFx(e);
        if (!vfxEnabled() || !tgt || !visRef.current(tgt)) continue;
        const c = (t: Token) => ({ x: (t.x + SPAN[t.size] / 2) * cell, y: (t.y + SPAN[t.size] / 2) * cell });
        const p = c(tgt);
        const q = src && src.id !== tgt.id ? c(src) : undefined;
        const item: Vfx = { key: `${e.id}-${Math.random().toString(36).slice(2, 6)}`, e, x: p.x, y: p.y, fx: q?.x, fy: q?.y, size: SPAN[tgt.size] * cell };
        const wait = Math.max(0, fxDelay() - 0.22) * 1000;
        window.setTimeout(() => {
          setItems((xs) => [...xs.slice(-24), item]);
          window.setTimeout(() => setItems((xs) => xs.filter((x) => x.key !== item.key)), 1300);
        }, wait);
      }
    }
  }, [log, cell]);

  return (
    <div className="vfx-layer">
      {items.map((v) => (
        <VfxItem key={v.key} v={v} />
      ))}
    </div>
  );
}

function VfxItem({ v }: { v: Vfx }) {
  const { e } = v;
  const color = e.element ? ELEMENT_COLOR[e.element] : e.heal ? '#7dffb0' : '#fff';
  const ranged = e.cue === 'arrow' || e.cue === 'thrown' || e.cue === 'spell';
  // launch: a projectile toward the target for shots / spells, a swipe for melee; a miss says so
  if (e.phase === 'launch') {
    return (
      <>
        {ranged && v.fx != null && v.fy != null && (
          <div
            className={`vfx-proj ${e.cue === 'spell' ? 'orb' : 'arrow'}`}
            style={
              {
                left: v.fx,
                top: v.fy,
                '--dx': `${v.x - v.fx}px`,
                '--dy': `${v.y - v.fy!}px`,
                '--ang': `${Math.atan2(v.y - v.fy!, v.x - v.fx)}rad`,
                '--c': color,
              } as React.CSSProperties
            }
          />
        )}
        {e.hit === false && (
          <div className="vfx-text miss" style={{ left: v.x, top: v.y - v.size / 2 }}>
            Trượt
          </div>
        )}
        {e.crit && <div className="vfx-crit" style={{ left: v.x, top: v.y, width: v.size * 1.8, height: v.size * 1.8 }} />}
      </>
    );
  }
  // impact: the mark of what hit, the element burst, the number
  const s = v.size;
  return (
    <>
      {!e.heal && <Mark cue={e.cue} x={v.x} y={v.y} s={s} />}
      {(e.element || e.heal) && (
        <div className={`vfx-burst ${e.heal ? 'heal' : ''}`} style={{ left: v.x, top: v.y, width: s * 1.6, height: s * 1.6, '--c': color } as React.CSSProperties}>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ '--a': `${(i / 8) * 360 + Math.random() * 20}deg` } as React.CSSProperties} />
          ))}
        </div>
      )}
      {e.amount != null && e.amount > 0 && (
        <div className={`vfx-text ${e.heal ? 'heal' : 'dmg'} ${e.crit || e.amount >= 20 ? 'big' : ''}`} style={{ left: v.x, top: v.y - s / 2 }}>
          {e.heal ? '+' : '−'}
          {e.amount}
        </div>
      )}
    </>
  );
}

/** The mark a hit leaves, by what hit: slash, claw rake, bite, impact star, thrust. */
function Mark({ cue, x, y, s }: { cue: FxEvent['cue']; x: number; y: number; s: number }) {
  const box = { left: x - s / 2, top: y - s / 2, width: s, height: s };
  if (cue === 'slash')
    return (
      <svg className="vfx-mark slash" style={box} viewBox="0 0 100 100">
        <path d="M15 85 Q50 50 88 12" />
      </svg>
    );
  if (cue === 'claw')
    return (
      <svg className="vfx-mark claw" style={box} viewBox="0 0 100 100">
        <path d="M22 18 L48 86" />
        <path d="M42 12 L66 84" />
        <path d="M62 10 L84 78" />
      </svg>
    );
  if (cue === 'bite')
    return (
      <svg className="vfx-mark bite" style={box} viewBox="0 0 100 100">
        <path className="jaw top" d="M10 40 L22 52 L32 40 L42 52 L52 40 L62 52 L72 40 L82 52 L92 40" />
        <path className="jaw bottom" d="M10 62 L22 50 L32 62 L42 50 L52 62 L62 50 L72 62 L82 50 L92 62" />
      </svg>
    );
  if (cue === 'pierce' || cue === 'arrow' || cue === 'thrown')
    return (
      <svg className="vfx-mark pierce" style={box} viewBox="0 0 100 100">
        <path d="M10 50 L90 50" />
        <circle cx="70" cy="50" r="10" />
      </svg>
    );
  if (cue === 'slam' || cue === 'punch')
    return (
      <svg className="vfx-mark slam" style={box} viewBox="0 0 100 100">
        <path d="M50 8 L58 38 L90 30 L64 52 L86 80 L54 66 L44 94 L38 64 L8 74 L30 50 L10 22 L42 36 Z" />
      </svg>
    );
  return null;
}

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { d20Check, type RollLogEntry } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { DddiceAccount } from './DddiceAccount.js';

const QUICK = [20, 12, 10, 8, 6, 4, 100];
const OPEN_KEY = 'dnd-table.diceOpen';
const TOAST_MS = 4000;

/** One-line outcome of a roll, for the toast and the collapsed button. */
function outcome(e: RollLogEntry): { text: string; cls: 'hit' | 'miss' | '' } {
  if (e.attack) {
    const verdict = e.attack.crit ? 'CHÍ MẠNG' : e.attack.hit ? 'TRÚNG' : 'TRƯỢT';
    const ac = typeof e.attack.targetAc === 'number' ? ` vs AC ${e.attack.targetAc}` : '';
    return { text: `${e.actorName} → ${e.attack.targetName}: ${verdict} ${e.result.total}${ac}`, cls: e.attack.hit ? 'hit' : 'miss' };
  }
  if (e.damage) {
    const type = e.damage.damageType ? ` ${e.damage.damageType}` : '';
    return { text: `${e.damage.targetName}: −${e.damage.amount} HP${type} (${e.actorName})`, cls: 'hit' };
  }
  return { text: `${e.actorName} · ${e.label}: ${e.result.total}`, cls: '' };
}

/** Dice tray in the top-left action bar (like dddice in Owlbear): the 🎲 button shows the last
 *  result and drops down the tray — quick dice and notation on top, history (newest first) under.
 *  Open state is remembered per browser; while closed, new results pop up as toasts at the bottom
 *  centre of the map so hits/misses and damage are still seen. */
function DiceWindowImpl() {
  const send = useStore((s) => s.send);
  const rollDice = useStore((s) => s.rollDice);
  const isDm = useStore((s) => s.isDm());
  const log = useStore((s) => s.room?.rollLog ?? []);
  const dddiceActive = useStore((s) => s.dddiceActive());
  const dddiceOn = useStore((s) => s.room?.dddice.enabled ?? false);
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  // Picking another toolbar control (a menu, a tool flyout) closes the tray so the two never stack.
  // Clicks on the map or the sheet leave it open, so rolls can be watched while playing.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest('.hud-dice')) return;
      if (t.closest('.map-tools, .hud-actions')) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  const [notation, setNotation] = useState('1d20');
  const [mode, setMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [priv, setPriv] = useState(false);

  const entries = useMemo(
    () => [...log].reverse().filter((e) => !e.private || isDm),
    [log, isDm],
  );

  // Toasts for entries that arrive while we're mounted (never the history present on load).
  const [toasts, setToasts] = useState<RollLogEntry[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seenRef.current) {
      seenRef.current = new Set(entries.map((e) => e.id));
      return;
    }
    const fresh = entries.filter((e) => !seenRef.current!.has(e.id));
    for (const e of entries) seenRef.current.add(e.id);
    if (!fresh.length) return;
    setToasts((t) => [...fresh.slice(0, 3).reverse(), ...t].slice(0, 3));
    const ids = new Set(fresh.map((e) => e.id));
    // Not cleared on the next run: a burst of rolls must not keep earlier toasts up forever.
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), TOAST_MS);
  }, [entries]);

  function roll(n: string, label: string) {
    void rollDice(label, n, { private: priv });
  }

  const last = entries[0] ? outcome(entries[0]) : null;
  return (
    <div className="hud-dice">
      <button
        className={open ? 'on' : ''}
        title={open ? 'Đóng khay xúc xắc' : 'Mở khay xúc xắc và lịch sử roll'}
        onClick={() => setOpen(!open)}
      >
        🎲
        {last && (
          <span className={`fab-last ${last.cls}`}>
            {entries[0].attack ? (entries[0].attack.hit ? '✔ ' : '✘ ') : ''}
            {entries[0].result.total}
          </span>
        )}
      </button>
      {!open && toasts.length > 0 && (
        <div className="roll-toasts" onClick={() => setOpen(true)} title="Bấm để mở lịch sử">
          {toasts.map((e) => {
            const o = outcome(e);
            return (
              <div key={e.id} className={`roll-toast ${o.cls}`}>
                {o.text}
              </div>
            );
          })}
        </div>
      )}
      {open && (
    <div className="dice-window">
      <div className="dw-head">
        <span>🎲 Xúc xắc{dddiceActive ? ' · 3D' : ''}</span>
        <button className="link" onClick={() => setOpen(false)} title="Đóng">
          ✕
        </button>
      </div>

      {dddiceOn && <DddiceAccount compact />}
      <div className="dw-body">
        <div className="dw-controls">
          <div className="quick-dice">
            {QUICK.map((d) => (
              <button key={d} onClick={() => roll(`1d${d}`, `d${d}`)}>
                d{d}
              </button>
            ))}
          </div>

          <div className="roll-form">
            <input
              value={notation}
              onChange={(e) => setNotation(e.target.value)}
              placeholder="vd 2d6+8, 4d6kh3"
              onKeyDown={(e) => e.key === 'Enter' && roll(notation, notation)}
            />
            <button onClick={() => roll(notation, notation)}>Tung</button>
          </div>

          <div className="d20-check">
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="normal">Thường</option>
              <option value="advantage">Lợi thế</option>
              <option value="disadvantage">Bất lợi</option>
            </select>
            <button onClick={() => roll(d20Check(0, mode), `d20 (${mode})`)}>d20</button>
            {isDm && (
              <label className="priv-toggle" title="Roll riêng (chỉ DM thấy)">
                <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
                riêng
              </label>
            )}
          </div>
        </div>
        <div className="log-head">
          <h4>Lịch sử (mới nhất trên cùng)</h4>
          {isDm && (
            <button
              className="link"
              onClick={() => window.confirm('Xóa lịch sử roll của cả bàn?') && send({ t: 'clearLog' })}
            >
              Xóa
            </button>
          )}
        </div>
        <ul className="roll-log">
          {entries.map((e) => (
            <li
              key={e.id}
              className={e.attack ? (e.attack.hit ? 'hit' : 'miss') : e.damage ? 'hit' : ''}
            >
              <div className="rl-top">
                <span className="rl-actor">{e.actorName}</span>
                <span className="rl-label">{e.label}</span>
                {e.private && <span className="rl-priv">riêng</span>}
              </div>
              <div className="rl-body">
                <span className="rl-total">{e.result.total}</span>
                <span className="rl-detail">
                  {e.result.terms
                    .map((t) =>
                      t.kind === 'flat'
                        ? `${t.sign < 0 ? '−' : '+'}${t.subtotal}`
                        : `${t.rolls!.map((r) => (r.kept ? r.value : `(${r.value})`)).join(',')}`,
                    )
                    .join(' ')}
                </span>
                {e.result.d20?.isCrit && (
                  <span className="crit">
                    {e.attack
                      ? 'CHÍ MẠNG'
                      : e.checkNat === 'success'
                        ? 'THÀNH CÔNG TUYỆT ĐỐI'
                        : '20 TỰ NHIÊN'}
                  </span>
                )}
                {e.result.d20?.isFumble && (
                  <span className="fumble">
                    {e.attack
                      ? 'HỎNG'
                      : e.checkNat === 'fail'
                        ? 'THẤT BẠI THẢM HẠI'
                        : '1 TỰ NHIÊN'}
                  </span>
                )}
              </div>
              {e.attack && (
                <div className="rl-attack">
                  → {e.attack.targetName}
                  {typeof e.attack.targetAc === 'number' ? ` (AC ${e.attack.targetAc})` : ''}:{' '}
                  <strong>
                    {e.attack.crit ? 'CHÍ MẠNG' : e.attack.hit ? 'TRÚNG' : 'TRƯỢT'}
                  </strong>
                </div>
              )}
              {e.damage && (
                <div className="rl-attack">
                  → {e.damage.targetName}: <strong>−{e.damage.amount} HP</strong>
                  {typeof e.damage.raw === 'number' && e.damage.raw !== e.damage.amount && (
                    <span className="rl-dmg-raw"> (gốc {e.damage.raw})</span>
                  )}
                  {e.damage.damageType && (
                    <span className="rl-dmg-type"> · {e.damage.damageType}</span>
                  )}
                  {e.damage.notes?.map((n) => (
                    <span key={n} className="rl-dmg-note"> · {n}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {entries.length === 0 && <li className="empty">Chưa có roll nào.</li>}
        </ul>
      </div>
    </div>
      )}
    </div>
  );
}

/** Memoised: takes no props, so it only re-renders when its own store selectors change. */
export const DiceWindow = memo(DiceWindowImpl);

import { useMemo, useState } from 'react';
import { d20Check } from '@dnd-table/shared';
import { useStore } from '../store.js';

const QUICK = [20, 12, 10, 8, 6, 4, 100];

/** Small floating window, bottom-left of the map: manual rolls + roll history. */
export function DiceWindow() {
  const send = useStore((s) => s.send);
  const rollDice = useStore((s) => s.rollDice);
  const isDm = useStore((s) => s.isDm());
  const log = useStore((s) => s.room?.rollLog ?? []);
  const dddiceActive = useStore((s) => s.dddiceActive());
  const [open, setOpen] = useState(true);
  const [notation, setNotation] = useState('1d20');
  const [mode, setMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [priv, setPriv] = useState(false);

  const entries = useMemo(
    () => [...log].reverse().filter((e) => !e.private || isDm),
    [log, isDm],
  );

  function roll(n: string, label: string) {
    void rollDice(label, n, { private: priv });
  }

  if (!open) {
    return (
      <button className="dice-window-fab" title="Xúc xắc" onClick={() => setOpen(true)}>
        🎲{entries[0] ? <span className="fab-last">{entries[0].result.total}</span> : null}
      </button>
    );
  }

  return (
    <div className="dice-window">
      <div className="dw-head">
        <span>🎲 Xúc xắc{dddiceActive ? ' · 3D' : ''}</span>
        <button className="link" onClick={() => setOpen(false)} title="Thu gọn">
          –
        </button>
      </div>

      <div className="dw-body">
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

        <div className="log-head">
          <h4>Lịch sử</h4>
          {isDm && (
            <button className="link" onClick={() => send({ t: 'clearLog' })}>
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
                {e.result.d20?.isCrit && <span className="crit">CHÍ MẠNG</span>}
                {e.result.d20?.isFumble && <span className="fumble">HỎNG</span>}
              </div>
              {e.attack && (
                <div className="rl-attack">
                  → {e.attack.targetName} (AC {e.attack.targetAc}):{' '}
                  <strong>
                    {e.attack.crit ? 'CHÍ MẠNG' : e.attack.hit ? 'TRÚNG' : 'TRƯỢT'}
                  </strong>
                </div>
              )}
              {e.damage && (
                <div className="rl-attack">
                  → {e.damage.targetName}: <strong>−{e.damage.amount} HP</strong>
                </div>
              )}
            </li>
          ))}
          {entries.length === 0 && <li className="empty">Chưa có roll nào.</li>}
        </ul>
      </div>
    </div>
  );
}

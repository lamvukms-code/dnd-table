import { useMemo, useState } from 'react';
import { d20Check } from '@dnd-table/shared';
import { useStore } from '../store.js';

const QUICK = [20, 12, 10, 8, 6, 4, 100];

export function DicePanel() {
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const log = useStore((s) => s.room?.rollLog ?? []);
  const [notation, setNotation] = useState('1d20');
  const [mode, setMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [priv, setPriv] = useState(false);

  const entries = useMemo(() => [...log].reverse(), [log]);

  function roll(n: string, label: string) {
    send({ t: 'roll', label, notation: n, private: priv });
  }

  return (
    <div className="dice-panel">
      <h3>Xúc xắc</h3>
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
          placeholder="vd 2d6+3, 4d6kh3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') roll(notation, notation);
          }}
        />
        <button onClick={() => roll(notation, notation)}>Tung</button>
      </div>

      <div className="d20-check">
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="normal">Thường</option>
          <option value="advantage">Lợi thế</option>
          <option value="disadvantage">Bất lợi</option>
        </select>
        <button onClick={() => roll(d20Check(0, mode), `d20 (${mode})`)}>Kiểm tra d20</button>
      </div>

      <label className="priv-toggle">
        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
        Roll riêng (chỉ DM){!isDm && ' — cần vai trò DM'}
      </label>

      <div className="log-head">
        <h4>Nhật ký roll</h4>
        {isDm && (
          <button className="link" onClick={() => send({ t: 'clearLog' })}>
            Xóa
          </button>
        )}
      </div>
      <ul className="roll-log">
        {entries.map((e) => (
          <li key={e.id} className={e.attack ? (e.attack.hit ? 'hit' : 'miss') : ''}>
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
          </li>
        ))}
        {entries.length === 0 && <li className="empty">Chưa có roll nào.</li>}
      </ul>
    </div>
  );
}

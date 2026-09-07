import { useRef, useState } from 'react';
import type { Token, TokenSize } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { DddiceCanvas } from './DddiceCanvas.js';

const CELL = 56; // display px per grid cell
const SIZE_CELLS: Record<TokenSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export function BattleMap() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const { map, tokens, diceTray } = room;

  const [selected, setSelected] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const selectedToken = tokens.find((t) => t.id === selected) ?? null;

  function onPointerDown(e: React.PointerEvent, token: Token) {
    const canMove = isDm || token.controllerId === meId;
    setSelected(token.id);
    if (!canMove) return;
    const rect = boardRef.current!.getBoundingClientRect();
    drag.current = {
      id: token.id,
      dx: e.clientX - rect.left - token.x * CELL,
      dy: e.clientY - rect.top - token.y * CELL,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = boardRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - drag.current.dx) / CELL;
    const y = (e.clientY - rect.top - drag.current.dy) / CELL;
    send({ t: 'updateToken', id: drag.current.id, patch: { x, y } });
  }

  function onPointerUp() {
    if (!drag.current) return;
    const token = tokens.find((t) => t.id === drag.current!.id);
    if (token) {
      send({
        t: 'updateToken',
        id: token.id,
        patch: { x: Math.round(token.x), y: Math.round(token.y) },
      });
    }
    drag.current = null;
  }

  return (
    <div className="battlemap">
      {isDm && <MapToolbar />}

      <div className="board-viewport">
      <div className="board-scroll">
        <div
          ref={boardRef}
          className="board"
          style={{
            width: map.cols * CELL,
            height: map.rows * CELL,
            backgroundImage: map.backgroundUrl ? `url(${map.backgroundUrl})` : undefined,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          {map.showGrid && (
            <div
              className="grid-overlay"
              style={{ backgroundSize: `${CELL}px ${CELL}px` }}
            />
          )}

          {tokens
            .filter((t) => isDm || !t.hidden)
            .map((t) => {
              const span = SIZE_CELLS[t.size];
              return (
                <div
                  key={t.id}
                  className={`token ${selected === t.id ? 'sel' : ''} ${t.hidden ? 'hidden' : ''}`}
                  style={{
                    left: t.x * CELL,
                    top: t.y * CELL,
                    width: span * CELL - 4,
                    height: span * CELL - 4,
                    background: t.imageUrl ? `center/cover url(${t.imageUrl})` : t.color,
                  }}
                  onPointerDown={(e) => onPointerDown(e, t)}
                  title={t.label}
                >
                  {!t.imageUrl && <span className="tk-initial">{t.label.slice(0, 2)}</span>}
                  {typeof t.currentHp === 'number' && typeof t.maxHp === 'number' && (
                    <div className="tk-hpbar">
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, (t.currentHp / t.maxHp) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                  <span className="tk-label">{t.label}</span>
                </div>
              );
            })}

          {diceTray.entries.length > 0 && (
            <div className="dice-tray">
              {diceTray.entries.slice(-6).map((d) => (
                <div key={d.id} className="tray-die" title={`${d.actorName}: ${d.notation}`}>
                  <span className="tray-faces">{d.faces.join(' ')}</span>
                  <strong>{d.total}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <DddiceCanvas />
      </div>
      </div>

      {selectedToken && (
        <TokenInspector token={selectedToken} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function MapToolbar() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const { map } = room;
  const [bg, setBg] = useState(map.backgroundUrl ?? '');

  return (
    <div className="map-toolbar">
      <button
        onClick={() =>
          send({
            t: 'addToken',
            token: { label: 'Token', x: 1, y: 1 },
          })
        }
      >
        + Token
      </button>
      <label>
        Nền (URL)
        <input
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          onBlur={() => send({ t: 'updateMap', patch: { backgroundUrl: bg || undefined } })}
          placeholder="https://…/map.jpg"
        />
      </label>
      <label>
        Cột
        <input
          type="number"
          min={4}
          max={80}
          value={map.cols}
          onChange={(e) => send({ t: 'updateMap', patch: { cols: Number(e.target.value) } })}
        />
      </label>
      <label>
        Hàng
        <input
          type="number"
          min={4}
          max={80}
          value={map.rows}
          onChange={(e) => send({ t: 'updateMap', patch: { rows: Number(e.target.value) } })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={map.showGrid}
          onChange={(e) => send({ t: 'updateMap', patch: { showGrid: e.target.checked } })}
        />
        Lưới
      </label>
    </div>
  );
}

function TokenInspector({ token, onClose }: { token: Token; onClose: () => void }) {
  const send = useStore((s) => s.send);
  const attackRoll = useStore((s) => s.attackRoll);
  const isDm = useStore((s) => s.isDm());
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const [atkName, setAtkName] = useState('Đòn đánh');
  const [atkBonus, setAtkBonus] = useState('5');
  const [dmg, setDmg] = useState('1d8+3');
  const [attackerId, setAttackerId] = useState('');

  function patch(p: Partial<Token>) {
    send({ t: 'updateToken', id: token.id, patch: p });
  }

  return (
    <div className="inspector">
      <div className="insp-head">
        <input value={token.label} onChange={(e) => patch({ label: e.target.value })} />
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="insp-grid">
        <label>
          HP
          <input
            type="number"
            value={token.currentHp ?? ''}
            onChange={(e) =>
              patch({ currentHp: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          HP tối đa
          <input
            type="number"
            value={token.maxHp ?? ''}
            onChange={(e) =>
              patch({ maxHp: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          AC
          <input
            type="number"
            value={token.armorClass ?? ''}
            onChange={(e) =>
              patch({ armorClass: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label>
          Cỡ
          <select
            value={token.size}
            onChange={(e) => patch({ size: e.target.value as TokenSize })}
          >
            {['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Màu
          <input
            type="color"
            value={token.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        {isDm && (
          <label className="chk">
            <input
              type="checkbox"
              checked={token.hidden}
              onChange={(e) => patch({ hidden: e.target.checked })}
            />
            Ẩn với người chơi
          </label>
        )}
      </div>

      <fieldset className="attack-box">
        <legend>Tấn công vào {token.label}</legend>
        <div className="attack-row">
          <select value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
            <option value="">— nguồn —</option>
            {tokens
              .filter((t) => t.id !== token.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
          <input value={atkName} onChange={(e) => setAtkName(e.target.value)} placeholder="Tên đòn" />
        </div>
        <div className="attack-row">
          <label>
            +Đánh
            <input value={atkBonus} onChange={(e) => setAtkBonus(e.target.value)} />
          </label>
          <label>
            Sát thương
            <input value={dmg} onChange={(e) => setDmg(e.target.value)} />
          </label>
        </div>
        <button
          className="primary"
          onClick={() =>
            attackRoll({
              label: attackerId
                ? `${tokens.find((t) => t.id === attackerId)?.label ?? ''} · ${atkName}`
                : atkName,
              attackNotation: `1d20+${Number(atkBonus) || 0}`,
              damageNotation: dmg,
              targetTokenId: token.id,
            })
          }
        >
          Tung đòn tấn công
        </button>
      </fieldset>
    </div>
  );
}

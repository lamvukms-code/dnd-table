import { memo, useState } from 'react';
import { nanoIdish } from '../util.js';
import type { InitiativeEntry } from '@dnd-table/shared';
import { useStore } from '../store.js';

/** Initiative strip: a pill in the top HUD row, between the action icons and the party. */
function InitiativeBarImpl() {
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const init = useStore((s) => s.room?.initiative)!;
  const sheets = useStore((s) => s.room?.sheets)!;
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  function setEntries(entries: InitiativeEntry[]) {
    send({ t: 'initSet', entries });
  }
  /** Only entries linked to a character sheet can be drag-swapped — never a monster's turn. */
  function isPlayerEntry(e: InitiativeEntry): boolean {
    return !!e.tokenId && sheets.some((s) => s.tokenId === e.tokenId);
  }
  function adjacentTo(idA: string, idB: string): boolean {
    const i = init.entries.findIndex((x) => x.id === idA);
    const j = init.entries.findIndex((x) => x.id === idB);
    return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
  }
  function addManual() {
    if (!name.trim()) return;
    setEntries([
      ...init.entries,
      { id: nanoIdish(), name: name.trim(), initiative: Number(value) || 0, isActive: false, hasGone: false },
    ]);
    setName('');
    setValue('');
  }

  return (
    <div className={`init-bar ${expanded ? 'expanded' : ''}`}>
      <div className={`ib-row ${isDm ? 'has-toolbar' : ''}`}>
        <button className="ib-toggle" onClick={() => setExpanded((v) => !v)} title="Initiative">
          ⚔ Initiative {expanded ? '▴' : '▾'}
        </button>
        {init.running && (
          <span className="ib-round" title="Vòng chiến đấu">
            Vòng {init.round}
          </span>
        )}

        <ol className="ib-track">
          {init.entries.map((e) => {
            const swappable = isPlayerEntry(e);
            const dragOverOk = !!dragId && dragId !== e.id && swappable && adjacentTo(dragId, e.id);
            return (
              <li
                key={e.id}
                className={[
                  e.isActive ? 'active' : e.hasGone ? 'gone' : '',
                  swappable ? 'swappable' : '',
                  dragOverOk ? 'drop-ok' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={swappable}
                title={swappable ? 'Kéo sang lượt người chơi liền kề để đổi chỗ' : undefined}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData('text/plain', e.id);
                  setDragId(e.id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(ev) => {
                  if (dragId && dragId !== e.id && swappable && adjacentTo(dragId, e.id)) {
                    ev.preventDefault();
                  }
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const fromId = dragId ?? ev.dataTransfer.getData('text/plain');
                  setDragId(null);
                  if (!fromId || fromId === e.id || !swappable || !adjacentTo(fromId, e.id)) return;
                  send({ t: 'initSwapAdjacent', entryIdA: fromId, entryIdB: e.id });
                }}
              >
                <span className="ib-val">{e.initiative}</span>
                <span className="ib-name">{e.name}</span>
                {isDm && expanded && (
                  <button
                    className="link"
                    onClick={() => setEntries(init.entries.filter((x) => x.id !== e.id))}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
          {init.entries.length === 0 && <li className="empty">— trống —</li>}
        </ol>

        {isDm && (
          <div className="ib-controls">
            <button onClick={() => send({ t: 'initPrev' })} title="Lùi lượt">
              ◀
            </button>
            <button
              className="primary"
              onClick={() => send({ t: 'initNext' })}
              title="Kết thúc lượt hiện tại (đẩy về cuối)"
            >
              Kết thúc lượt ▶
            </button>
            {init.entries.length > 0 && (
              <button
                title="Xoá sạch thanh initiative (ví dụ sau khi quái bị xoá thủ công còn sót lại tên) — không hoàn tác được"
                onClick={() => {
                  if (window.confirm('Reset thanh initiative về trống? Không hoàn tác được.')) {
                    send({ t: 'initReset' });
                  }
                }}
              >
                ↺
              </button>
            )}
          </div>
        )}
      </div>

      {isDm && expanded && (
        <div className="ib-tools">
          <button onClick={() => send({ t: 'initRollAll' })}>Tung cho mọi token</button>
          <button onClick={() => send({ t: 'initStart' })}>Bắt đầu</button>
          <button
            className="link"
            onClick={() => {
              if (window.confirm('Reset thanh initiative về trống? Không hoàn tác được.')) {
                send({ t: 'initReset' });
              }
            }}
          >
            Reset
          </button>
          <input
            placeholder="Tên"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManual()}
          />
          <input
            placeholder="Init"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManual()}
          />
          <button onClick={addManual}>+ Thêm</button>
        </div>
      )}
    </div>
  );
}

/** Memoised: takes no props, so it only re-renders when its own store selectors change. */
export const InitiativeBar = memo(InitiativeBarImpl);

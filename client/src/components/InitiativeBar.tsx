import { useState } from 'react';
import { nanoIdish } from '../util.js';
import type { InitiativeEntry } from '@dnd-table/shared';
import { useStore } from '../store.js';

/** Thin horizontal initiative strip pinned to the top of the battle map. */
export function InitiativeBar() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const init = room.initiative;
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  function setEntries(entries: InitiativeEntry[]) {
    send({ t: 'initSet', entries });
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
      <div className="ib-row">
        <button className="ib-toggle" onClick={() => setExpanded((v) => !v)} title="Initiative">
          ⚔ {init.running ? `Vòng ${init.round}` : 'Initiative'} {expanded ? '▴' : '▾'}
        </button>

        <ol className="ib-track">
          {init.entries.map((e) => (
            <li key={e.id} className={e.isActive ? 'active' : e.hasGone ? 'gone' : ''}>
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
          ))}
          {init.entries.length === 0 && <li className="empty">— trống —</li>}
        </ol>

        {isDm && (
          <div className="ib-controls">
            <button onClick={() => send({ t: 'initPrev' })} title="Lùi lượt">
              ◀
            </button>
            <button className="primary" onClick={() => send({ t: 'initNext' })} title="Lượt tiếp">
              ▶
            </button>
          </div>
        )}
      </div>

      {isDm && expanded && (
        <div className="ib-tools">
          <button onClick={() => send({ t: 'initRollAll' })}>Tung cho mọi token</button>
          <button onClick={() => send({ t: 'initStart' })}>Bắt đầu</button>
          <button className="link" onClick={() => send({ t: 'initReset' })}>
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

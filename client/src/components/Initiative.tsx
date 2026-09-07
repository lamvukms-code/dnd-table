import { useState } from 'react';
import { nanoIdish } from '../util.js';
import type { InitiativeEntry } from '@dnd-table/shared';
import { useStore } from '../store.js';

export function Initiative() {
  const room = useStore((s) => s.room)!;
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const init = room.initiative;
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  function setEntries(entries: InitiativeEntry[]) {
    send({ t: 'initSet', entries });
  }

  function addManual() {
    if (!name.trim()) return;
    setEntries([
      ...init.entries,
      {
        id: nanoIdish(),
        name: name.trim(),
        initiative: Number(value) || 0,
        isActive: false,
        hasGone: false,
      },
    ]);
    setName('');
    setValue('');
  }

  return (
    <div className="initiative">
      <div className="init-head">
        <h2>Initiative — Vòng {init.round}</h2>
        {isDm && (
          <div className="init-controls">
            <button onClick={() => send({ t: 'initRollAll' })}>Tung cho mọi token</button>
            <button onClick={() => send({ t: 'initStart' })}>Bắt đầu</button>
            <button onClick={() => send({ t: 'initPrev' })}>◀ Lùi</button>
            <button className="primary" onClick={() => send({ t: 'initNext' })}>
              Lượt tiếp ▶
            </button>
            <button className="link" onClick={() => send({ t: 'initReset' })}>
              Reset
            </button>
          </div>
        )}
      </div>

      <ol className="init-list">
        {init.entries.map((e, i) => (
          <li key={e.id} className={e.isActive ? 'active' : e.hasGone ? 'gone' : ''}>
            <span className="init-order">{i + 1}</span>
            {isDm ? (
              <input
                className="init-val"
                type="number"
                value={e.initiative}
                onChange={(ev) =>
                  setEntries(
                    init.entries.map((x) =>
                      x.id === e.id ? { ...x, initiative: Number(ev.target.value) } : x,
                    ),
                  )
                }
              />
            ) : (
              <span className="init-val">{e.initiative}</span>
            )}
            <span className="init-name">{e.name}</span>
            {isDm && (
              <button
                className="link"
                onClick={() => setEntries(init.entries.filter((x) => x.id !== e.id))}
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {init.entries.length === 0 && <li className="empty">Chưa có ai trong initiative.</li>}
      </ol>

      {isDm && (
        <div className="init-add">
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
          <button onClick={addManual}>Thêm</button>
        </div>
      )}
    </div>
  );
}

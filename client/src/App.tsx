import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { JoinScreen } from './components/JoinScreen.js';
import { BattleMap } from './components/BattleMap.js';
import { DicePanel } from './components/DicePanel.js';
import { Initiative } from './components/Initiative.js';
import { Sheets } from './components/Sheets.js';

type Tab = 'map' | 'initiative' | 'sheets';

export function App() {
  const identity = useStore((s) => s.identity);
  const room = useStore((s) => s.room);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const me = useStore((s) => s.me());
  const [tab, setTab] = useState<Tab>('map');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    setToast(error);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  if (!identity || !room || !me) {
    return <JoinScreen connecting={status === 'connecting'} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>{room.name}</strong>
        <nav>
          <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>
            Bản đồ
          </button>
          <button
            className={tab === 'initiative' ? 'on' : ''}
            onClick={() => setTab('initiative')}
          >
            Initiative {room.initiative.running ? `· R${room.initiative.round}` : ''}
          </button>
          <button className={tab === 'sheets' ? 'on' : ''} onClick={() => setTab('sheets')}>
            Nhân vật
          </button>
        </nav>
        <span className={`conn ${status}`}>
          {me.name} · {me.role === 'dm' ? 'DM' : 'Người chơi'}
          {status !== 'open' ? ' · mất kết nối…' : ''}
        </span>
      </header>

      <main className="layout">
        <section className="content">
          {tab === 'map' && <BattleMap />}
          {tab === 'initiative' && <Initiative />}
          {tab === 'sheets' && <Sheets />}
        </section>
        <aside className="sidebar">
          <DicePanel />
        </aside>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

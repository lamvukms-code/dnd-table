import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { JoinScreen } from './components/JoinScreen.js';
import { BattleMap } from './components/BattleMap.js';
import { DiceWindow } from './components/DiceWindow.js';
import { InitiativeBar } from './components/InitiativeBar.js';
import { SheetDock } from './components/SheetDock.js';
import { SettingsModal } from './components/Settings.js';

export function App() {
  const identity = useStore((s) => s.identity);
  const room = useStore((s) => s.room);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const me = useStore((s) => s.me());
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);

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
        <span className={`conn ${status}`}>
          {me.name} · {me.role === 'dm' ? 'DM' : 'Người chơi'}
          {status !== 'open' ? ' · mất kết nối…' : ''}
        </span>
        <button
          className={dockOpen ? 'on' : ''}
          title="Ẩn/hiện character sheet"
          onClick={() => setDockOpen((v) => !v)}
        >
          Nhân vật
        </button>
        <button className="gear" title="Cài đặt" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </header>

      <div className="stage">
        <div className="map-area">
          <InitiativeBar />
          <BattleMap />
          <DiceWindow />
        </div>
        {dockOpen && <SheetDock />}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

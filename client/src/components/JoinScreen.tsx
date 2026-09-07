import { useState } from 'react';
import { useStore } from '../store.js';

export function JoinScreen({ connecting }: { connecting: boolean }) {
  const join = useStore((s) => s.join);
  const existing = useStore((s) => s.identity);
  const [name, setName] = useState(existing?.name ?? '');
  const [role, setRole] = useState<'dm' | 'player'>(existing?.role ?? 'player');

  return (
    <div className="join">
      <div className="join-card">
        <h1>D&D Table</h1>
        <p>Bàn chơi D&D 5e (2024) cá nhân — LAN.</p>
        <label>
          Tên hiển thị
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên của bạn"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) join({ name: name.trim(), role });
            }}
          />
        </label>
        <label>
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value as 'dm' | 'player')}>
            <option value="player">Người chơi</option>
            <option value="dm">DM (quản trò)</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={!name.trim() || connecting}
          onClick={() => join({ name: name.trim(), role })}
        >
          {connecting ? 'Đang kết nối…' : 'Vào bàn'}
        </button>
      </div>
    </div>
  );
}

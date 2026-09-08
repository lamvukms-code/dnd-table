import { useState } from 'react';
import { useStore } from '../store.js';

export function JoinScreen({ connecting }: { connecting: boolean }) {
  const join = useStore((s) => s.join);
  const existing = useStore((s) => s.identity);
  const [name, setName] = useState(existing?.name ?? '');

  function go() {
    if (name.trim()) join({ name: name.trim() });
  }

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
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
        </label>
        <p className="hint">
          Người vào phòng đầu tiên là DM (quản trò). Những người sau vào với vai trò
          người chơi — DM có thể đổi vai trò trong Cài đặt.
        </p>
        <button className="primary" disabled={!name.trim() || connecting} onClick={go}>
          {connecting ? 'Đang kết nối…' : 'Vào bàn'}
        </button>
      </div>
    </div>
  );
}

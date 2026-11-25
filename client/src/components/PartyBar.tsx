import { memo } from 'react';
import { useStore } from '../store.js';

/** Top-right party strip (Owlbear-style): one avatar per participant, dimmed while offline. */
function PartyBarImpl() {
  const participants = useStore((s) => s.room?.participants ?? []);
  const meId = useStore((s) => s.participantId);
  const sorted = [...participants].sort((a, b) => Number(b.role === 'dm') - Number(a.role === 'dm') || Number(b.connected) - Number(a.connected));
  if (!sorted.length) return null;
  return (
    <div className="hud-pill party-bar">
      {sorted.map((p) => (
        <span
          key={p.id}
          className={`party-avatar ${p.connected ? '' : 'off'} ${p.id === meId ? 'me' : ''}`}
          style={{ background: p.color }}
          title={`${p.name} · ${p.role === 'dm' ? 'DM' : 'Người chơi'}${p.connected ? '' : ' · đang offline'}${p.id === meId ? ' (bạn)' : ''}`}
        >
          {p.name.trim().slice(0, 1).toUpperCase() || '?'}
          {p.role === 'dm' && <span className="party-dm">DM</span>}
        </span>
      ))}
    </div>
  );
}

export const PartyBar = memo(PartyBarImpl);

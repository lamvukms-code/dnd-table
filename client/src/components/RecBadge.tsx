import { useEffect, useState } from 'react';
import { formatElapsed } from '@dnd-table/shared';
import { useStore } from '../store.js';

/** Open (or bring forward) the DM's recording window. */
export function openStreamWindow(): void {
  const w = window.open('/?stream=1', 'dnd-table-stream', 'popup,width=1600,height=960');
  w?.focus();
}

/** "● REC 12:34" for everyone at the table while the DM records (so nobody is recorded unknowingly). */
export function RecBadge() {
  const rec = useStore((s) => s.room?.recording);
  const isDm = useStore((s) => s.isDm());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rec) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [rec]);
  if (!rec) return null;
  return (
    <button
      className="rec-badge"
      title={isDm ? 'Đang ghi hình — bấm để mở khung quay' : 'DM đang ghi hình buổi chơi'}
      onClick={isDm ? openStreamWindow : undefined}
    >
      ● REC {formatElapsed(now - rec.since)}
    </button>
  );
}

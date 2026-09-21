import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { SrdRef } from './SrdRef.js';
import { LoreBook } from './LoreBook.js';

type Tab = 'srd' | 'lore' | 'web';

const KEY = 'dnd-table.referenceUrl';

/**
 * A resizable side panel: built-in SRD rules search, the DM-only Lore Book (local book
 * text, never bundled), and an optional embedded web page. The web URL is stored
 * per-browser in localStorage.
 */
export function ReferencePanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [draft, setDraft] = useState(url);
  const isDm = useStore((st) => st.isDm());
  const [tab, setTab] = useState<Tab>('srd');
  const [width, setWidth] = useState(() => {
    const w = Number(localStorage.getItem(KEY + '.w'));
    return w >= 240 && w <= 900 ? w : 420;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, url);
    } catch {
      /* private mode */
    }
  }, [url]);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      const w = Math.max(240, Math.min(900, startW + (startX - ev.clientX)));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(KEY + '.w', String(width));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'srd', label: '📚 SRD' },
    ...(isDm ? [{ id: 'lore' as Tab, label: '📖 Lore Book' }] : []),
    { id: 'web', label: '🌐 Web' },
  ];

  return (
    <aside className="reference-panel" style={{ width }}>
      <div className="rp-resize" onPointerDown={startResize} title="Kéo để đổi cỡ" />
      <div className="rp-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      {tab === 'srd' && <SrdRef />}
      {tab === 'lore' && isDm && <LoreBook />}
      {tab === 'web' && (
        <>
          <div className="rp-head">
            <input
              value={draft}
              placeholder="URL trang tra cứu (wiki luật, tài liệu bạn sở hữu…)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setUrl(draft.trim())}
            />
            <button onClick={() => setUrl(draft.trim())}>Mở</button>
            {url && (
              <a className="rp-newtab" href={url} target="_blank" rel="noreferrer" title="Mở tab mới">
                ↗
              </a>
            )}
          </div>
          {url ? (
            <iframe className="rp-frame" src={url} title="Tra cứu" referrerPolicy="no-referrer" />
          ) : (
            <div className="rp-empty">
              <p>Dán URL một trang tra cứu để xem ngay trong app.</p>
              <p className="hint">Trang nào chặn nhúng thì dùng nút ↗ để mở tab mới.</p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

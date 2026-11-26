import { useEffect, useState } from 'react';
import type { SettingReference } from '@dnd-table/shared';
import { storedCredentials, useStore } from '../store.js';
import { SrdRef } from './SrdRef.js';
import { LoreBook } from './LoreBook.js';
import { SettingRef } from './SettingRef.js';

type Tab = 'srd' | 'setting' | 'lore' | 'web';

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
  // the setting's own reference (the DM's notes, if the server has them; players get it without 🔒 lines)
  const [setting, setSetting] = useState<SettingReference | null>(null);
  useEffect(() => {
    let dead = false;
    const c = storedCredentials();
    fetch('/reference', { headers: { 'x-participant-id': c.participantId ?? '', 'x-participant-secret': c.secret ?? '' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SettingReference | null) => {
        if (dead || !j?.sections?.length) return;
        setSetting(j);
        setTab((t) => (t === 'srd' ? 'setting' : t));
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [isDm]);
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
    let lastW = width; // `width` in this closure is stale once dragging starts
    const move = (ev: PointerEvent) => {
      // panel floats on the left now, so its grip is the right edge
      lastW = Math.max(240, Math.min(900, startW + (ev.clientX - startX)));
      setWidth(lastW);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(KEY + '.w', String(lastW));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'srd', label: '📚 SRD' },
    ...(setting ? [{ id: 'setting' as Tab, label: `📕 ${setting.title}` }] : []),
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
      {tab === 'setting' && setting && <SettingRef data={setting} />}
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

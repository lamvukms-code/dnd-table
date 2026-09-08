import { useEffect, useState } from 'react';

const KEY = 'dnd-table.referenceUrl';

/**
 * A resizable side panel that embeds an external reference site (your own
 * self-hosted 5etools mirror, D&D Beyond, a rules wiki…). The URL is stored
 * per-browser in localStorage — the app hosts nothing itself. Some sites block
 * being framed; an "open in a tab" button is always offered.
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

  return (
    <aside className="reference-panel" style={{ width }}>
      <div className="rp-resize" onPointerDown={startResize} title="Kéo để đổi cỡ" />
      <div className="rp-head">
        <input
          value={draft}
          placeholder="http://localhost:5050  (5etools mirror của bạn)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setUrl(draft.trim())}
        />
        <button onClick={() => setUrl(draft.trim())}>Mở</button>
        {url && (
          <a className="rp-newtab" href={url} target="_blank" rel="noreferrer" title="Mở tab mới">
            ↗
          </a>
        )}
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      {url ? (
        <iframe className="rp-frame" src={url} title="Tra cứu" referrerPolicy="no-referrer" />
      ) : (
        <div className="rp-empty">
          <p>Dán URL của trang tra cứu bạn tự chạy (vd 5etools mirror trên máy bạn).</p>
          <p className="hint">
            App không tự host 5etools. Chạy mirror riêng rồi trỏ vào đây. Trang nào chặn nhúng thì
            dùng nút ↗ để mở tab.
          </p>
        </div>
      )}
    </aside>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.js';

interface MapEntry {
  id: string;
  group: string;
  order: number;
  name: string;
  file: string;
  kb: number;
  cols?: number;
  rows?: number;
  grid: boolean;
}

/**
 * DM-only map library: browse the maps a pack importer put on the server (grouped by chapter),
 * preview one, then set it as the current scene's background or open it in a new scene. The
 * board is sized to the map's grid squares. Files live in the server's `maps/` folder
 * (see scripts/import-maps.mjs) — nothing is bundled into the app.
 */
export function MapLibrary({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const [maps, setMaps] = useState<MapEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/maps/index.json')
      .then((r) => {
        if (!r.ok) throw new Error('Chưa có thư viện bản đồ — chạy scripts/import-maps.mjs trên máy chủ.');
        return r.json();
      })
      .then((j: { maps: MapEntry[] }) => setMaps(j.maps))
      .catch((e: Error) => setErr(e.message));
  }, []);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const by = new Map<string, MapEntry[]>();
    for (const m of maps ?? []) {
      if (term && !`${m.name} ${m.group}`.toLowerCase().includes(term)) continue;
      by.set(m.group, [...(by.get(m.group) ?? []), m]);
    }
    return [...by.entries()];
  }, [maps, q]);

  const url = (m: MapEntry) => `/maps/${m.file}`;
  const patch = (m: MapEntry) => ({
    name: m.name.replace(/^\d+\.\s*/, ''),
    backgroundUrl: url(m),
    cols: m.cols ?? 24,
    rows: m.rows ?? 16,
    showGrid: m.grid,
  });

  function useHere(m: MapEntry) {
    send({ t: 'updateMap', patch: patch(m) });
    setNote(`Đã đặt "${m.name}" làm nền của cảnh hiện tại.`);
  }
  function newScene(m: MapEntry) {
    send({ t: 'sceneCreate', name: m.name.replace(/^\d+\.\s*/, '') });
    send({ t: 'updateMap', patch: patch(m) });
    setNote(`Đã tạo cảnh mới "${m.name}".`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal map-library" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Thư viện bản đồ</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>
        {err && <p className="hint">{err}</p>}
        {!err && !maps && <p className="hint">Đang tải…</p>}
        {maps && (
          <>
            <input
              className="ml-search"
              placeholder={`Tìm trong ${maps.length} bản đồ…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {note && <p className="ml-note">{note}</p>}
            <div className="ml-groups">
              {groups.map(([g, list], gi) => (
                <details key={g} open={!!q.trim() || gi === 0}>
                  <summary>
                    {g} <span className="hint">({list.length})</span>
                  </summary>
                  {list.map((m) => (
                    <div key={m.id} className="ml-row">
                      <div className="ml-line">
                        <span className="ml-name">{m.name}</span>
                        <span className="hint">
                          {m.cols && m.rows ? `${m.cols}×${m.rows} ô · ` : ''}
                          {m.kb >= 1024 ? `${(m.kb / 1024).toFixed(1)} MB` : `${m.kb} KB`}
                        </span>
                        <button onClick={() => setPreview(preview === m.id ? null : m.id)}>
                          {preview === m.id ? 'Ẩn' : '👁 Xem'}
                        </button>
                        <button onClick={() => useHere(m)} title="Thay nền của cảnh đang mở (token giữ nguyên)">
                          Dùng cho cảnh này
                        </button>
                        <button className="primary" onClick={() => newScene(m)} title="Tạo cảnh mới với bản đồ này">
                          + Cảnh mới
                        </button>
                      </div>
                      {preview === m.id && <img className="ml-preview" src={url(m)} alt={m.name} loading="lazy" />}
                    </div>
                  ))}
                </details>
              ))}
              {groups.length === 0 && <p className="hint">Không thấy bản đồ nào.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

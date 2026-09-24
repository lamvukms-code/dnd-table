import { useState } from 'react';
import type { MapZone } from '@dnd-table/shared';
import { nanoIdish } from '../util.js';
import zoneLibraryRaw from '../data/crookedMoonZones.json';

interface ZoneLibraryEntry {
  code: string;
  name: string;
  description: string;
  chapter?: string;
  source?: string;
}
const ZONE_LIBRARY = zoneLibraryRaw as ZoneLibraryEntry[];

const DEFAULT_COLOR = '#3a6ea5';

export type ZonePopupState =
  | { kind: 'existing'; zone: MapZone }
  | { kind: 'new'; x: number; y: number; w: number; h: number }
  | null;

/** DM-only popup for a map zone: view its read-aloud/DM text, or draw-and-fill a new one —
 *  search `crookedMoonZones.json` by area code/name to auto-fill instead of typing it out. */
export function ZonePopup({
  state,
  onClose,
  onSave,
  onDelete,
}: {
  state: ZonePopupState;
  onClose: () => void;
  onSave: (zone: MapZone) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(state?.kind === 'new');
  const [libQuery, setLibQuery] = useState('');
  const [draft, setDraft] = useState<MapZone>(() =>
    state?.kind === 'existing'
      ? state.zone
      : {
          id: nanoIdish(),
          name: '',
          code: '',
          x: state?.kind === 'new' ? state.x : 0,
          y: state?.kind === 'new' ? state.y : 0,
          w: state?.kind === 'new' ? state.w : 1,
          h: state?.kind === 'new' ? state.h : 1,
          color: DEFAULT_COLOR,
          description: '',
        },
  );
  if (!state) return null;

  const q = libQuery.trim().toLowerCase();
  const libMatches = q
    ? ZONE_LIBRARY.filter((e) => e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)).slice(0, 20)
    : [];

  function applyLibraryEntry(e: ZoneLibraryEntry) {
    setDraft((d) => ({ ...d, name: e.name, code: e.code, description: e.description, source: e.source }));
    setLibQuery('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal zone-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {editing
              ? state.kind === 'new'
                ? 'Vùng mới'
                : 'Sửa vùng'
              : `${draft.code ? draft.code + ' — ' : ''}${draft.name || '(chưa đặt tên)'}`}
          </h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        {!editing ? (
          <>
            <div className="zone-desc">{draft.description || <em>Chưa có mô tả.</em>}</div>
            {draft.source && <p className="hint">Nguồn: {draft.source}</p>}
            <div className="sb-footer">
              <button onClick={() => setEditing(true)}>✎ Sửa</button>
              <button className="danger" onClick={() => onDelete(draft.id)}>
                Xóa vùng
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Tìm trong sách (mã hoặc tên khu vực)…
              <input
                value={libQuery}
                placeholder="vd. V4, Mayor's Home…"
                onChange={(e) => setLibQuery(e.target.value)}
              />
            </label>
            {libMatches.length > 0 && (
              <div className="zone-lib-matches">
                {libMatches.map((m) => (
                  <button key={m.code} className="zone-lib-row" onClick={() => applyLibraryEntry(m)}>
                    <strong>{m.code}</strong> {m.name}
                  </button>
                ))}
              </div>
            )}
            <div className="sb-row">
              <label>
                Mã khu vực
                <input
                  value={draft.code ?? ''}
                  placeholder="V4"
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                />
              </label>
              <label className="grow">
                Tên
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                Màu
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </label>
            </div>
            <label>
              Mô tả (đọc cho người chơi / ghi chú DM)
              <textarea
                rows={8}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="sb-footer">
              <button
                className="primary"
                onClick={() => {
                  onSave(draft);
                }}
              >
                💾 Lưu
              </button>
              {state.kind === 'existing' && (
                <button className="danger" onClick={() => onDelete(draft.id)}>
                  Xóa vùng
                </button>
              )}
              <button className="link" onClick={onClose}>
                Hủy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

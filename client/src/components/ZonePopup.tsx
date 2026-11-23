import { useState } from 'react';
import type { MapZone } from '@dnd-table/shared';
import { nanoIdish } from '../util.js';
import { ZONE_LIBRARY, type ZoneLibraryEntry } from '../campaignData.js';

export { ZONE_LIBRARY, type ZoneLibraryEntry };

const DEFAULT_COLOR = '#3a6ea5';

export type ZonePopupState =
  | { kind: 'existing'; zone: MapZone }
  | { kind: 'new'; x: number; y: number; w: number; h: number }
  | null;

/** DM-only popup for a map zone: view its read-aloud/DM text, or draw-and-fill a new one —
 *  search the zone library (`zones.local.json`, see campaignData.ts) by area code/name to auto-fill instead of typing it out. */
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
          readAloud: '',
          dmNotes: '',
        },
  );
  if (!state) return null;

  const q = libQuery.trim().toLowerCase();
  const libMatches = q
    ? ZONE_LIBRARY.filter((e) => e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)).slice(0, 20)
    : [];

  function applyLibraryEntry(e: ZoneLibraryEntry) {
    setDraft((d) => ({
      ...d,
      name: e.name,
      code: e.code,
      readAloud: e.readAloud ?? '',
      dmNotes: e.dmNotes ?? '',
      source: e.source,
    }));
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
            {draft.readAloud ? (
              <blockquote className="zone-readaloud">{draft.readAloud}</blockquote>
            ) : (
              <p className="hint">Chưa có đoạn đọc cho người chơi.</p>
            )}
            {draft.dmNotes && <div className="zone-dmnotes">{draft.dmNotes}</div>}
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
            <div className="sb-row">
              <label title="Vị trí/kích thước ô vuông trên bản đồ, tính theo số ô lưới — chỉnh tay nếu vùng nạp sẵn lệch chỗ">
                X
                <input
                  type="number"
                  step="0.1"
                  value={draft.x}
                  onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  step="0.1"
                  value={draft.y}
                  onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })}
                />
              </label>
              <label>
                Rộng
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={draft.w}
                  onChange={(e) => setDraft({ ...draft, w: Number(e.target.value) })}
                />
              </label>
              <label>
                Cao
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={draft.h}
                  onChange={(e) => setDraft({ ...draft, h: Number(e.target.value) })}
                />
              </label>
            </div>
            <label>
              Đọc cho người chơi (boxed text — nguyên văn/sát nghĩa từ sách)
              <textarea
                className="zone-readaloud-input"
                rows={6}
                placeholder="This circular room, built into the base of the manor's turret…"
                value={draft.readAloud ?? ''}
                onChange={(e) => setDraft({ ...draft, readAloud: e.target.value })}
              />
            </label>
            <label>
              Ghi chú DM (cơ chế, DC, bí mật — không đọc cho người chơi)
              <textarea
                rows={5}
                value={draft.dmNotes ?? ''}
                onChange={(e) => setDraft({ ...draft, dmNotes: e.target.value })}
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

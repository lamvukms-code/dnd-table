import { useMemo, useRef, useState } from 'react';
import type { HomebrewEntry, HomebrewKind, HomebrewStatus } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';

/**
 * DM-made items / house rules / features / notes for this table (docs/LOREBOOK.md §3). DM edits in place
 * (`homebrewUpsert` / `homebrewRemove`); players get the same list read-only, minus `secret` entries and the
 * DM's own `notes` (both already stripped server-side for non-DM connections — see server/src/index.ts `stateFor`).
 */
const KIND_LABEL: Record<HomebrewKind, string> = {
  item: 'Vật phẩm',
  rule: 'Luật nhà',
  feature: 'Feature',
  note: 'Ghi chú',
};
const KIND_ORDER: HomebrewKind[] = ['item', 'rule', 'feature', 'note'];
const STATUS_LABEL: Record<HomebrewStatus, string> = { draft: 'Nháp', live: 'Đang dùng', retired: 'Đã bỏ' };
const STATUS_ORDER: HomebrewStatus[] = ['draft', 'live', 'retired'];

function blankHomebrew(kind: HomebrewKind): HomebrewEntry {
  const name = { item: 'Vật phẩm mới', rule: 'Luật mới', feature: 'Feature mới', note: 'Ghi chú mới' }[kind];
  return { id: nanoIdish(), name, kind, status: 'draft', description: '' };
}

export function HomebrewPanel({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const homebrew = useStore((s) => s.room?.homebrew ?? []);
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<HomebrewStatus | ''>('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const players = useMemo(
    () => Array.from(new Set(homebrew.map((h) => h.forPlayer).filter((x): x is string => !!x))).sort(),
    [homebrew],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return homebrew.filter((h) => {
      if (statusFilter && h.status !== statusFilter) return false;
      if (playerFilter && h.forPlayer !== playerFilter) return false;
      if (term && !`${h.name} ${h.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [homebrew, q, statusFilter, playerFilter]);

  const groups = KIND_ORDER.map((k) => [k, filtered.filter((h) => h.kind === k)] as const).filter(
    ([, list]) => list.length > 0,
  );
  const selected = homebrew.find((h) => h.id === selId) ?? null;

  function create(kind: HomebrewKind) {
    const e = blankHomebrew(kind);
    send({ t: 'homebrewUpsert', entry: e });
    setSelId(e.id);
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(homebrew, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homebrew-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Bulk-seed from a JSON array of homebrew entries (docs/LOREBOOK.md's optional `homebrew.local.json`
   *  starting seed, or a backup exported here). Merges by `id`; entries without one get a fresh id. */
  async function importFile(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.homebrew) ? raw.homebrew : null;
      if (!arr) throw new Error('File không phải danh sách homebrew');
      let n = 0;
      for (const e of arr as Partial<HomebrewEntry>[]) {
        if (!e.name || !e.kind || !e.status || e.description === undefined) continue;
        send({ t: 'homebrewUpsert', entry: { ...e, id: e.id || nanoIdish() } as HomebrewEntry });
        n++;
      }
      setNote(`Đã nhập ${n} mục (gộp theo id).`);
    } catch (e) {
      setNote(`Lỗi nhập file: ${(e as Error).message}`);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal homebrew" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            🧪 Homebrew {!isDm && <span className="hint">(chỉ xem)</span>}
          </h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="homebrew-body">
          <div className="hb-list">
            <input placeholder="Tìm tên / mô tả…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="hb-filters">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as HomebrewStatus | '')}>
                <option value="">— mọi trạng thái —</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {players.length > 0 && (
                <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
                  <option value="">— mọi người chơi —</option>
                  {players.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="hb-list-scroll">
              {groups.map(([kind, list]) => (
                <div key={kind} className="hb-group">
                  <span className="hb-group-label">
                    {KIND_LABEL[kind]} ({list.length})
                  </span>
                  {list.map((h) => (
                    <button
                      key={h.id}
                      className={`hb-item status-${h.status} ${h.id === selId ? 'on' : ''}`}
                      onClick={() => setSelId(h.id)}
                    >
                      <span className="hb-name">{h.name}</span>
                      {h.secret && <span className="hb-tag secret" title="Chỉ DM thấy">🔒</span>}
                      {h.forPlayer && <span className="hb-tag">{h.forPlayer}</span>}
                    </button>
                  ))}
                </div>
              ))}
              {filtered.length === 0 && <p className="empty">Trống.</p>}
            </div>
            {isDm && (
              <div className="hb-list-actions">
                {KIND_ORDER.map((k) => (
                  <button key={k} onClick={() => create(k)}>
                    + {KIND_LABEL[k]}
                  </button>
                ))}
                <button onClick={() => fileRef.current?.click()}>Nhập file</button>
                <button onClick={exportFile} disabled={homebrew.length === 0}>
                  Xuất file
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
            {note && <p className="note">{note}</p>}
          </div>

          <div className="hb-editor">
            {!selected && <p className="empty">Chọn một mục{isDm ? ', hoặc tạo mới ở dưới danh sách.' : '.'}</p>}
            {selected && isDm && (
              <HomebrewEditor key={selected.id} entry={selected} onDeleted={() => setSelId(null)} />
            )}
            {selected && !isDm && <HomebrewReadOnly entry={selected} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomebrewEditor({ entry, onDeleted }: { entry: HomebrewEntry; onDeleted: () => void }) {
  const send = useStore((s) => s.send);
  const commit = (next: HomebrewEntry) => send({ t: 'homebrewUpsert', entry: next });
  const set = <K extends keyof HomebrewEntry>(k: K, v: HomebrewEntry[K]) => commit({ ...entry, [k]: v });

  function remove() {
    if (!window.confirm(`Xóa "${entry.name}"? Không hoàn tác được.`)) return;
    send({ t: 'homebrewRemove', id: entry.id });
    onDeleted();
  }

  return (
    <div className="hb-form">
      <div className="hb-row">
        <label className="grow">
          Tên
          <input value={entry.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Loại
          <select value={entry.kind} onChange={(e) => set('kind', e.target.value as HomebrewKind)}>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select value={entry.status} onChange={(e) => set('status', e.target.value as HomebrewStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hb-row">
        <label className="grow">
          Cho người chơi (chữ tự do)
          <input
            placeholder="Sabine (Rogue / Sinner)"
            value={entry.forPlayer ?? ''}
            onChange={(e) => set('forPlayer', e.target.value || undefined)}
          />
        </label>
        {entry.kind === 'item' && (
          <>
            <label>
              Độ hiếm
              <input
                placeholder="uncommon"
                value={entry.rarity ?? ''}
                onChange={(e) => set('rarity', e.target.value || undefined)}
              />
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={entry.attunement ?? false}
                onChange={(e) => set('attunement', e.target.checked)}
              />
              Cần điều hợp
            </label>
          </>
        )}
      </div>

      <label className="grow">
        Mô tả (người chơi thấy)
        <textarea
          rows={3}
          value={entry.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <label className="grow">
        Cơ chế (người chơi thấy)
        <textarea
          rows={3}
          placeholder="Phần luật cụ thể…"
          value={entry.mechanics ?? ''}
          onChange={(e) => set('mechanics', e.target.value || undefined)}
        />
      </label>

      <div className="hb-row">
        <label className="chk">
          <input
            type="checkbox"
            checked={entry.secret ?? false}
            onChange={(e) => set('secret', e.target.checked)}
          />
          🔒 Bí mật (chỉ DM thấy)
        </label>
      </div>
      <label className="grow">
        Ghi chú riêng của DM (không gửi cho người chơi)
        <textarea
          rows={2}
          placeholder="cân bằng, nhắc việc…"
          value={entry.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || undefined)}
        />
      </label>

      <div className="hb-actions">
        <button className="danger" onClick={remove}>
          Xóa
        </button>
      </div>
    </div>
  );
}

function HomebrewReadOnly({ entry }: { entry: HomebrewEntry }) {
  return (
    <div className="hb-form hb-readonly">
      <h3>{entry.name}</h3>
      <p className="hint">
        {KIND_LABEL[entry.kind]} · {STATUS_LABEL[entry.status]}
        {entry.forPlayer ? ` · ${entry.forPlayer}` : ''}
        {entry.kind === 'item' && entry.rarity ? ` · ${entry.rarity}` : ''}
        {entry.kind === 'item' && entry.attunement ? ' · cần điều hợp' : ''}
      </p>
      <p>{entry.description}</p>
      {entry.mechanics && <p className="hb-mechanics">{entry.mechanics}</p>}
    </div>
  );
}

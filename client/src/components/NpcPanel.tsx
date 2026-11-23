import { useMemo, useState } from 'react';
import type { Statblock } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { normalizeStatblock } from '../statblock.js';
import { StatblockEditor } from './BestiaryPanel.js';
import { NPC_CATALOG, NPC_CHAPTER_LABELS as CHAPTER_LABELS } from '../campaignData.js';

/** DM-only NPC roster for the current campaign (`npcs.local.json`, see campaignData.ts) — mirrors BestiaryPanel's layout/interactions,
 *  but is sourced from the local campaign roster instead of the room's live bestiary.
 *  Selecting/spawning an entry copies it into `room.bestiary` (tagged "npc") on first use, so
 *  from then on it behaves exactly like any other bestiary statblock (editable, draggable from
 *  the map's NPC palette, persisted with the room). */
export function NpcPanel({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const bestiary = useStore((s) => s.room?.bestiary ?? []);
  const map = useStore((s) => s.room!.map);
  const [selId, setSelId] = useState<string | null>(NPC_CATALOG[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [chapter, setChapter] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const chapters = useMemo(() => {
    const set = new Set<string>();
    for (const n of NPC_CATALOG) for (const t of n.tags) if (t.startsWith('ch')) set.add(t);
    return [...set].sort();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return NPC_CATALOG.filter((n) => {
      if (chapter && !n.tags.includes(chapter)) return false;
      if (!s) return true;
      return (
        n.name.toLowerCase().includes(s) ||
        n.notes.toLowerCase().includes(s) ||
        n.tags.some((t) => t.toLowerCase().includes(s))
      );
    });
  }, [q, chapter]);

  const liveOf = (id: string) => bestiary.find((b) => b.id === id);

  /** Copies the catalog entry into the room's bestiary if it isn't there yet (a no-op after the
   *  first time), so edits/spawns act on the same live copy every subsequent click. */
  function ensureImported(npc: Statblock): Statblock {
    const existing = liveOf(npc.id);
    if (existing) return existing;
    const normalized = normalizeStatblock(npc);
    send({ t: 'bestiaryUpsert', statblock: normalized });
    return normalized;
  }

  function quickSpawn(npc: Statblock) {
    ensureImported(npc);
    send({
      t: 'spawnStatblock',
      id: npc.id,
      x: Math.floor(map.cols / 2),
      y: Math.floor(map.rows / 2),
      rollHp: true,
      hidden: false,
    });
    setNote(`Đã thả "${npc.name}" lên map — kéo từ palette "🧑‍🤝‍🧑 NPC" trên bản đồ để đặt đúng vị trí.`);
  }

  function importAll() {
    for (const n of NPC_CATALOG) ensureImported(n);
    setNote(`Đã nhập ${NPC_CATALOG.length} NPC vào Bestiary (tag "npc") — giờ có thể kéo thả từ palette trên bản đồ.`);
  }

  const selectedLive = selId ? liveOf(selId) : null;
  const selectedCatalog = selId ? NPC_CATALOG.find((n) => n.id === selId) : null;

  function open(npc: Statblock) {
    setSelId(npc.id);
    ensureImported(npc);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal bestiary" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>NPC</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bestiary-body">
          <div className="be-list">
            <input
              placeholder="Tìm tên / vai trò / tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
              <option value="">— Tất cả chương —</option>
              {chapters.map((c) => (
                <option key={c} value={c}>
                  {CHAPTER_LABELS[c] ?? c}
                </option>
              ))}
            </select>
            <div className="be-list-scroll">
              {filtered.map((n) => (
                <div key={n.id} className={`be-item npc-item ${n.id === selId ? 'on' : ''}`}>
                  <button className="npc-item-main" onClick={() => open(n)}>
                    <span className="be-dot" style={{ background: n.color }} />
                    <span className="be-name">{n.name}</span>
                    {n.cr && <span className="be-cr">CR {n.cr}</span>}
                  </button>
                  <button
                    className="link npc-quickspawn"
                    title={`Thả nhanh "${n.name}" lên giữa bản đồ`}
                    onClick={() => quickSpawn(n)}
                  >
                    ⤵
                  </button>
                </div>
              ))}
              {filtered.length === 0 && <p className="empty">Trống.</p>}
            </div>
            <div className="be-list-actions">
              <button onClick={importAll}>Nhập tất cả vào Bestiary</button>
            </div>
            {note && <p className="note">{note}</p>}
          </div>

          <div className="be-editor">
            {selectedLive ? (
              <StatblockEditor key={selectedLive.id} sb={selectedLive} onDeleted={() => setSelId(null)} />
            ) : selectedCatalog ? (
              <p className="empty">Đang nhập…</p>
            ) : (
              <p className="empty">Chọn một NPC.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

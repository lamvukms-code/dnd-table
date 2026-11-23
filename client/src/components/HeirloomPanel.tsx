import { useMemo, useState } from 'react';
import type { HeirloomDef } from '@dnd-table/shared';
import { lockedHeirloomFeatureCount, nextHeirloomUnlockLevel, unlockedHeirloomFeatures } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { HEIRLOOMS } from '../campaignData.js';

const TIER_LABEL: Record<string, string> = {
  rare: 'Hiếm',
  veryRare: 'Rất hiếm',
  legendary: 'Huyền thoại',
};

/**
 * Browsable catalog of level-gated heirloom items (`heirlooms.local.json`, see campaignData.ts) — DM always sees every property in
 * full (own reference), but a player only sees the properties their own character's level has
 * unlocked (Lv1 = Rare, Lv7 = Very Rare, Lv13 = Legendary, per the source's heirloom rarity table).
 * Locked properties are hidden name-and-all — not just their text — so nothing spoils what the
 * item can eventually do.
 */
export function HeirloomPanel({ onClose }: { onClose: () => void }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const isDm = useStore((s) => s.isDm());
  const room = useStore((s) => s.room);
  const participantId = useStore((s) => s.participantId);

  const mySheets = useMemo(
    () => (room?.sheets ?? []).filter((s) => s.ownerId === participantId),
    [room, participantId],
  );
  const [dmFullView, setDmFullView] = useState(true);
  const [viewLevel, setViewLevel] = useState(mySheets[0]?.level ?? 1);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? HEIRLOOMS.filter((h) => h.name.toLowerCase().includes(term)) : HEIRLOOMS;
  }, [q]);

  const selected = HEIRLOOMS.find((h) => h.id === selId) ?? null;
  const gated = !(isDm && dmFullView);
  const level = isDm ? viewLevel : (mySheets[0]?.level ?? 1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal homebrew eqsrd" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🏺 Fabled Heirloom</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="homebrew-body">
          <div className="hb-list">
            <input placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} />
            {isDm ? (
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={dmFullView} onChange={(e) => setDmFullView(e.target.checked)} />
                Xem đầy đủ (DM)
              </label>
            ) : (
              <p className="hint">
                Theo cấp nhân vật của bạn{mySheets[0] ? ` (${mySheets[0].name}, cấp ${mySheets[0].level})` : ''}.
              </p>
            )}
            {isDm && !dmFullView && (
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Xem theo cấp
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={viewLevel}
                  onChange={(e) => setViewLevel(Number(e.target.value) || 1)}
                  style={{ width: 48 }}
                />
              </label>
            )}
            <div className="hb-list-scroll">
              {filtered.map((h) => (
                <button key={h.id} className={`hb-item ${h.id === selId ? 'on' : ''}`} onClick={() => setSelId(h.id)}>
                  <span className="hb-name">{h.name}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="empty">Không tìm thấy.</p>}
            </div>
          </div>

          <div className="hb-editor">
            {!selected && <p className="empty">Chọn một bảo vật để xem chi tiết.</p>}
            {selected && <HeirloomDetail def={selected} level={level} gated={gated} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeirloomDetail({ def, level, gated }: { def: HeirloomDef; level: number; gated: boolean }) {
  const unlocked = gated ? unlockedHeirloomFeatures(def, level) : def.features;
  const lockedCount = gated ? lockedHeirloomFeatureCount(def, level) : 0;
  const nextAt = gated ? nextHeirloomUnlockLevel(def, level) : undefined;

  return (
    <div className="hb-form hb-readonly">
      <h3>{def.name}</h3>
      <p>{def.description}</p>
      {def.source && <p className="hint">Nguồn: {def.source}</p>}
      <div className="cf-list">
        {unlocked.map((f, i) => (
          <div key={i} className="cf-row">
            <span className="cf-lvl">{TIER_LABEL[f.tier]}</span>
            <span className="cf-body">
              <strong>{f.name}.</strong> {f.text}
            </span>
          </div>
        ))}
      </div>
      {lockedCount > 0 && (
        <p className="hint heirloom-locked">
          🔒 Còn {lockedCount} năng lực chưa mở khóa{nextAt ? ` — mở tiếp ở cấp ${nextAt}` : ''}.
        </p>
      )}
    </div>
  );
}

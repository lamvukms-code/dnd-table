import { useEffect, useMemo, useState } from 'react';
import { equipmentPresetFromDef, type EquipmentPreset, type ItemType } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';

/**
 * SRD 5.2.1 non-magical equipment catalog (weapons/armor/shields/gear/tools) — a DM-facing browser with a
 * "→ Túi đồ" button that pushes a pick straight onto any character sheet (players can only target their own).
 * Same data source (`/srd/equipment.json`) as the "+ preset" picker on the Equipment tab; this panel exists for
 * the case a player would rather have the DM hand them gear than dig through the picker themselves.
 */
const TYPE_LABEL: Record<ItemType, string> = {
  weapon: 'Vũ khí',
  armor: 'Giáp',
  shield: 'Khiên',
  gear: 'Đồ dùng',
  consumable: 'Tiêu hao',
};
const TYPE_ORDER: ItemType[] = ['weapon', 'armor', 'shield', 'gear', 'consumable'];

export function EquipmentSrdPanel({ onClose }: { onClose: () => void }) {
  const [defs, setDefs] = useState<EquipmentPreset[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('');

  useEffect(() => {
    fetch('/srd/equipment.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setDefs(Array.isArray(j) ? j : []))
      .catch(() => setDefs([]));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (defs ?? []).filter((d) => {
      if (typeFilter && d.type !== typeFilter) return false;
      if (term && !d.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [defs, q, typeFilter]);

  const groups = TYPE_ORDER.map((t) => [t, filtered.filter((d) => d.type === t)] as const).filter(
    ([, list]) => list.length > 0,
  );
  const selected = (defs ?? []).find((d) => d.id === selId) ?? null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal homebrew eqsrd" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🎒 Trang bị SRD</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="homebrew-body">
          <div className="hb-list">
            <input placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="hb-filters">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemType | '')}>
                <option value="">— mọi loại —</option>
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="hb-list-scroll">
              {defs === null && <p className="empty">Đang tải…</p>}
              {groups.map(([t, list]) => (
                <div key={t} className="hb-group">
                  <span className="hb-group-label">
                    {TYPE_LABEL[t]} ({list.length})
                  </span>
                  {list.map((d) => (
                    <button
                      key={d.id}
                      className={`hb-item ${d.id === selId ? 'on' : ''}`}
                      onClick={() => setSelId(d.id)}
                    >
                      <span className="hb-name">{d.name}</span>
                      {d.cost && <span className="hb-tag">{d.cost}</span>}
                    </button>
                  ))}
                </div>
              ))}
              {defs !== null && filtered.length === 0 && <p className="empty">Không tìm thấy.</p>}
            </div>
          </div>

          <div className="hb-editor">
            {!selected && <p className="empty">Chọn một vật phẩm để xem chi tiết và gửi.</p>}
            {selected && <EquipmentPresetDetail def={selected} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EquipmentPresetDetail({ def }: { def: EquipmentPreset }) {
  return (
    <div className="hb-form hb-readonly">
      <h3>
        {def.name}
        {def.attunementRequired ? <span title="Cần điều hợp"> ⚡</span> : ''}
      </h3>
      <p className="hint">
        {TYPE_LABEL[def.type]}
        {def.rarity ? ` · ${def.rarity}` : ''}
        {def.attunementRequired ? ' · cần điều hợp' : ''}
        {def.cost ? ` · ${def.cost}` : ''}
        {def.weight !== undefined ? ` · ${def.weight} lb` : ''}
        {def.damage ? ` · ${def.damage}${def.attackBonusMisc ? ` (+${def.attackBonusMisc})` : ''} ${def.damageType ?? ''}`.trimEnd() : ''}
        {def.rangeText ? ` · ${def.rangeText}` : ''}
        {def.armorBase !== undefined ? ` · AC ${def.armorBase}${def.armorCategory ? ` (${def.armorCategory})` : ''}` : ''}
        {def.stealthDisadvantage ? ' · Bất lợi Stealth' : ''}
      </p>
      {def.notes && <p>{def.notes}</p>}
      <SendToSheet def={def} />
    </div>
  );
}

/** "→ Túi đồ": same ownership rule as Homebrew's send-to-inventory — DM can target any sheet, a player only theirs. */
function SendToSheet({ def }: { def: EquipmentPreset }) {
  const send = useStore((s) => s.send);
  const room = useStore((s) => s.room);
  const participantId = useStore((s) => s.participantId);
  const isDm = useStore((s) => s.isDm());
  const sheets = useMemo(
    () => (room?.sheets ?? []).filter((s) => isDm || s.ownerId === participantId),
    [room, isDm, participantId],
  );
  const [target, setTarget] = useState(sheets[0]?.id ?? '');
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!sheets.some((s) => s.id === target)) setTarget(sheets[0]?.id ?? '');
  }, [sheets, target]);

  if (sheets.length === 0) {
    return <p className="hint">{isDm ? 'Chưa có nhân vật nào trên bàn.' : 'Bạn chưa có nhân vật nào.'}</p>;
  }

  function push() {
    const sheet = sheets.find((s) => s.id === target);
    if (!sheet) return;
    const item = equipmentPresetFromDef(def, nanoIdish);
    send({ t: 'upsertSheet', sheet: { ...sheet, inventory: [...sheet.inventory, item] }, base: sheet });
    setSent(`Đã thêm vào túi đồ của ${sheet.name}.`);
    setTimeout(() => setSent(null), 3000);
  }

  return (
    <div className="hb-send">
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        {sheets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button onClick={push}>→ Túi đồ</button>
      {sent && <span className="hint">{sent}</span>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  ATTUNEMENT_SLOTS,
  COIN_TYPES,
  attunementCount,
  carriedWeight,
  carryCapacity,
  consumeInventoryItem,
  currencyInGp,
  equipInventoryItem,
  equipmentPresetFromDef,
  findCantrip,
  spellFromCantrip,
  type ArmorCategory,
  type ConsumableKind,
  type EquipmentPreset,
  type InventoryItem,
  type ItemType,
  type WeaponAbility,
} from '@dnd-table/shared';
import { useStore } from '../../store.js';
import { nanoIdish } from '../../util.js';
import { FormulaHint } from '../FormulaHint.js';
import { DamageTypeSelect, ExtraDamageEditor } from '../DefensesEditor.js';
import type { EditorCtx } from '../SheetDock.js';

const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'shield', 'gear', 'consumable'];
const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  weapon: 'Vũ khí',
  armor: 'Giáp',
  shield: 'Khiên',
  gear: 'Đồ dùng',
  consumable: 'Tiêu hao',
};
const CONSUMABLE_KIND_LABEL: Record<ConsumableKind, string> = {
  heal: 'Hồi máu (potion)',
  spell: 'Cuộn phép / đũa phép',
  custom: 'Khác (chỉ trừ số lượng)',
};
const COIN_LABEL: Record<string, string> = { pp: 'PP', gp: 'GP', ep: 'EP', sp: 'SP', cp: 'CP' };

function blankItem(type: ItemType): InventoryItem {
  const base: InventoryItem = {
    id: nanoIdish(),
    name:
      type === 'weapon' ? 'Vũ khí mới'
      : type === 'armor' ? 'Giáp mới'
      : type === 'shield' ? 'Khiên'
      : type === 'consumable' ? 'Potion of Healing'
      : 'Vật phẩm',
    type,
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
  };
  if (type === 'weapon')
    return { ...base, weaponAbility: 'str', damage: '1d6', damageType: 'chém', proficient: true, attackBonusMisc: 0, damageBonusMisc: 0 };
  if (type === 'armor') return { ...base, armorBase: 14, armorCategory: 'medium', stealthDisadvantage: false };
  if (type === 'shield') return { ...base, armorBase: 2, weight: 6 };
  if (type === 'consumable') return { ...base, consumableKind: 'heal', healFormula: '2d4+2' };
  return base;
}

export function EquipmentTab({ draft, commit }: EditorCtx) {
  const beginCast = useStore((s) => s.beginCast);
  const healRoll = useStore((s) => s.healRoll);
  const [usedNote, setUsedNote] = useState<Record<string, string>>({});
  const weight = carriedWeight(draft);
  const capacity = carryCapacity(draft);
  const over = weight > capacity;
  const attuned = attunementCount(draft);
  const attuneFull = attuned >= ATTUNEMENT_SLOTS;

  // Ticking "equipped" on an armor/shield item auto-unequips any other item of that same type — only one
  // suit of armor / one shield at a time (see `equipInventoryItem`).
  const setItem = (id: string, patch: Partial<InventoryItem>) =>
    commit({ ...draft, inventory: equipInventoryItem(draft.inventory, id, patch) });
  const removeItem = (id: string) =>
    commit({ ...draft, inventory: draft.inventory.filter((it) => it.id !== id) });
  const addItem = (type: ItemType) =>
    commit({ ...draft, inventory: [...draft.inventory, blankItem(type)] });

  /**
   * "Dùng" a consumable: spends one charge (quantity - 1) right away, then — 'heal' rolls `healFormula` onto the
   * linked token; 'spell' looks up `scrollSpellName` in the SRD spell DB and casts it through the normal casting
   * flow (same as clicking 🪄 on a spell row — still needs a target click on the map for attack/save spells);
   * 'custom' and an unmatched scroll name just spend the charge, no auto roll.
   */
  function useConsumable(it: InventoryItem) {
    if (it.quantity <= 0) return;
    commit({ ...draft, inventory: consumeInventoryItem(draft.inventory, it.id) });
    if (it.consumableKind === 'heal' && it.healFormula) {
      if (!draft.tokenId) {
        window.alert('Gắn nhân vật với token trên bản đồ trước đã, rồi mới roll hồi máu được.');
        return;
      }
      void healRoll(`${draft.name} · ${it.name} (hồi máu)`, it.healFormula, draft.tokenId, draft.id);
    } else if (it.consumableKind === 'spell' && it.scrollSpellName) {
      const def = findCantrip(it.scrollSpellName);
      if (def) beginCast(draft.id, spellFromCantrip(def, draft, nanoIdish()));
      else flashNote(it.id, `Đã trừ 1 "${it.name}" — không tìm thấy "${it.scrollSpellName}" trong DB, tự thực hiện tay.`);
    } else {
      flashNote(it.id, it.consumableNote ? `Đã dùng "${it.name}": ${it.consumableNote}` : `Đã trừ 1 "${it.name}".`);
    }
  }

  function flashNote(id: string, msg: string) {
    setUsedNote((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setUsedNote((prev) => (prev[id] === msg ? { ...prev, [id]: '' } : prev)), 4000);
  }

  return (
    <div className="equipment-tab">
      <div className="currency-row">
        {COIN_TYPES.map((coin) => (
          <label key={coin}>
            {COIN_LABEL[coin]}
            <input
              type="number"
              min={0}
              value={draft.currency[coin]}
              onChange={(e) =>
                commit({
                  ...draft,
                  currency: { ...draft.currency, [coin]: Math.max(0, Number(e.target.value)) },
                })
              }
            />
          </label>
        ))}
        <span className="currency-total">≈ {currencyInGp(draft.currency).toFixed(2)} gp</span>
        <span className={`weight-tag ${over ? 'over' : ''}`}>
          {weight}/{capacity} lb{over ? ' · quá tải' : ''}
        </span>
        <span
          className={`attune-tag ${attuned > ATTUNEMENT_SLOTS ? 'over' : attuneFull ? 'full' : ''}`}
          title="Tối đa 3 vật phẩm điều hợp cùng lúc (5e). Tích ⚡ ở từng vật phẩm."
        >
          ⚡ Điều hợp {attuned}/{ATTUNEMENT_SLOTS}
        </span>
      </div>

      <div className="add-item-row">
        {ITEM_TYPES.map((t) => (
          <button key={t} onClick={() => addItem(t)}>
            + {ITEM_TYPE_LABEL[t]}
          </button>
        ))}
        <EquipmentPicker
          onAdd={(item) => commit({ ...draft, inventory: [...draft.inventory, item] })}
        />
      </div>
      <p className="hint">Chỉ mặc được 1 giáp và 1 khiên cùng lúc — mặc món khác sẽ tự cởi món cũ.</p>

      <div className="inventory-list">
        {draft.inventory.map((it) => (
          <details key={it.id} className={`inv-item ${it.equipped ? 'equipped' : ''}`}>
            <summary>
              <input
                type="checkbox"
                checked={it.equipped}
                title="Trang bị"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setItem(it.id, { equipped: e.target.checked })}
              />
              <span className="inv-name">{it.name}</span>
              <span className="inv-meta">
                {ITEM_TYPE_LABEL[it.type]}
                {it.quantity > 1 || it.type === 'consumable' ? ` ×${it.quantity}` : ''}
                {it.attuned ? ' · ⚡' : ''}
              </span>
              {it.type === 'consumable' && (
                <button
                  className="inv-use"
                  disabled={it.quantity <= 0}
                  title={it.quantity <= 0 ? 'Hết rồi' : `Dùng 1 (còn lại ${it.quantity - 1})`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    useConsumable(it);
                  }}
                >
                  Dùng
                </button>
              )}
            </summary>
            {usedNote[it.id] && <p className="hint inv-used-note">{usedNote[it.id]}</p>}

            <div className="inv-fields">
              <label className="grow">
                Tên
                <input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} />
              </label>
              <label>
                Loại
                <select value={it.type} onChange={(e) => setItem(it.id, { type: e.target.value as ItemType })}>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ITEM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SL
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => setItem(it.id, { quantity: Math.max(1, Number(e.target.value)) })}
                />
              </label>
              <label>
                Nặng
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={it.weight}
                  onChange={(e) => setItem(it.id, { weight: Math.max(0, Number(e.target.value)) })}
                />
              </label>

              {it.type === 'weapon' && (
                <>
                  <label>
                    Chỉ số
                    <select
                      value={it.weaponAbility ?? 'str'}
                      onChange={(e) => setItem(it.id, { weaponAbility: e.target.value as WeaponAbility })}
                    >
                      <option value="str">STR</option>
                      <option value="dex">DEX</option>
                      <option value="finesse">Linh hoạt</option>
                    </select>
                  </label>
                  <label>
                    Sát thương nền
                    <input
                      value={it.damage ?? ''}
                      placeholder="1d8"
                      onChange={(e) => setItem(it.id, { damage: e.target.value })}
                    />
                    <FormulaHint notation={it.damage ?? ''} />
                  </label>
                  <label>
                    Loại dmg
                    <DamageTypeSelect
                      value={it.damageType}
                      onChange={(v) => setItem(it.id, { damageType: v ?? '' })}
                    />
                  </label>
                  <label>
                    Tầm
                    <input
                      placeholder="5 ft / 20/60 ft"
                      value={it.rangeText ?? ''}
                      onChange={(e) => setItem(it.id, { rangeText: e.target.value || undefined })}
                    />
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={it.proficient ?? false}
                      onChange={(e) => setItem(it.id, { proficient: e.target.checked })}
                    />
                    Thành thạo
                  </label>
                  <label>
                    +đánh phụ
                    <input
                      type="number"
                      value={it.attackBonusMisc ?? 0}
                      onChange={(e) => setItem(it.id, { attackBonusMisc: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    +dmg phụ
                    <input
                      type="number"
                      value={it.damageBonusMisc ?? 0}
                      onChange={(e) => setItem(it.id, { damageBonusMisc: Number(e.target.value) })}
                    />
                  </label>
                  <label className="grow">
                    Sát thương phụ (flame tongue…)
                    <ExtraDamageEditor
                      parts={it.weaponExtraDamage}
                      onChange={(parts) => setItem(it.id, { weaponExtraDamage: parts })}
                    />
                  </label>
                </>
              )}

              {it.type === 'armor' && (
                <>
                  <label>
                    AC nền
                    <input
                      type="number"
                      value={it.armorBase ?? 10}
                      onChange={(e) => setItem(it.id, { armorBase: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Hạng giáp
                    <select
                      value={it.armorCategory ?? 'medium'}
                      onChange={(e) => setItem(it.id, { armorCategory: e.target.value as ArmorCategory })}
                    >
                      <option value="light">Nhẹ</option>
                      <option value="medium">Vừa</option>
                      <option value="heavy">Nặng</option>
                    </select>
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={it.stealthDisadvantage ?? false}
                      onChange={(e) => setItem(it.id, { stealthDisadvantage: e.target.checked })}
                    />
                    Bất lợi Ẩn nấp
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={it.grantsCritImmune ?? false}
                      onChange={(e) => setItem(it.id, { grantsCritImmune: e.target.checked })}
                    />
                    Adamantine (miễn chí mạng khi mặc)
                  </label>
                </>
              )}

              {it.type === 'shield' && (
                <label>
                  Bonus AC
                  <input
                    type="number"
                    value={it.armorBase ?? 2}
                    onChange={(e) => setItem(it.id, { armorBase: Number(e.target.value) })}
                  />
                </label>
              )}

              {it.type === 'consumable' && (
                <>
                  <label>
                    Khi dùng
                    <select
                      value={it.consumableKind ?? 'custom'}
                      onChange={(e) => setItem(it.id, { consumableKind: e.target.value as ConsumableKind })}
                    >
                      {(Object.keys(CONSUMABLE_KIND_LABEL) as ConsumableKind[]).map((k) => (
                        <option key={k} value={k}>
                          {CONSUMABLE_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {it.consumableKind === 'heal' && (
                    <label>
                      Công thức hồi máu
                      <input
                        value={it.healFormula ?? ''}
                        placeholder="2d4+2"
                        onChange={(e) => setItem(it.id, { healFormula: e.target.value })}
                      />
                      <FormulaHint notation={it.healFormula ?? ''} />
                    </label>
                  )}
                  {it.consumableKind === 'spell' && (
                    <label className="grow">
                      Tên phép (khớp DB SRD để tự roll)
                      <input
                        value={it.scrollSpellName ?? ''}
                        placeholder="Cure Wounds"
                        onChange={(e) => setItem(it.id, { scrollSpellName: e.target.value })}
                      />
                      <span className="hint">
                        {it.scrollSpellName
                          ? findCantrip(it.scrollSpellName)
                            ? `✓ khớp "${findCantrip(it.scrollSpellName)!.name}" — Dùng sẽ mở ra phép, bấm mục tiêu trên bản đồ.`
                            : '✗ chưa có trong DB phép — Dùng chỉ trừ số lượng, tự thực hiện tay.'
                          : ''}
                      </span>
                    </label>
                  )}
                  {it.consumableKind === 'custom' && (
                    <label className="grow">
                      Hiện khi dùng
                      <input
                        value={it.consumableNote ?? ''}
                        placeholder="mô tả hiệu ứng…"
                        onChange={(e) => setItem(it.id, { consumableNote: e.target.value || undefined })}
                      />
                    </label>
                  )}
                </>
              )}

              <label className="chk" title="Vật phẩm ma thuật cần điều hợp (tối đa 3)">
                <input
                  type="checkbox"
                  checked={it.attuned ?? false}
                  disabled={!it.attuned && attuneFull}
                  onChange={(e) => setItem(it.id, { attuned: e.target.checked })}
                />
                ⚡ Điều hợp
                {!it.attuned && attuneFull ? ' (hết slot)' : ''}
              </label>
              <label className="grow">
                Ghi chú
                <input value={it.notes} onChange={(e) => setItem(it.id, { notes: e.target.value })} />
              </label>
              <button className="danger" onClick={() => removeItem(it.id)}>
                Xóa
              </button>
            </div>
          </details>
        ))}
        {draft.inventory.length === 0 && <p className="empty">Túi đồ trống.</p>}
      </div>
    </div>
  );
}

/**
 * "+ preset" picker (SRS FR-63g): searches `/srd/equipment.json` (fetched at runtime, same pattern as the
 * Bestiary's SRD monster list) and turns a pick into a ready-filled inventory item. The repo ships that file
 * EMPTY — populating it with the SRD 5.2.1 weapons/armor/gear tables is a separate, later task — so until then
 * this quietly does nothing but the plain "+ Vũ khí / + Giáp / …" buttons keep working as before.
 */
function EquipmentPicker({ onAdd }: { onAdd: (item: InventoryItem) => void }) {
  const [defs, setDefs] = useState<EquipmentPreset[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch('/srd/equipment.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setDefs(Array.isArray(j) ? j : []))
      .catch(() => setDefs([]));
  }, []);

  const term = q.trim().toLowerCase();
  const list = (defs ?? []).filter((d) => !term || d.name.toLowerCase().includes(term));

  function pick(d: EquipmentPreset) {
    onAdd(equipmentPresetFromDef(d, nanoIdish));
    setQ('');
    setOpen(false);
  }

  const empty = defs !== null && defs.length === 0;
  return (
    <div className="eq-picker">
      <input
        value={q}
        placeholder={
          defs === null ? 'Đang tải preset…' : empty ? 'Chưa có preset SRD' : `Tìm trang bị… (${defs.length})`
        }
        disabled={empty}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && list.length > 0 && (
        <ul className="eq-list">
          {list.slice(0, 40).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="sp-opt"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(d)}
                title={d.notes}
              >
                <span className="sp-name">{d.name}</span>
                <span className="sp-hint">
                  {ITEM_TYPE_LABEL[d.type]}
                  {d.cost ? ` · ${d.cost}` : ''}
                  {d.damage ? ` · ${d.damage}` : ''}
                  {d.armorBase !== undefined ? ` · AC ${d.armorBase}` : ''}
                  {d.healFormula ? ` · hồi ${d.healFormula}` : ''}
                  {d.scrollSpellName ? ` · ${d.scrollSpellName}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

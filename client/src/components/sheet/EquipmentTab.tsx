import {
  ATTUNEMENT_SLOTS,
  COIN_TYPES,
  attunementCount,
  carriedWeight,
  carryCapacity,
  currencyInGp,
  type ArmorCategory,
  type InventoryItem,
  type ItemType,
  type WeaponAbility,
} from '@dnd-table/shared';
import { nanoIdish } from '../../util.js';
import { FormulaHint } from '../FormulaHint.js';
import { DamageTypeSelect, ExtraDamageEditor } from '../DefensesEditor.js';
import type { EditorCtx } from '../SheetDock.js';

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  weapon: 'Vũ khí',
  armor: 'Giáp',
  shield: 'Khiên',
  gear: 'Đồ dùng',
};
const COIN_LABEL: Record<string, string> = { pp: 'PP', gp: 'GP', ep: 'EP', sp: 'SP', cp: 'CP' };

function blankItem(type: ItemType): InventoryItem {
  const base: InventoryItem = {
    id: nanoIdish(),
    name:
      type === 'weapon' ? 'Vũ khí mới' : type === 'armor' ? 'Giáp mới' : type === 'shield' ? 'Khiên' : 'Vật phẩm',
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
  return base;
}

export function EquipmentTab({ draft, commit }: EditorCtx) {
  const weight = carriedWeight(draft);
  const capacity = carryCapacity(draft);
  const over = weight > capacity;
  const attuned = attunementCount(draft);
  const attuneFull = attuned >= ATTUNEMENT_SLOTS;

  const setItem = (id: string, patch: Partial<InventoryItem>) =>
    commit({ ...draft, inventory: draft.inventory.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id: string) =>
    commit({ ...draft, inventory: draft.inventory.filter((it) => it.id !== id) });
  const addItem = (type: ItemType) =>
    commit({ ...draft, inventory: [...draft.inventory, blankItem(type)] });

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
        {(['weapon', 'armor', 'shield', 'gear'] as ItemType[]).map((t) => (
          <button key={t} onClick={() => addItem(t)}>
            + {ITEM_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

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
                {it.quantity > 1 ? ` ×${it.quantity}` : ''}
                {it.attuned ? ' · ⚡' : ''}
              </span>
            </summary>

            <div className="inv-fields">
              <label className="grow">
                Tên
                <input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} />
              </label>
              <label>
                Loại
                <select value={it.type} onChange={(e) => setItem(it.id, { type: e.target.value as ItemType })}>
                  {(['weapon', 'armor', 'shield', 'gear'] as ItemType[]).map((t) => (
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

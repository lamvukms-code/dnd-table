import { useEffect, useMemo, useState } from 'react';
import {
  formatCp,
  generateShopStock,
  maxRarityForLevel,
  partyLevel,
  presetPriceCp,
  purseCp,
  RARITY_VI,
  rarityKey,
  SHOP_KINDS,
  shopKindAccepts,
  shopPriceCp,
  type EquipmentPreset,
  type Shop,
  type ShopItem,
} from '@dnd-table/shared';
import { loadEquipmentCatalog } from '../equipmentCatalog.js';
import { useStore } from '../store.js';
import { nanoIdish } from '../util.js';

/**
 * Shops. The DM opens stores of a kind (general goods, smith, armourer, alchemist, magic, custom),
 * fills them from the equipment catalog for the party's level, sets prices / stock, restocks by
 * hand and opens them to players. Players pick one of their characters and buy: the server takes
 * the coins (with change) and puts the item in that character's inventory.
 */

const kindOf = (k: string) => SHOP_KINDS.find((x) => x.key === k) ?? SHOP_KINDS[SHOP_KINDS.length - 1];
const rarityText = (p: EquipmentPreset) => {
  const r = rarityKey(p.rarity);
  return r ? RARITY_VI[r] : '';
};
/** gp (with decimals) typed by the DM → copper */
const gpToCp = (v: string) => Math.max(0, Math.round((Number(v.replace(',', '.')) || 0) * 100));

export function ShopPanel({ onClose }: { onClose: () => void }) {
  const isDm = useStore((s) => s.isDm());
  const room = useStore((s) => s.room);
  const shops = room?.shops ?? [];
  const [selId, setSelId] = useState<string | null>(shops[0]?.id ?? null);
  const [catalog, setCatalog] = useState<EquipmentPreset[] | null>(null);
  useEffect(() => {
    if (isDm) void loadEquipmentCatalog().then(setCatalog);
  }, [isDm]);
  useEffect(() => {
    if (!shops.some((s) => s.id === selId)) setSelId(shops[0]?.id ?? null);
  }, [shops, selId]);

  const playerIds = useMemo(
    () => new Set((room?.participants ?? []).filter((p) => p.role === 'player').map((p) => p.id)),
    [room?.participants],
  );
  const party = partyLevel(room?.sheets ?? [], playerIds);
  const selected = shops.find((s) => s.id === selId) ?? null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal homebrew shop-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🛒 Cửa hàng</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="homebrew-body">
          <div className="hb-list">
            {isDm && <NewShop party={party} catalog={catalog} onCreated={setSelId} />}
            <div className="hb-list-scroll">
              {shops.length === 0 && <p className="empty">{isDm ? 'Chưa có cửa hàng nào.' : 'Chưa có cửa hàng nào mở cửa.'}</p>}
              {shops.map((s) => (
                <button key={s.id} className={`hb-item ${s.id === selId ? 'on' : ''}`} onClick={() => setSelId(s.id)}>
                  <span className="hb-name">
                    {kindOf(s.kind).icon} {s.name}
                  </span>
                  {isDm && <span className="hb-tag">{s.open ? 'mở' : 'đóng'}</span>}
                </button>
              ))}
            </div>
            {isDm && <p className="hint">Level nhóm hiện tại: {party} (tối đa {RARITY_VI[maxRarityForLevel(party)]}).</p>}
          </div>
          <div className="hb-editor">
            {!selected && <p className="empty">Chọn một cửa hàng.</p>}
            {selected && isDm && <ShopEditor key={selected.id} shop={selected} party={party} catalog={catalog} />}
            {selected && !isDm && <ShopFront shop={selected} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewShop({ party, catalog, onCreated }: { party: number; catalog: EquipmentPreset[] | null; onCreated: (id: string) => void }) {
  const send = useStore((s) => s.send);
  const [kind, setKind] = useState<string>('general');
  const create = () => {
    const k = kindOf(kind);
    const id = nanoIdish();
    const items = catalog ? generateShopStock(catalog, kind, party, { newId: nanoIdish }) : [];
    send({ t: 'shopUpsert', shop: { id, name: k.label, kind, open: false, level: party, markup: 100, items } });
    onCreated(id);
  };
  return (
    <div className="hb-filters">
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {SHOP_KINDS.map((k) => (
          <option key={k.key} value={k.key}>
            {k.icon} {k.label}
          </option>
        ))}
      </select>
      <button disabled={!catalog} title="Tạo cửa hàng mới (đóng cửa), hàng chọn theo level nhóm" onClick={create}>
        + Mở shop
      </button>
    </div>
  );
}

function ShopEditor({ shop, party, catalog }: { shop: Shop; party: number; catalog: EquipmentPreset[] | null }) {
  const send = useStore((s) => s.send);
  const save = (patch: Partial<Shop>) => send({ t: 'shopUpsert', shop: { ...shop, ...patch } });
  const setItem = (id: string, patch: Partial<ShopItem>) => save({ items: shop.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const [level, setLevel] = useState(shop.level ?? party);
  const [q, setQ] = useState('');
  const [onlyKind, setOnlyKind] = useState(true);

  const regenerate = () => {
    if (!catalog) return;
    if (shop.items.length && !window.confirm(`Thay toàn bộ ${shop.items.length} món hiện có bằng hàng mới cho level ${level}?`)) return;
    save({ level, items: generateShopStock(catalog, shop.kind, level, { newId: nanoIdish }) });
  };
  const addable = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!catalog || !term) return [];
    const have = new Set(shop.items.map((i) => i.preset.id));
    return catalog
      .filter((p) => !have.has(p.id) && p.name.toLowerCase().includes(term) && (!onlyKind || shopKindAccepts(shop.kind, p)))
      .slice(0, 12);
  }, [catalog, q, onlyKind, shop.items, shop.kind]);
  const add = (p: EquipmentPreset) => {
    const magic = rarityKey(p.rarity) != null;
    save({ items: [...shop.items, { id: nanoIdish(), preset: p, priceCp: presetPriceCp(p) ?? 0, stock: magic ? 1 : 5, restock: magic ? 1 : 5 }] });
    setQ('');
  };

  return (
    <div className="hb-form shop-editor">
      <div className="hb-row">
        <label className="grow">
          Tên
          <input defaultValue={shop.name} onBlur={(e) => e.target.value.trim() && e.target.value !== shop.name && save({ name: e.target.value.trim() })} />
        </label>
        <label>
          Loại
          <select value={shop.kind} onChange={(e) => save({ kind: e.target.value })}>
            {SHOP_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
        </label>
        <label title="Giá bán = giá gốc × %">
          Giá %
          <input
            type="number"
            min={0}
            step={5}
            style={{ width: 64 }}
            defaultValue={shop.markup ?? 100}
            onBlur={(e) => Number(e.target.value) !== (shop.markup ?? 100) && save({ markup: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label className="shop-open">
          <input type="checkbox" checked={shop.open} onChange={(e) => save({ open: e.target.checked })} /> Mở cho người chơi
        </label>
      </div>
      <div className="hb-row">
        <label className="grow">
          Ghi chú (người chơi thấy)
          <input defaultValue={shop.note ?? ''} onBlur={(e) => e.target.value !== (shop.note ?? '') && save({ note: e.target.value || undefined })} />
        </label>
        <label className="grow">
          Ghi chú DM (ẩn)
          <input defaultValue={shop.dmNote ?? ''} onBlur={(e) => e.target.value !== (shop.dmNote ?? '') && save({ dmNote: e.target.value || undefined })} />
        </label>
      </div>
      <div className="hb-row">
        <label title={`Level nhóm hiện tại: ${party}`}>
          Level
          <input type="number" min={1} max={20} style={{ width: 56 }} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </label>
        <button disabled={!catalog} title={`Chọn lại toàn bộ hàng theo loại shop và level (tối đa ${RARITY_VI[maxRarityForLevel(level)]})`} onClick={regenerate}>
          🎲 Tạo lại hàng
        </button>
        <button title="Đưa số lượng mọi món về mức nhập hàng" onClick={() => send({ t: 'shopRestock', id: shop.id })}>
          📦 Nhập hàng
        </button>
        <button
          className="danger"
          onClick={() => window.confirm(`Xoá cửa hàng "${shop.name}"?`) && send({ t: 'shopRemove', id: shop.id })}
        >
          🗑 Xoá shop
        </button>
      </div>

      <table className="shop-table">
        <thead>
          <tr>
            <th>Món</th>
            <th title="Giá gốc (gp), trước Giá %">Giá gp</th>
            <th title="Còn lại; để trống = không giới hạn">Còn</th>
            <th title="Nhập hàng đưa về số này; để trống = không nhập lại">Nhập</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shop.items.map((i) => (
            <tr key={i.id} className={i.stock === 0 ? 'sold-out' : ''}>
              <td title={i.preset.notes}>
                {i.preset.name}
                {rarityText(i.preset) && <span className="hb-tag">{rarityText(i.preset)}</span>}
              </td>
              <td>
                <input
                  key={i.priceCp}
                  defaultValue={i.priceCp / 100}
                  style={{ width: 80 }}
                  onBlur={(e) => gpToCp(e.target.value) !== i.priceCp && setItem(i.id, { priceCp: gpToCp(e.target.value) })}
                />
              </td>
              <td>
                <input
                  key={`s${i.stock}`}
                  defaultValue={i.stock ?? ''}
                  placeholder="∞"
                  style={{ width: 44 }}
                  onBlur={(e) => {
                    const v = e.target.value.trim() === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0));
                    if (v !== i.stock) setItem(i.id, { stock: v });
                  }}
                />
              </td>
              <td>
                <input
                  key={`r${i.restock}`}
                  defaultValue={i.restock ?? ''}
                  placeholder="—"
                  style={{ width: 44 }}
                  onBlur={(e) => {
                    const v = e.target.value.trim() === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0));
                    if (v !== i.restock) setItem(i.id, { restock: v });
                  }}
                />
              </td>
              <td>
                <button className="link" title="Bỏ khỏi shop" onClick={() => save({ items: shop.items.filter((x) => x.id !== i.id) })}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {shop.items.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                Chưa có hàng. Bấm 🎲 Tạo lại hàng hoặc thêm từng món bên dưới.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="hb-row">
        <label className="grow">
          Thêm món từ danh mục
          <input placeholder="Tìm tên…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="shop-open">
          <input type="checkbox" checked={onlyKind} onChange={(e) => setOnlyKind(e.target.checked)} /> chỉ đúng loại shop
        </label>
      </div>
      {addable.length > 0 && (
        <div className="shop-add">
          {addable.map((p) => (
            <button key={p.id} className="hb-item" onClick={() => add(p)}>
              <span className="hb-name">+ {p.name}</span>
              <span className="hb-tag">{presetPriceCp(p) != null ? formatCp(presetPriceCp(p)!) : 'chưa có giá'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShopFront({ shop }: { shop: Shop }) {
  const send = useStore((s) => s.send);
  const room = useStore((s) => s.room);
  const participantId = useStore((s) => s.participantId);
  const mine = (room?.sheets ?? []).filter((s) => s.ownerId === participantId);
  const [sheetId, setSheetId] = useState(mine[0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const sheet = mine.find((s) => s.id === sheetId) ?? mine[0];
  const money = sheet ? purseCp(sheet.currency) : 0;

  return (
    <div className="hb-form shop-front">
      <h3>
        {kindOf(shop.kind).icon} {shop.name}
      </h3>
      {shop.note && <p className="hint">{shop.note}</p>}
      {mine.length === 0 ? (
        <p className="empty">Bạn chưa có nhân vật để mua.</p>
      ) : (
        <div className="hb-send">
          Mua cho
          <select value={sheet?.id} onChange={(e) => setSheetId(e.target.value)}>
            {mine.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="hint">
            Ví: {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((c) => sheet?.currency[c]).map((c) => `${sheet!.currency[c]} ${c}`).join(' · ') || 'trống'}
          </span>
        </div>
      )}
      <table className="shop-table">
        <thead>
          <tr>
            <th>Món</th>
            <th>Giá</th>
            <th>Còn</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shop.items.map((i) => {
            const price = shopPriceCp(shop, i);
            const n = Math.max(1, qty[i.id] ?? 1);
            const soldOut = i.stock === 0;
            const tooMuch = i.stock != null && n > i.stock;
            const poor = price * n > money;
            return (
              <tr key={i.id} className={soldOut ? 'sold-out' : ''}>
                <td title={i.preset.notes}>
                  {i.preset.name}
                  {rarityText(i.preset) && <span className="hb-tag">{rarityText(i.preset)}</span>}
                </td>
                <td>{formatCp(price)}</td>
                <td>{i.stock ?? '∞'}</td>
                <td className="shop-buy">
                  <input
                    type="number"
                    min={1}
                    max={i.stock ?? 99}
                    style={{ width: 44 }}
                    value={n}
                    disabled={soldOut || !sheet}
                    onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                  />
                  <button
                    disabled={!sheet || soldOut || tooMuch || poor}
                    title={soldOut ? 'Hết hàng' : poor ? `Không đủ tiền (cần ${formatCp(price * n)})` : `Trả ${formatCp(price * n)}, món vào túi đồ của ${sheet?.name}`}
                    onClick={() => sheet && send({ t: 'shopBuy', shopId: shop.id, itemId: i.id, sheetId: sheet.id, qty: n })}
                  >
                    {soldOut ? 'Hết' : 'Mua'}
                  </button>
                </td>
              </tr>
            );
          })}
          {shop.items.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                Cửa hàng đang trống.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

import type { CharacterSheet, Coin, Currency, EquipmentPreset, InventoryItem, Shop, ShopItem } from './types.js';
import { equipmentPresetFromDef } from './equipment.js';

/**
 * Shops: the DM sets up stores (general goods, smith, armourer, alchemist, magic…) whose stock is
 * picked from the equipment catalog to suit the party's level, priced in copper, with a stock count
 * the DM refills by hand ("restock"). Players buy from the shops the DM has opened; the server
 * takes the coins (making change) and puts the item in the character's inventory.
 */

export const SHOP_KINDS = [
  { key: 'general', label: 'Tạp hoá', icon: '🧺' },
  { key: 'weapons', label: 'Lò rèn / vũ khí', icon: '⚔' },
  { key: 'armor', label: 'Giáp & khiên', icon: '🛡' },
  { key: 'alchemist', label: 'Thuốc & giả kim', icon: '⚗' },
  { key: 'magic', label: 'Vật phẩm phép', icon: '✨' },
  { key: 'custom', label: 'Tuỳ chỉnh', icon: '🏪' },
] as const;
export type ShopKind = (typeof SHOP_KINDS)[number]['key'];

export const COIN_CP: Record<Coin, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

/** "15 gp" / "2 sp" / "1,500 gp" → copper pieces; null when there's no price. */
export function parseCostCp(cost: string | undefined): number | null {
  if (!cost) return null;
  const m = /([\d.,]+)\s*(pp|gp|ep|sp|cp)\b/i.exec(cost);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * COIN_CP[m[2].toLowerCase() as Coin]) : null;
}

/** "1 gp 5 sp" style text for a copper amount (no ep/pp: prices read in gold). */
export function formatCp(cp: number): string {
  const v = Math.max(0, Math.round(cp));
  const gp = Math.floor(v / 100);
  const sp = Math.floor((v % 100) / 10);
  const c = v % 10;
  const parts = [gp ? `${gp.toLocaleString('en-US')} gp` : '', sp ? `${sp} sp` : '', c ? `${c} cp` : ''].filter(Boolean);
  return parts.join(' ') || '0 gp';
}

export const RARITIES = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_VI: Record<Rarity, string> = {
  common: 'phổ biến',
  uncommon: 'không phổ biến',
  rare: 'hiếm',
  veryRare: 'rất hiếm',
  legendary: 'huyền thoại',
  artifact: 'cổ vật',
};

/** Free-text rarity (English or Vietnamese, or a range like "uncommon–legendary" → the lowest) → key. */
export function rarityKey(r: unknown): Rarity | null {
  if (typeof r !== 'string' || !r.trim()) return null;
  const s = r.toLowerCase().split(/[–—-]|\bto\b/)[0].trim();
  if (/very\s*rare|rất\s*hiếm/.test(s)) return 'veryRare';
  if (/uncommon|không\s*phổ\s*biến/.test(s)) return 'uncommon';
  if (/common|phổ\s*biến/.test(s)) return 'common';
  if (/rare|hiếm/.test(s)) return 'rare';
  if (/legendary|huyền\s*thoại/.test(s)) return 'legendary';
  if (/artifact|cổ\s*vật/.test(s)) return 'artifact';
  return null;
}

/** Magic item prices by rarity (5e 2024 DMG guide, gp); consumables (potions, scrolls) cost half. */
export const RARITY_PRICE_GP: Record<Rarity, number> = {
  common: 100,
  uncommon: 400,
  rare: 4000,
  veryRare: 40000,
  legendary: 200000,
  artifact: 0,
};

/** Highest rarity a shop offers a party of this level (tiers 1–4, 5–10, 11–16, 17+). */
export function maxRarityForLevel(level: number): Rarity {
  return level >= 17 ? 'legendary' : level >= 11 ? 'veryRare' : level >= 5 ? 'rare' : 'uncommon';
}

const isConsumable = (p: EquipmentPreset) => p.type === 'consumable' || /potion|scroll|elixir|oil of|thuốc|cuộn/i.test(p.name);

/** List price of a catalog item in copper: its own cost, else by rarity; null = can't be priced (artifacts). */
export function presetPriceCp(p: EquipmentPreset): number | null {
  const own = parseCostCp(p.cost);
  if (own != null) return own;
  const r = rarityKey(p.rarity);
  if (!r || r === 'artifact') return null;
  return RARITY_PRICE_GP[r] * 100 * (isConsumable(p) ? 0.5 : 1);
}

/** Whether a catalog item belongs on a shop of this kind. */
export function shopKindAccepts(kind: string, p: EquipmentPreset): boolean {
  const magic = rarityKey(p.rarity) != null;
  switch (kind) {
    case 'general':
      return !magic && (p.type === 'gear' || p.type === 'consumable');
    case 'weapons':
      return !magic && p.type === 'weapon';
    case 'armor':
      return !magic && (p.type === 'armor' || p.type === 'shield');
    case 'alchemist':
      return isConsumable(p) && (!magic || (rarityKey(p.rarity) !== 'artifact'));
    case 'magic':
      return magic;
    default:
      return true;
  }
}

/** Party level for shop stock: the average level of the players' sheets (at least 1). */
export function partyLevel(sheets: CharacterSheet[], playerIds: Set<string>): number {
  const lv = sheets.filter((s) => s.ownerId && playerIds.has(s.ownerId)).map((s) => s.level || 1);
  return lv.length ? Math.max(1, Math.round(lv.reduce((a, b) => a + b, 0) / lv.length)) : 1;
}

/** Items a shop of this kind can carry for this level (priced, rarity within the level's cap). */
export function shopCandidates(catalog: EquipmentPreset[], kind: string, level: number): EquipmentPreset[] {
  const cap = RARITIES.indexOf(maxRarityForLevel(level));
  return catalog.filter((p) => {
    if (!shopKindAccepts(kind, p) || presetPriceCp(p) == null) return false;
    const r = rarityKey(p.rarity);
    return r == null || RARITIES.indexOf(r) <= cap;
  });
}

/** Weight of a rarity in a random pick: the top rarities a level allows are scarcer. */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 8, uncommon: 6, rare: 3, veryRare: 1.5, legendary: 0.6, artifact: 0 };

export interface StockOptions {
  /** How many different items (default: 30 general goods, 8 magic, 12 custom; smith / armour / alchemist carry all). */
  count?: number;
  /** Random source (tests pass a seeded one). */
  rng?: () => number;
  newId?: () => string;
}

/**
 * Fill a shop for a party of `level`: smiths / armourers / alchemists carry their whole category,
 * the general store, magic and custom shops a weighted random handful. Mundane goods stock 5–10,
 * magic potions 1–3, other magic items 1; "restock" refills to the same numbers.
 */
export function generateShopStock(catalog: EquipmentPreset[], kind: string, level: number, opts: StockOptions = {}): ShopItem[] {
  const rng = opts.rng ?? Math.random;
  const newId = opts.newId ?? (() => Math.random().toString(36).slice(2, 10));
  let pool = shopCandidates(catalog, kind, level);
  const defaultCount: Record<string, number> = { general: 30, magic: 8, custom: 12 };
  const count = opts.count ?? defaultCount[kind];
  if (count != null) {
    const want = Math.min(pool.length, count);
    const picked: EquipmentPreset[] = [];
    const left = [...pool];
    while (picked.length < want && left.length) {
      const w = left.map((p) => RARITY_WEIGHT[rarityKey(p.rarity) ?? 'common'] || 0.1);
      let roll = rng() * w.reduce((a, b) => a + b, 0);
      let i = 0;
      while (i < left.length - 1 && roll >= w[i]) roll -= w[i++];
      picked.push(left.splice(i, 1)[0]);
    }
    pool = picked;
  }
  return pool
    .map((p): ShopItem => {
      const magic = rarityKey(p.rarity) != null && !isConsumable(p);
      const stock = magic ? 1 : isConsumable(p) && rarityKey(p.rarity) ? 1 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 6);
      return { id: newId(), preset: p, priceCp: presetPriceCp(p) ?? 0, stock, restock: stock };
    })
    .sort((a, b) => a.priceCp - b.priceCp || a.preset.name.localeCompare(b.preset.name));
}

/** What a shop item costs to buy (the shop's markup in percent, default 100). */
export function shopPriceCp(shop: Pick<Shop, 'markup'>, item: Pick<ShopItem, 'priceCp'>): number {
  return Math.max(0, Math.round((item.priceCp * (shop.markup ?? 100)) / 100));
}

export const purseCp = (c: Currency): number => (Object.keys(COIN_CP) as Coin[]).reduce((a, k) => a + (c[k] ?? 0) * COIN_CP[k], 0);

/**
 * Pay `cp` from a purse, the way a shopkeeper would: largest coins first without overpaying, then
 * break one coin for the rest and give change in gp / sp / cp. Null when the purse is short.
 */
export function payFromPurse(purse: Currency, cp: number): Currency | null {
  if (cp <= 0) return { ...purse };
  if (purseCp(purse) < cp) return null;
  const out: Currency = { ...purse };
  const order: Coin[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
  let need = cp;
  for (const c of order) {
    const n = Math.min(out[c] ?? 0, Math.floor(need / COIN_CP[c]));
    out[c] = (out[c] ?? 0) - n;
    need -= n * COIN_CP[c];
  }
  if (need > 0) {
    // every coin left is worth more than what's owed: break the smallest one
    const c = [...order].reverse().find((k) => (out[k] ?? 0) > 0 && COIN_CP[k] > need);
    if (!c) return null;
    out[c] -= 1;
    let change = COIN_CP[c] - need;
    for (const k of ['gp', 'sp', 'cp'] as Coin[]) {
      const n = Math.floor(change / COIN_CP[k]);
      out[k] = (out[k] ?? 0) + n;
      change -= n * COIN_CP[k];
    }
  }
  return out;
}

/** The inventory after buying `qty` of a shop item: stackables join a same-named row, the rest are new rows. */
export function addShopPurchase(inventory: InventoryItem[], item: ShopItem, qty: number, newId: () => string): InventoryItem[] {
  const p = item.preset;
  const stackable = p.type === 'gear' || p.type === 'consumable';
  if (stackable) {
    const same = inventory.find((i) => i.name === p.name && i.type === p.type);
    if (same) return inventory.map((i) => (i === same ? { ...i, quantity: i.quantity + qty } : i));
    return [...inventory, { ...equipmentPresetFromDef(p, newId), quantity: qty }];
  }
  return [...inventory, ...Array.from({ length: qty }, () => equipmentPresetFromDef(p, newId))];
}

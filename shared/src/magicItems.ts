import type { CharacterSheet, InventoryItem } from './types.js';

/** Table-specific (homebrew) magic items whose effects the app applies by itself. */
export type MagicItemKey = 'wolf-fangs' | 'hood-ki' | 'tophat-mockery' | 'circlet-rejuvenation';

interface MagicItemDef {
  key: MagicItemKey;
  /** English card name — also what the "+ vật phẩm homebrew" picker inserts. */
  name: string;
  /** Matches the item name however the table typed it (English or Vietnamese, any accents). */
  match: RegExp;
  /** Vietnamese rules summary shown in the inventory row. */
  notes: string;
}

const MAGIC_ITEMS: MagicItemDef[] = [
  {
    key: 'wolf-fangs',
    name: 'Necklace of Wolf Fangs',
    match: /wolf\s*fang|nanh\s*soi/,
    notes:
      'Tự động: nếu có Sneak Attack, số d6 Sneak Attack tăng thêm bằng Proficiency Bonus. Cần Equipped + Điều hợp.',
  },
  {
    key: 'hood-ki',
    name: 'Hood of Empowered Ki',
    match: /empowered\s*ki|ho\s*mon\s*khi/,
    notes: 'Tự động: thêm số Focus (ki) Point bằng Proficiency Bonus cho Monk. Cần Equipped + Điều hợp.',
  },
  {
    key: 'tophat-mockery',
    name: 'Top Hat of Mental Anguish',
    match: /mental\s*anguish|ton\s*thuong\s*tam\s*tri/,
    notes:
      'Tự động: biết cantrip Great Fool’s Vicious Mockery (tab Phép) — đòn phép tầm xa 60ft, 1d6 Psychic, mục tiêu bất lợi đòn đánh kế tiếp; 2/3/4 đòn ở cấp 5/11/17. Dùng chỉ số ra phép của bạn, không có thì CHA. Cần Equipped + Điều hợp.',
  },
  {
    key: 'circlet-rejuvenation',
    name: 'Circlet of Natural Rejuvenation',
    match: /natural\s*rejuvenation|nguyet\s*que.*hoi\s*sinh/,
    notes:
      'Tự động: mỗi khi tiêu 1 lần Wild Shape, nhận HP tạm = Proficiency Bonus + cấp Druid (không cộng dồn). Cần Equipped + Điều hợp.',
  },
];

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

export function magicItemKeyOf(item: Pick<InventoryItem, 'name'>): MagicItemKey | null {
  const n = fold(item.name ?? '');
  return MAGIC_ITEMS.find((d) => d.match.test(n))?.key ?? null;
}

/** True while the character wears AND is attuned to (a copy of) this item — every one of these
 *  items requires attunement, so a merely-carried one does nothing. */
export function magicItemActive(sheet: Pick<CharacterSheet, 'inventory'>, key: MagicItemKey): boolean {
  return (sheet.inventory ?? []).some((it) => it.equipped && it.attuned && magicItemKeyOf(it) === key);
}

/** Ready-to-add inventory rows for the four homebrew items (the "+ vật phẩm homebrew" picker). */
export function magicItemPresets(newId: () => string): InventoryItem[] {
  return MAGIC_ITEMS.map((d) => ({
    id: newId(),
    name: d.name,
    type: 'gear' as const,
    quantity: 1,
    weight: 0,
    equipped: true,
    attuned: false, // the table picks which 3 to attune to (cap = ATTUNEMENT_SLOTS)
    attunementRequired: true,
    rarity: 'Hiếm',
    notes: d.notes,
  }));
}

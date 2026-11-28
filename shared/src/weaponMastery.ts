import type { CharacterSheet, InventoryItem } from './types.js';
import { classLevelOf, hasFeat } from './rules.js';

/**
 * Weapon properties, Weapon Mastery and the Fighting Style feats (SRD 5.2.1 rules, CC-BY-4.0).
 *
 * The weapon table gives each SRD weapon its properties and mastery; an inventory item is matched
 * by its `weaponKind` (set in the equipment tab) or else by name ("+1 Longsword", "Longsword of
 * Flames" → Longsword). A character uses the mastery of a weapon only if that weapon kind is in
 * `sheet.weaponMasteries` (chosen on the sheet; how many depends on class and level).
 */

export type WeaponProp = 'light' | 'heavy' | 'two-handed' | 'versatile' | 'thrown' | 'finesse' | 'reach' | 'loading' | 'ammunition';
export type WeaponMasteryKind = 'cleave' | 'graze' | 'nick' | 'push' | 'sap' | 'slow' | 'topple' | 'vex';

export const MASTERY_VI: Record<WeaponMasteryKind, { name: string; text: string }> = {
  cleave: { name: 'Cleave', text: 'Trúng đòn cận chiến: được đánh thêm 1 kẻ khác trong 5 ft mục tiêu đầu (không cộng điểm chỉ số vào sát thương), 1 lần/lượt.' },
  graze: { name: 'Graze', text: 'Trượt: vẫn gây sát thương bằng điểm chỉ số dùng để đánh (cùng loại sát thương).' },
  nick: { name: 'Nick', text: 'Đòn thêm của vũ khí Light được đánh trong hành động Attack, không tốn Bonus Action (1 lần/lượt).' },
  push: { name: 'Push', text: 'Trúng: đẩy mục tiêu cỡ Large trở xuống ra xa 10 ft.' },
  sap: { name: 'Sap', text: 'Trúng: mục tiêu bị Bất lợi ở đòn tấn công kế tiếp trước đầu lượt sau của bạn.' },
  slow: { name: 'Slow', text: 'Trúng và gây sát thương: Speed mục tiêu −10 ft đến đầu lượt sau của bạn (không cộng dồn).' },
  topple: { name: 'Topple', text: 'Trúng: mục tiêu cứu CON (DC 8 + điểm chỉ số đánh + Proficiency) hoặc ngã Prone.' },
  vex: { name: 'Vex', text: 'Trúng và gây sát thương: Lợi thế ở đòn kế tiếp của bạn vào mục tiêu đó trước hết lượt sau của bạn.' },
};

export interface WeaponInfo {
  /** Table key, e.g. "longsword". */
  kind: string;
  name: string;
  props: WeaponProp[];
  mastery: WeaponMasteryKind;
}

const W = (name: string, props: WeaponProp[], mastery: WeaponMasteryKind): WeaponInfo => ({ kind: name.toLowerCase(), name, props, mastery });

/** SRD 5.2.1 weapons table. */
export const SRD_WEAPONS: WeaponInfo[] = [
  // simple melee
  W('Club', ['light'], 'slow'),
  W('Dagger', ['finesse', 'light', 'thrown'], 'nick'),
  W('Greatclub', ['two-handed'], 'push'),
  W('Handaxe', ['light', 'thrown'], 'vex'),
  W('Javelin', ['thrown'], 'slow'),
  W('Light Hammer', ['light', 'thrown'], 'nick'),
  W('Mace', [], 'sap'),
  W('Quarterstaff', ['versatile'], 'topple'),
  W('Sickle', ['light'], 'nick'),
  W('Spear', ['thrown', 'versatile'], 'sap'),
  // simple ranged
  W('Dart', ['finesse', 'thrown'], 'vex'),
  W('Light Crossbow', ['ammunition', 'loading', 'two-handed'], 'slow'),
  W('Shortbow', ['ammunition', 'two-handed'], 'vex'),
  W('Sling', ['ammunition'], 'slow'),
  // martial melee
  W('Battleaxe', ['versatile'], 'topple'),
  W('Flail', [], 'sap'),
  W('Glaive', ['heavy', 'reach', 'two-handed'], 'graze'),
  W('Greataxe', ['heavy', 'two-handed'], 'cleave'),
  W('Greatsword', ['heavy', 'two-handed'], 'graze'),
  W('Halberd', ['heavy', 'reach', 'two-handed'], 'cleave'),
  W('Lance', ['heavy', 'reach', 'two-handed'], 'topple'),
  W('Longsword', ['versatile'], 'sap'),
  W('Maul', ['heavy', 'two-handed'], 'topple'),
  W('Morningstar', [], 'sap'),
  W('Pike', ['heavy', 'reach', 'two-handed'], 'push'),
  W('Rapier', ['finesse'], 'vex'),
  W('Scimitar', ['finesse', 'light'], 'nick'),
  W('Shortsword', ['finesse', 'light'], 'vex'),
  W('Trident', ['thrown', 'versatile'], 'topple'),
  W('Warhammer', ['versatile'], 'push'),
  W('War Pick', ['versatile'], 'sap'),
  W('Whip', ['finesse', 'reach'], 'slow'),
  // martial ranged
  W('Blowgun', ['ammunition', 'loading'], 'vex'),
  W('Hand Crossbow', ['ammunition', 'light', 'loading'], 'vex'),
  W('Heavy Crossbow', ['ammunition', 'heavy', 'loading', 'two-handed'], 'push'),
  W('Longbow', ['ammunition', 'heavy', 'two-handed'], 'slow'),
  W('Musket', ['ammunition', 'loading', 'two-handed'], 'slow'),
  W('Pistol', ['ammunition', 'loading'], 'vex'),
];

const BY_KIND = new Map(SRD_WEAPONS.map((w) => [w.kind, w]));
// longest names first, so "light crossbow" wins over a shorter name inside it
const BY_LENGTH = [...SRD_WEAPONS].sort((a, b) => b.kind.length - a.kind.length);

export function weaponByKind(kind: string | undefined): WeaponInfo | undefined {
  return kind ? BY_KIND.get(kind.trim().toLowerCase()) : undefined;
}

/** The SRD weapon an inventory item is: its `weaponKind`, else the weapon name found in its name. */
export function weaponInfo(it: Pick<InventoryItem, 'name' | 'type'> & { weaponKind?: string }): WeaponInfo | undefined {
  if (it.type !== 'weapon') return undefined;
  const set = weaponByKind(it.weaponKind);
  if (set) return set;
  const n = ` ${it.name.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  return BY_LENGTH.find((w) => n.includes(` ${w.kind} `));
}

export function hasProp(info: WeaponInfo | undefined, p: WeaponProp): boolean {
  return !!info?.props.includes(p);
}

/** Weapon kinds a character can master at once (class table + Weapon Master feat). */
export function masterySlots(sheet: CharacterSheet): number {
  const lv = (c: string) => classLevelOf(sheet, c);
  let n = 0;
  const f = lv('fighter');
  if (f) n = Math.max(n, f >= 16 ? 6 : f >= 10 ? 5 : f >= 4 ? 4 : 3);
  const b = lv('barbarian');
  if (b) n = Math.max(n, b >= 10 ? 4 : b >= 4 ? 3 : 2);
  for (const c of ['paladin', 'ranger', 'rogue']) if (lv(c)) n = Math.max(n, 2);
  if (hasFeat(sheet, 'Weapon Master')) n += 1;
  return n;
}

/** The mastery this item's attacks use, or undefined (not mastered / not an SRD weapon). */
export function itemMastery(sheet: CharacterSheet, it: InventoryItem): WeaponMasteryKind | undefined {
  const info = weaponInfo(it);
  if (!info) return undefined;
  const chosen = (sheet.weaponMasteries ?? []).map((k) => k.toLowerCase());
  return chosen.includes(info.kind) ? info.mastery : undefined;
}

// ---------------------------------------------------------------------------
// Fighting Style feats (2024: Fighter / Paladin / Ranger pick one as a feat)
// ---------------------------------------------------------------------------

export type FightingStyle =
  | 'archery'
  | 'blind-fighting'
  | 'defense'
  | 'dueling'
  | 'great-weapon-fighting'
  | 'interception'
  | 'protection'
  | 'thrown-weapon-fighting'
  | 'two-weapon-fighting'
  | 'unarmed-fighting';

const STYLE_NAMES: Record<FightingStyle, string> = {
  archery: 'Archery',
  'blind-fighting': 'Blind Fighting',
  defense: 'Defense',
  dueling: 'Dueling',
  'great-weapon-fighting': 'Great Weapon Fighting',
  interception: 'Interception',
  protection: 'Protection',
  'thrown-weapon-fighting': 'Thrown Weapon Fighting',
  'two-weapon-fighting': 'Two-Weapon Fighting',
  'unarmed-fighting': 'Unarmed Fighting',
};

export function hasStyle(sheet: CharacterSheet | undefined, s: FightingStyle): boolean {
  return !!sheet && hasFeat(sheet, STYLE_NAMES[s]);
}

/** Equipped melee weapons that are Light (two of them → the off-hand attack). */
export function lightMeleeWeapons(sheet: CharacterSheet): InventoryItem[] {
  return sheet.inventory.filter((it) => it.type === 'weapon' && it.equipped && hasProp(weaponInfo(it), 'light') && !hasProp(weaponInfo(it), 'ammunition'));
}

export function shieldEquipped(sheet: CharacterSheet): boolean {
  return sheet.inventory.some((it) => it.type === 'shield' && it.equipped);
}

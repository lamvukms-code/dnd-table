import type { CharacterSheet, DamagePart, MetamagicKey } from './types.js';
import { abilityMod, classLevelOf } from './rules.js';

/**
 * Sorcerer (SRD 5.2.1): Font of Magic, Metamagic, Sorcerous Restoration, Innate Sorcery.
 * Rules text is paraphrased in Vietnamese; the numbers come from the SRD class table.
 */

export const sorcererLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'sorcerer');

/** Sorcery Points: equal to Sorcerer level, from level 2. */
export function sorceryPointsMax(sheet: CharacterSheet): number {
  const sl = sorcererLevel(sheet);
  return sl >= 2 ? sl : 0;
}
export function sorceryPointsLeft(sheet: CharacterSheet): number {
  return Math.max(0, sorceryPointsMax(sheet) - (sheet.sorceryUsed ?? 0));
}

/** Metamagic options known: 2 at level 2, 4 at 10, 6 at 17. */
export function metamagicKnownMax(sheet: CharacterSheet): number {
  const sl = sorcererLevel(sheet);
  return sl >= 17 ? 6 : sl >= 10 ? 4 : sl >= 2 ? 2 : 0;
}

export interface MetamagicDef {
  key: MetamagicKey;
  name: string;
  cost: number;
  /** Can go on a spell together with another Metamagic option. */
  stacks?: boolean;
  vi: string;
}

export const METAMAGIC: MetamagicDef[] = [
  { key: 'careful', name: 'Careful Spell', cost: 1, vi: 'Phép có save: tối đa CHA mod đồng minh (token người chơi) trong vùng tự đỗ save và không nhận sát thương.' },
  { key: 'distant', name: 'Distant Spell', cost: 1, vi: 'Tầm phép gấp đôi (chạm → 30 ft). App: vùng phép được đặt xa gấp đôi.' },
  { key: 'empowered', name: 'Empowered Spell', cost: 1, stacks: true, vi: 'Đổ lại tối đa CHA mod xúc xắc sát thương thấp nhất (dưới trung bình), lấy kết quả mới. Dùng chung được với Metamagic khác.' },
  { key: 'extended', name: 'Extended Spell', cost: 1, vi: 'Thời gian phép gấp đôi (tối đa 24 giờ); phép tập trung thì lợi thế khi save giữ tập trung.' },
  { key: 'heightened', name: 'Heightened Spell', cost: 2, vi: 'Mục tiêu bị bất lợi khi save chống phép.' },
  { key: 'quickened', name: 'Quickened Spell', cost: 2, vi: 'Phép tốn 1 Action thành Bonus Action. Không dùng nếu lượt này đã đúc phép cấp 1+.' },
  { key: 'seeking', name: 'Seeking Spell', cost: 1, stacks: true, vi: 'Đòn phép trượt thì đổ lại d20 một lần, lấy kết quả mới. Dùng chung được với Metamagic khác.' },
  { key: 'subtle', name: 'Subtle Spell', cost: 1, vi: 'Đúc phép không cần Verbal / Somatic / Material (trừ vật liệu có giá).' },
  { key: 'transmuted', name: 'Transmuted Spell', cost: 1, vi: 'Đổi loại sát thương giữa acid, cold, fire, lightning, poison, thunder.' },
  { key: 'twinned', name: 'Twinned Spell', cost: 1, vi: 'Phép tăng mục tiêu khi nâng ô: cấp hiệu lực +1 (thêm 1 mục tiêu). App: xúc xắc nâng ô tính thêm 1 cấp.' },
];
export const metamagicDef = (k: MetamagicKey): MetamagicDef | undefined => METAMAGIC.find((m) => m.key === k);

export const TRANSMUTE_TYPES = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'];

export function metamagicCost(keys: MetamagicKey[]): number {
  return keys.reduce((s, k) => s + (metamagicDef(k)?.cost ?? 0), 0);
}

/**
 * Can these options go on one spell? One option per spell, plus any that stack (Empowered,
 * Seeking). Sorcery Incarnate (level 7, while Innate Sorcery is up) allows two.
 */
export function metamagicProblem(keys: MetamagicKey[], opts: { incarnate?: boolean } = {}): string | null {
  const plain = keys.filter((k) => !metamagicDef(k)?.stacks);
  const allowed = opts.incarnate ? 2 : 1;
  if (plain.length > allowed) return opts.incarnate ? 'Tối đa 2 Metamagic mỗi phép (Sorcery Incarnate)' : 'Chỉ 1 Metamagic mỗi phép (trừ Empowered / Seeking)';
  return null;
}

/** Font of Magic: cost in Sorcery Points to create a slot, and the Sorcerer level it needs. */
export const SLOT_CREATE_COST: Record<number, { cost: number; minLevel: number }> = {
  1: { cost: 2, minLevel: 2 },
  2: { cost: 3, minLevel: 3 },
  3: { cost: 5, minLevel: 5 },
  4: { cost: 6, minLevel: 7 },
  5: { cost: 7, minLevel: 9 },
};

/** Font of Magic: spend a slot (no action) to gain Sorcery Points equal to its level. */
export function slotToPoints(sheet: CharacterSheet, level: number): CharacterSheet | string {
  const max = sorceryPointsMax(sheet);
  if (!max) return 'Cần Sorcerer cấp 2 (Font of Magic)';
  const slot = sheet.spellSlots.find((s) => s.level === level);
  if (!slot || slot.used >= slot.max) return `Không còn ô phép cấp ${level}`;
  const used = sheet.sorceryUsed ?? 0;
  if (used === 0) return 'Sorcery Points đang đầy';
  return {
    ...sheet,
    sorceryUsed: Math.max(0, used - level),
    spellSlots: sheet.spellSlots.map((s) => (s.level === level ? { ...s, used: s.used + 1 } : s)),
  };
}

/** Font of Magic: spend Sorcery Points (Bonus Action) to create a slot up to level 5. It vanishes on a long rest. */
export function pointsToSlot(sheet: CharacterSheet, level: number): CharacterSheet | string {
  const row = SLOT_CREATE_COST[level];
  if (!row) return 'Chỉ tạo được ô phép cấp 1–5';
  if (sorcererLevel(sheet) < row.minLevel) return `Tạo ô cấp ${level} cần Sorcerer cấp ${row.minLevel}`;
  if (sorceryPointsLeft(sheet) < row.cost) return `Cần ${row.cost} Sorcery Points`;
  const slots = sheet.spellSlots.some((s) => s.level === level)
    ? sheet.spellSlots
    : [...sheet.spellSlots, { level, max: 0, used: 0 }].sort((a, b) => a.level - b.level);
  const key = String(level);
  // an expended slot comes back; with none expended the new slot sits on top of the maximum
  // (tracked in `createdSlots` so the slot table keeps it until the long rest)
  const refill = (slots.find((s) => s.level === level)?.used ?? 0) > 0;
  return {
    ...sheet,
    sorceryUsed: (sheet.sorceryUsed ?? 0) + row.cost,
    spellSlots: slots.map((s) => (s.level !== level ? s : refill ? { ...s, used: s.used - 1 } : { ...s, max: s.max + 1 })),
    ...(refill ? {} : { createdSlots: { ...(sheet.createdSlots ?? {}), [key]: (sheet.createdSlots?.[key] ?? 0) + 1 } }),
  };
}

/** Sorcerous Restoration (level 5): on a short rest, regain up to half the Sorcerer level (round down); once per long rest. */
export function sorcerousRestoration(sheet: CharacterSheet): CharacterSheet | string {
  const sl = sorcererLevel(sheet);
  if (sl < 5) return 'Cần Sorcerer cấp 5';
  if (sheet.sorcRestoreUsed) return 'Đã dùng Sorcerous Restoration từ lần nghỉ dài trước';
  if (!sheet.sorceryUsed) return 'Sorcery Points đang đầy';
  return { ...sheet, sorceryUsed: Math.max(0, sheet.sorceryUsed - Math.floor(sl / 2)), sorcRestoreUsed: true };
}

/** Long rest: points back, created slots gone, restoration ready again. Applied after the slots refill. */
export function sorcererLongRest(sheet: CharacterSheet): Partial<CharacterSheet> {
  const created = sheet.createdSlots ?? {};
  const spellSlots = Object.keys(created).length
    ? sheet.spellSlots
        .map((s) => ({ ...s, max: Math.max(0, s.max - (created[String(s.level)] ?? 0)) }))
        .filter((s) => s.max > 0)
    : sheet.spellSlots;
  return { sorceryUsed: 0, sorcRestoreUsed: false, createdSlots: {}, metamagicArmed: [], spellSlots };
}

/** Innate Sorcery uses: 2 per long rest (pool id in `subclassUses`). */
export const INNATE_SORCERY_ID = 'sorc-innate-sorcery';
export const INNATE_SORCERY = 'Innate Sorcery';

// --- applying Metamagic to one cast ---------------------------------------------------------

/** How many dice Empowered Spell may reroll: CHA modifier, at least 1. */
export const empoweredDice = (sheet: CharacterSheet): number => Math.max(1, abilityMod(sheet.abilities.cha));
/** How many creatures Careful Spell protects: CHA modifier, at least 1. */
export const carefulCount = (sheet: CharacterSheet): number => Math.max(1, abilityMod(sheet.abilities.cha));

/** Damage parts after Transmuted (type swap) and Empowered (reroll the lowest dice). */
export function metamagicDamage(parts: DamagePart[] | undefined, meta: MetamagicKey[], sheet: CharacterSheet): DamagePart[] | undefined {
  if (!parts?.length || !meta.length) return parts;
  const to = sheet.metamagicTransmute;
  let out = parts;
  if (meta.includes('transmuted') && to && TRANSMUTE_TYPES.includes(to)) {
    out = out.map((p) => (TRANSMUTE_TYPES.includes(p.type) ? { ...p, type: to } : p));
  }
  if (meta.includes('empowered')) out = out.map((p, i) => (i === 0 ? { ...p, rerollLowest: empoweredDice(sheet) } : p));
  return out;
}

/** Text appended to a cast's log label. */
export function metamagicLabel(meta: MetamagicKey[]): string {
  return meta.length ? ` · ✨ ${meta.map((k) => metamagicDef(k)?.name.replace(' Spell', '') ?? k).join(', ')}` : '';
}

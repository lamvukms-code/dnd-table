import type {
  Ability,
  CharacterSheet,
  ConditionType,
  DamagePart,
  Spell,
  SpellCastKind,
} from './types.js';
import { sheetClasses, totalLevelOf } from './rules.js';

/**
 * D&D 5e (2024) cantrips. Descriptions are short paraphrases of the mechanics —
 * the System Reference Document 5.2 (© Wizards of the Coast, CC-BY-4.0) covers
 * these. No spell text is reproduced; `guidance` is a brief Vietnamese summary
 * of how the cantrip works and how this app handles it.
 *
 * `combat: true` cantrips are wired semi-automatically: picking one fills in the
 * cast kind, the damage dice (scaled to the character's level) and, for save
 * cantrips, the saving throw — so the point-and-click cast flow just works.
 * Everything else is added as a plain entry with guidance text for the player.
 */
export interface CantripDef {
  id: string;
  name: string;
  school: string;
  /** Lowercase class names whose spell list includes this cantrip (2024). */
  classes: string[];
  /** true => the app wires damage / save automatically. */
  combat: boolean;
  castKind: SpellCastKind; // 'attack' | 'save' | 'utility'
  actionType?: 'action' | 'bonus';
  /** One die, e.g. '1d10'. Scaled by count at character levels 5 / 11 / 17. */
  damageDie?: string;
  damageType?: string;
  /** Saving throw the target rolls (for `castKind: 'save'`). */
  save?: Ability;
  concentration?: boolean;
  /** Effect placed on the target (advisory badge unless the condition is wired). */
  effect?: { name: string; condition?: ConditionType; note?: string; expiresInRounds?: number };
  /** One-shot d20 bonus die placed on the target (Guidance +1d4 to an ability check). */
  rollBonus?: { dice: string; scope: 'check' | 'save' | 'attack' };
  range?: string;
  /** Short Vietnamese paraphrase of the SRD mechanic + how the app handles it. */
  guidance: string;
}

/** Cantrip damage multiplier by character level (5e 2024: 1 / 2 / 3 / 4 dice). */
export function cantripTier(charLevel: number): number {
  return charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
}

/** Scale a single die spec ('1d10') by the cantrip tier for `charLevel` ('3d10'). */
export function scaleCantripDie(die: string, charLevel: number): string {
  const m = /^\s*(\d+)\s*d\s*(\d+)\s*$/i.exec(die);
  if (!m) return die;
  return `${Number(m[1]) * cantripTier(charLevel)}d${m[2]}`;
}

const C = (
  id: string,
  name: string,
  school: string,
  classes: string[],
  guidance: string,
  extra: Partial<CantripDef> = {},
): CantripDef => ({
  id,
  name,
  school,
  classes,
  combat: false,
  castKind: 'utility',
  guidance,
  ...extra,
});

/** Combat cantrips — semi-automatic (attack roll or saving throw + scaled damage). */
const COMBAT: CantripDef[] = [
  C('fire-bolt', 'Fire Bolt', 'Evocation', ['sorcerer', 'wizard'],
    'Đòn đánh phép tầm 120ft. Trúng: 1d10 lửa (2d10 cấp 5 · 3d10 cấp 11 · 4d10 cấp 17). Bắt cháy vật không ai giữ.',
    { combat: true, castKind: 'attack', damageDie: '1d10', damageType: 'fire', range: '120ft' }),
  C('eldritch-blast', 'Eldritch Blast', 'Evocation', ['warlock'],
    'Đòn đánh phép tầm 120ft, 1d10 lực mỗi tia. Thêm tia ở cấp 5/11/17 (app gộp thành 2d10/3d10/4d10 — muốn bắn nhiều mục tiêu thì tung tay từng tia). Agonizing Blast: tự cộng CHA mod vào mỗi tia.',
    { combat: true, castKind: 'attack', damageDie: '1d10', damageType: 'force', range: '120ft' }),
  C('ray-of-frost', 'Ray of Frost', 'Evocation', ['sorcerer', 'wizard'],
    'Đòn đánh phép tầm 60ft. Trúng: 1d8 băng và tốc độ mục tiêu −10ft tới đầu lượt sau của bạn.',
    { combat: true, castKind: 'attack', damageDie: '1d8', damageType: 'cold', range: '60ft' }),
  C('shocking-grasp', 'Shocking Grasp', 'Evocation', ['sorcerer', 'wizard'],
    'Đòn đánh phép chạm. Trúng: 1d8 sét, mục tiêu không dùng được reaction tới đầu lượt sau. Lợi thế nếu mục tiêu mặc giáp kim loại.',
    { combat: true, castKind: 'attack', damageDie: '1d8', damageType: 'lightning', range: 'Chạm' }),
  C('chill-touch', 'Chill Touch', 'Necromancy', ['sorcerer', 'warlock', 'wizard'],
    'Đòn đánh phép chạm. Trúng: 1d10 hoại tử và mục tiêu không hồi HP được tới đầu lượt sau của bạn.',
    { combat: true, castKind: 'attack', damageDie: '1d10', damageType: 'necrotic', range: 'Chạm' }),
  C('produce-flame', 'Produce Flame', 'Conjuration', ['druid'],
    'Ngọn lửa trên tay toả sáng. Có thể ném: đòn đánh phép tầm 30ft, trúng 1d8 lửa.',
    { combat: true, castKind: 'attack', damageDie: '1d8', damageType: 'fire', range: '30ft' }),
  C('thorn-whip', 'Thorn Whip', 'Transmutation', ['druid'],
    'Đòn đánh phép tầm 30ft. Trúng: 1d6 xuyên; nếu mục tiêu cỡ Large trở xuống thì kéo lại gần bạn 10ft.',
    { combat: true, castKind: 'attack', damageDie: '1d6', damageType: 'piercing', range: '30ft' }),
  C('sacred-flame', 'Sacred Flame', 'Evocation', ['cleric'],
    'Mục tiêu tầm 60ft chịu save DEX (cover không giúp). Thất bại: 1d8 thánh. Không sát thương khi save thành công.',
    { combat: true, castKind: 'save', save: 'dex', damageDie: '1d8', damageType: 'radiant', range: '60ft' }),
  C('toll-the-dead', 'Toll the Dead', 'Necromancy', ['cleric', 'warlock', 'wizard'],
    'Mục tiêu tầm 60ft chịu save WIS. Thất bại: 1d8 hoại tử — đổi thành 1d12 nếu mục tiêu đang mất HP (sửa ô sát thương tay khi cần).',
    { combat: true, castKind: 'save', save: 'wis', damageDie: '1d8', damageType: 'necrotic', range: '60ft' }),
  C('poison-spray', 'Poison Spray', 'Necromancy', ['druid', 'sorcerer', 'warlock', 'wizard'],
    'Mục tiêu tầm 30ft chịu save CON. Thất bại: 1d12 độc.',
    { combat: true, castKind: 'save', save: 'con', damageDie: '1d12', damageType: 'poison', range: '30ft' }),
  C('acid-splash', 'Acid Splash', 'Evocation', ['sorcerer', 'wizard'],
    'Quả cầu axit tầm 60ft: mỗi sinh vật trong bán kính 5ft chịu save DEX, thất bại 1d6 axit. App chỉ xử 1 mục tiêu/lần — ra phép lại cho mục tiêu thứ hai.',
    { combat: true, castKind: 'save', save: 'dex', damageDie: '1d6', damageType: 'acid', range: '60ft' }),
  C('vicious-mockery', 'Vicious Mockery', 'Enchantment', ['bard'],
    'Mục tiêu nghe được tầm 60ft chịu save WIS. Thất bại: 1d6 tâm linh và bất lợi đòn tấn công kế tiếp (trước cuối lượt sau của nó).',
    { combat: true, castKind: 'save', save: 'wis', damageDie: '1d6', damageType: 'psychic', range: '60ft',
      effect: { name: 'Vicious Mockery (bất lợi đòn kế)', note: 'Bất lợi đòn tấn công kế tiếp', expiresInRounds: 1 } }),
  C('mind-sliver', 'Mind Sliver', 'Enchantment', ['sorcerer', 'warlock', 'wizard'],
    'Mục tiêu tầm 60ft chịu save INT. Thất bại: 1d6 tâm linh và trừ 1d4 vào save kế tiếp của nó (trước cuối lượt sau của bạn).',
    { combat: true, castKind: 'save', save: 'int', damageDie: '1d6', damageType: 'psychic', range: '60ft',
      effect: { name: 'Mind Sliver (−1d4 save kế)', note: 'Trừ 1d4 vào saving throw kế tiếp', expiresInRounds: 1 } }),
  C('starry-wisp', 'Starry Wisp', 'Evocation', ['bard', 'druid'],
    'Mục tiêu tầm 60ft chịu save DEX. Thất bại: 1d8 thánh và phát sáng (mất Tàng hình, đòn đánh nó có lợi thế) tới cuối lượt sau của bạn.',
    { combat: true, castKind: 'save', save: 'dex', damageDie: '1d8', damageType: 'radiant', range: '60ft',
      effect: { name: 'Starry Wisp (phát sáng)', note: 'Toả sáng lờ mờ 10ft, không thể Tàng hình', expiresInRounds: 1 } }),
  C('word-of-radiance', 'Word of Radiance', 'Evocation', ['cleric'],
    'Mỗi sinh vật bạn chọn trong 5ft chịu save CON, thất bại 1d6 thánh. App xử 1 mục tiêu/lần.',
    { combat: true, castKind: 'save', save: 'con', damageDie: '1d6', damageType: 'radiant', range: '5ft' }),
];

/** Utility / non-combat cantrips — added with guidance text, no auto rolls. */
const UTILITY: CantripDef[] = [
  C('guidance', 'Guidance', 'Divination', ['cleric', 'druid'],
    'Tập trung, tới 1 phút. Ra phép lên 1 token đồng minh: lần kiểm tra chỉ số (ability check / skill) kế tiếp của họ TỰ ĐỘNG +1d4, xong thì hết. Người chơi không cần cộng tay.',
    { concentration: true, range: 'Chạm', rollBonus: { dice: '1d4', scope: 'check' } }),
  C('resistance', 'Resistance', 'Abjuration', ['cleric', 'druid'],
    'Tập trung, tới 1 phút. Chạm 1 đồng minh: một lần, nó cộng 1d4 vào một saving throw. Tự cộng khi tung save.',
    { concentration: true, range: 'Chạm' }),
  C('spare-the-dying', 'Spare the Dying', 'Necromancy', ['cleric', 'druid'],
    'Tầm 15ft: ổn định một sinh vật đang 0 HP (khỏi cần lăn death save). Tầm tăng ở cấp 5/11/17.',
    { range: '15ft' }),
  C('light', 'Light', 'Evocation', ['bard', 'cleric', 'sorcerer', 'wizard'],
    'Chạm một vật: toả sáng rực 20ft + lờ mờ thêm 20ft, 1 giờ. Vật có người giữ được save DEX để chống.',
    { range: 'Chạm' }),
  C('mage-hand', 'Mage Hand', 'Conjuration', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Bàn tay ma tầm 30ft, mang tối đa 10 lb, thao tác đồ vật. Không tấn công / kích hoạt vật nguy hiểm.',
    { range: '30ft' }),
  C('minor-illusion', 'Minor Illusion', 'Illusion', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tạo âm thanh HOẶC hình ảnh tĩnh trong 5ft, 1 phút. Ai điều tra chịu kiểm tra Investigation vs spell save DC.',
    { range: '30ft' }),
  C('prestidigitation', 'Prestidigitation', 'Transmutation', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Mẹo phép vặt: đánh lửa, làm sạch/bẩn, mùi vị, ký hiệu nhỏ, đồ chơi ảo… Hiệu ứng nhỏ, không sát thương.',
    { range: '10ft' }),
  C('message', 'Message', 'Transmutation', ['bard', 'sorcerer', 'wizard'],
    'Thì thầm tới một mục tiêu tầm 120ft, nó nghe và trả lời riêng. Đi qua vật cản mỏng.',
    { range: '120ft' }),
  C('mending', 'Mending', 'Transmutation', ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'],
    'Sửa một vết hỏng/rách trên vật (≤ 1 ft). Không hồi HP cho vật kết cấu hay sinh vật.',
    { range: 'Chạm' }),
  C('dancing-lights', 'Dancing Lights', 'Illusion', ['bard', 'druid', 'sorcerer', 'wizard'],
    'Tập trung, tới 1 phút. Tạo 4 quả cầu sáng (hoặc 1 hình người mờ) tầm 120ft, mỗi lượt bay 60ft.',
    { concentration: true, range: '120ft' }),
  C('druidcraft', 'Druidcraft', 'Transmutation', ['druid'],
    'Dự báo thời tiết 24h tới, làm nở hoa, tạo hiệu ứng cảm giác nhỏ, hoặc châm/tắt lửa nhỏ.',
    { range: '30ft' }),
  C('shillelagh', 'Shillelagh', 'Transmutation', ['druid'],
    'Bonus action. Gậy/dùi cui trong tay: 1 phút dùng chỉ số ra phép để đánh, sát thương 1d8 (d10 cấp 5+) và tính là magic. Sửa hành động vũ khí tương ứng.',
    { actionType: 'bonus', range: 'Chạm' }),
  C('thaumaturgy', 'Thaumaturgy', 'Transmutation', ['cleric'],
    'Điềm báo nhỏ: giọng vang gấp 3, rung mặt đất, mở/đóng cửa, đổi màu mắt, đèn lửa nhấp nháy…',
    { range: '30ft' }),
  C('true-strike', 'True Strike', 'Divination', ['bard', 'sorcerer', 'warlock', 'wizard'],
    '2024: tung ngay một đòn đánh vũ khí, nhưng dùng chỉ số ra phép; có thể đổi sát thương thành thánh và thêm 1d6 thánh (2d6 cấp 5 · 3d6 cấp 11 · 4d6 cấp 17). App: dùng hành động vũ khí của bạn, thêm phần thánh vào "sát thương thêm" của đòn.',
    { range: 'Chạm' }),
];

export const SRD_CANTRIPS: CantripDef[] = [...COMBAT, ...UTILITY];

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

/** Look up a cantrip definition by (loose) name. */
export function findCantrip(name: string): CantripDef | undefined {
  const n = norm(name);
  return SRD_CANTRIPS.find((c) => norm(c.name) === n);
}

/**
 * The cantrips split by whether the sheet's class list grants them. `others` is
 * every remaining SRD cantrip (still addable — e.g. via a feat or subclass).
 */
export function cantripsForSheet(sheet: CharacterSheet): { own: CantripDef[]; others: CantripDef[] } {
  const names = sheetClasses(sheet)
    .map((c) => (c.name ?? '').toLowerCase().trim())
    .filter(Boolean);
  const own: CantripDef[] = [];
  const others: CantripDef[] = [];
  for (const def of SRD_CANTRIPS) {
    const match = def.classes.some((cl) => names.some((n) => n.includes(cl) || cl.includes(n)));
    (match ? own : others).push(def);
  }
  return { own, others };
}

/** Build a ready-to-add spell from a cantrip, damage scaled to the sheet's level. */
export function spellFromCantrip(def: CantripDef, sheet: CharacterSheet, id: string): Spell {
  const scaled = def.damageDie ? scaleCantripDie(def.damageDie, totalLevelOf(sheet)) : undefined;
  const damage: DamagePart[] | undefined = scaled
    ? [{ dice: scaled, type: def.damageType ?? '', label: def.name }]
    : undefined;
  const wired = def.castKind === 'attack' || def.castKind === 'save';
  return {
    id,
    name: def.name,
    level: 0,
    school: def.school,
    prepared: true,
    concentration: def.concentration ?? false,
    castKind: def.castKind,
    actionType: def.actionType ?? 'action',
    damage: wired ? damage : undefined,
    save: def.castKind === 'save' && def.save ? { ability: def.save } : undefined,
    effect: def.rollBonus
      ? { name: `${def.name} (+${def.rollBonus.dice})`, note: def.guidance, rollBonus: def.rollBonus }
      : def.effect
        ? { ...def.effect }
        : undefined,
    range: def.range,
    notes: def.guidance,
  };
}

/** Re-scale a cantrip spell's damage dice to the sheet's current level, or null. */
export function rescaleCantripSpell(sp: Spell, sheet: CharacterSheet): Partial<Spell> | null {
  const def = findCantrip(sp.name);
  if (!def || !def.damageDie) return null;
  const scaled = scaleCantripDie(def.damageDie, totalLevelOf(sheet));
  return { damage: [{ dice: scaled, type: def.damageType ?? '', label: def.name }] };
}

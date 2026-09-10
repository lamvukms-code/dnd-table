import type {
  Ability,
  CharacterSheet,
  ConditionType,
  DamagePart,
  Spell,
  SpellCastKind,
} from './types.js';
import { abilityMod, sheetClasses, spellcastingAbilityOf, totalLevelOf } from './rules.js';

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
  /** Lowercase class names whose spell list includes this spell (2024). */
  classes: string[];
  /** Spell level: 0 = cantrip (scales with character level), 1+ = leveled. */
  level?: number;
  /** true => the app wires damage / save / heal automatically. */
  combat: boolean;
  castKind: SpellCastKind; // 'attack' | 'save' | 'heal' | 'damage' | 'rider' | 'utility'
  actionType?: 'action' | 'bonus' | 'reaction';
  /** Cantrips: one die ('1d10'), scaled by count at character levels 5 / 11 / 17. */
  damageDie?: string;
  /** Leveled spells: the fixed base damage ('3d6'); upcast is done by hand. */
  fixedDamage?: string;
  damageType?: string;
  /** Add the caster's spellcasting modifier to the damage (Spiritual Weapon). */
  addSpellMod?: boolean;
  /** Healing dice for `castKind: 'heal'` ('2d4'); casting-ability mod added automatically. */
  heal?: string;
  /** Target-bound damage rider for `castKind: 'rider'` (Hex, Hunter's Mark). */
  rider?: { dice: string; type: string };
  /** Saving throw the target rolls (for `castKind: 'save'`). */
  save?: Ability;
  /** Leveled AoE: the target still takes half damage on a successful save. */
  halfOnSave?: boolean;
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
  C('sorcerous-burst', 'Sorcerous Burst', 'Evocation', ['sorcerer'],
    'Đòn đánh phép tầm 120ft, 1d8 — chọn loại axit/băng/lửa/sét/độc/tâm linh/âm thanh (sửa loại dmg). Mỗi dice ra mặt cao nhất được tung thêm 1 dice (tối đa = chỉ số ra phép). Scale 2/3/4d8 ở cấp 5/11/17.',
    { combat: true, castKind: 'attack', damageDie: '1d8', damageType: 'force', range: '120ft' }),
  C('thunderclap', 'Thunderclap', 'Evocation', ['bard', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Mỗi sinh vật trong 5ft (trừ bạn) save CON, thất bại 1d6 âm thanh. App xử 1 mục tiêu/lần. Scale 2/3/4d6.',
    { combat: true, castKind: 'save', save: 'con', damageDie: '1d6', damageType: 'thunder', range: '5ft' }),
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
  C('elementalism', 'Elementalism', 'Transmutation', ['druid', 'sorcerer', 'wizard'],
    'Hiệu ứng nguyên tố nhỏ tầm 30ft: dập/nhóm lửa, thổi gió đẩy vật nhẹ, rung đất tạo địa hình khó 5ft, tạo hơi nước/bụi cát che tầm nhìn tạm.',
    { range: '30ft' }),
  C('blade-ward', 'Blade Ward', 'Abjuration', ['bard', 'sorcerer', 'warlock', 'wizard'],
    '2024: 1 action, tới cuối lượt sau của bạn — kháng sát thương đập/đâm/chém. App: đặt token defenses tạm hoặc ghi chú.',
    { range: 'Bản thân' }),
  C('friends', 'Friends', 'Enchantment', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tập trung tới 1 phút: lợi thế kiểm tra CHA với 1 sinh vật không thù địch. Hết phép nó biết bạn đã dùng ma thuật.',
    { concentration: true, range: '10ft' }),
];

export const SRD_CANTRIPS: CantripDef[] = [...COMBAT, ...UTILITY];

const S1 = (
  id: string,
  name: string,
  school: string,
  classes: string[],
  guidance: string,
  extra: Partial<CantripDef> = {},
): CantripDef => ({ id, name, school, classes, level: 1, combat: false, castKind: 'utility', guidance, ...extra });

/**
 * Level-1 spells used in combat (SRD 5.2 / 2024 mechanics paraphrased). Healing
 * spells add the caster's spellcasting modifier automatically; damage is the
 * base (level-1) amount — upcasting with a higher slot is done by hand.
 */
const L1: CantripDef[] = [
  // --- healing ---
  S1('healing-word', 'Healing Word', 'Abjuration', ['bard', 'cleric', 'druid'],
    'Bonus action, tầm 60ft. Hồi 2d4 + chỉ số ra phép cho 1 mục tiêu (không phải Undead/Construct). Nâng ô: +2d4 mỗi cấp — sửa ô hồi máu tay.',
    { combat: true, castKind: 'heal', heal: '2d4', actionType: 'bonus', range: '60ft' }),
  S1('cure-wounds', 'Cure Wounds', 'Abjuration', ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
    'Chạm 1 mục tiêu: hồi 2d6 + chỉ số ra phép (không phải Undead/Construct). Nâng ô: +2d6 mỗi cấp.',
    { combat: true, castKind: 'heal', heal: '2d6', range: 'Chạm' }),
  // --- attack roll ---
  S1('guiding-bolt', 'Guiding Bolt', 'Evocation', ['cleric'],
    'Đòn đánh phép tầm 120ft. Trúng: 4d6 thánh, và đòn tấn công kế nhắm mục tiêu (trước cuối lượt sau của bạn) có lợi thế. Nâng ô: +1d6.',
    { combat: true, castKind: 'attack', fixedDamage: '4d6', damageType: 'radiant', range: '120ft',
      effect: { name: 'Guiding Bolt (đòn kế có lợi thế)', note: 'Đòn tấn công kế nhắm mục tiêu này có lợi thế', expiresInRounds: 1 } }),
  S1('chromatic-orb', 'Chromatic Orb', 'Evocation', ['sorcerer', 'wizard'],
    'Đòn đánh phép tầm 90ft, 3d8 — chọn loại: axit/băng/lửa/sét/độc/âm thanh (sửa loại dmg trong ô). Nâng ô: +1d8.',
    { combat: true, castKind: 'attack', fixedDamage: '3d8', damageType: 'fire', range: '90ft' }),
  S1('witch-bolt', 'Witch Bolt', 'Evocation', ['sorcerer', 'wizard'],
    'Đòn đánh phép tầm 30ft, 2d12 sét, tập trung. Mỗi lượt sau dùng action gây lại 1d12 (miễn còn trong tầm 30ft). Nâng ô: +1d12 đòn đầu.',
    { combat: true, castKind: 'attack', fixedDamage: '2d12', damageType: 'lightning', range: '30ft', concentration: true }),
  S1('ray-of-sickness', 'Ray of Sickness', 'Necromancy', ['sorcerer', 'wizard'],
    'Đòn đánh phép tầm 60ft. Trúng: 2d8 độc; mục tiêu chịu save CON (DM/hệ thống qua panel Hiệu ứng), thất bại → Trúng độc tới cuối lượt sau của bạn. Nâng ô: +1d8.',
    { combat: true, castKind: 'attack', fixedDamage: '2d8', damageType: 'poison', range: '60ft',
      effect: { name: 'Ray of Sickness (save CON hoặc Trúng độc)', condition: 'poisoned', note: 'Nếu fail save CON: Trúng độc tới cuối lượt sau của caster', expiresInRounds: 1 } }),
  // --- auto-hit ---
  S1('magic-missile', 'Magic Missile', 'Evocation', ['sorcerer', 'wizard'],
    'Tự trúng (không tung đòn), tầm 120ft: 3 tia, mỗi tia 1d4+1 lực = 3d4+3. Nâng ô: +1 tia (+1d4+1). Chia tia cho nhiều mục tiêu thì ra phép lại.',
    { combat: true, castKind: 'damage', fixedDamage: '3d4+3', damageType: 'force', range: '120ft' }),
  // --- saving throw ---
  S1('burning-hands', 'Burning Hands', 'Evocation', ['sorcerer', 'wizard'],
    'Nón 15ft, save DEX, 3d6 lửa; save thành công vẫn ăn nửa. App xử 1 mục tiêu/lần. Nâng ô: +1d6.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '3d6', damageType: 'fire', halfOnSave: true, range: 'Nón 15ft' }),
  S1('thunderwave', 'Thunderwave', 'Evocation', ['bard', 'druid', 'sorcerer', 'wizard'],
    'Khối 15ft, save CON, 2d8 âm thanh; thất bại còn bị đẩy lùi 10ft; save thành công ăn nửa, không bị đẩy. Nâng ô: +1d8.',
    { combat: true, castKind: 'save', save: 'con', fixedDamage: '2d8', damageType: 'thunder', halfOnSave: true, range: 'Khối 15ft',
      effect: { name: 'Thunderwave (đẩy lùi 10ft)', note: 'Bị đẩy lùi 10ft khi fail save', expiresInRounds: 1 } }),
  S1('sleep', 'Sleep', 'Enchantment', ['bard', 'sorcerer', 'wizard'],
    '2024: khối 5ft tầm 90ft, save WIS. Thất bại → Bất lực (Incapacitated) tới cuối lượt sau của bạn; cứu lại cuối mỗi lượt của nó. Không sát thương.',
    { combat: true, castKind: 'save', save: 'wis', range: '90ft',
      effect: { name: 'Sleep (Bất lực)', condition: 'incapacitated', note: 'Cứu WIS lại cuối mỗi lượt của nó', expiresInRounds: 1 } }),
  S1('faerie-fire', 'Faerie Fire', 'Evocation', ['bard', 'druid'],
    'Khối 20ft tầm 60ft, save DEX, tập trung 1 phút. Thất bại → phát sáng: đòn tấn công nhắm nó có lợi thế, không thể Tàng hình. App xử 1 mục tiêu/lần.',
    { combat: true, castKind: 'save', save: 'dex', concentration: true, range: '60ft',
      effect: { name: 'Faerie Fire (phát sáng)', note: 'Đòn tấn công nhắm mục tiêu có lợi thế; mất Tàng hình', expiresInRounds: 10 } }),
  // --- buffs / utility (advisory) ---
  S1('bless', 'Bless', 'Enchantment', ['cleric', 'paladin'],
    'Tập trung 1 phút. 3 đồng minh trong 30ft: mỗi đòn tấn công & saving throw +1d4. App: nhắc thủ công — cộng 1d4 khi tung (chưa auto vì kéo dài, không phải 1 lần).',
    { concentration: true, range: '30ft' }),
  S1('bane', 'Bane', 'Enchantment', ['bard', 'cleric'],
    'Tập trung 1 phút. 3 kẻ địch save CHA, thất bại → mỗi đòn tấn công & save của chúng −1d4. App: nhắc thủ công (DM trừ 1d4).',
    { combat: true, castKind: 'save', save: 'cha', concentration: true, range: '30ft',
      effect: { name: 'Bane (−1d4 đòn đánh & save)', note: 'Trừ 1d4 vào mọi đòn tấn công và saving throw', expiresInRounds: 10 } }),
  S1('shield-spell', 'Shield', 'Abjuration', ['sorcerer', 'wizard'],
    'Reaction khi bị đánh trúng / dính Magic Missile: +5 AC tới đầu lượt sau, và miễn Magic Missile. App: chỉnh "AC ghi đè" tạm hoặc ghi chú.',
    { range: 'Bản thân' }),
  S1('mage-armor', 'Mage Armor', 'Abjuration', ['sorcerer', 'wizard'],
    'Chạm 1 mục tiêu không mặc giáp: AC = 13 + DEX mod, 8 giờ. App: đặt "AC ghi đè".',
    { range: 'Chạm' }),
  // --- more level-1 damage / control ---
  S1('inflict-wounds', 'Inflict Wounds', 'Necromancy', ['cleric'],
    '2024: đòn đánh phép chạm, trúng 2d10 hoại tử. Nâng ô: +2d10 (sửa ô sát thương).',
    { combat: true, castKind: 'attack', fixedDamage: '2d10', damageType: 'necrotic', range: 'Chạm' }),
  S1('hellish-rebuke', 'Hellish Rebuke', 'Evocation', ['sorcerer', 'warlock'],
    'Reaction khi bị 1 sinh vật làm bị thương: nó save DEX, 2d10 lửa, thành công ăn nửa. Nâng ô: +1d10.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '2d10', damageType: 'fire', halfOnSave: true, actionType: 'reaction', range: '60ft' }),
  S1('arms-of-hadar', 'Arms of Hadar', 'Conjuration', ['warlock'],
    'Toả 10ft quanh bạn: mỗi sinh vật save STR, 2d6 hoại tử; fail thì không dùng reaction tới lượt sau của nó. Thành công ăn nửa. Nâng ô: +1d6.',
    { combat: true, castKind: 'save', save: 'str', fixedDamage: '2d6', damageType: 'necrotic', halfOnSave: true, range: 'Toả 10ft' }),
  S1('color-spray', 'Color Spray', 'Illusion', ['bard', 'sorcerer', 'wizard'],
    'Nón 15ft: tung 6d10 — tổng đó là lượng HP sinh vật (HP thấp trước) bị Mù tới cuối lượt sau của bạn. App: gắn Mù + tự roll 6d10 để tính.',
    { combat: true, castKind: 'utility', range: 'Nón 15ft',
      effect: { name: 'Color Spray (Mù)', condition: 'blinded', note: 'Mù tới cuối lượt sau của caster (giới hạn theo 6d10 tổng HP)', expiresInRounds: 1 } }),
  S1('tashas-hideous-laughter', "Tasha's Hideous Laughter", 'Enchantment', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 30ft, save WIS, tập trung 1 phút. Fail → ngã (Prone) và Bất lực vì cười, không đứng dậy được. Cứu WIS lại cuối mỗi lượt (và khi ăn dmg có lợi thế).',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '30ft',
      effect: { name: 'Hideous Laughter (Bất lực + Ngã)', condition: 'incapacitated', note: 'Prone + Incapacitated; cứu WIS cuối mỗi lượt', expiresInRounds: 10 } }),
  S1('command', 'Command', 'Enchantment', ['bard', 'cleric', 'paladin'],
    'Tầm 60ft, save WIS. Fail → tuân 1 lệnh 1 từ ở lượt sau (Approach/Drop/Flee/Grovel/Halt…). Không sát thương.',
    { combat: true, castKind: 'save', save: 'wis', range: '60ft',
      effect: { name: 'Command', note: 'Tuân 1 lệnh 1 từ ở lượt kế', expiresInRounds: 1 } }),
  S1('entangle', 'Entangle', 'Conjuration', ['druid'],
    'Ô 20ft tầm 90ft, tập trung 1 phút. Save STR khi phép hiện; fail → Bị trói (Restrained). Dùng action + kiểm tra STR (Athletics) để thoát.',
    { combat: true, castKind: 'save', save: 'str', concentration: true, range: '90ft',
      effect: { name: 'Entangle (Bị trói)', condition: 'restrained', note: 'Action + STR check để thoát', expiresInRounds: 10 } }),
  S1('grease', 'Grease', 'Conjuration', ['sorcerer', 'wizard'],
    'Ô 10ft tầm 60ft: địa hình khó. Sinh vật trong đó khi phép hiện (và ai vào/đứng dậy) save DEX; fail → Ngã (Prone).',
    { combat: true, castKind: 'save', save: 'dex', range: '60ft',
      effect: { name: 'Grease (Ngã)', condition: 'prone', note: 'Địa hình khó; save DEX khi vào/đứng dậy' } }),
  S1('hex', 'Hex', 'Enchantment', ['warlock'],
    'Bonus action, tập trung tới 1 giờ. Nguyền 1 mục tiêu tầm 90ft: mỗi khi bạn đánh trúng nó, +1d6 hoại tử; nó bất lợi kiểm tra 1 chỉ số bạn chọn. App: gắn rider vào mục tiêu.',
    { combat: true, castKind: 'rider', rider: { dice: '1d6', type: 'necrotic' }, actionType: 'bonus', concentration: true, range: '90ft' }),
  S1('hunters-mark', "Hunter's Mark", 'Divination', ['ranger'],
    'Bonus action, tập trung. Đánh dấu 1 mục tiêu tầm 90ft: mỗi đòn vũ khí trúng nó +1d6; lợi thế kiểm tra Perception/Survival để lần theo. App: gắn rider vào mục tiêu.',
    { combat: true, castKind: 'rider', rider: { dice: '1d6', type: 'force' }, actionType: 'bonus', concentration: true, range: '90ft' }),
  S1('divine-favor', 'Divine Favor', 'Evocation', ['paladin'],
    '2024: kéo dài cả trận, không tập trung. Đòn vũ khí của bạn +1d6 thánh. App: thêm 1 rider (+1d6 radiant, phạm vi “đòn vũ khí”).',
    { range: 'Bản thân' }),
  S1('shield-of-faith', 'Shield of Faith', 'Abjuration', ['cleric', 'paladin'],
    'Bonus action, tập trung 10 phút, tầm 60ft: mục tiêu +2 AC. App: +2 vào "AC ghi đè" tạm.',
    { actionType: 'bonus', concentration: true, range: '60ft' }),
  S1('sanctuary', 'Sanctuary', 'Abjuration', ['cleric'],
    'Bonus action, tầm 30ft. Ai muốn đánh mục tiêu này phải save WIS trước, fail thì mất đòn/phép đó. Hết nếu mục tiêu tấn công / ra phép hại.',
    { actionType: 'bonus', range: '30ft' }),
  S1('protection-evil-good', 'Protection from Evil and Good', 'Abjuration', ['cleric', 'druid', 'paladin', 'wizard'],
    'Tập trung 10 phút, chạm 1 đồng minh: Aberration/Celestial/Elemental/Fey/Fiend/Undead bất lợi khi đánh nó; nó miễn bị các loại đó Charmed/Frightened/Possessed.',
    { concentration: true, range: 'Chạm' }),
  S1('heroism', 'Heroism', 'Enchantment', ['bard', 'paladin'],
    'Tập trung 1 phút, chạm: miễn Khiếp sợ (Frightened); đầu mỗi lượt nhận tạm HP = chỉ số ra phép.',
    { concentration: true, range: 'Chạm' }),
  S1('goodberry', 'Goodberry', 'Conjuration', ['druid', 'ranger'],
    'Tạo 10 quả mọng; ăn 1 quả (action) hồi 1 HP. App: dùng nút hồi máu, mỗi lần 1 HP, hoặc ghi chú.',
    { castKind: 'heal', heal: '1', range: 'Chạm' }),
  S1('detect-magic', 'Detect Magic', 'Divination', ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'wizard'],
    'Nghi lễ, tập trung 10 phút: cảm nhận ma thuật trong 30ft và biết trường phái. Xuyên qua vật cản mỏng.',
    { concentration: true, range: 'Bản thân' }),
  S1('charm-person', 'Charm Person', 'Enchantment', ['bard', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 30ft, save WIS (lợi thế nếu bạn/đồng minh đang đánh nó). Fail → coi bạn là bạn 1 giờ (hết khi bạn/đồng minh hại nó).',
    { combat: true, castKind: 'save', save: 'wis', range: '30ft',
      effect: { name: 'Charm Person', condition: 'charmed', note: '1 giờ; hết khi bị hại' } }),
  S1('feather-fall', 'Feather Fall', 'Transmutation', ['bard', 'sorcerer', 'wizard'],
    'Reaction khi đang rơi (tầm 60ft, tối đa 5 mục tiêu): rơi chậm, không sát thương rơi, 1 phút.',
    { actionType: 'reaction', range: '60ft' }),
  S1('longstrider', 'Longstrider', 'Transmutation', ['bard', 'druid', 'ranger', 'wizard'],
    'Chạm 1 mục tiêu: +10ft tốc độ trong 1 giờ.',
    { range: 'Chạm' }),
  S1('jump', 'Jump', 'Transmutation', ['druid', 'ranger', 'sorcerer', 'wizard'],
    'Chạm 1 mục tiêu: khoảng nhảy ×3 trong 1 phút.',
    { range: 'Chạm' }),
  S1('speak-with-animals', 'Speak with Animals', 'Divination', ['bard', 'druid', 'ranger'],
    'Nghi lễ, 10 phút: hiểu và nói với thú.',
    { range: 'Bản thân' }),
  S1('disguise-self', 'Disguise Self', 'Illusion', ['bard', 'sorcerer', 'wizard'],
    'Đổi ngoại hình (quần áo, giáp, vũ khí, đồ) 1 giờ. Ai nghi ngờ chạm hoặc kiểm tra Investigation vs spell save DC để lật.',
    { range: 'Bản thân' }),
  S1('silent-image', 'Silent Image', 'Illusion', ['bard', 'sorcerer', 'wizard'],
    'Tập trung 10 phút: hình ảnh 15ft di chuyển được (không âm thanh/mùi). Kiểm tra Investigation vs DC để lật.',
    { concentration: true, range: '60ft' }),
  S1('find-familiar', 'Find Familiar', 'Conjuration', ['wizard'],
    'Nghi lễ 1 giờ: triệu 1 linh thú (familiar) hỗ trợ trinh sát, Help, chuyển chạm-phép. Dùng stat block quái nhỏ từ Bestiary.',
    { range: '10ft' }),
];

export const SRD_L1_SPELLS: CantripDef[] = L1;

const S2 = (
  id: string,
  name: string,
  school: string,
  classes: string[],
  guidance: string,
  extra: Partial<CantripDef> = {},
): CantripDef => ({ id, name, school, classes, level: 2, combat: false, castKind: 'utility', guidance, ...extra });

/**
 * Level-2 spells used in combat (SRD 5.2 / 2024 mechanics paraphrased). Same
 * wiring as level 1: fixed base damage, half-on-save for AoE, conditions for
 * control spells; upcasting is done by hand.
 */
const L2: CantripDef[] = [
  // --- healing ---
  S2('prayer-of-healing', 'Prayer of Healing', 'Abjuration', ['cleric'],
    'Đúc 10 phút (ngoài chiến đấu), tầm 30ft: hồi 2d8 + chỉ số ra phép cho tới 6 mục tiêu. Nâng ô: +1d8. App: dùng nút hồi máu cho từng người.',
    { combat: true, castKind: 'heal', heal: '2d8', range: '30ft' }),
  // --- attack roll ---
  S2('scorching-ray', 'Scorching Ray', 'Evocation', ['sorcerer', 'wizard'],
    '3 tia, mỗi tia là đòn đánh phép riêng tầm 120ft, trúng 2d6 lửa (app gộp 6d6 — chia tia cho nhiều mục tiêu thì ra phép lại). Nâng ô: +1 tia.',
    { combat: true, castKind: 'attack', fixedDamage: '6d6', damageType: 'fire', range: '120ft' }),
  S2('acid-arrow', "Melf's Acid Arrow", 'Evocation', ['wizard'],
    'Đòn đánh phép tầm 90ft: trúng 4d4 axit + 2d4 đầu lượt sau; trượt vẫn 2d4 (không có dmg lượt sau). Nâng ô: +1d4 mỗi phần.',
    { combat: true, castKind: 'attack', fixedDamage: '4d4', damageType: 'acid', range: '90ft',
      effect: { name: 'Acid Arrow (2d4 lượt sau)', note: 'Chịu 2d4 axit vào đầu lượt kế của nó', expiresInRounds: 1 } }),
  S2('spiritual-weapon', 'Spiritual Weapon', 'Evocation', ['cleric'],
    'Bonus action, tạo vũ khí linh hồn tầm 60ft: đòn đánh phép, trúng 1d8 + chỉ số ra phép lực. Bonus action các lượt sau để bay 20ft và đánh lại. Nâng ô: +1d8 mỗi 2 cấp.',
    { combat: true, castKind: 'attack', fixedDamage: '1d8', addSpellMod: true, damageType: 'force', actionType: 'bonus', range: '60ft' }),
  // --- auto-hit ---
  S2('cloud-of-daggers', 'Cloud of Daggers', 'Conjuration', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Khối 5ft tầm 60ft, tập trung 1 phút: sinh vật vào / bắt đầu lượt trong đó chịu 4d4 chém (không save). Nâng ô: +2d4.',
    { combat: true, castKind: 'damage', fixedDamage: '4d4', damageType: 'slashing', concentration: true, range: '60ft' }),
  S2('heat-metal', 'Heat Metal', 'Transmutation', ['bard', 'druid'],
    'Nung 1 vật kim loại (giáp/vũ khí) tầm 60ft, tập trung 1 phút: 2d8 lửa ngay và mỗi bonus action sau. Ai cầm/mặc save CON hoặc rơi vật / bất lợi tới lượt sau. Nâng ô: +1d8.',
    { combat: true, castKind: 'damage', fixedDamage: '2d8', damageType: 'fire', concentration: true, range: '60ft',
      effect: { name: 'Heat Metal', note: 'Bonus action lặp 2d8; save CON hoặc rơi vật / bất lợi', expiresInRounds: 10 } }),
  // --- saving throw (half on save) ---
  S2('shatter', 'Shatter', 'Evocation', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Cầu 10ft tầm 60ft, save CON, 3d8 âm thanh (vật vô cơ bất lợi save). Thành công ăn nửa. Nâng ô: +1d8.',
    { combat: true, castKind: 'save', save: 'con', fixedDamage: '3d8', damageType: 'thunder', halfOnSave: true, range: '60ft' }),
  S2('moonbeam', 'Moonbeam', 'Evocation', ['druid'],
    'Trụ 5ft tầm 120ft, tập trung 1 phút. Sinh vật vào / bắt đầu lượt trong trụ save CON, 2d10 thánh, thành công ăn nửa. Bonus action dời trụ 60ft. Nâng ô: +1d10.',
    { combat: true, castKind: 'save', save: 'con', fixedDamage: '2d10', damageType: 'radiant', halfOnSave: true, concentration: true, range: '120ft' }),
  S2('flaming-sphere', 'Flaming Sphere', 'Conjuration', ['druid', 'wizard'],
    'Cầu lửa 5ft tầm 60ft, tập trung 1 phút. Sinh vật kề bên / bị lăn vào save DEX, 2d6 lửa, thành công ăn nửa. Bonus action lăn cầu 30ft. Nâng ô: +1d6.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '2d6', damageType: 'fire', halfOnSave: true, concentration: true, range: '60ft' }),
  // --- saving throw (condition) ---
  S2('hold-person', 'Hold Person', 'Enchantment', ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 60ft, 1 Humanoid, save WIS, tập trung 1 phút. Fail → Tê liệt (Paralyzed); cứu WIS lại cuối mỗi lượt của nó. Đánh trúng trong 5ft = chí mạng.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '60ft',
      effect: { name: 'Hold Person (Tê liệt)', condition: 'paralyzed', note: 'Cứu WIS cuối mỗi lượt', expiresInRounds: 10 } }),
  S2('blindness-deafness', 'Blindness/Deafness', 'Transmutation', ['bard', 'cleric', 'sorcerer', 'wizard'],
    'Tầm 120ft, save CON. Fail → Mù (hoặc Điếc) 1 phút; cứu CON lại cuối mỗi lượt của nó. Nâng ô: +1 mục tiêu.',
    { combat: true, castKind: 'save', save: 'con', range: '120ft',
      effect: { name: 'Blindness (Mù)', condition: 'blinded', note: 'Cứu CON cuối mỗi lượt', expiresInRounds: 10 } }),
  S2('web', 'Web', 'Conjuration', ['sorcerer', 'wizard'],
    'Khối 20ft tầm 60ft, tập trung 1 giờ: địa hình khó, che khuất nhẹ. Save DEX khi vào / bắt đầu lượt; fail → Bị trói. Action + STR check để thoát.',
    { combat: true, castKind: 'save', save: 'dex', concentration: true, range: '60ft',
      effect: { name: 'Web (Bị trói)', condition: 'restrained', note: 'Action + STR check để thoát', expiresInRounds: 10 } }),
  S2('crown-of-madness', 'Crown of Madness', 'Enchantment', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 120ft, 1 Humanoid, save WIS, tập trung 1 phút. Fail → Mê hoặc (Charmed): mỗi lượt phải đánh 1 sinh vật bạn chọn hoặc bỏ lượt. Cứu WIS cuối mỗi lượt.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '120ft',
      effect: { name: 'Crown of Madness (Mê hoặc)', condition: 'charmed', note: 'Bị ép đánh mục tiêu bạn chọn; cứu WIS cuối lượt', expiresInRounds: 10 } }),
  S2('suggestion', 'Suggestion', 'Enchantment', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 30ft, save WIS, tập trung tới 8 giờ. Fail → làm theo 1 gợi ý hợp lý (không rõ hại). Hết khi hoàn thành hoặc bị hại.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '30ft',
      effect: { name: 'Suggestion', condition: 'charmed', note: 'Theo 1 gợi ý hợp lý; hết khi xong / bị hại' } }),
  S2('ray-of-enfeeblement', 'Ray of Enfeeblement', 'Necromancy', ['warlock', 'wizard'],
    'Đòn đánh phép tầm 60ft, tập trung 1 phút. Trúng → mục tiêu chỉ gây nửa sát thương đòn đánh dùng STR. Cứu CON cuối mỗi lượt để thoát. App: đánh dấu bằng ghi chú.',
    { concentration: true, range: '60ft',
      effect: { name: 'Ray of Enfeeblement', note: 'Nửa sát thương đòn đánh dùng STR; cứu CON cuối lượt', expiresInRounds: 10 } }),
  // --- utility / buff (advisory) ---
  S2('misty-step', 'Misty Step', 'Conjuration', ['sorcerer', 'warlock', 'wizard'],
    'Bonus action: dịch chuyển tối đa 30ft tới ô trống bạn thấy.',
    { actionType: 'bonus', range: 'Bản thân' }),
  S2('invisibility', 'Invisibility', 'Illusion', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tập trung 1 giờ, chạm 1 mục tiêu: Tàng hình tới khi nó tấn công / ra phép. Nâng ô: +1 mục tiêu.',
    { concentration: true, range: 'Chạm',
      effect: { name: 'Invisibility', condition: 'invisible', note: 'Hết khi tấn công / ra phép' } }),
  S2('mirror-image', 'Mirror Image', 'Illusion', ['sorcerer', 'warlock', 'wizard'],
    '3 ảnh giả quanh bạn 1 phút: đòn đánh có thể trúng ảnh (tung d6) thay vì bạn. App: ghi chú / theo dõi số ảnh.',
    { range: 'Bản thân' }),
  S2('blur', 'Blur', 'Illusion', ['sorcerer', 'wizard'],
    'Tập trung 1 phút: đòn tấn công nhắm bạn bị bất lợi (trừ kẻ không cần thị giác). App: ghi chú.',
    { concentration: true, range: 'Bản thân' }),
  S2('darkness', 'Darkness', 'Evocation', ['sorcerer', 'warlock', 'wizard'],
    'Cầu tối 15ft tầm 60ft, tập trung 10 phút: tối hoàn toàn, ánh sáng thường không xuyên. Bám vật / di chuyển được.',
    { concentration: true, range: '60ft' }),
  S2('silence', 'Silence', 'Illusion', ['bard', 'cleric', 'ranger'],
    'Nghi lễ, cầu 20ft tầm 120ft, tập trung 10 phút: không có âm thanh, miễn sát thương thunder, chặn phép có thành phần Verbal.',
    { concentration: true, range: '120ft' }),
  S2('pass-without-trace', 'Pass without Trace', 'Abjuration', ['druid', 'ranger'],
    'Tập trung 1 giờ: bạn và đồng minh trong 30ft +10 kiểm tra Ẩn nấp (Stealth) và không để lại dấu vết.',
    { concentration: true, range: 'Bản thân' }),
  S2('enhance-ability', 'Enhance Ability', 'Transmutation', ['bard', 'cleric', 'druid', 'ranger', 'sorcerer', 'wizard'],
    'Tập trung 1 giờ, chạm: mục tiêu có lợi thế kiểm tra 1 chỉ số chọn trước (và hiệu ứng phụ theo chỉ số). Nâng ô: +1 mục tiêu.',
    { concentration: true, range: 'Chạm' }),
  S2('lesser-restoration', 'Lesser Restoration', 'Abjuration', ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
    'Chạm: chữa 1 tình trạng — Bị mù, Bị điếc, Bị tê liệt, Trúng độc, hoặc 1 bệnh.',
    { range: 'Chạm' }),
  S2('aid', 'Aid', 'Abjuration', ['bard', 'cleric', 'paladin', 'ranger'],
    'Tầm 30ft, 3 mục tiêu: HP tối đa và HP hiện tại +5 trong 8 giờ. Nâng ô: +5 mỗi cấp. App: chỉnh HP tối đa + HP tay.',
    { range: '30ft' }),
  S2('see-invisibility', 'See Invisibility', 'Divination', ['bard', 'sorcerer', 'wizard'],
    '1 giờ: thấy vật/sinh vật Tàng hình và vào Cõi Ê-the.',
    { range: 'Bản thân' }),
  S2('levitate', 'Levitate', 'Transmutation', ['sorcerer', 'wizard'],
    'Tập trung 10 phút, tầm 60ft (save CON nếu ép sinh vật): nâng mục tiêu lên tối đa 20ft, di chuyển dọc bằng ý nghĩ.',
    { concentration: true, range: '60ft' }),
  S2('spider-climb', 'Spider Climb', 'Transmutation', ['sorcerer', 'warlock', 'wizard'],
    'Tập trung 1 giờ, chạm: đi trên tường/trần, tốc độ leo = tốc độ đi.',
    { concentration: true, range: 'Chạm' }),
  S2('enlarge-reduce', 'Enlarge/Reduce', 'Transmutation', ['bard', 'druid', 'sorcerer', 'wizard'],
    'Tập trung 1 phút, tầm 30ft. Enlarge: cỡ +1, lợi thế STR, đòn +1d4. Reduce: cỡ −1, bất lợi STR, đòn −1d4.',
    { concentration: true, range: '30ft' }),
  S2('magic-weapon', 'Magic Weapon', 'Transmutation', ['paladin', 'ranger', 'sorcerer', 'wizard'],
    'Tập trung 1 giờ, chạm 1 vũ khí thường: thành +1 (magic). Nâng ô: +2 (cấp 4), +3 (cấp 6). App: thêm rider / attackBonusMisc.',
    { concentration: true, range: 'Chạm' }),
  S2('calm-emotions', 'Calm Emotions', 'Enchantment', ['bard', 'cleric'],
    'Cầu 20ft tầm 60ft, tập trung 1 phút, save CHA. Fail → chặn Charmed/Frightened hiện có, hoặc làm dửng dưng thù địch.',
    { concentration: true, range: '60ft' }),
  S2('zone-of-truth', 'Zone of Truth', 'Enchantment', ['bard', 'cleric', 'paladin'],
    'Cầu 15ft tầm 60ft, 10 phút, save CHA. Fail → không nói dối cố ý trong vùng (vẫn né tránh được).',
    { range: '60ft' }),
  S2('detect-thoughts', 'Detect Thoughts', 'Divination', ['bard', 'sorcerer', 'wizard'],
    'Tập trung 1 phút: đọc suy nghĩ bề mặt sinh vật trong 30ft; đào sâu thì nó save WIS (fail = biết bị dò).',
    { concentration: true, range: 'Bản thân' }),
  S2('knock', 'Knock', 'Transmutation', ['bard', 'sorcerer', 'wizard'],
    'Tầm 60ft: mở khóa / bỏ chốt / gỡ thanh chắn 1 vật (tiếng động lớn).',
    { range: '60ft' }),
  S2('warding-bond', 'Warding Bond', 'Abjuration', ['cleric'],
    'Chạm 1 đồng minh 1 giờ (trong 60ft): nó +1 AC & save, kháng mọi sát thương; bạn chịu song song lượng sát thương nó nhận.',
    { range: 'Chạm' }),
];

export const SRD_L2_SPELLS: CantripDef[] = L2;

const S3 = (
  id: string,
  name: string,
  school: string,
  classes: string[],
  guidance: string,
  extra: Partial<CantripDef> = {},
): CantripDef => ({ id, name, school, classes, level: 3, combat: false, castKind: 'utility', guidance, ...extra });

/**
 * Level-3 spells (SRD 5.2 / 2024 mechanics paraphrased). Same wiring as levels
 * 1–2: `fixedDamage` is the base amount, `halfOnSave` for AoE, conditions for
 * control spells; upcasting ("Nâng ô") is done by hand.
 */
const L3: CantripDef[] = [
  // --- healing ---
  S3('mass-healing-word', 'Mass Healing Word', 'Abjuration', ['bard', 'cleric'],
    'Bonus action, tầm 60ft: hồi 2d4 + chỉ số ra phép cho tới 6 mục tiêu (không phải Undead/Construct). Nâng ô: +1d4.',
    { combat: true, castKind: 'heal', heal: '2d4', actionType: 'bonus', range: '60ft' }),
  S3('aura-of-vitality', 'Aura of Vitality', 'Abjuration', ['cleric', 'druid', 'paladin'],
    'Tập trung 1 phút. Mỗi lượt dùng bonus action: hồi 2d6 cho 1 mục tiêu trong 30ft. App: bấm nút hồi máu mỗi lượt.',
    { combat: true, castKind: 'heal', heal: '2d6', actionType: 'bonus', concentration: true, range: '30ft' }),
  S3('revivify', 'Revivify', 'Necromancy', ['cleric', 'druid', 'paladin', 'ranger'],
    'Chạm 1 sinh vật chết chưa quá 1 phút: sống lại với 1 HP (không hồi tay/chân đứt, không chữa già/chết vì tuổi). Tốn viên kim cương 300gp.',
    { range: 'Chạm' }),
  // --- save + damage (AoE, nửa khi save thành công) ---
  S3('fireball', 'Fireball', 'Evocation', ['sorcerer', 'wizard'],
    'Cầu 20ft tầm 150ft, save DEX, 8d6 lửa, thành công ăn nửa. Bắt cháy vật không ai giữ. Nâng ô: +1d6.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '8d6', damageType: 'fire', halfOnSave: true, range: '150ft' }),
  S3('lightning-bolt', 'Lightning Bolt', 'Evocation', ['sorcerer', 'wizard'],
    'Tia dài 100ft, rộng 5ft, save DEX, 8d6 sét, thành công ăn nửa. Nâng ô: +1d6. App xử 1 mục tiêu/lần.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '8d6', damageType: 'lightning', halfOnSave: true, range: '100ft' }),
  S3('call-lightning', 'Call Lightning', 'Conjuration', ['druid'],
    'Tập trung 10 phút: tạo đám mây bão. Mỗi lượt dùng action gọi 1 tia xuống điểm trong 120ft — sinh vật trong 5ft save DEX, 3d10 sét, nửa khi thành công (+1d10 nếu trời đang bão). Nâng ô: +1d10.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '3d10', damageType: 'lightning', halfOnSave: true, concentration: true, range: '120ft' }),
  S3('spirit-guardians', 'Spirit Guardians', 'Conjuration', ['cleric'],
    'Toả 15ft quanh bạn, tập trung 10 phút. Kẻ địch trong vùng: tốc độ giảm nửa; khi vào / bắt đầu lượt trong vùng save WIS, 3d8 thánh (hoặc hoại tử — chọn), nửa khi thành công. Nâng ô: +1d8.',
    { combat: true, castKind: 'save', save: 'wis', fixedDamage: '3d8', damageType: 'radiant', halfOnSave: true, concentration: true, range: 'Toả 15ft',
      effect: { name: 'Spirit Guardians (tốc độ −½)', note: 'Tốc độ giảm nửa khi ở trong vùng toả 15ft của caster', expiresInRounds: 10 } }),
  S3('conjure-animals', 'Conjure Animals', 'Conjuration', ['druid', 'ranger'],
    '2024: bầy linh thú toả 10ft quanh bạn, tập trung 1 phút; bạn +10ft tốc độ. Sinh vật vào / bắt đầu lượt trong vùng save DEX, 3d10 chém, nửa khi thành công (1 lần/lượt). Nâng ô: +1d10 và +5ft vùng.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '3d10', damageType: 'slashing', halfOnSave: true, concentration: true, range: 'Toả 10ft' }),
  S3('conjure-barrage', 'Conjure Barrage', 'Conjuration', ['ranger'],
    'Nón 60ft: save DEX, 3d8 (loại của vũ khí tầm xa/đạn bạn dùng, hoặc lực), nửa khi thành công.',
    { combat: true, castKind: 'save', save: 'dex', fixedDamage: '3d8', damageType: 'force', halfOnSave: true, range: 'Nón 60ft' }),
  S3('wind-wall', 'Wind Wall', 'Evocation', ['druid', 'ranger'],
    'Tường gió 50ft×15ft tầm 120ft, tập trung 1 phút: sinh vật trong vùng khi tường hiện save STR, 3d8 đập, nửa khi thành công. Chặn khí gas, đạn nhỏ, sinh vật cỡ Small trở xuống.',
    { combat: true, castKind: 'save', save: 'str', fixedDamage: '3d8', damageType: 'bludgeoning', halfOnSave: true, concentration: true, range: '120ft' }),
  S3('thunder-step', 'Thunder Step', 'Conjuration', ['sorcerer', 'wizard'],
    'Dịch chuyển tối đa 90ft (mang theo 1 vật/đồng minh sẵn lòng). Sinh vật trong 10ft điểm bạn rời đi save CON, 3d10 âm thanh, nửa khi thành công. Nâng ô: +1d10.',
    { combat: true, castKind: 'save', save: 'con', fixedDamage: '3d10', damageType: 'thunder', halfOnSave: true, range: 'Bản thân' }),
  // --- damage (auto / đòn đánh) ---
  S3('vampiric-touch', 'Vampiric Touch', 'Necromancy', ['sorcerer', 'warlock', 'wizard'],
    'Đòn đánh phép chạm, tập trung 1 phút. Trúng: 3d6 hoại tử và bạn hồi nửa số đó. Mỗi lượt dùng action đánh lại. Nâng ô: +1d6.',
    { combat: true, castKind: 'attack', fixedDamage: '3d6', damageType: 'necrotic', concentration: true, range: 'Chạm' }),
  S3('hunger-of-hadar', 'Hunger of Hadar', 'Conjuration', ['warlock'],
    'Cầu tối 20ft tầm 150ft, tập trung 1 phút: tối hoàn toàn, địa hình khó, sinh vật bên trong bị Mù. Bắt đầu lượt trong đó: 2d6 băng. Kết thúc lượt trong đó: save DEX hoặc 2d6 axit. App: gắn 2d6 băng, ghi chú phần axit.',
    { combat: true, castKind: 'damage', fixedDamage: '2d6', damageType: 'cold', concentration: true, range: '150ft',
      effect: { name: 'Hunger of Hadar', condition: 'blinded', note: 'Mù + địa hình khó trong vùng; +2d6 axit (save DEX) khi kết thúc lượt trong đó', expiresInRounds: 10 } }),
  // --- save + trạng thái / khống chế ---
  S3('fear', 'Fear', 'Illusion', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Nón 30ft, save WIS. Fail → rơi vật đang cầm và Khiếp sợ (Frightened); khi còn khiếp sợ phải Dash chạy xa nếu được. Cứu WIS cuối mỗi lượt (nếu không thấy caster). Tập trung 1 phút.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: 'Nón 30ft',
      effect: { name: 'Fear (Khiếp sợ)', condition: 'frightened', note: 'Rơi vật đang cầm; phải Dash xa; cứu WIS cuối lượt', expiresInRounds: 10 } }),
  S3('hypnotic-pattern', 'Hypnotic Pattern', 'Illusion', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Khối 30ft tầm 120ft, save WIS (hiệu ứng thị giác, không lời). Fail → Mê hoặc: Bất lực, tốc độ 0, không phản ứng. Hết khi ăn sát thương hoặc đồng minh dùng action lay tỉnh. Tập trung 1 phút.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '120ft',
      effect: { name: 'Hypnotic Pattern (mê man)', condition: 'incapacitated', note: 'Bất lực + tốc độ 0; hết khi bị sát thương / được lay tỉnh', expiresInRounds: 10 } }),
  S3('slow', 'Slow', 'Transmutation', ['sorcerer', 'wizard'],
    'Khối 40ft tầm 120ft, tối đa 6 mục tiêu, save WIS, tập trung 1 phút. Fail → tốc độ ½, −2 AC & save DEX, không reaction, mỗi lượt chỉ 1 action HOẶC 1 bonus. Cứu WIS cuối mỗi lượt.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: '120ft',
      effect: { name: 'Slow', note: 'Tốc độ ½, −2 AC & save DEX, không reaction, 1 action/lượt', expiresInRounds: 10 } }),
  S3('stinking-cloud', 'Stinking Cloud', 'Conjuration', ['bard', 'sorcerer', 'wizard'],
    'Cầu 20ft tầm 90ft, tập trung 1 phút: che khuất hoàn toàn. Sinh vật bắt đầu lượt trong đó save CON, fail → nôn oẹ, mất action lượt đó. Cứu CON cuối mỗi lượt.',
    { combat: true, castKind: 'save', save: 'con', concentration: true, range: '90ft',
      effect: { name: 'Stinking Cloud (nôn oẹ)', condition: 'incapacitated', note: 'Mất action nếu fail; save CON đầu mỗi lượt khi ở trong cầu 20ft', expiresInRounds: 10 } }),
  S3('bestow-curse', 'Bestow Curse', 'Necromancy', ['bard', 'cleric', 'wizard'],
    'Chạm, save WIS, tập trung 1 phút. Fail → chọn 1 lời nguyền: bất lợi kiểm tra/save 1 chỉ số; bất lợi đòn đánh nhắm bạn; mỗi lượt save WIS hoặc mất action; bạn gây +1d8 hoại tử lên nó.',
    { combat: true, castKind: 'save', save: 'wis', concentration: true, range: 'Chạm',
      effect: { name: 'Bestow Curse', note: 'Chọn hiệu ứng nguyền (xem mô tả phép); +1d8 hoại tử nếu chọn nhánh đó', expiresInRounds: 10 } }),
  // --- smite / rider (đúc rồi cưỡi lên đòn đánh) ---
  S3('blinding-smite', 'Blinding Smite', 'Evocation', ['paladin'],
    'Bonus action, tập trung 1 phút. Đòn đánh vũ khí trúng kế tiếp: +3d8 thánh và mục tiêu save CON hoặc bị Mù (cứu CON cuối mỗi lượt). App: gắn rider +3d8 radiant, bấm khi trúng rồi gỡ.',
    { combat: true, castKind: 'rider', rider: { dice: '3d8', type: 'radiant' }, actionType: 'bonus', concentration: true, range: 'Bản thân' }),
  S3('lightning-arrow', 'Lightning Arrow', 'Transmutation', ['ranger'],
    'Bonus action, tập trung 1 phút. Đòn tấn công vũ khí tầm xa kế: thành 4d8 sét (2d8 nếu trượt), và sinh vật trong 10ft mục tiêu save DEX, 2d8 sét, nửa khi thành công. App: gắn rider 4d8 sét.',
    { combat: true, castKind: 'rider', rider: { dice: '4d8', type: 'lightning' }, actionType: 'bonus', concentration: true, range: 'Bản thân' }),
  // --- buff (advisory) ---
  S3('haste', 'Haste', 'Transmutation', ['sorcerer', 'wizard'],
    'Tập trung 1 phút, chạm 1 mục tiêu: +2 AC, lợi thế save DEX, tốc độ ×2, thêm 1 action (chỉ để Attack 1 lần / Dash / Disengage / Hide / dùng vật). Khi phép hết: mục tiêu không action & bonus lượt kế.',
    { concentration: true, range: '30ft' }),
  S3('fly', 'Fly', 'Transmutation', ['sorcerer', 'warlock', 'wizard'],
    'Tập trung 10 phút, chạm 1 mục tiêu: tốc độ bay 60ft. Nâng ô: +1 mục tiêu. App: chỉnh tốc độ token / ghi chú.',
    { concentration: true, range: 'Chạm' }),
  S3('blink', 'Blink', 'Transmutation', ['sorcerer', 'wizard'],
    '1 phút. Cuối mỗi lượt của bạn tung 1d6: ra 4–6 → biến vào Cõi Ê-the tới đầu lượt sau (đòn đánh/phép nhắm bạn trượt hết). Quay lại ô cũ hoặc ô trống trong 10ft.',
    { range: 'Bản thân' }),
  S3('protection-from-energy', 'Protection from Energy', 'Abjuration', ['cleric', 'druid', 'ranger', 'sorcerer', 'wizard'],
    'Tập trung 1 giờ, chạm 1 mục tiêu: kháng 1 loại — axit/băng/lửa/sét/âm thanh (chọn). App: bật kháng loại đó trong Phòng thủ của token.',
    { concentration: true, range: 'Chạm' }),
  S3('crusaders-mantle', "Crusader's Mantle", 'Evocation', ['paladin'],
    'Toả 30ft quanh bạn, tập trung 1 phút: bạn và đồng minh trong vùng gây thêm 1d4 thánh mỗi đòn đánh vũ khí. App: mỗi người thêm rider +1d4 radiant (đòn vũ khí).',
    { concentration: true, range: 'Toả 30ft' }),
  S3('elemental-weapon', 'Elemental Weapon', 'Transmutation', ['druid', 'paladin', 'ranger', 'wizard'],
    'Tập trung 1 giờ, chạm 1 vũ khí thường: +1 đòn đánh & sát thương, thêm 1d4 nguyên tố (chọn loại). Nâng ô: +2/+2d4 (cấp 5), +3/+3d4 (cấp 7). App: thêm rider + attackBonusMisc.',
    { concentration: true, range: 'Chạm' }),
  S3('beacon-of-hope', 'Beacon of Hope', 'Abjuration', ['cleric'],
    'Toả 30ft, tập trung 1 phút: đồng minh trong vùng có lợi thế save WIS & death save, và hồi máu luôn ở mức tối đa (không cần tung).',
    { concentration: true, range: 'Toả 30ft' }),
  // --- utility (advisory) ---
  S3('counterspell', 'Counterspell', 'Abjuration', ['sorcerer', 'wizard'],
    'Reaction khi thấy sinh vật trong 60ft đang đúc phép: phép đó bị hủy nếu cấp ≤ 3; cấp cao hơn thì bạn tung kiểm tra ra phép DC 10 + cấp phép.',
    { actionType: 'reaction', range: '60ft' }),
  S3('dispel-magic', 'Dispel Magic', 'Abjuration', ['bard', 'cleric', 'druid', 'paladin', 'sorcerer', 'warlock', 'wizard'],
    'Tầm 120ft: kết thúc mọi hiệu ứng phép cấp ≤ 3 trên 1 mục tiêu/vật/vùng; hiệu ứng cấp cao hơn cần kiểm tra ra phép DC 10 + cấp phép.',
    { range: '120ft' }),
  S3('daylight', 'Daylight', 'Evocation', ['cleric', 'druid', 'paladin', 'ranger', 'sorcerer'],
    'Cầu sáng 60ft (bán kính) trong 1 giờ, sáng như ban ngày + 60ft lờ mờ ngoài. Hóa giải bóng tối ma thuật cấp ≤ 3.',
    { range: '60ft' }),
  S3('clairvoyance', 'Clairvoyance', 'Divination', ['bard', 'cleric', 'sorcerer', 'wizard'],
    'Đúc 10 phút, tập trung 10 phút: tạo giác quan nghe HOẶC nhìn vô hình ở một nơi quen thuộc / thấy được trong 1 dặm.',
    { concentration: true, range: '1 dặm' }),
  S3('sending', 'Sending', 'Divination', ['bard', 'cleric', 'wizard'],
    'Gửi 1 tin nhắn ≤ 25 từ tới 1 sinh vật bạn biết, bất kể khoảng cách (khác cõi thì có thể trượt). Nó trả lời ngay.',
    { range: 'Không giới hạn' }),
  S3('tongues', 'Tongues', 'Divination', ['bard', 'cleric', 'sorcerer', 'warlock', 'wizard'],
    'Chạm 1 mục tiêu, 1 giờ: hiểu mọi ngôn ngữ nói nghe thấy; ai biết 1 ngôn ngữ đều hiểu lời nó nói.',
    { range: 'Chạm' }),
  S3('water-breathing', 'Water Breathing', 'Transmutation', ['druid', 'ranger', 'sorcerer', 'wizard'],
    'Nghi lễ. Tối đa 10 sinh vật sẵn lòng thở được dưới nước 24 giờ.',
    { range: '30ft' }),
  S3('water-walk', 'Water Walk', 'Transmutation', ['cleric', 'druid', 'ranger', 'sorcerer'],
    'Nghi lễ. Tối đa 10 sinh vật đi trên mặt chất lỏng (nước, axit, bùn, dung nham…) như đất cứng, 1 giờ.',
    { range: '30ft' }),
  S3('gaseous-form', 'Gaseous Form', 'Transmutation', ['sorcerer', 'warlock', 'wizard'],
    'Tập trung 1 giờ, chạm 1 mục tiêu sẵn lòng: hóa sương mù — kháng đập/đâm/chém & sát thương phi phép, bay 10ft, chui qua khe nhỏ, không hành động/nói/cầm đồ.',
    { concentration: true, range: 'Chạm' }),
  S3('major-image', 'Major Image', 'Illusion', ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Tập trung 10 phút, tầm 120ft: ảo ảnh 20ft có hình + âm thanh + mùi + nhiệt, điều khiển được. Kiểm tra Investigation vs spell save DC để lật.',
    { concentration: true, range: '120ft' }),
  S3('leomunds-tiny-hut', "Leomund's Tiny Hut", 'Evocation', ['bard', 'wizard'],
    'Nghi lễ. Vòm bán cầu 10ft (bán kính) đứng yên 8 giờ, chứa 9 người: chắn thời tiết, ai/gì bên ngoài không vào được, bên trong nhìn ra được.',
    { range: '10ft' }),
  S3('magic-circle', 'Magic Circle', 'Abjuration', ['cleric', 'paladin', 'wizard'],
    'Đúc 1 phút, trụ 10ft×20ft tầm 10ft, 1 giờ: chọn loại (Aberration/Celestial/Elemental/Fey/Fiend/Undead) — không vào được, bất lợi đòn đánh người bên trong, miễn Charmed/Frightened/Possessed. Có thể đảo chiều để nhốt.',
    { range: '10ft' }),
  S3('nondetection', 'Nondetection', 'Abjuration', ['bard', 'ranger', 'wizard'],
    'Chạm 1 mục tiêu / vật / vùng ≤ 10ft, 8 giờ: ẩn khỏi phép Divination và giác quan ma thuật.',
    { range: 'Chạm' }),
  S3('remove-curse', 'Remove Curse', 'Abjuration', ['cleric', 'paladin', 'warlock', 'wizard'],
    'Chạm: gỡ mọi lời nguyền trên 1 sinh vật, hoặc phá liên kết nguyền của 1 vật (không phá vật).',
    { range: 'Chạm' }),
  S3('speak-with-dead', 'Speak with Dead', 'Necromancy', ['bard', 'cleric', 'wizard'],
    'Đúc 1 phút lên 1 xác còn miệng, chết chưa quá 10 ngày, chưa bị hỏi trong 10 ngày qua: hỏi tối đa 5 câu trong 10 phút; nó trả lời theo hiểu biết lúc còn sống (có thể ngắn/mập mờ).',
    { range: '10ft' }),
  S3('speak-with-plants', 'Speak with Plants', 'Transmutation', ['bard', 'druid', 'ranger'],
    '10 phút: hỏi cây cỏ trong 30ft về chuyện xảy ra gần đó; ra lệnh cây di chuyển được (nới cản, mở lối…).',
    { range: 'Bản thân' }),
  S3('create-food-and-water', 'Create Food and Water', 'Conjuration', ['cleric', 'druid', 'paladin'],
    'Tầm 30ft: tạo 45 lbs thức ăn + 30 gallon nước, đủ cho 15 người / 5 ngựa trong 24 giờ.',
    { range: '30ft' }),
  S3('plant-growth', 'Plant Growth', 'Transmutation', ['bard', 'druid', 'ranger'],
    'Đúc 1 action: cây cỏ trong bán kính 100ft rậm rạp — địa hình khó (di chuyển tốn ×4). Hoặc đúc 8 giờ: làm màu mỡ đất bán kính ½ dặm (mùa sau bội thu).',
    { range: '150ft' }),
  S3('catnap', 'Catnap', 'Enchantment', ['bard', 'sorcerer', 'wizard'],
    'Tầm 30ft, tối đa 3 mục tiêu sẵn lòng: ngủ 10 phút, hết thời gian tỉnh dậy như vừa nghỉ ngắn. Không dùng được cho ai đã nghỉ ngắn/dài từ lần nghỉ dài gần nhất.',
    { range: '30ft' }),
  S3('animate-dead', 'Animate Dead', 'Necromancy', ['cleric', 'wizard'],
    'Đúc 1 phút lên 1 bộ xương / xác chết cỡ Small–Medium trong 10ft: tạo 1 Skeleton hoặc Zombie theo lệnh (24 giờ; đúc lại để gia hạn 24 giờ và +2 undead). App: spawn stat block từ Bestiary.',
    { range: '10ft' }),
  S3('summon-fey', 'Summon Fey', 'Conjuration', ['druid', 'ranger', 'warlock', 'wizard'],
    'Bonus action, tập trung 1 giờ: triệu 1 Fey Spirit (chọn kiểu: Fuming/Mirthful/Tricksy) tầm 90ft, đánh/hỗ trợ theo lệnh. App: spawn stat block từ Bestiary.',
    { actionType: 'bonus', concentration: true, range: '90ft' }),
  S3('summon-undead', 'Summon Undead', 'Necromancy', ['warlock', 'wizard'],
    'Bonus action, tập trung 1 giờ: triệu 1 Undead Spirit (Ghostly/Putrid/Skeletal) tầm 90ft, đánh theo lệnh. App: spawn stat block từ Bestiary.',
    { actionType: 'bonus', concentration: true, range: '90ft' }),
  S3('glyph-of-warding', 'Glyph of Warding', 'Abjuration', ['bard', 'cleric', 'wizard'],
    'Đúc 1 giờ, tốn bột 200gp: đặt 1 ký hiệu bẫy (nổ 5d8 loại chọn, save DEX nửa) hoặc chứa 1 phép ≤ 3 để bung khi điều kiện kích hoạt. Kéo dài tới khi nổ.',
    { range: 'Chạm' }),
  S3('sleet-storm', 'Sleet Storm', 'Conjuration', ['druid', 'sorcerer', 'wizard'],
    'Trụ 40ft×20ft tầm 150ft, tập trung 1 phút: che khuất, dập lửa trần, địa hình khó, mặt đất trơn — sinh vật khi vào / bắt đầu lượt save DEX hoặc Ngã. Ai tập trung trong vùng phải save CON để giữ.',
    { combat: true, castKind: 'save', save: 'dex', concentration: true, range: '150ft',
      effect: { name: 'Sleet Storm (trơn trượt)', condition: 'prone', note: 'Địa hình khó + che khuất; save DEX hoặc Ngã khi vào/bắt đầu lượt', expiresInRounds: 10 } }),
  S3('meld-into-stone', 'Meld into Stone', 'Transmutation', ['cleric', 'druid'],
    'Nghi lễ. Nhập vào 1 tảng đá đủ lớn trong 8 giờ: nghe lờ mờ, không thấy, ra vào bằng ½ tốc độ. Đá vỡ → 6d6 đập cho bạn.',
    { range: 'Chạm' }),
  S3('phantom-steed', 'Phantom Steed', 'Illusion', ['wizard'],
    'Nghi lễ. Tạo 1 ngựa ma (giống Warhorse) tầm 30ft, đi được 1 giờ, tốc độ 100ft, không mệt. Ăn sát thương / hết giờ → tan.',
    { range: '30ft' }),
];

export const SRD_L3_SPELLS: CantripDef[] = L3;
export const SRD_SPELLS: CantripDef[] = [
  ...SRD_CANTRIPS,
  ...SRD_L1_SPELLS,
  ...SRD_L2_SPELLS,
  ...SRD_L3_SPELLS,
];

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

/** Look up a spell definition (cantrip or level-1) by (loose) name. */
export function findCantrip(name: string): CantripDef | undefined {
  const n = norm(name);
  return SRD_SPELLS.find((c) => norm(c.name) === n);
}

/** Split a spell-def list by whether the sheet's class list grants each entry. */
export function spellDefsForSheet(
  sheet: CharacterSheet,
  list: CantripDef[],
): { own: CantripDef[]; others: CantripDef[] } {
  const names = sheetClasses(sheet)
    .map((c) => (c.name ?? '').toLowerCase().trim())
    .filter(Boolean);
  const own: CantripDef[] = [];
  const others: CantripDef[] = [];
  for (const def of list) {
    const match = def.classes.some((cl) => names.some((n) => n.includes(cl) || cl.includes(n)));
    (match ? own : others).push(def);
  }
  return { own, others };
}

/** Cantrips split by the sheet's class list (`others` = still addable via feat/subclass). */
export function cantripsForSheet(sheet: CharacterSheet) {
  return spellDefsForSheet(sheet, SRD_CANTRIPS);
}
/** Level-1 SRD spells split by the sheet's class list. */
export function l1SpellsForSheet(sheet: CharacterSheet) {
  return spellDefsForSheet(sheet, SRD_L1_SPELLS);
}
/** Level-2 SRD spells split by the sheet's class list. */
export function l2SpellsForSheet(sheet: CharacterSheet) {
  return spellDefsForSheet(sheet, SRD_L2_SPELLS);
}
/** Level-3 SRD spells split by the sheet's class list. */
export function l3SpellsForSheet(sheet: CharacterSheet) {
  return spellDefsForSheet(sheet, SRD_L3_SPELLS);
}

/** The caster's spellcasting ability modifier (0 if not yet a caster). */
function castMod(sheet: CharacterSheet): number {
  const ab = spellcastingAbilityOf(sheet);
  return ab ? abilityMod(sheet.abilities[ab]) : 0;
}

/** The base damage parts for a spell def, scaled for cantrips / fixed for leveled. */
function defDamageParts(def: CantripDef, sheet: CharacterSheet): DamagePart[] | undefined {
  let dice = def.fixedDamage
    ? def.fixedDamage
    : def.damageDie
      ? scaleCantripDie(def.damageDie, totalLevelOf(sheet))
      : undefined;
  if (!dice) return undefined;
  if (def.addSpellMod) {
    const m = castMod(sheet);
    if (m) dice = `${dice}${m > 0 ? '+' : ''}${m}`;
  }
  return [{ dice, type: def.damageType ?? '', label: def.name }];
}

/** Build a ready-to-add spell from a def, damage scaled/fixed for the sheet. */
export function spellFromCantrip(def: CantripDef, sheet: CharacterSheet, id: string): Spell {
  const damage = defDamageParts(def, sheet);
  const wired =
    def.castKind === 'attack' || def.castKind === 'save' || def.castKind === 'damage';
  return {
    id,
    name: def.name,
    level: def.level ?? 0,
    school: def.school,
    prepared: true,
    concentration: def.concentration ?? false,
    castKind: def.castKind,
    actionType: def.actionType ?? 'action',
    damage: wired ? damage : undefined,
    heal: def.castKind === 'heal' ? def.heal : undefined,
    rider: def.castKind === 'rider' ? def.rider : undefined,
    save:
      def.castKind === 'save' && def.save
        ? { ability: def.save, halfOnSave: def.halfOnSave || undefined }
        : undefined,
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

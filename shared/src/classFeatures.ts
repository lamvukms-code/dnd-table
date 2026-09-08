import type { CharacterSheet } from './types.js';
import { barbarianLevel, druidLevel, monkLevel, rogueLevel, warlockLevel } from './rules.js';

/**
 * Base-class feature progression (D&D 5e 2024). Descriptions are short
 * paraphrases of the mechanics — the System Reference Document 5.2 covers the
 * Barbarian, Rogue, Monk, Warlock and Druid base classes under CC-BY-4.0
 * (© Wizards of the Coast). Subclasses are intentionally out of scope for now.
 *
 * "ASI" (ability score improvement) levels are omitted — they aren't a feature
 * to track. Levels that only grant a subclass feature are noted as such.
 */

export interface ClassFeatureDef {
  id: string;
  class: string; // lowercase class name this matches
  level: number; // class level at which it is gained
  name: string;
  description: string;
  /** Which semi-automatic control on the sheet drives this feature, if any. */
  automation?:
    | 'sneak-attack'
    | 'cunning-action'
    | 'rage'
    | 'reckless-attack'
    | 'martial-arts'
    | 'focus'
    | 'stunning-strike'
    | 'pact-magic'
    | 'wild-shape';
}

const ROGUE: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'rogue-expertise-1',
    level: 1,
    name: 'Expertise',
    description: 'Chọn 2 kỹ năng thành thạo → nhân đôi proficiency bonus cho chúng.',
  },
  {
    id: 'rogue-sneak-attack',
    level: 1,
    name: 'Sneak Attack',
    description:
      'Một lần mỗi lượt, khi trúng đòn bằng vũ khí finesse/tầm xa và bạn có lợi thế (hoặc đồng minh kề mục tiêu và bạn không bất lợi), cộng thêm sát thương. Số dice = ⌈cấp Rogue ÷ 2⌉ d6.',
    automation: 'sneak-attack',
  },
  {
    id: 'rogue-thieves-cant',
    level: 1,
    name: "Thieves' Cant",
    description: 'Biết mật ngữ/ký hiệu của giới trộm cắp.',
  },
  {
    id: 'rogue-weapon-mastery',
    level: 1,
    name: 'Weapon Mastery',
    description: 'Dùng thuộc tính mastery của 2 loại vũ khí bạn thành thạo (đổi khi nghỉ dài).',
  },
  {
    id: 'rogue-cunning-action',
    level: 2,
    name: 'Cunning Action',
    description: 'Bonus Action mỗi lượt: Dash, Disengage, hoặc Hide.',
    automation: 'cunning-action',
  },
  {
    id: 'rogue-steady-aim',
    level: 3,
    name: 'Steady Aim',
    description:
      'Bonus Action: nếu chưa di chuyển lượt này, tự cho mình lợi thế đòn tấn công tiếp theo trong lượt (tốc độ = 0 tới hết lượt).',
  },
  { id: 'rogue-subclass-3', level: 3, name: 'Roguish Archetype', description: 'Chọn subclass (chưa hỗ trợ trong app).' },
  {
    id: 'rogue-cunning-strike',
    level: 5,
    name: 'Cunning Strike',
    description:
      'Khi tung Sneak Attack, có thể bỏ bớt d6 để thêm hiệu ứng: Poison (DC CON, Poisoned), Trip (DC DEX, Prone), Withdraw (di chuyển nửa tốc độ, không kích đòn cơ hội).',
  },
  {
    id: 'rogue-uncanny-dodge',
    level: 5,
    name: 'Uncanny Dodge',
    description: 'Reaction khi bị 1 đòn tấn công thấy được trúng: giảm nửa sát thương đòn đó.',
  },
  {
    id: 'rogue-expertise-6',
    level: 6,
    name: 'Expertise',
    description: 'Thêm 2 kỹ năng nữa được Expertise.',
  },
  {
    id: 'rogue-evasion',
    level: 7,
    name: 'Evasion',
    description: 'Khi chịu save DEX để giảm nửa sát thương: thành công = 0 sát thương, thất bại = nửa.',
  },
  {
    id: 'rogue-reliable-talent',
    level: 7,
    name: 'Reliable Talent',
    description: 'Với kiểm tra kỹ năng bạn thành thạo, coi kết quả d20 dưới 10 thành 10.',
  },
  {
    id: 'rogue-improved-cunning-strike',
    level: 11,
    name: 'Improved Cunning Strike',
    description: 'Dùng tối đa 2 lựa chọn Cunning Strike trong một lần Sneak Attack.',
  },
  {
    id: 'rogue-devious-strikes',
    level: 14,
    name: 'Devious Strikes',
    description: 'Thêm lựa chọn Cunning Strike: Daze, Knock Out, Obscure.',
  },
  {
    id: 'rogue-slippery-mind',
    level: 15,
    name: 'Slippery Mind',
    description: 'Thành thạo save WIS và CHA.',
  },
  {
    id: 'rogue-elusive',
    level: 18,
    name: 'Elusive',
    description: 'Không đòn tấn công nào có lợi thế nhắm bạn khi bạn chưa bị Incapacitated.',
  },
  {
    id: 'rogue-stroke-of-luck',
    level: 20,
    name: 'Stroke of Luck',
    description:
      'Một lần mỗi nghỉ ngắn/dài: biến 1 đòn trượt thành trúng, hoặc coi 1 kiểm tra d20 thất bại như tung ra 20.',
  },
];

const BARBARIAN: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'barb-rage',
    level: 1,
    name: 'Rage',
    description:
      'Bonus Action, dùng 1 charge: lợi thế kiểm tra & save STR; +sát thương cận chiến STR (+2 / +3 từ cấp 9 / +4 từ cấp 16); kháng đâm–chém–đập. Kéo dài 10 phút (không cần logic tự kết thúc). Hồi 1 charge khi nghỉ ngắn, hồi hết khi nghỉ dài.',
    automation: 'rage',
  },
  {
    id: 'barb-unarmored-defense',
    level: 1,
    name: 'Unarmored Defense',
    description: 'Khi không mặc giáp: AC = 10 + DEX mod + CON mod (dùng ô "AC ghi đè" trên sheet).',
  },
  {
    id: 'barb-weapon-mastery',
    level: 1,
    name: 'Weapon Mastery',
    description: 'Dùng thuộc tính mastery của 2 loại vũ khí bạn thành thạo (đổi khi nghỉ dài).',
  },
  {
    id: 'barb-danger-sense',
    level: 2,
    name: 'Danger Sense',
    description: 'Lợi thế save DEX với hiệu ứng bạn thấy được (khi không bị Incapacitated).',
  },
  {
    id: 'barb-reckless-attack',
    level: 2,
    name: 'Reckless Attack',
    description:
      'Đòn tấn công cận chiến STR đầu lượt: tự cho mình lợi thế, đổi lại mọi đòn tấn công nhắm bạn có lợi thế tới hết lượt sau.',
    automation: 'reckless-attack',
  },
  { id: 'barb-subclass-3', level: 3, name: 'Barbarian Subclass', description: 'Chọn subclass (chưa hỗ trợ trong app).' },
  {
    id: 'barb-primal-knowledge',
    level: 3,
    name: 'Primal Knowledge',
    description: 'Thêm 1 kỹ năng thành thạo; khi Rage có thể dùng STR cho vài loại kiểm tra DEX/CON/INT/WIS/CHA nhất định.',
  },
  {
    id: 'barb-extra-attack',
    level: 5,
    name: 'Extra Attack',
    description: 'Tấn công 2 lần khi dùng action Attack.',
  },
  {
    id: 'barb-fast-movement',
    level: 5,
    name: 'Fast Movement',
    description: 'Tốc độ +10 ft khi không mặc giáp nặng.',
  },
  {
    id: 'barb-feral-instinct',
    level: 7,
    name: 'Feral Instinct',
    description: 'Lợi thế initiative.',
  },
  {
    id: 'barb-instinctive-pounce',
    level: 7,
    name: 'Instinctive Pounce',
    description: 'Khi vào Rage bằng Bonus Action, di chuyển tới nửa tốc độ.',
  },
  {
    id: 'barb-brutal-strike',
    level: 9,
    name: 'Brutal Strike',
    description:
      'Khi Reckless Attack, có thể bỏ lợi thế để thêm 1d10 sát thương + 1 hiệu ứng (Forceful Blow đẩy lùi, hoặc Hamstring Blow giảm tốc độ).',
  },
  {
    id: 'barb-relentless-rage',
    level: 11,
    name: 'Relentless Rage',
    description: 'Khi xuống 0 HP mà đang Rage và không chết ngay: save CON DC 10 (+5 mỗi lần) để về 1 HP.',
  },
  {
    id: 'barb-improved-brutal-strike',
    level: 13,
    name: 'Improved Brutal Strike',
    description: 'Thêm lựa chọn Brutal Strike; có thể dùng 2 hiệu ứng.',
  },
  {
    id: 'barb-persistent-rage',
    level: 15,
    name: 'Persistent Rage',
    description: 'Rage không kết thúc sớm do bị Unconscious hay không tấn công/bị đánh; kéo dài tới 10 phút. Bonus Action hồi Rage về đầy uses khi vào initiative.',
  },
  {
    id: 'barb-improved-brutal-strike-17',
    level: 17,
    name: 'Improved Brutal Strike (17)',
    description: 'Sát thương thêm của Brutal Strike lên 2d10.',
  },
  {
    id: 'barb-indomitable-might',
    level: 18,
    name: 'Indomitable Might',
    description: 'Kiểm tra STR: nếu tổng dưới điểm STR thì tính bằng điểm STR.',
  },
  {
    id: 'barb-primal-champion',
    level: 20,
    name: 'Primal Champion',
    description: 'STR và CON +4 (tối đa 24).',
  },
];

const MONK: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'monk-martial-arts',
    level: 1,
    name: 'Martial Arts',
    description:
      'Đòn không vũ khí & vũ khí monk dùng DEX, sát thương = Martial Arts die (1d6 → 1d8 cấp 5 → 1d10 cấp 11 → 1d12 cấp 17). Sau đòn Attack, đánh không vũ khí 1 lần bằng Bonus Action.',
    automation: 'martial-arts',
  },
  {
    id: 'monk-unarmored-defense',
    level: 1,
    name: 'Unarmored Defense',
    description: 'Không giáp, không khiên: AC = 10 + DEX mod + WIS mod (dùng ô "AC ghi đè").',
  },
  {
    id: 'monk-focus',
    level: 2,
    name: "Monk's Focus (Focus Points)",
    description:
      'Có Focus Points = cấp Monk, hồi hết khi nghỉ ngắn/dài. Dùng 1 điểm: Flurry of Blows (thêm 2 đòn không vũ khí, 3 từ cấp 10), Patient Defense (Disengage; hoặc +1 điểm để Dodge), Step of the Wind (Dash + Disengage; nhảy xa gấp đôi).',
    automation: 'focus',
  },
  {
    id: 'monk-unarmored-movement',
    level: 2,
    name: 'Unarmored Movement',
    description: 'Tốc độ +10 ft khi không giáp/khiên (tăng dần: +15 cấp 6, +20 cấp 10, +25 cấp 14, +30 cấp 18).',
  },
  {
    id: 'monk-uncanny-metabolism',
    level: 2,
    name: 'Uncanny Metabolism',
    description: 'Một lần mỗi nghỉ dài, khi lăn initiative: hồi hết Focus Points và hồi HP = tung Martial Arts die + cấp Monk.',
  },
  {
    id: 'monk-deflect-attacks',
    level: 3,
    name: 'Deflect Attacks',
    description:
      'Reaction khi trúng đòn cận/xa (chỉ đập/đâm/chém): giảm sát thương đi 1d10 + DEX mod + cấp Monk. Nếu về 0, dùng 1 Focus Point để ném lại.',
  },
  { id: 'monk-subclass-3', level: 3, name: 'Monk Subclass', description: 'Chọn subclass (chưa hỗ trợ trong app).' },
  {
    id: 'monk-slow-fall',
    level: 4,
    name: 'Slow Fall',
    description: 'Reaction khi ngã: giảm sát thương ngã đi 5 × cấp Monk.',
  },
  {
    id: 'monk-extra-attack',
    level: 5,
    name: 'Extra Attack',
    description: 'Tấn công 2 lần khi dùng action Attack.',
  },
  {
    id: 'monk-stunning-strike',
    level: 5,
    name: 'Stunning Strike',
    description:
      'Một lần mỗi lượt, khi trúng đòn cận chiến: dùng 1 Focus Point → mục tiêu save CON (DC = 8 + PB + WIS mod); thất bại → Stunned tới hết lượt sau của bạn (thành công → tốc độ = 0 tới đầu lượt sau).',
    automation: 'stunning-strike',
  },
  {
    id: 'monk-empowered-strikes',
    level: 6,
    name: 'Empowered Strikes',
    description: 'Đòn không vũ khí có thể gây sát thương Force thay vì Bludgeoning.',
  },
  {
    id: 'monk-evasion',
    level: 7,
    name: 'Evasion',
    description: 'Save DEX để giảm nửa: thành công = 0, thất bại = nửa.',
  },
  {
    id: 'monk-acrobatic-movement',
    level: 9,
    name: 'Acrobatic Movement',
    description: 'Khi không giáp/khiên: đi trên mặt nước/tường thẳng đứng khi di chuyển.',
  },
  {
    id: 'monk-heightened-focus',
    level: 10,
    name: 'Heightened Focus',
    description: 'Flurry đánh 3 đòn; Patient Defense cho tạm HP 2 × cấp Monk; Step of the Wind cho đồng minh kề bên +½ tốc độ.',
  },
  {
    id: 'monk-deflect-energy',
    level: 13,
    name: 'Deflect Energy',
    description: 'Deflect Attacks áp dụng cho mọi loại sát thương.',
  },
  {
    id: 'monk-disciplined-survivor',
    level: 14,
    name: 'Disciplined Survivor',
    description: 'Thành thạo mọi saving throw. Dùng 1 Focus Point để reroll 1 save.',
  },
  {
    id: 'monk-perfect-focus',
    level: 15,
    name: 'Perfect Focus',
    description: 'Khi lăn initiative mà còn ≤ 3 Focus Point: hồi lên 4.',
  },
  {
    id: 'monk-superior-defense',
    level: 18,
    name: 'Superior Defense',
    description: 'Đầu lượt, dùng 3 Focus Point: 1 phút kháng mọi sát thương trừ Force.',
  },
  {
    id: 'monk-body-and-mind',
    level: 20,
    name: 'Body and Mind',
    description: 'DEX và WIS +4 (tối đa 25).',
  },
];

const WARLOCK: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'warlock-eldritch-invocations',
    level: 1,
    name: 'Eldritch Invocations',
    description:
      'Học Invocation (số lượng theo cấp: 1/3/5/7/9… — xem bảng). Đổi 1 khi lên cấp. Pact of the Blade / Tome / Chain là Invocation cấp 1.',
  },
  {
    id: 'warlock-pact-magic',
    level: 1,
    name: 'Pact Magic',
    description:
      'Ô phép Pact (quản lý ở tab Phép — số ô & cấp ô tự tính theo cấp Warlock, hồi khi nghỉ ngắn/dài). Spell save DC & spell attack tự tính, ability = CHA.',
    automation: 'pact-magic',
  },
  {
    id: 'warlock-magical-cunning',
    level: 2,
    name: 'Magical Cunning',
    description:
      'Một lần mỗi nghỉ dài, nghi lễ 1 phút hồi số ô Pact = ½ số ô tối đa (làm tròn lên).',
  },
  { id: 'warlock-subclass-3', level: 3, name: 'Warlock Subclass', description: 'Chọn subclass (chưa hỗ trợ trong app).' },
  {
    id: 'warlock-contact-patron',
    level: 9,
    name: 'Contact Patron',
    description: 'Đúc kết Contact Other Plane với patron, luôn thành công; đúc miễn phí 1 lần mỗi nghỉ dài.',
  },
  {
    id: 'warlock-mystic-arcanum-6',
    level: 11,
    name: 'Mystic Arcanum (cấp 6)',
    description: 'Chọn 1 phép cấp 6, đúc miễn phí 1 lần mỗi nghỉ dài (không tốn ô Pact).',
  },
  {
    id: 'warlock-mystic-arcanum-7',
    level: 13,
    name: 'Mystic Arcanum (cấp 7)',
    description: 'Thêm 1 phép cấp 7, miễn phí 1 lần mỗi nghỉ dài.',
  },
  {
    id: 'warlock-mystic-arcanum-8',
    level: 15,
    name: 'Mystic Arcanum (cấp 8)',
    description: 'Thêm 1 phép cấp 8, miễn phí 1 lần mỗi nghỉ dài.',
  },
  {
    id: 'warlock-mystic-arcanum-9',
    level: 17,
    name: 'Mystic Arcanum (cấp 9)',
    description: 'Thêm 1 phép cấp 9, miễn phí 1 lần mỗi nghỉ dài.',
  },
  {
    id: 'warlock-eldritch-master',
    level: 20,
    name: 'Eldritch Master',
    description: 'Nghi lễ 1 phút, 1 lần mỗi nghỉ dài: hồi hết ô Pact.',
  },
];

const DRUID: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'druid-druidic',
    level: 1,
    name: 'Druidic',
    description: 'Biết mật ngữ Druidic; luôn có Speak with Animals như nghi lễ.',
  },
  {
    id: 'druid-primal-order',
    level: 1,
    name: 'Primal Order',
    description:
      'Chọn: Magician (thêm 1 cantrip, cộng WIS mod vào kiểm tra Arcana/Nature) hoặc Warden (thành thạo giáp vừa, khiên, vũ khí Martial).',
  },
  {
    id: 'druid-spellcasting',
    level: 1,
    name: 'Spellcasting',
    description:
      'Full caster, ability = WIS. Prepared spells (số lượng theo bảng). Quản lý ô phép ở tab Phép — tự tính theo cấp. Spell save DC & spell attack tự tính.',
  },
  {
    id: 'druid-wild-shape',
    level: 2,
    name: 'Wild Shape',
    description:
      'Bonus Action: biến thành một Beast bạn từng thấy (giới hạn CR/loại theo cấp). Số lần dùng = 2 (3 từ cấp 6, 4 từ cấp 17); hồi 1 khi nghỉ ngắn, hồi hết khi nghỉ dài. Ở app: dùng stat block quái từ Bestiary cho hình dạng thú.',
    automation: 'wild-shape',
  },
  {
    id: 'druid-wild-companion',
    level: 2,
    name: 'Wild Companion',
    description: 'Tốn 1 lần Wild Shape để đúc Find Familiar (dạng linh hồn, không cần vật liệu).',
  },
  { id: 'druid-subclass-3', level: 3, name: 'Druid Subclass', description: 'Chọn subclass (chưa hỗ trợ trong app).' },
  {
    id: 'druid-wild-resurgence',
    level: 5,
    name: 'Wild Resurgence',
    description:
      'Một lần mỗi lượt, nếu hết lần Wild Shape: tốn 1 ô phép để hồi 1 lần. Hoặc 1 lần mỗi nghỉ dài: tốn 1 lần Wild Shape để hồi 1 ô phép cấp 1.',
  },
  {
    id: 'druid-elemental-fury',
    level: 7,
    name: 'Elemental Fury',
    description:
      'Chọn: Potent Spellcasting (cộng WIS mod vào sát thương cantrip Druid) hoặc Primal Strike (một lần mỗi lượt, đòn đánh / Wild Shape gây thêm 1d8 sát thương Cold/Fire/Lightning/Thunder).',
  },
  {
    id: 'druid-improved-elemental-fury',
    level: 15,
    name: 'Improved Elemental Fury',
    description: 'Potent Spellcasting: tầm cantrip gấp đôi. Primal Strike: sát thương thêm lên 2d8.',
  },
  {
    id: 'druid-beast-spells',
    level: 18,
    name: 'Beast Spells',
    description: 'Đúc phép Druid khi đang Wild Shape chỉ cần Somatic/Verbal (không cần Material).',
  },
  {
    id: 'druid-archdruid',
    level: 20,
    name: 'Archdruid',
    description:
      'Wild Shape không giới hạn (1 lần miễn phí mỗi lượt). Bỏ qua V/S/M của phép Druid. Lão hóa chậm.',
  },
];

export const CLASS_FEATURES: ClassFeatureDef[] = [
  ...ROGUE.map((f) => ({ ...f, class: 'rogue' })),
  ...BARBARIAN.map((f) => ({ ...f, class: 'barbarian' })),
  ...MONK.map((f) => ({ ...f, class: 'monk' })),
  ...WARLOCK.map((f) => ({ ...f, class: 'warlock' })),
  ...DRUID.map((f) => ({ ...f, class: 'druid' })),
];

/** Classes we have a feature table for. */
export const SUPPORTED_FEATURE_CLASSES = ['rogue', 'barbarian', 'monk', 'warlock', 'druid'];

/** The class features this sheet has earned, from CLASS_FEATURES, ordered by level. */
export function derivedClassFeatures(sheet: CharacterSheet): ClassFeatureDef[] {
  const levels: Record<string, number> = {
    rogue: rogueLevel(sheet),
    barbarian: barbarianLevel(sheet),
    monk: monkLevel(sheet),
    warlock: warlockLevel(sheet),
    druid: druidLevel(sheet),
  };
  return CLASS_FEATURES.filter((f) => f.level <= (levels[f.class] ?? 0)).sort(
    (a, b) => a.level - b.level,
  );
}

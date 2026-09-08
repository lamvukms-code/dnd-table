import type { CharacterSheet } from './types.js';
import { barbarianLevel, rogueLevel } from './rules.js';

/**
 * Base-class feature progression (D&D 5e 2024). Descriptions are short
 * paraphrases of the mechanics — the System Reference Document 5.2 covers the
 * Barbarian and Rogue base classes under CC-BY-4.0 (© Wizards of the Coast).
 * Subclasses are intentionally out of scope for now.
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
  automation?: 'sneak-attack' | 'cunning-action' | 'rage' | 'reckless-attack';
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

export const CLASS_FEATURES: ClassFeatureDef[] = [
  ...ROGUE.map((f) => ({ ...f, class: 'rogue' })),
  ...BARBARIAN.map((f) => ({ ...f, class: 'barbarian' })),
];

/** Classes we have a feature table for. */
export const SUPPORTED_FEATURE_CLASSES = ['rogue', 'barbarian'];

/** The class features this sheet has earned, from CLASS_FEATURES, ordered by level. */
export function derivedClassFeatures(sheet: CharacterSheet): ClassFeatureDef[] {
  const levels: Record<string, number> = {
    rogue: rogueLevel(sheet),
    barbarian: barbarianLevel(sheet),
  };
  return CLASS_FEATURES.filter((f) => f.level <= (levels[f.class] ?? 0)).sort(
    (a, b) => a.level - b.level,
  );
}

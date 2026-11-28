import type { CharacterSheet } from './types.js';
import { resolveFeatureFormula, type FeatureAction } from './featureActions.js';
import type { FeaturePassive } from './featurePassives.js';
import { barbarianLevel, classLevelOf, druidLevel, monkLevel, rogueLevel, warlockLevel } from './rules.js';

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
    | 'wild-shape'
    | 'sorcery'
    | 'spellbook'
    | 'builtin';
  /** Options the player picks between; the chosen one's passive / buttons apply (sheet.featureChoices[id]). */
  choices?: { value: string; label: string; passive?: FeaturePassive; actions?: FeatureAction[] }[];
  /** Mechanics the app runs for this feature (same shapes as subclass features). */
  passive?: FeaturePassive;
  actions?: FeatureAction[];
  uses?: SubclassFeatureDef['uses'];
}

/**
 * A subclass feature. Subclass content that isn't SRD (e.g. a published setting
 * you own) is NOT shipped in this repo — the DM drops a JSON file of these into
 * their local install (see client/src/data/subclasses.example.json). Same shape
 * as a class feature plus a `subclass` tag and an optional limited-use pool.
 */
export interface SubclassFeatureDef {
  id: string;
  class: string; // lowercase class name
  subclass: string; // subclass name (matched case-insensitively, loosely)
  level: number; // class level at which it is gained
  name: string;
  description: string;
  /** A limited-use pool this feature grants (rendered as a pip tracker). */
  /**
   * `max`: a number, 'cha-mod' (at least 1), 'prof', a feature formula ("2*mod:cha", at least 1),
   * '<class>:<formula>' (`lvl` = that class's level: "paladin:5*lvl"), or a table by class level
   * ("tbl:fighter:1=2,4=3,10=4").
   */
  uses?: {
    max: number | string;
    /** 'shortOne': a short rest gives back one use, a long rest all of them. */
    recharge: 'short' | 'long' | 'shortOne';
    /** From this class level on, a short rest gives back every use (Font of Inspiration). */
    shortFrom?: number;
  };
  /** Buttons this feature puts on the sheet (see featureActions.ts). */
  actions?: FeatureAction[];
  /** Always-on mechanics: AC, speed, resistances, extra damage… (see featurePassives.ts). */
  passive?: FeaturePassive;
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
    actions: [{ label: 'Steady Aim', kind: 'effect', target: 'self', cost: 'bonus', effect: { name: 'Steady Aim', rollAdvantage: ['attack'], speedPenalty: 999, untilEndOfTurn: true } }],
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
    passive: { reaction: { kind: 'halve' } },
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
    passive: { evasion: true },
    level: 7,
    name: 'Evasion',
    description: 'Khi chịu save DEX để giảm nửa sát thương: thành công = 0 sát thương, thất bại = nửa.',
  },
  {
    id: 'rogue-reliable-talent',
    passive: { checkMin: { d20: 10, proficientOnly: true } },
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
    passive: { saveProficiency: ['wis', 'cha'] },
    level: 15,
    name: 'Slippery Mind',
    description: 'Thành thạo save WIS và CHA.',
  },
  {
    id: 'rogue-elusive',
    passive: { elusive: true },
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
    passive: { saveAdvantage: ['dex'] },
    level: 2,
    name: 'Danger Sense',
    description: 'Lợi thế save DEX với hiệu ứng bạn thấy được (khi không bị Incapacitated).',
  },
  {
    id: 'barb-reckless-attack',
    actions: [{ label: 'Reckless Attack', kind: 'effect', target: 'self', effect: { name: 'Reckless Attack', rollAdvantage: ['attack'], untilEndOfTurn: true, note: 'Lợi thế đòn cận chiến STR lượt này' }, extraEffect: { name: 'Reckless (bị lợi thế)', attackersAdvantage: true, untilYourNextTurn: true, note: 'Đòn đánh vào bạn có lợi thế đến lượt kế' } }],
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
    passive: { initiativeAdvantage: true },
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
    passive: { relentlessRage: true },
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
    passive: { checkMin: { score: 'str' } },
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
    actions: [{ label: 'Uncanny Metabolism', kind: 'heal', target: 'self', diceByLevel: { 2: '1d6+lvl', 5: '1d8+lvl', 11: '1d10+lvl', 17: '1d12+lvl' }, refillFocus: true }],
    uses: { max: 1, recharge: 'long' },
    level: 2,
    name: 'Uncanny Metabolism',
    description: 'Một lần mỗi nghỉ dài, khi lăn initiative: hồi hết Focus Points và hồi HP = tung Martial Arts die + cấp Monk.',
  },
  {
    id: 'monk-deflect-attacks',
    passive: { reaction: { kind: 'reduce', dice: '1d10+mod:dex+lvl', types: ['bludgeoning', 'piercing', 'slashing'] } },
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
    passive: { evasion: true },
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
    passive: { deflectAnyType: true },
    level: 13,
    name: 'Deflect Energy',
    description: 'Deflect Attacks áp dụng cho mọi loại sát thương.',
  },
  {
    id: 'monk-disciplined-survivor',
    passive: { saveProficiency: 'all' },
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
    actions: [{ label: 'Superior Defense', kind: 'effect', target: 'self', focusCost: 3, effect: { name: 'Superior Defense', rounds: 10, resist: ['acid', 'bludgeoning', 'cold', 'fire', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'] } }],
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
    actions: [{ label: 'Magical Cunning', kind: 'effect', target: 'self', restorePact: 'half' }],
    uses: { max: 1, recharge: 'long' },
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
    choices: [
      { value: 'magician', label: 'Magician', passive: { skillAdd: [{ skill: 'arcana', add: 'wis' }, { skill: 'nature', add: 'wis' }] } },
      { value: 'warden', label: 'Warden' },
    ],
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
      'Bonus Action: biến thành một Beast đã biết (4 hình dạng, 6 ở cấp 4, 8 ở cấp 8). CR tối đa 1/4 (1/2 ở cấp 4, 1 ở cấp 8), chưa được bay tới cấp 8. Nhận HP tạm = cấp Druid. Thay STR/DEX/CON, AC, tốc độ, cỡ và đòn đánh bằng của thú; giữ HP, INT/WIS/CHA, proficiency. Không đúc phép được. Hết khi về 0 HP hoặc tự thôi. Số lần = 2 (3 từ cấp 6, 4 từ cấp 17); hồi 1 khi nghỉ ngắn. App: phần 🐾 Wild Shape.',
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
    actions: [
      { label: 'Ô phép → 1 Wild Shape', kind: 'effect', target: 'self', convert: 'slotToWildShape', spendsUse: false },
      { label: '1 Wild Shape → ô cấp 1', kind: 'effect', target: 'self', convert: 'wildShapeToSlot' },
    ],
    uses: { max: 1, recharge: 'long' },
    level: 5,
    name: 'Wild Resurgence',
    description:
      'Một lần mỗi lượt, nếu hết lần Wild Shape: tốn 1 ô phép để hồi 1 lần. Hoặc 1 lần mỗi nghỉ dài: tốn 1 lần Wild Shape để hồi 1 ô phép cấp 1.',
  },
  {
    id: 'druid-elemental-fury',
    choices: [
      { value: 'potent', label: 'Potent Spellcasting', passive: { riders: [{ label: 'Potent Spellcasting', dice: 'mod:wis', type: 'same', scope: 'spell', cantripOnly: true }] } },
      { value: 'primal-cold', label: 'Primal Strike (cold)', passive: { riders: [{ label: 'Primal Strike', byLevel: { 7: '1d8', 15: '2d8' }, type: 'cold', scope: 'weapon', armed: true }] } },
      { value: 'primal-fire', label: 'Primal Strike (fire)', passive: { riders: [{ label: 'Primal Strike', byLevel: { 7: '1d8', 15: '2d8' }, type: 'fire', scope: 'weapon', armed: true }] } },
      { value: 'primal-lightning', label: 'Primal Strike (lightning)', passive: { riders: [{ label: 'Primal Strike', byLevel: { 7: '1d8', 15: '2d8' }, type: 'lightning', scope: 'weapon', armed: true }] } },
      { value: 'primal-thunder', label: 'Primal Strike (thunder)', passive: { riders: [{ label: 'Primal Strike', byLevel: { 7: '1d8', 15: '2d8' }, type: 'thunder', scope: 'weapon', armed: true }] } },
    ],
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

const FIGHTER: Omit<ClassFeatureDef, 'class'>[] = [
  { id: 'fighter-fighting-style', level: 1, name: 'Fighting Style', description: 'Chọn 1 feat Fighting Style (tab Đặc điểm → Feat). Archery, Defense, Dueling, GWF, TWF, Protection, Interception… đã tự áp.' },
  {
    id: 'fighter-second-wind',
    level: 1,
    name: 'Second Wind',
    description: 'Bonus Action: hồi 1d10 + cấp Fighter HP. 2 lần (3 ở cấp 4, 4 ở cấp 10); nghỉ ngắn hồi 1 lần, nghỉ dài hồi hết.',
    actions: [{ label: 'Second Wind', kind: 'heal', target: 'self', cost: 'bonus', dice: '1d10+lvl' }],
    uses: { max: 'tbl:fighter:1=2,4=3,10=4', recharge: 'shortOne' },
  },
  { id: 'fighter-weapon-mastery', level: 1, name: 'Weapon Mastery', description: 'Dùng thuộc tính Mastery của 3 loại vũ khí (4 ở cấp 4, 5 ở cấp 10, 6 ở cấp 16). Chọn ở tab Trang bị — app tự áp.', automation: 'builtin' },
  {
    id: 'fighter-action-surge',
    level: 2,
    name: 'Action Surge',
    description: 'Trong lượt của bạn: thêm 1 Action (không dùng cho Magic action). 1 lần mỗi nghỉ ngắn/dài (2 lần ở cấp 17, nhưng 1 lần mỗi lượt).',
    actions: [{ label: 'Action Surge', kind: 'surge' }],
    uses: { max: 'tbl:fighter:2=1,17=2', recharge: 'short' },
  },
  { id: 'fighter-tactical-mind', level: 2, name: 'Tactical Mind', description: 'Trượt một lần kiểm tra chỉ số: tốn 1 lần Second Wind để cộng 1d10 (không trúng thì không mất lượt).' },
  { id: 'fighter-subclass-3', level: 3, name: 'Fighter Subclass', description: 'Chọn subclass.' },
  { id: 'fighter-extra-attack', level: 5, name: 'Extra Attack', description: 'Đánh 2 lần mỗi Attack action (3 ở cấp 11, 4 ở cấp 20). App tự đếm.', automation: 'builtin' },
  { id: 'fighter-tactical-shift', level: 5, name: 'Tactical Shift', description: 'Khi dùng Second Wind: được di chuyển tối đa nửa tốc độ không bị đòn cơ hội.' },
  {
    id: 'fighter-indomitable',
    level: 9,
    name: 'Indomitable',
    description: 'Trượt save: tung lại, cộng thêm cấp Fighter, phải lấy kết quả mới. 1 lần (2 ở cấp 13, 3 ở cấp 17) mỗi nghỉ dài.',
    uses: { max: 'tbl:fighter:9=1,13=2,17=3', recharge: 'long' },
  },
  { id: 'fighter-tactical-master', level: 9, name: 'Tactical Master', description: 'Khi đánh bằng vũ khí có Mastery: được đổi sang Push, Sap hoặc Slow cho đòn đó.' },
  { id: 'fighter-two-extra-attacks', level: 11, name: 'Two Extra Attacks', description: 'Đánh 3 lần mỗi Attack action. App tự đếm.' },
  { id: 'fighter-studied-attacks', level: 13, name: 'Studied Attacks', description: 'Đánh trượt một sinh vật: đòn kế tiếp vào nó trước hết lượt sau của bạn có lợi thế.' },
  { id: 'fighter-three-extra-attacks', level: 20, name: 'Three Extra Attacks', description: 'Đánh 4 lần mỗi Attack action. App tự đếm.' },
];

const PALADIN: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'paladin-lay-on-hands',
    level: 1,
    name: 'Lay On Hands',
    description: 'Quỹ HP = 5 × cấp Paladin, hồi khi nghỉ dài. Bonus Action chạm: hồi số HP chọn từ quỹ (5 HP để chữa Poisoned).',
    actions: [{ label: 'Lay On Hands', kind: 'poolHeal', cost: 'bonus' }],
    uses: { max: 'paladin:5*lvl', recharge: 'long' },
  },
  { id: 'paladin-spellcasting', level: 1, name: 'Spellcasting', description: 'Half caster, ability = CHA. Ô phép, DC tự tính ở tab Phép.' },
  { id: 'paladin-weapon-mastery', level: 1, name: 'Weapon Mastery', description: 'Mastery của 2 loại vũ khí. Chọn ở tab Trang bị — app tự áp.' },
  { id: 'paladin-fighting-style', level: 2, name: 'Fighting Style', description: 'Chọn 1 feat Fighting Style, hoặc Blessed Warrior (2 cantrip Cleric).' },
  { id: 'paladin-smite', level: 2, name: "Paladin's Smite", description: 'Luôn chuẩn bị Divine Smite; đúc 1 lần không tốn ô mỗi nghỉ dài. App: chip Divine Smite ở “Sát thương thêm” (✎ quản lý → mẫu).' },
  {
    id: 'paladin-channel-divinity',
    level: 3,
    name: 'Channel Divinity',
    description: 'Divine Sense (Bonus Action, 10 phút: biết vị trí Celestial / Fiend / Undead trong 60 ft) và lựa chọn của subclass. 2 lần (3 ở cấp 11); nghỉ ngắn hồi 1, nghỉ dài hồi hết.',
    uses: { max: 'tbl:paladin:3=2,11=3', recharge: 'shortOne' },
  },
  { id: 'paladin-subclass-3', level: 3, name: 'Paladin Subclass', description: 'Chọn Oath.' },
  { id: 'paladin-extra-attack', level: 5, name: 'Extra Attack', description: 'Đánh 2 lần mỗi Attack action. App tự đếm.' },
  { id: 'paladin-faithful-steed', level: 5, name: 'Faithful Steed', description: 'Luôn chuẩn bị Find Steed; đúc 1 lần không tốn ô mỗi nghỉ dài.' },
  {
    id: 'paladin-aura-of-protection',
    level: 6,
    name: 'Aura of Protection',
    description: 'Bạn và đồng minh trong 10 ft (30 ft ở cấp 18) cộng CHA mod (tối thiểu +1) vào mọi save, khi bạn không Incapacitated. App tự cộng.',
    passive: { auraSave: { ability: 'cha', radius: { 6: 10, 18: 30 } } },
  },
  { id: 'paladin-abjure-foes', level: 9, name: 'Abjure Foes', description: 'Channel Divinity: tối đa CHA mod sinh vật trong 60 ft cứu WIS hoặc Frightened 1 phút (chỉ di chuyển hoặc 1 hành động).' },
  { id: 'paladin-aura-of-courage', level: 10, name: 'Aura of Courage', description: 'Bạn và đồng minh trong aura miễn nhiễm Frightened.' },
  {
    id: 'paladin-radiant-strikes',
    level: 11,
    name: 'Radiant Strikes',
    description: 'Đòn cận chiến bằng vũ khí (hoặc tay không) trúng: +1d8 radiant. App tự cộng.',
    passive: { riders: [{ label: 'Radiant Strikes', dice: '1d8', type: 'radiant', scope: 'melee' }] },
  },
  { id: 'paladin-restoring-touch', level: 14, name: 'Restoring Touch', description: 'Lay On Hands: tốn 5 HP từ quỹ để gỡ 1 trong các trạng thái Blinded, Charmed, Deafened, Frightened, Paralyzed, Stunned.' },
  { id: 'paladin-aura-expansion', level: 18, name: 'Aura Expansion', description: 'Aura tăng lên 30 ft. App tự áp.' },
];

const RANGER: Omit<ClassFeatureDef, 'class'>[] = [
  { id: 'ranger-spellcasting', level: 1, name: 'Spellcasting', description: 'Half caster, ability = WIS. Ô phép, DC tự tính ở tab Phép.' },
  {
    id: 'ranger-favored-enemy',
    level: 1,
    name: 'Favored Enemy',
    description: "Luôn chuẩn bị Hunter's Mark; đúc không tốn ô 2 lần (3 ở cấp 5, 4 ở cấp 9, 5 ở cấp 13, 6 ở cấp 17) mỗi nghỉ dài. Dấu ấn đặt ở ô 🎯 Mục tiêu.",
    uses: { max: 'tbl:ranger:1=2,5=3,9=4,13=5,17=6', recharge: 'long' },
  },
  { id: 'ranger-weapon-mastery', level: 1, name: 'Weapon Mastery', description: 'Mastery của 2 loại vũ khí. App tự áp.' },
  { id: 'ranger-deft-explorer', level: 2, name: 'Deft Explorer', description: 'Expertise 1 kỹ năng đã thành thạo; biết thêm 2 ngôn ngữ.' },
  { id: 'ranger-fighting-style', level: 2, name: 'Fighting Style', description: 'Chọn 1 feat Fighting Style, hoặc Druidic Warrior (2 cantrip Druid).' },
  { id: 'ranger-subclass-3', level: 3, name: 'Ranger Subclass', description: 'Chọn subclass.' },
  { id: 'ranger-extra-attack', level: 5, name: 'Extra Attack', description: 'Đánh 2 lần mỗi Attack action. App tự đếm.' },
  {
    id: 'ranger-roving',
    level: 6,
    name: 'Roving',
    description: 'Tốc độ +10 ft khi không mặc giáp nặng; có tốc độ leo và bơi bằng tốc độ đi. App tự cộng.',
    passive: { speed: { bonus: 10, noHeavyArmor: true } },
  },
  { id: 'ranger-expertise', level: 9, name: 'Expertise', description: 'Expertise thêm 2 kỹ năng đã thành thạo.' },
  {
    id: 'ranger-tireless',
    level: 10,
    name: 'Tireless',
    description: 'Magic action: nhận 1d8 + WIS HP tạm, WIS mod lần (tối thiểu 1) mỗi nghỉ dài. Nghỉ ngắn giảm 1 Exhaustion.',
    actions: [{ label: 'Tireless', kind: 'tempHp', target: 'self', cost: 'action', dice: '1d8+mod:wis' }],
    uses: { max: 'wis-mod', recharge: 'long' },
  },
  { id: 'ranger-relentless-hunter', level: 13, name: 'Relentless Hunter', description: "Nhận sát thương không làm mất tập trung Hunter's Mark." },
  {
    id: 'ranger-natures-veil',
    level: 14,
    name: "Nature's Veil",
    description: 'Bonus Action: Invisible đến hết lượt kế của bạn. WIS mod lần (tối thiểu 1) mỗi nghỉ dài.',
    actions: [{ label: "Nature's Veil", kind: 'effect', target: 'self', cost: 'bonus', effect: { name: "Nature's Veil", condition: 'invisible', rounds: 1 } }],
    uses: { max: 'wis-mod', recharge: 'long' },
  },
  { id: 'ranger-precise-hunter', level: 17, name: 'Precise Hunter', description: "Lợi thế khi đánh sinh vật mang Hunter's Mark của bạn." },
  { id: 'ranger-feral-senses', level: 18, name: 'Feral Senses', description: 'Blindsight 30 ft.' },
  { id: 'ranger-foe-slayer', level: 20, name: 'Foe Slayer', description: "Xúc xắc sát thương của Hunter's Mark thành d10." },
];

const BARD: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'bard-inspiration',
    level: 1,
    name: 'Bardic Inspiration',
    description:
      'Bonus Action: 1 sinh vật trong 60 ft nhận 1 xúc xắc Inspiration (d6; d8 ở cấp 5, d10 ở cấp 10, d12 ở cấp 15) trong 1 giờ — khi trượt một lần tung d20, cộng xúc xắc đó vào. CHA mod lần (tối thiểu 1) mỗi nghỉ dài; từ cấp 5 (Font of Inspiration) hồi khi nghỉ ngắn.',
    actions: [
      {
        label: 'Bardic Inspiration',
        kind: 'effect',
        cost: 'bonus',
        dice: '1d6',
        diceByLevel: { 5: '1d8', 10: '1d10', 15: '1d12' },
        effect: { name: 'Bardic Inspiration', note: 'Xúc xắc Bardic Inspiration {dice}: trượt một lần tung d20 thì cộng vào (1 giờ)' },
      },
    ],
    uses: { max: 'cha-mod', recharge: 'long', shortFrom: 5 },
  },
  { id: 'bard-spellcasting', level: 1, name: 'Spellcasting', description: 'Full caster, ability = CHA. Ô phép, DC tự tính ở tab Phép.' },
  { id: 'bard-expertise', level: 2, name: 'Expertise', description: 'Expertise 2 kỹ năng đã thành thạo (thêm 2 ở cấp 9).' },
  {
    id: 'bard-jack-of-all-trades',
    level: 2,
    name: 'Jack of All Trades',
    description: 'Cộng nửa Proficiency Bonus (làm tròn xuống) vào kiểm tra kỹ năng chưa thành thạo (kể cả Initiative). App tự cộng.',
    passive: { jackOfAllTrades: true },
  },
  { id: 'bard-subclass-3', level: 3, name: 'Bard Subclass', description: 'Chọn College.' },
  { id: 'bard-font-of-inspiration', level: 5, name: 'Font of Inspiration', description: 'Bardic Inspiration hồi khi nghỉ ngắn; có thể tốn ô phép để hồi 1 lần. App tự áp phần nghỉ ngắn.' },
  { id: 'bard-countercharm', level: 7, name: 'Countercharm', description: 'Reaction: sinh vật trong 30 ft trượt save chống Charmed/Frightened được tung lại với lợi thế.' },
  { id: 'bard-magical-secrets', level: 10, name: 'Magical Secrets', description: 'Chọn phép từ danh sách Bard, Cleric, Druid hoặc Wizard khi học phép mới.' },
  { id: 'bard-superior-inspiration', level: 18, name: 'Superior Inspiration', description: 'Tung Initiative: hồi Bardic Inspiration lên tối thiểu 2 lần.' },
  { id: 'bard-words-of-creation', level: 20, name: 'Words of Creation', description: 'Luôn chuẩn bị Power Word Heal và Power Word Kill; có thể nhắm thêm 1 sinh vật trong 10 ft mục tiêu đầu.' },
];

const CLERIC: Omit<ClassFeatureDef, 'class'>[] = [
  { id: 'cleric-spellcasting', level: 1, name: 'Spellcasting', description: 'Full caster, ability = WIS. Ô phép, DC tự tính ở tab Phép.' },
  {
    id: 'cleric-divine-order',
    level: 1,
    name: 'Divine Order',
    description: 'Chọn: Protector (giáp nặng, vũ khí quân sự) hoặc Thaumaturge (thêm 1 cantrip, cộng WIS vào Arcana/Religion). App: chọn ở đây, Thaumaturge tự cộng.',
    choices: [
      { value: 'protector', label: 'Protector' },
      { value: 'thaumaturge', label: 'Thaumaturge', passive: { skillAdd: [{ skill: 'arcana', add: 'wis' }, { skill: 'religion', add: 'wis' }] } },
    ],
  },
  {
    id: 'cleric-channel-divinity',
    level: 2,
    name: 'Channel Divinity',
    description:
      'Divine Spark (Magic action, 30 ft): hồi 1d8 + WIS cho 1 sinh vật, hoặc gây 1d8 + WIS radiant/necrotic (CON save nửa) — 2d8 ở cấp 7, 3d8 ở cấp 13, 4d8 ở cấp 18. Turn Undead: Undead trong 30 ft cứu WIS hoặc Frightened + Incapacitated 1 phút. 2 lần (3 ở cấp 6, 4 ở cấp 18); nghỉ ngắn hồi 1, nghỉ dài hồi hết.',
    actions: [
      { label: 'Divine Spark (hồi)', kind: 'heal', cost: 'action', diceByLevel: { 2: '1d8+mod:wis', 7: '2d8+mod:wis', 13: '3d8+mod:wis', 18: '4d8+mod:wis' } },
      {
        label: 'Divine Spark (gây)',
        kind: 'save',
        cost: 'action',
        type: 'radiant',
        save: { ability: 'con', dc: 'spell', halfOnSave: true },
        diceByLevel: { 2: '1d8+mod:wis', 7: '2d8+mod:wis', 13: '3d8+mod:wis', 18: '4d8+mod:wis' },
      },
      {
        label: 'Turn Undead',
        kind: 'aoe',
        cost: 'action',
        area: 'cầu 30ft',
        save: { ability: 'wis', dc: 'spell' },
        effect: { name: 'Turn Undead', condition: 'frightened', rounds: 10, note: 'Frightened + Incapacitated, phải tránh xa; hết khi nhận sát thương' },
      },
    ],
    uses: { max: 'tbl:cleric:2=2,6=3,18=4', recharge: 'shortOne' },
  },
  { id: 'cleric-subclass-3', level: 3, name: 'Cleric Subclass', description: 'Chọn Domain.' },
  { id: 'cleric-sear-undead', level: 5, name: 'Sear Undead', description: 'Turn Undead: Undead trượt save nhận thêm WIS mod d8 radiant.' },
  {
    id: 'cleric-blessed-strikes',
    level: 7,
    name: 'Blessed Strikes',
    description: 'Chọn: Divine Strike (1 lần mỗi lượt, đòn vũ khí +1d8 necrotic/radiant, 2d8 ở cấp 14) hoặc Potent Spellcasting (cộng WIS vào sát thương cantrip Cleric). App: chọn ở đây rồi tự áp.',
    choices: [
      { value: 'divine-radiant', label: 'Divine Strike (radiant)', passive: { riders: [{ label: 'Divine Strike', byLevel: { 7: '1d8', 14: '2d8' }, type: 'radiant', scope: 'weapon', armed: true }] } },
      { value: 'divine-necrotic', label: 'Divine Strike (necrotic)', passive: { riders: [{ label: 'Divine Strike', byLevel: { 7: '1d8', 14: '2d8' }, type: 'necrotic', scope: 'weapon', armed: true }] } },
      { value: 'potent', label: 'Potent Spellcasting', passive: { riders: [{ label: 'Potent Spellcasting', dice: 'mod:wis', type: 'same', scope: 'spell', cantripOnly: true }] } },
    ],
  },
  { id: 'cleric-divine-intervention', level: 10, name: 'Divine Intervention', description: 'Magic action: đúc 1 phép Cleric cấp ≤ 5 không tốn ô, không cần vật liệu. 1 lần mỗi nghỉ dài.' },
  { id: 'cleric-improved-blessed-strikes', level: 14, name: 'Improved Blessed Strikes', description: 'Divine Strike lên 2d8; Potent Spellcasting thêm HP tạm.' },
  { id: 'cleric-greater-divine-intervention', level: 20, name: 'Greater Divine Intervention', description: 'Divine Intervention có thể đúc Wish (sau đó 2d4 nghỉ dài mới dùng lại).' },
];

const SORCERER: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'sorc-spellcasting',
    level: 1,
    name: 'Spellcasting',
    description: 'Full caster, ability = CHA. Ô phép, DC, spell attack tự tính ở tab Phép.',
  },
  {
    id: 'sorc-innate-sorcery',
    automation: 'sorcery',
    level: 1,
    name: 'Innate Sorcery',
    description:
      'Bonus Action, 1 phút: +1 spell save DC phép Sorcerer và lợi thế đòn phép Sorcerer. 2 lần mỗi nghỉ dài. App: nút ✨ Innate Sorcery ở phần Sorcerer.',
  },
  {
    id: 'sorc-font-of-magic',
    automation: 'sorcery',
    level: 2,
    name: 'Font of Magic',
    description:
      'Sorcery Points = cấp Sorcerer, hồi khi nghỉ dài. Đổi 1 ô phép thành điểm bằng cấp ô (không tốn action); Bonus Action đổi điểm thành ô: cấp 1 = 2, cấp 2 = 3, cấp 3 = 5, cấp 4 = 6, cấp 5 = 7 điểm. Ô tạo ra biến mất khi nghỉ dài.',
  },
  {
    id: 'sorc-metamagic',
    automation: 'sorcery',
    level: 2,
    name: 'Metamagic',
    description:
      'Biết 2 lựa chọn (4 ở cấp 10, 6 ở cấp 17). 1 Metamagic mỗi phép (Empowered, Seeking dùng chung được). App: chọn ở phần Sorcerer, bật trước khi bấm 🪄, tự trừ điểm khi đúc.',
  },
  {
    id: 'sorc-restoration',
    automation: 'sorcery',
    level: 5,
    name: 'Sorcerous Restoration',
    description: 'Khi nghỉ ngắn: hồi tối đa nửa cấp Sorcerer (làm tròn xuống) Sorcery Points. 1 lần mỗi nghỉ dài.',
  },
  {
    id: 'sorc-incarnate',
    automation: 'sorcery',
    level: 7,
    name: 'Sorcery Incarnate',
    description: 'Hết lượt Innate Sorcery thì tốn 2 Sorcery Points để bật. Khi Innate Sorcery đang bật: tối đa 2 Metamagic mỗi phép.',
  },
  {
    id: 'sorc-apotheosis',
    level: 20,
    name: 'Arcane Apotheosis',
    description: 'Khi Innate Sorcery đang bật: 1 Metamagic mỗi lượt không tốn Sorcery Points.',
  },
];

const WIZARD: Omit<ClassFeatureDef, 'class'>[] = [
  {
    id: 'wiz-spellcasting',
    automation: 'spellbook',
    level: 1,
    name: 'Spellcasting (Spellbook)',
    description:
      'Full caster, ability = INT. Sổ phép: 6 phép cấp 1 lúc đầu, +2 phép mỗi cấp Wizard (miễn phí). Phép tìm được chép vào sổ tốn 2 giờ và 50 gp mỗi cấp phép. Chuẩn bị phép từ sổ (số lượng theo bảng).',
  },
  {
    id: 'wiz-ritual-adept',
    automation: 'spellbook',
    level: 1,
    name: 'Ritual Adept',
    description: 'Đúc phép Ritual có trong sổ dù chưa chuẩn bị (thêm 10 phút, không tốn ô). App: nút 📖 trên phép Ritual.',
  },
  {
    id: 'wiz-arcane-recovery',
    automation: 'spellbook',
    level: 1,
    name: 'Arcane Recovery',
    description:
      'Sau nghỉ ngắn, 1 lần mỗi nghỉ dài: hồi ô phép đã dùng, tổng cấp ≤ nửa cấp Wizard (làm tròn lên), không ô cấp 6+.',
  },
  {
    id: 'wiz-scholar',
    level: 2,
    name: 'Scholar',
    description: 'Expertise một kỹ năng: Arcana, History, Investigation, Medicine, Nature hoặc Religion.',
  },
  {
    id: 'wiz-memorize',
    level: 5,
    name: 'Memorize Spell',
    description: 'Khi nghỉ ngắn: đổi 1 phép đã chuẩn bị lấy 1 phép cấp 1+ khác trong sổ.',
  },
  {
    id: 'wiz-spell-mastery',
    level: 18,
    name: 'Spell Mastery',
    description: 'Chọn 1 phép cấp 1 và 1 phép cấp 2 trong sổ: đúc ở cấp gốc không tốn ô.',
  },
  {
    id: 'wiz-signature',
    level: 20,
    name: 'Signature Spells',
    description: 'Chọn 2 phép cấp 3 trong sổ: luôn chuẩn bị, mỗi phép 1 lần đúc cấp 3 không tốn ô mỗi nghỉ ngắn/dài.',
  },
];

export const CLASS_FEATURES: ClassFeatureDef[] = [
  ...ROGUE.map((f) => ({ ...f, class: 'rogue' })),
  ...BARBARIAN.map((f) => ({ ...f, class: 'barbarian' })),
  ...MONK.map((f) => ({ ...f, class: 'monk' })),
  ...WARLOCK.map((f) => ({ ...f, class: 'warlock' })),
  ...DRUID.map((f) => ({ ...f, class: 'druid' })),
  ...SORCERER.map((f) => ({ ...f, class: 'sorcerer' })),
  ...WIZARD.map((f) => ({ ...f, class: 'wizard' })),
  ...FIGHTER.map((f) => ({ ...f, class: 'fighter' })),
  ...PALADIN.map((f) => ({ ...f, class: 'paladin' })),
  ...RANGER.map((f) => ({ ...f, class: 'ranger' })),
  ...BARD.map((f) => ({ ...f, class: 'bard' })),
  ...CLERIC.map((f) => ({ ...f, class: 'cleric' })),
];

/** Classes we have a feature table for. */
export const SUPPORTED_FEATURE_CLASSES = ['rogue', 'barbarian', 'monk', 'warlock', 'druid', 'sorcerer', 'wizard', 'fighter', 'paladin', 'ranger', 'bard', 'cleric'];

/** The class features this sheet has earned, from CLASS_FEATURES, ordered by level. */
export function derivedClassFeatures(sheet: CharacterSheet): ClassFeatureDef[] {
  const levels: Record<string, number> = {
    rogue: rogueLevel(sheet),
    barbarian: barbarianLevel(sheet),
    monk: monkLevel(sheet),
    warlock: warlockLevel(sheet),
    druid: druidLevel(sheet),
    sorcerer: classLevelOf(sheet, 'sorcerer'),
    wizard: classLevelOf(sheet, 'wizard'),
    fighter: classLevelOf(sheet, 'fighter'),
    paladin: classLevelOf(sheet, 'paladin'),
    ranger: classLevelOf(sheet, 'ranger'),
    bard: classLevelOf(sheet, 'bard'),
    cleric: classLevelOf(sheet, 'cleric'),
  };
  for (const f of CUSTOM_CLASS_FEATURES) levels[f.class] ??= classLevelOf(sheet, f.class);
  return [...CLASS_FEATURES, ...CUSTOM_CLASS_FEATURES]
    .filter((f) => f.level <= (levels[f.class] ?? 0))
    .sort((a, b) => a.level - b.level);
}

/** Class features this sheet has that carry mechanics (passives, buttons, use pools), as feature defs. */
export function classMechanicDefs(sheet: CharacterSheet): SubclassFeatureDef[] {
  return derivedClassFeatures(sheet)
    .map((f) => {
      // a feature with options: the chosen one's mechanics
      const ch = f.choices?.find((c) => c.value === sheet.featureChoices?.[f.id]);
      return { ...f, passive: ch?.passive ?? f.passive, actions: ch?.actions ?? f.actions };
    })
    .filter((f) => f.passive || f.actions || f.uses)
    .map((f) => ({ id: f.id, class: f.class, subclass: '', level: f.level, name: f.name, description: f.description, passive: f.passive, actions: f.actions, uses: f.uses }));
}

/**
 * Feature lists of classes that aren't in this repo (a third-party class the DM owns), loaded
 * at runtime from the DM's local data — see `registerCustomClass` in classDefaults.ts.
 */
const CUSTOM_CLASS_FEATURES: ClassFeatureDef[] = [];
export function registerCustomClassFeatures(classKey: string, features: Omit<ClassFeatureDef, 'class'>[]): void {
  const key = classKey.toLowerCase();
  for (let i = CUSTOM_CLASS_FEATURES.length - 1; i >= 0; i--) if (CUSTOM_CLASS_FEATURES[i].class === key) CUSTOM_CLASS_FEATURES.splice(i, 1);
  CUSTOM_CLASS_FEATURES.push(...features.map((f) => ({ ...f, class: key })));
}

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Subclass features the sheet has earned, given a set of definitions (loaded
 * from the DM's local file). Matches on class + subclass name + class level.
 */
export function derivedSubclassFeatures(
  sheet: CharacterSheet,
  defs: SubclassFeatureDef[],
): SubclassFeatureDef[] {
  const classes = (sheet.classes && sheet.classes.length > 0
    ? sheet.classes
    : [{ name: sheet.className, subclass: sheet.subclass, level: sheet.level }]
  ).filter((c) => c.subclass);

  const out: SubclassFeatureDef[] = [];
  for (const c of classes) {
    const cls = norm(c.name);
    const sub = norm(c.subclass);
    for (const d of defs) {
      if (
        d.level <= c.level &&
        cls.includes(norm(d.class)) &&
        (norm(d.subclass) === sub || sub.includes(norm(d.subclass)) || norm(d.subclass).includes(sub))
      ) {
        out.push(d);
      }
    }
  }
  return out.sort((a, b) => a.level - b.level);
}

/** Resolve a `uses.max` spec against a sheet. */
export function subclassUsesMax(
  spec: NonNullable<SubclassFeatureDef['uses']>['max'],
  sheet: CharacterSheet,
): number {
  if (typeof spec === 'number') return spec;
  const mod = (a: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') => Math.floor((sheet.abilities[a] - 10) / 2);
  const m = /^(str|dex|con|int|wis|cha)-mod(\+1)?$/.exec(spec);
  if (m) return Math.max(1, mod(m[1] as 'str') + (m[2] ? 1 : 0));
  if (spec === 'prof') return sheet.proficiencyBonus;
  // a table by class level: "tbl:fighter:1=2,4=3,10=4"
  const t = /^tbl:([a-z]+):(.+)$/.exec(spec);
  if (t) {
    const lv = classLevelOf(sheet, t[1]);
    let n = 0;
    for (const pair of t[2].split(',')) {
      const [at, val] = pair.split('=').map(Number);
      if (lv >= at) n = val;
    }
    return n;
  }
  // a formula on one class's level: "paladin:5*lvl"
  const c = /^([a-z]+):(.+)$/.exec(spec);
  if (c && !/^(mod|dc)$/.test(c[1])) return Math.max(1, Number(resolveFeatureFormula(c[2], sheet, c[1])) || 0);
  return Math.max(1, Number(resolveFeatureFormula(spec, sheet)) || 0);
}

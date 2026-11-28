import type { Ability } from './types.js';

/**
 * Full 2024 Player's Handbook feat list (75 feats: 10 Origin, 43 General,
 * 10 Fighting Style, 12 Epic Boon). Extracted from the DM's own personal-use PHB
 * copy (see `.srd-src/NOTICE-personal-use.txt`) and paraphrased in Vietnamese
 * (no PHB text reproduced verbatim) — same convention as `cantrips.ts`
 * (SRD_CANTRIPS / SRD_SPELLS).
 *
 * Wired into the "Đặc điểm" tab via `FeatPicker` (SheetDock.tsx), which adds a
 * picked feat as a plain `Feat` entry (name + prerequisite-aware description) —
 * mirrors `InvocationPicker` (invocations.draft.ts).
 */
export interface FeatDef {
  id: string;
  name: string;
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** Free text as printed, e.g. "Cấp 4+, DEX 13+". */
  prerequisite?: string;
  /** Which ability(ies) the feat's own +1 Ability Score Increase can go into (General/Epic Boon
   *  feats only — Origin and Fighting Style feats don't grant one). */
  abilityScoreIncrease?: Ability[];
  /** Brief Vietnamese paraphrase of the mechanics — not the PHB's own wording. */
  guidance: string;
  /** Mechanics the app runs for the feat (see featurePassives.ts / featureActions.ts). */
  passive?: import('./featurePassives.js').FeaturePassive;
  actions?: import('./featureActions.js').FeatureAction[];
uses?: import('./classFeatures.js').SubclassFeatureDef['uses'];
}

// ---------------------------------------------------------------------------
// Origin feats — no level prerequisite, picked via background.
// ---------------------------------------------------------------------------
const ORIGIN: FeatDef[] = [
  {
    id: 'feat-alert',
    passive: { initiativeProf: true },
    name: 'Alert',
    category: 'origin',
    guidance:
      'Cộng Proficiency Bonus vào Initiative. Ngay sau khi tung Initiative, có thể đổi kết quả Initiative của mình với 1 đồng minh sẵn lòng trong cùng trận (cả hai không được Incapacitated).',
  },
  {
    id: 'feat-crafter',
    name: 'Crafter',
    category: 'origin',
    guidance:
      'Thành thạo 3 Artisan\'s Tools tự chọn (theo bảng Fast Crafting). Mua đồ thường được giảm 20%. Khi nghỉ dài, có thể chế 1 món trong bảng Fast Crafting (cần đúng bộ dụng cụ + thành thạo) — món đó tồn tại tới lần nghỉ dài kế tiếp rồi hỏng.',
  },
  {
    id: 'feat-healer',
    name: 'Healer',
    category: 'origin',
    guidance:
      'Có Healer\'s Kit: dùng Utilize action + 1 lượt Healer\'s Kit để sơ cứu 1 sinh vật trong 5ft — mục tiêu tiêu 1 Hit Die, bạn tung die đó, mục tiêu hồi HP = kết quả + Proficiency Bonus của bạn. Mọi lần tung dice hồi máu (phép hoặc feat này) mà ra 1 đều được tung lại 1 lần, bắt buộc lấy kết quả mới.',
  },
  {
    id: 'feat-lucky',
    uses: { max: 'prof', recharge: 'long' },
    name: 'Lucky',
    category: 'origin',
    guidance:
      'Có số Luck Point = Proficiency Bonus (hồi khi nghỉ dài). Tiêu 1 điểm khi tung d20 (D20 Test của mình) để có Lợi thế; hoặc khi bị tấn công, tiêu 1 điểm để áp Bất lợi lên roll tấn công đó.',
  },
  {
    id: 'feat-magic-initiate',
    name: 'Magic Initiate',
    category: 'origin',
    guidance:
      'Chọn 1 trong 3 spell list (Cleric/Druid/Wizard): học 2 cantrip từ list đó (ability = INT/WIS/CHA tự chọn). Học thêm 1 phép cấp 1 cùng list, luôn "prepared", cast miễn phí 1 lần/nghỉ dài (hoặc dùng slot thật nếu có). Lên cấp có thể đổi 1 trong các phép đã chọn (cùng cấp, cùng list). Repeatable — mỗi lần chọn 1 list khác.',
  },
  {
    id: 'feat-musician',
    name: 'Musician',
    category: 'origin',
    guidance:
      'Thành thạo 3 nhạc cụ tự chọn. Sau khi nghỉ ngắn/dài, chơi 1 bài (nhạc cụ đã thành thạo) → cho Heroic Inspiration cho số đồng minh nghe được = Proficiency Bonus của bạn.',
  },
  {
    id: 'feat-savage-attacker',
    passive: { savageAttacker: true },
    name: 'Savage Attacker',
    category: 'origin',
    guidance: 'Một lần mỗi lượt, khi trúng đòn vũ khí, có thể tung lại toàn bộ dice sát thương của đòn đó và chọn kết quả cao hơn.',
  },
  {
    id: 'feat-skilled',
    name: 'Skilled',
    category: 'origin',
    guidance: 'Thành thạo thêm 3 kỹ năng hoặc công cụ (kết hợp tự do). Repeatable — lấy nhiều lần được.',
  },
  {
    id: 'feat-tavern-brawler',
    passive: { unarmed: { byLevel: { 1: '1d4' } }, tavernBrawler: true },
    name: 'Tavern Brawler',
    category: 'origin',
    guidance:
      'Unarmed Strike gây 1d4 + STR mod (Bludgeoning) thay vì sát thương thường. Tung dice sát thương Unarmed Strike ra 1 thì được tung lại, bắt buộc lấy kết quả mới. Thành thạo vũ khí ngẫu hứng (improvised). Khi trúng Unarmed Strike trong Attack action, có thể vừa gây sát thương vừa đẩy mục tiêu 5ft (1 lần/lượt).',
  },
  {
    id: 'feat-tough',
    name: 'Tough',
    category: 'origin',
    guidance: 'HP tối đa +2× cấp nhân vật ngay khi lấy feat; mỗi cấp sau đó +2 HP tối đa nữa.',
  },
];

// ---------------------------------------------------------------------------
// General feats — cấp 4+ (thường lấy thay ASI khi lên cấp). Hầu hết cho +1 vào 1
// trong các ability liệt kê, TỐI ĐA 20 (không giống Epic Boon là tối đa 30).
// ---------------------------------------------------------------------------
const GENERAL: FeatDef[] = [
  {
    id: 'feat-ability-score-improvement',
    name: 'Ability Score Improvement',
    category: 'general',
    prerequisite: 'Cấp 4+',
    guidance: '+2 vào 1 chỉ số, hoặc +1 vào 2 chỉ số (tối đa 20 mỗi chỉ số). Repeatable.',
  },
  {
    id: 'feat-actor',
    name: 'Actor',
    category: 'general',
    prerequisite: 'Cấp 4+, CHA 13+',
    abilityScoreIncrease: ['cha'],
    guidance:
      '+1 CHA. Lợi thế Deception/Performance khi đóng giả người khác (thật hoặc hư cấu). Bắt chước âm thanh/giọng nói — người nghe phải WIS(Insight) DC 8+CHA mod+Proficiency mới nhận ra là giả.',
  },
  {
    id: 'feat-athlete',
    name: 'Athlete',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance: '+1 STR/DEX. Có Climb Speed = Speed. Đứng dậy khỏi Prone chỉ tốn 5ft. Nhảy xa/cao chỉ cần chạy đà 5ft.',
  },
  {
    id: 'feat-charger',
    name: 'Charger',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Dash cộng thêm +10ft Speed cho action đó. Di chuyển thẳng ≥10ft rồi đánh cận chiến trúng: chọn +1d8 sát thương HOẶC đẩy mục tiêu 10ft (mục tiêu ≤ cỡ lớn hơn 1 bậc) — 1 lần/lượt.',
  },
  {
    id: 'feat-chef',
    name: 'Chef',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['con', 'wis'],
    guidance:
      '+1 CON/WIS. Thành thạo Cook\'s Utensils. Nghỉ ngắn: nấu đồ ăn cho 4+Proficiency Bonus người, ai ăn xong dùng Hit Dice hồi máu thì hồi thêm 1d8. Nghỉ dài (hoặc 1h làm việc): làm số bánh = Proficiency Bonus, dùng Bonus Action ăn 1 cái để nhận Temp HP = Proficiency Bonus (hiệu lực 8h).',
  },
  {
    id: 'feat-crossbow-expert',
    name: 'Crossbow Expert',
    category: 'general',
    prerequisite: 'Cấp 4+, DEX 13+',
    abilityScoreIncrease: ['dex'],
    guidance:
      '+1 DEX. Bỏ qua thuộc tính Loading của nỏ (Hand/Heavy/Light Crossbow) — nạp đạn dù không rảnh tay. Đứng trong 5ft địch không bị Bất lợi khi bắn nỏ. Đòn phụ two-weapon bằng nỏ Light được cộng ability mod vào sát thương nếu chưa được cộng.',
  },
  {
    id: 'feat-crusher',
    passive: { crusher: true },
    name: 'Crusher',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'con'],
    guidance:
      '+1 STR/CON. 1 lần/lượt, trúng đòn Bludgeoning: đẩy mục tiêu 5ft (mục tiêu ≤ cỡ lớn hơn 1 bậc). Critical Hit Bludgeoning: mọi đòn tấn công nhắm mục tiêu đó có Lợi thế tới đầu lượt sau của bạn.',
  },
  {
    id: 'feat-defensive-duelist',
    passive: { reaction: { kind: 'parry' } },
    name: 'Defensive Duelist',
    category: 'general',
    prerequisite: 'Cấp 4+, DEX 13+',
    abilityScoreIncrease: ['dex'],
    guidance:
      '+1 DEX. Đang cầm vũ khí Finesse, bị trúng đòn cận chiến: Reaction cộng Proficiency Bonus vào AC (có thể biến trúng thành trượt), hiệu lực tới đầu lượt sau.',
  },
  {
    id: 'feat-dual-wielder',
    passive: { dualWielder: true },
    name: 'Dual Wielder',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Attack action đánh vũ khí Light: Bonus Action đánh thêm 1 đòn bằng vũ khí cận chiến khác (không Two-Handed) — không cộng ability mod vào sát thương đòn phụ trừ khi mod âm. Rút/cất 2 vũ khí (không Two-Handed) cùng lúc.',
  },
  {
    id: 'feat-durable',
    passive: { deathSaveAdvantage: true },
    name: 'Durable',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['con'],
    guidance: '+1 CON. Lợi thế Death Saving Throw. Bonus Action: tiêu 1 Hit Die, tung, hồi HP = kết quả.',
  },
  {
    id: 'feat-elemental-adept',
    name: 'Elemental Adept',
    category: 'general',
    prerequisite: 'Cấp 4+, có Spellcasting/Pact Magic',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Chọn 1 loại (Acid/Cold/Fire/Lightning/Thunder): phép bạn cast bỏ qua Kháng loại đó, và số 1 trên dice sát thương loại đó tính là 2. Repeatable (loại khác nhau mỗi lần).',
  },
  {
    id: 'feat-fey-touched',
    name: 'Fey-Touched',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Chọn 1 phép cấp 1 trường Divination hoặc Enchantment — luôn "prepared" cùng Misty Step, cả 2 cast miễn phí 1 lần/nghỉ dài (mỗi phép), sau đó dùng slot thật. Ability ra phép = chỉ số vừa tăng.',
  },
  {
    id: 'feat-grappler',
    name: 'Grappler',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Trúng Unarmed Strike trong Attack action: vừa gây sát thương vừa Grapple cùng lúc (1 lần/lượt). Lợi thế tấn công mục tiêu đang bị mình Grapple. Kéo mục tiêu Grapple (cỡ ≤ mình) không bị giảm nửa tốc độ.',
  },
  {
    id: 'feat-great-weapon-master',
    passive: { riders: [{ label: 'Great Weapon Master', dice: 'pb', type: 'same', scope: 'weapon', heavyOnly: true }], extraAttackOnCritOrKill: true },
    name: 'Great Weapon Master',
    category: 'general',
    prerequisite: 'Cấp 4+, STR 13+',
    abilityScoreIncrease: ['str'],
    guidance:
      '+1 STR. Trúng đòn vũ khí Heavy trong Attack action: cộng thêm sát thương = Proficiency Bonus. Ngay sau Critical Hit hoặc hạ gục mục tiêu bằng vũ khí cận chiến: Bonus Action đánh thêm 1 đòn cùng vũ khí.',
  },
  {
    id: 'feat-heavily-armored',
    name: 'Heavily Armored',
    category: 'general',
    prerequisite: 'Cấp 4+, đã luyện Medium Armor',
    abilityScoreIncrease: ['con', 'str'],
    guidance: '+1 CON/STR. Được luyện Heavy Armor.',
  },
  {
    id: 'feat-heavy-armor-master',
    passive: { heavyArmorReduce: true },
    name: 'Heavy Armor Master',
    category: 'general',
    prerequisite: 'Cấp 4+, đã luyện Heavy Armor',
    abilityScoreIncrease: ['con', 'str'],
    guidance: '+1 CON/STR. Mặc Heavy Armor: sát thương Bludgeoning/Piercing/Slashing nhận vào giảm = Proficiency Bonus.',
  },
  {
    id: 'feat-inspiring-leader',
    name: 'Inspiring Leader',
    category: 'general',
    prerequisite: 'Cấp 4+, WIS hoặc CHA 13+',
    abilityScoreIncrease: ['wis', 'cha'],
    guidance:
      '+1 WIS/CHA. Sau khi nghỉ ngắn/dài, diễn thuyết/hát/nhảy truyền cảm hứng: tối đa 6 người trong 30ft (kể cả bạn) nhận Temp HP = cấp nhân vật + mod của chỉ số vừa tăng.',
  },
  {
    id: 'feat-keen-mind',
    name: 'Keen Mind',
    category: 'general',
    prerequisite: 'Cấp 4+, INT 13+',
    abilityScoreIncrease: ['int'],
    guidance:
      '+1 INT. Chọn 1 kỹ năng (Arcana/History/Investigation/Nature/Religion): chưa thành thạo thì được thành thạo, đã thành thạo thì được Expertise. Dùng Study action bằng Bonus Action.',
  },
  {
    id: 'feat-lightly-armored',
    name: 'Lightly Armored',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance: '+1 STR/DEX. Được luyện Light Armor và Shield.',
  },
  {
    id: 'feat-mage-slayer',
    passive: { mageSlayer: true },
    name: 'Mage Slayer',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Gây sát thương cho mục tiêu đang Concentration: mục tiêu bị Bất lợi khi save duy trì Concentration. Fail save INT/WIS/CHA: có thể biến thành thành công (1 lần, hồi khi nghỉ ngắn/dài).',
  },
  {
    id: 'feat-martial-weapon-training',
    name: 'Martial Weapon Training',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance: '+1 STR/DEX. Được thành thạo vũ khí Martial.',
  },
  {
    id: 'feat-medium-armor-master',
    passive: { mediumArmorDexCap: 3 },
    name: 'Medium Armor Master',
    category: 'general',
    prerequisite: 'Cấp 4+, đã luyện Medium Armor',
    abilityScoreIncrease: ['str', 'dex'],
    guidance: '+1 STR/DEX. Mặc Medium Armor với DEX ≥16: cộng +3 (thay vì +2) vào AC.',
  },
  {
    id: 'feat-moderately-armored',
    name: 'Moderately Armored',
    category: 'general',
    prerequisite: 'Cấp 4+, đã luyện Light Armor',
    abilityScoreIncrease: ['str', 'dex'],
    guidance: '+1 STR/DEX. Được luyện Medium Armor.',
  },
  {
    id: 'feat-mounted-combatant',
    name: 'Mounted Combatant',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex', 'wis'],
    guidance:
      '+1 STR/DEX/WIS. Đang cưỡi: Lợi thế tấn công mục tiêu không cưỡi, nhỏ hơn thú cưỡi ≥1 bậc, trong 5ft thú cưỡi. Thú cưỡi né 1/2 sát thương thành công → 0 sát thương (cả 2 không Incapacitated). Có thể hứng đòn thay cho thú cưỡi.',
  },
  {
    id: 'feat-observant',
    name: 'Observant',
    category: 'general',
    prerequisite: 'Cấp 4+, INT hoặc WIS 13+',
    abilityScoreIncrease: ['int', 'wis'],
    guidance:
      '+1 INT/WIS. Chọn 1 kỹ năng (Insight/Investigation/Perception): chưa thành thạo thì được thành thạo, đã thành thạo thì được Expertise. Dùng Search action bằng Bonus Action.',
  },
  {
    id: 'feat-piercer',
    passive: { piercer: true },
    name: 'Piercer',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. 1 lần/lượt, trúng đòn Piercing: tung lại 1 dice sát thương, bắt buộc lấy kết quả mới. Critical Hit Piercing: tung thêm 1 dice sát thương nữa.',
  },
  {
    id: 'feat-poisoner',
    name: 'Poisoner',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['dex', 'int'],
    guidance:
      '+1 DEX/INT. Sát thương Poison bạn gây bỏ qua Kháng độc. Thành thạo Poisoner\'s Kit: 1h + 50gp nguyên liệu → chế số liều độc = Proficiency Bonus. Bonus Action tẩm vũ khí (hiệu lực 1 phút hoặc tới lần trúng đầu); trúng đòn: CON save DC 8+mod+Proficiency hoặc chịu 2d8 Poison + Poisoned tới hết lượt sau của bạn.',
  },
  {
    id: 'feat-polearm-master',
    passive: { polearmMaster: true },
    name: 'Polearm Master',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Vũ khí Quarterstaff/Spear/Heavy+Reach: sau Attack action, Bonus Action đánh thêm bằng đầu kia (1d4 Bludgeoning). Reaction: tấn công sinh vật vừa vào tầm reach của vũ khí đó.',
  },
  {
    id: 'feat-resilient',
    name: 'Resilient',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số bạn CHƯA thành thạo saving throw, đồng thời được thành thạo saving throw chỉ số đó.',
  },
  {
    id: 'feat-ritual-caster',
    name: 'Ritual Caster',
    category: 'general',
    prerequisite: 'Cấp 4+, INT/WIS/CHA 13+',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Chọn số phép cấp 1 có tag Ritual = Proficiency Bonus, luôn "prepared", cast bằng slot thật có. Proficiency Bonus tăng thì học thêm 1 phép ritual cấp 1 nữa. Có thể cast 1 phép ritual đã chuẩn bị theo thời gian THƯỜNG (không cần thời gian ritual dài) mà không tốn slot — 1 lần/nghỉ dài.',
  },
  {
    id: 'feat-sentinel',
    name: 'Sentinel',
    category: 'general',
    prerequisite: 'Cấp 4+, STR hoặc DEX 13+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Sinh vật trong 5ft dùng Disengage hoặc đánh trúng người khác (không phải bạn): Opportunity Attack lên nó ngay. Opportunity Attack trúng: Speed mục tiêu = 0 tới hết lượt.',
  },
  {
    id: 'feat-shadow-touched',
    name: 'Shadow-Touched',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Chọn 1 phép cấp 1 trường Illusion hoặc Necromancy — luôn "prepared" cùng Invisibility, cả 2 cast miễn phí 1 lần/nghỉ dài (mỗi phép), sau đó dùng slot thật. Ability ra phép = chỉ số vừa tăng.',
  },
  {
    id: 'feat-sharpshooter',
    passive: { rangedCoverIgnore: true, noCloseRangedPenalty: true, noLongRangePenalty: true },
    name: 'Sharpshooter',
    category: 'general',
    prerequisite: 'Cấp 4+, DEX 13+',
    abilityScoreIncrease: ['dex'],
    guidance:
      '+1 DEX. Tấn công tầm xa bỏ qua Nửa che/¾ che. Đứng trong 5ft địch không bị Bất lợi khi bắn. Bắn xa (long range) không bị Bất lợi.',
  },
  {
    id: 'feat-shield-master',
    passive: { shieldInterpose: true },
    name: 'Shield Master',
    category: 'general',
    prerequisite: 'Cấp 4+, đã luyện Shield',
    abilityScoreIncrease: ['str'],
    guidance:
      '+1 STR. Trúng đòn cận chiến trong Attack action (mục tiêu trong 5ft), đang cầm khiên: có thể húc khiên — mục tiêu STR save DC 8+STR mod+Proficiency, fail thì bị đẩy 5ft hoặc Prone (tự chọn), 1 lần/lượt. Chịu hiệu ứng cho phép DEX save giảm nửa sát thương, đang cầm khiên: Reaction né hẳn thành 0 sát thương nếu save thành công.',
  },
  {
    id: 'feat-skill-expert',
    name: 'Skill Expert',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số tự chọn. Thành thạo thêm 1 kỹ năng. Chọn 1 kỹ năng đã thành thạo để có Expertise.',
  },
  {
    id: 'feat-skulker',
    name: 'Skulker',
    category: 'general',
    prerequisite: 'Cấp 4+, DEX 13+',
    abilityScoreIncrease: ['dex'],
    guidance:
      '+1 DEX. Có Blindsight tầm 10ft. Lợi thế Stealth check khi Hide trong combat. Bắn trượt lúc đang ẩn nấp không bị lộ vị trí.',
  },
  {
    id: 'feat-slasher',
    passive: { slasher: true },
    name: 'Slasher',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. 1 lần/lượt, trúng đòn Slashing: giảm Speed mục tiêu 10ft tới đầu lượt sau của bạn. Critical Hit Slashing: mục tiêu Bất lợi tấn công tới đầu lượt sau của bạn.',
  },
  {
    id: 'feat-speedy',
    passive: { speed: { bonus: 10 } },
    name: 'Speedy',
    category: 'general',
    prerequisite: 'Cấp 4+, DEX hoặc CON 13+',
    abilityScoreIncrease: ['dex', 'con'],
    guidance: '+1 DEX/CON. Speed +10ft. Dash không bị Địa hình khó cản thêm cho tới hết lượt. Opportunity Attack nhắm bạn bị Bất lợi.',
  },
  {
    id: 'feat-spell-sniper',
    passive: { spellIgnoreCover: true, spellNoCloseRangedPenalty: true },
    name: 'Spell Sniper',
    category: 'general',
    prerequisite: 'Cấp 4+, có Spellcasting/Pact Magic',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Đòn tấn công phép bỏ qua Nửa che/¾ che. Đứng trong 5ft địch không bị Bất lợi khi cast phép cần roll tấn công. Phép roll tấn công có tầm ≥10ft: tăng tầm thêm 60ft.',
  },
  {
    id: 'feat-telekinetic',
    name: 'Telekinetic',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Học Mage Hand (không cần V/S, bàn tay vô hình, tầm +30ft). Bonus Action: đẩy/kéo 1 sinh vật trong 30ft 5ft — mục tiêu STR save DC 8+mod+Proficiency mới né được.',
  },
  {
    id: 'feat-telepathic',
    name: 'Telepathic',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Nói chuyện thần giao cách cảm với sinh vật thấy được trong 60ft (chúng phải biết ngôn ngữ bạn dùng, không trả lời lại được qua tâm trí). Luôn có Detect Thoughts "prepared", cast miễn phí 1 lần/nghỉ dài, sau đó dùng slot thật.',
  },
  {
    id: 'feat-war-caster',
    passive: { concentrationAdvantage: true },
    name: 'War Caster',
    category: 'general',
    prerequisite: 'Cấp 4+, có Spellcasting/Pact Magic',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance:
      '+1 INT/WIS/CHA. Lợi thế CON save duy trì Concentration. Bị khiêu khích Opportunity Attack: có thể Reaction cast phép (thời gian 1 action, chỉ nhắm đúng sinh vật đó) thay vì đánh. Ra phép có Somatic dù đang cầm vũ khí/khiên.',
  },
  {
    id: 'feat-weapon-master',
    name: 'Weapon Master',
    category: 'general',
    prerequisite: 'Cấp 4+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX. Dùng được thuộc tính mastery của 1 loại vũ khí Simple/Martial tự chọn (phải đã thành thạo). Đổi loại vũ khí khi nghỉ dài.',
  },
];

// ---------------------------------------------------------------------------
// Fighting Style feats — cần feature "Fighting Style" (Fighter/Paladin/Ranger…).
// Không cho ASI.
// ---------------------------------------------------------------------------
const FIGHTING_STYLE: FeatDef[] = [
  { id: 'feat-archery', name: 'Archery', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: '+2 vào roll tấn công vũ khí tầm xa (Ranged).' },
  { id: 'feat-blind-fighting', name: 'Blind Fighting', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Có Blindsight tầm 10ft.' },
  { id: 'feat-defense', name: 'Defense', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Mặc giáp (Light/Medium/Heavy) được +1 AC.' },
  { id: 'feat-dueling', name: 'Dueling', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Cầm đúng 1 vũ khí cận chiến (tay kia trống, không vũ khí khác): +2 sát thương với vũ khí đó.' },
  { id: 'feat-great-weapon-fighting', name: 'Great Weapon Fighting', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Vũ khí cận chiến 2 tay (Two-Handed/Versatile): số 1-2 trên dice sát thương tính là 3.' },
  { id: 'feat-interception', name: 'Interception', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Đồng minh trong 5ft bị trúng đòn: Reaction (cần cầm khiên hoặc vũ khí Simple/Martial) giảm sát thương đó 1d10 + Proficiency Bonus.' },
  { id: 'feat-protection', name: 'Protection', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Mục tiêu khác trong 5ft (không phải bạn) bị tấn công, đang cầm khiên: Reaction áp Bất lợi lên đòn đó và mọi đòn khác nhắm mục tiêu đó tới đầu lượt sau, miễn bạn còn trong 5ft mục tiêu.' },
  { id: 'feat-thrown-weapon-fighting', name: 'Thrown Weapon Fighting', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Trúng đòn ném (vũ khí có Thrown): +2 sát thương.' },
  { id: 'feat-two-weapon-fighting', name: 'Two-Weapon Fighting', category: 'fighting-style', prerequisite: 'Có Fighting Style feature', guidance: 'Đòn phụ two-weapon bằng vũ khí Light: cộng ability mod vào sát thương nếu chưa được cộng.' },
  {
    id: 'feat-unarmed-fighting',
    name: 'Unarmed Fighting',
    category: 'fighting-style',
    prerequisite: 'Có Fighting Style feature',
    guidance: 'Unarmed Strike gây 1d6 + STR mod Bludgeoning (1d8 nếu không cầm vũ khí/khiên) thay sát thương thường. Đầu mỗi lượt, gây thêm 1d4 Bludgeoning lên 1 mục tiêu đang bị bạn Grapple.',
  },
];

// ---------------------------------------------------------------------------
// Epic Boon feats — cấp 19+, ASI riêng tối đa 30 (không phải 20).
// ---------------------------------------------------------------------------
const EPIC_BOON: FeatDef[] = [
  {
    id: 'feat-boon-of-combat-prowess',
    name: 'Boon of Combat Prowess',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). Trượt 1 roll tấn công: có thể biến thành trúng. 1 lần, hồi đầu lượt sau.',
  },
  {
    id: 'feat-boon-of-dimensional-travel',
    name: 'Boon of Dimensional Travel',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). Ngay sau Attack action hoặc Magic action: dịch chuyển tức thời tới 30ft tới ô trống thấy được.',
  },
  {
    id: 'feat-boon-of-energy-resistance',
    name: 'Boon of Energy Resistance',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance:
      '+1 vào 1 chỉ số (tối đa 30). Chọn 2 loại sát thương (Acid/Cold/Fire/Lightning/Necrotic/Poison/Psychic/Radiant/Thunder): có Kháng, đổi lại được khi nghỉ dài. Chịu sát thương loại đã chọn: Reaction dồn lại loại đó (2d12+CON mod, DEX save DC 8+CON mod+Proficiency) lên 1 sinh vật khác trong 60ft.',
  },
  {
    id: 'feat-boon-of-fate',
    name: 'Boon of Fate',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance:
      '+1 vào 1 chỉ số (tối đa 30). Khi mình hoặc 1 sinh vật trong 60ft vừa roll D20 Test xong (trúng/trượt), tung 2d4 rồi cộng/trừ vào kết quả d20 đó. 1 lần, hồi khi roll Initiative hoặc nghỉ ngắn/dài.',
  },
  {
    id: 'feat-boon-of-fortitude',
    name: 'Boon of Fortitude',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). HP tối đa +40. Mỗi lần hồi máu, hồi thêm = CON mod (1 lần/lượt).',
  },
  {
    id: 'feat-boon-of-irresistible-offense',
    name: 'Boon of Irresistible Offense',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex'],
    guidance:
      '+1 STR/DEX (tối đa 30). Sát thương Bludgeoning/Piercing/Slashing của bạn luôn bỏ qua Kháng. Roll tấn công ra 20 tự nhiên: gây thêm sát thương = chỉ số vừa tăng (cùng loại sát thương đòn đó).',
  },
  {
    id: 'feat-boon-of-recovery',
    name: 'Boon of Recovery',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance:
      '+1 vào 1 chỉ số (tối đa 30). Sắp về 0 HP: thay vào đó còn 1 HP và hồi thêm nửa HP tối đa. 1 lần, hồi khi nghỉ dài. Có pool 10 viên d10: Bonus Action tiêu vài viên, tung, hồi HP = tổng; pool hồi đầy khi nghỉ dài.',
  },
  {
    id: 'feat-boon-of-skill',
    name: 'Boon of Skill',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). Thành thạo TẤT CẢ kỹ năng. Chọn 1 kỹ năng chưa có Expertise để có Expertise.',
  },
  {
    id: 'feat-boon-of-speed',
    name: 'Boon of Speed',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). Bonus Action Disengage kèm tự thoát Grapple. Speed +30ft.',
  },
  {
    id: 'feat-boon-of-spell-recall',
    name: 'Boon of Spell Recall',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+, có Spellcasting',
    abilityScoreIncrease: ['int', 'wis', 'cha'],
    guidance: '+1 INT/WIS/CHA (tối đa 30). Cast phép bằng slot cấp 1-4: tung 1d4, trùng đúng cấp slot thì slot không bị tiêu.',
  },
  {
    id: 'feat-boon-of-the-night-spirit',
    name: 'Boon of the Night Spirit',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance:
      '+1 vào 1 chỉ số (tối đa 30). Trong Dim Light/Darkness: Bonus Action tự Invisible (hết ngay khi dùng action/bonus/reaction). Trong Dim Light/Darkness: Kháng mọi sát thương trừ Psychic và Radiant.',
  },
  {
    id: 'feat-boon-of-truesight',
    name: 'Boon of Truesight',
    category: 'epic-boon',
    prerequisite: 'Cấp 19+',
    abilityScoreIncrease: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    guidance: '+1 vào 1 chỉ số (tối đa 30). Có Truesight tầm 60ft.',
  },
];

export const SRD_FEATS_DRAFT: FeatDef[] = [...ORIGIN, ...GENERAL, ...FIGHTING_STYLE, ...EPIC_BOON];

export function findFeatDraft(name: string): FeatDef | undefined {
  const n = name.toLowerCase().trim();
  return SRD_FEATS_DRAFT.find((f) => f.name.toLowerCase() === n);
}

/**
 * Compact rules reference for the "Tra cứu" panel — Vietnamese paraphrase of the
 * D&D System Reference Document 5.2.1 (2024 rules).
 *
 * This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1")
 * by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd.
 * The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International
 * License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
 */
export interface SrdEntry {
  cat: string;
  name: string;
  text: string;
}

const E = (cat: string, name: string, text: string): SrdEntry => ({ cat, name, text });

export const SRD_ATTRIBUTION =
  'Nội dung tóm lược từ System Reference Document 5.2.1 © Wizards of the Coast LLC, giấy phép CC BY 4.0 (creativecommons.org/licenses/by/4.0).';

export const SRD_ENTRIES: SrdEntry[] = [
  // ── Conditions ─────────────────────────────────────────────
  E('Tình trạng', 'Blinded', 'Không nhìn thấy, tự động rớt mọi check cần thị giác. Đòn tấn công vào bạn có Advantage; đòn của bạn có Disadvantage.'),
  E('Tình trạng', 'Charmed', 'Không thể tấn công hay nhắm phép/hiệu ứng có hại vào kẻ mê hoặc. Kẻ đó có Advantage trong mọi check xã hội với bạn.'),
  E('Tình trạng', 'Deafened', 'Không nghe được, tự động rớt mọi check cần thính giác.'),
  E('Tình trạng', 'Exhaustion', 'Cộng dồn theo cấp (1–6). Mỗi cấp: mọi d20 Test −2 và Speed −5 ft. Cấp 6 = chết. Long Rest giảm 1 cấp.'),
  E('Tình trạng', 'Frightened', 'Disadvantage khi check và tấn công lúc còn thấy nguồn sợ hãi. Không thể tự nguyện tiến lại gần nguồn đó.'),
  E('Tình trạng', 'Grappled', 'Speed 0. Disadvantage khi tấn công mục tiêu khác kẻ đang ghì. Kẻ ghì kéo bạn đi được (tốn thêm 1 ft/ft trừ khi bạn nhỏ hơn ≥2 cỡ). Kết thúc nếu kẻ ghì mất khả năng hành động hoặc bạn bị đẩy ra khỏi tầm với.'),
  E('Tình trạng', 'Incapacitated', 'Không dùng được Action, Bonus Action, Reaction. Mất Concentration. Không nói được. Disadvantage khi tung Initiative.'),
  E('Tình trạng', 'Invisible', 'Không bị nhắm bởi hiệu ứng cần nhìn thấy (trừ khi có see-invisible). Đòn tấn công của bạn có Advantage; đòn vào bạn có Disadvantage. Advantage khi tung Initiative.'),
  E('Tình trạng', 'Paralyzed', 'Incapacitated, Speed 0, tự rớt Save STR và DEX. Đòn vào bạn có Advantage; đòn trúng từ ≤5 ft là Critical Hit.'),
  E('Tình trạng', 'Petrified', 'Hoá đá: Incapacitated, Speed 0, tự rớt Save STR/DEX, đòn vào bạn có Advantage, kháng mọi sát thương, miễn nhiễm Poisoned, không già đi.'),
  E('Tình trạng', 'Poisoned', 'Disadvantage khi tấn công và khi ability check.'),
  E('Tình trạng', 'Prone', 'Chỉ bò được, hoặc tốn nửa Speed để đứng dậy. Disadvantage khi tấn công. Đòn vào bạn: Advantage nếu kẻ tấn công ≤5 ft, ngược lại Disadvantage.'),
  E('Tình trạng', 'Restrained', 'Speed 0. Đòn vào bạn có Advantage; đòn của bạn có Disadvantage. Disadvantage khi Save DEX.'),
  E('Tình trạng', 'Stunned', 'Incapacitated, tự rớt Save STR và DEX. Đòn vào bạn có Advantage.'),
  E('Tình trạng', 'Unconscious', 'Incapacitated + Prone, Speed 0, thả vật đang cầm, tự rớt Save STR/DEX. Đòn vào bạn có Advantage; đòn trúng từ ≤5 ft là Critical Hit. Không biết gì xung quanh.'),

  // ── Actions ────────────────────────────────────────────────
  E('Hành động', 'Attack', 'Thực hiện 1 đòn đánh (hoặc nhiều nếu có Extra Attack). Có thể thay 1 đòn bằng Grapple / Shove.'),
  E('Hành động', 'Dash', 'Cộng thêm quãng đường bằng Speed của bạn trong lượt này.'),
  E('Hành động', 'Disengage', 'Di chuyển của bạn không gây Opportunity Attack trong phần còn lại của lượt.'),
  E('Hành động', 'Dodge', 'Đến đầu lượt sau: đòn tấn công vào bạn có Disadvantage (nếu thấy kẻ đánh) và bạn có Advantage Save DEX. Mất hiệu lực nếu Incapacitated hay Speed 0.'),
  E('Hành động', 'Help', 'Giúp đồng đội một ability check (Advantage cho check đó) hoặc cho đòn tấn công kế tiếp của đồng đội vào kẻ địch ≤5 ft bạn.'),
  E('Hành động', 'Hide', 'Check DEX (Stealth) DC 15 khi đang ở nơi che khuất; thành công = Invisible cho đến khi bị phát hiện, tấn công hay phát ra tiếng.'),
  E('Hành động', 'Influence', 'Check Charisma (Deception, Intimidation, Performance, Persuasion) hoặc WIS (Animal Handling) để tác động lên một sinh vật.'),
  E('Hành động', 'Magic', 'Cast một phép có thời gian cast là Action, dùng magic item, hoặc dùng một đặc tính cần Magic action.'),
  E('Hành động', 'Ready', 'Chọn một trigger và một hành động; dùng Reaction khi trigger xảy ra. Nếu là phép: tốn spell slot lúc chuẩn bị và phải giữ Concentration.'),
  E('Hành động', 'Search', 'Check WIS (Insight, Medicine, Perception, hoặc Survival) để tìm thứ gì đó.'),
  E('Hành động', 'Study', 'Check INT (Arcana, History, Investigation, Nature, Religion) để nhớ/phân tích thông tin.'),
  E('Hành động', 'Utilize', 'Dùng một vật thể không phải vũ khí (1 vật miễn phí mỗi lượt khi tương tác nhẹ).'),

  // ── Combat rules ───────────────────────────────────────────
  E('Chiến đấu', 'Initiative', 'Check DEX. Ai cao hơn đi trước. Surprise = Disadvantage Initiative.'),
  E('Chiến đấu', 'Advantage / Disadvantage', 'Tung 2d20, lấy cao hơn (Adv) hoặc thấp hơn (Dis). Không cộng dồn; có cả hai thì triệt tiêu thành tung 1d20.'),
  E('Chiến đấu', 'Critical Hit', 'Nat 20 khi tấn công: tung gấp đôi số xúc xắc sát thương (modifier giữ nguyên). Nat 20 luôn trúng; nat 1 luôn trượt.'),
  E('Chiến đấu', 'Opportunity Attack', 'Reaction: khi kẻ địch bạn nhìn thấy rời khỏi tầm với của bạn, bạn tấn công cận chiến 1 đòn. Không xảy ra khi Disengage, dịch chuyển, hay bị đẩy.'),
  E('Chiến đấu', 'Cover', 'Nửa che: +2 AC và Save DEX. Ba phần tư che: +5. Che hoàn toàn: không thể bị nhắm trực tiếp.'),
  E('Chiến đấu', 'Grapple', 'Thay 1 đòn bằng Unarmed Strike: mục tiêu (≤ 1 cỡ lớn hơn) Save STR hoặc DEX vs DC 8 + STR mod + Proficiency. Rớt = Grappled. Thoát: Action, Athletics/Acrobatics vs cùng DC.'),
  E('Chiến đấu', 'Shove', 'Thay 1 đòn bằng Unarmed Strike: mục tiêu Save STR/DEX vs DC 8 + STR mod + Prof. Rớt = bị đẩy 5 ft hoặc ngã Prone.'),
  E('Chiến đấu', 'Two-Weapon Fighting', 'Khi Attack bằng vũ khí Light, Bonus Action đánh thêm 1 đòn bằng vũ khí Light khác. Không cộng ability mod vào damage của đòn thêm (trừ khi âm).'),
  E('Chiến đấu', 'Concentration', 'Mất khi bị damage: Save CON DC = max(10, ½ damage), tối đa DC 30. Cũng mất khi Incapacitated / chết hay cast phép Concentration khác.'),
  E('Chiến đấu', 'Death Saving Throws', 'Ở 0 HP: đầu lượt tung d20 (không modifier). ≥10 thành công, <10 thất bại; 3 thắng = ổn định, 3 thua = chết. Nat 20: hồi 1 HP. Nat 1: 2 thất bại. Bị damage ở 0 HP = 1 thất bại (Critical = 2).'),
  E('Chiến đấu', 'Instant Death', 'Nếu damage khiến bạn về 0 HP và phần dư ≥ HP tối đa, bạn chết ngay.'),
  E('Chiến đấu', 'Stabilize', 'Action: check WIS (Medicine) DC 10 để ổn định người ở 0 HP.'),
  E('Chiến đấu', 'Resistance / Vulnerability', 'Kháng: nửa damage (làm tròn xuống). Vulnerability: gấp đôi. Áp dụng sau mọi modifier khác; Resistance trước Vulnerability.'),
  E('Chiến đấu', 'Temporary Hit Points', 'Không cộng dồn (chọn lượng cao hơn). Hấp thụ damage trước HP thường. Không hồi phục được bằng heal.'),
  E('Chiến đấu', 'Falling', '1d6 damage Bludgeoning mỗi 10 ft, tối đa 20d6, rồi ngã Prone.'),
  E('Chiến đấu', 'Damage types', 'Acid, Bludgeoning, Cold, Fire, Force, Lightning, Necrotic, Piercing, Poison, Psychic, Radiant, Slashing, Thunder.'),

  // ── Weapons ────────────────────────────────────────────────
  E('Vũ khí', 'Mastery: Cleave', 'Khi trúng đòn cận chiến: đánh thêm 1 kẻ thứ hai trong 5 ft mục tiêu (và trong tầm với của bạn). Không cộng ability mod vào damage (trừ khi âm). 1 lần/lượt.'),
  E('Vũ khí', 'Mastery: Graze', 'Khi trượt đòn: vẫn gây damage bằng ability modifier dùng khi tấn công (cùng loại damage).'),
  E('Vũ khí', 'Mastery: Nick', 'Đòn thêm của thuộc tính Light có thể đánh như một phần của Attack action (không tốn Bonus Action), 1 lần/lượt.'),
  E('Vũ khí', 'Mastery: Push', 'Khi trúng: đẩy mục tiêu Large trở xuống thẳng ra xa tối đa 10 ft.'),
  E('Vũ khí', 'Mastery: Sap', 'Khi trúng: mục tiêu Disadvantage ở đòn tấn công kế tiếp của nó trước đầu lượt sau của bạn.'),
  E('Vũ khí', 'Mastery: Slow', 'Khi trúng và gây damage: Speed mục tiêu giảm 10 ft đến đầu lượt sau của bạn (không cộng dồn).'),
  E('Vũ khí', 'Mastery: Topple', 'Khi trúng: mục tiêu Save CON (DC 8 + ability mod + Prof) hoặc ngã Prone.'),
  E('Vũ khí', 'Mastery: Vex', 'Khi trúng và gây damage: bạn có Advantage ở đòn tấn công kế tiếp vào mục tiêu đó trước hết lượt sau của bạn.'),
  E('Vũ khí', 'Property: Finesse', 'Dùng STR hoặc DEX (chọn) cho cả tấn công và damage.'),
  E('Vũ khí', 'Property: Heavy', 'Disadvantage nếu STR (cận chiến) hoặc DEX (tầm xa) của bạn dưới 13.'),
  E('Vũ khí', 'Property: Light', 'Cho phép Two-Weapon Fighting bằng Bonus Action.'),
  E('Vũ khí', 'Property: Loading', 'Chỉ bắn được 1 viên mỗi Action / Bonus Action / Reaction, bất kể số đòn Extra Attack.'),
  E('Vũ khí', 'Property: Reach', 'Tầm với thêm 5 ft (tổng 10 ft) cho tấn công và Opportunity Attack.'),
  E('Vũ khí', 'Property: Thrown', 'Có thể ném để tấn công tầm xa, dùng cùng ability mod như cận chiến.'),
  E('Vũ khí', 'Property: Two-Handed', 'Cần cả hai tay khi tấn công.'),
  E('Vũ khí', 'Property: Versatile', 'Dùng hai tay để đổi sang xúc xắc damage lớn hơn ghi trong ngoặc.'),
  E('Vũ khí', 'Property: Ammunition', 'Cần đạn; mỗi đòn tốn 1 viên, nhặt lại được một nửa sau khi nghỉ. Rút đạn cần tay tự do.'),
  E('Vũ khí', 'Range (normal / long)', 'Trong tầm thường: bình thường. Tầm dài: Disadvantage. Ngoài tầm dài: không thể tấn công. Tấn công tầm xa khi kẻ địch (thấy được) trong 5 ft: Disadvantage.'),

  // ── Abilities & skills ─────────────────────────────────────
  E('Kỹ năng', 'STR', 'Athletics.'),
  E('Kỹ năng', 'DEX', 'Acrobatics, Sleight of Hand, Stealth.'),
  E('Kỹ năng', 'CON', 'Không có kỹ năng (Save duy trì Concentration, chống độc, sức bền).'),
  E('Kỹ năng', 'INT', 'Arcana, History, Investigation, Nature, Religion.'),
  E('Kỹ năng', 'WIS', 'Animal Handling, Insight, Medicine, Perception, Survival.'),
  E('Kỹ năng', 'CHA', 'Deception, Intimidation, Performance, Persuasion.'),
  E('Kỹ năng', 'Passive check', '10 + toàn bộ modifier của check đó (+5 nếu có Advantage, −5 nếu Disadvantage).'),
  E('Kỹ năng', 'DC mặc định', 'Rất dễ 5 · Dễ 10 · Trung bình 15 · Khó 20 · Rất khó 25 · Gần như bất khả 30.'),
  E('Kỹ năng', 'Proficiency Bonus', 'Cấp 1–4: +2 · 5–8: +3 · 9–12: +4 · 13–16: +5 · 17–20: +6.'),
  E('Kỹ năng', 'Spell Save DC / Attack', 'Save DC = 8 + spellcasting mod + Proficiency. Spell attack = spellcasting mod + Proficiency.'),

  // ── Resting & misc ─────────────────────────────────────────
  E('Nghỉ ngơi', 'Short Rest', '≥1 giờ nghỉ nhẹ. Có thể tiêu Hit Dice để hồi HP (tung Hit Die + CON mod mỗi viên).'),
  E('Nghỉ ngơi', 'Long Rest', '≥8 giờ (ngủ ≥6). Hồi toàn bộ HP và một nửa tổng Hit Dice (làm tròn xuống, tối thiểu 1), giảm 1 cấp Exhaustion. Tối đa 1 lần / 24 giờ.'),
  E('Nghỉ ngơi', 'Heroic Inspiration', 'Dùng để tung lại một d20 Test bất kỳ của bạn (phải dùng kết quả mới). Chỉ giữ 1 cái một lúc.'),
  E('Nghỉ ngơi', 'Attunement', 'Tối đa 3 magic item cùng lúc; cần Short Rest tập trung vào item để attune.'),

  // ── Environment ────────────────────────────────────────────
  E('Môi trường', 'Bright / Dim / Darkness', 'Sáng: nhìn bình thường. Dim: Lightly Obscured (Disadvantage Perception). Tối: Heavily Obscured (như Blinded với vùng đó).'),
  E('Môi trường', 'Blindsight / Darkvision', 'Blindsight: cảm nhận không cần thấy trong tầm. Darkvision: nhìn Dim như sáng, Darkness như Dim (chỉ sắc xám).'),
  E('Môi trường', 'Suffocating', 'Nín thở được 1 + CON mod phút (tối thiểu 30 giây). Hết hơi: sống thêm số round bằng CON mod (tối thiểu 1) rồi về 0 HP.'),
];

export const SRD_CATEGORIES = Array.from(new Set(SRD_ENTRIES.map((e) => e.cat)));

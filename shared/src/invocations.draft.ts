/**
 * Full 2024 Player's Handbook Warlock Eldritch Invocation list (28 invocations,
 * "ELDRITCH INVOCATION OPTIONS" section, alphabetical). Extracted from the DM's own
 * personal-use PHB copy (see `.srd-src/NOTICE-personal-use.txt`) and paraphrased in
 * Vietnamese (no PHB text reproduced verbatim) — same convention as `cantrips.ts`
 * (SRD_CANTRIPS / SRD_SPELLS) and `feats.draft.ts`.
 *
 * Wired into the "Năng lực" tab via `InvocationPicker` (SheetDock.tsx), which adds a
 * picked invocation as a plain `Feature` (no `uses` tracker — most invocations are
 * unlimited-use, unlike the class features/feats that use that field).
 *
 * Two of these (Agonizing Blast, Repelling Blast) already have their OWN mechanical
 * support elsewhere as per-cantrip flags — see `Spell.agonizingBlast` /
 * `Spell.repellingBlast` in `types.ts` and the toggle buttons in `SpellRow`. They're
 * still listed here for the picker's completeness, but picking them only adds the
 * descriptive feature entry — the actual damage/push bonus still comes from toggling
 * the flag on the chosen cantrip in the Phép tab, not from this list entry.
 */
export interface InvocationDef {
  id: string;
  name: string;
  /** Free-text prerequisite, e.g. "Warlock cấp 5+, có Pact of the Blade". Omitted = no prerequisite. */
  prerequisite?: string;
  /** True if the invocation can be taken more than once (choosing a different eligible option each time). */
  repeatable?: boolean;
  guidance: string;
}

export const WARLOCK_INVOCATIONS_DRAFT: InvocationDef[] = [
  {
    id: 'inv-agonizing-blast',
    name: 'Agonizing Blast',
    prerequisite: 'Warlock cấp 2+, có cantrip Warlock gây sát thương',
    repeatable: true,
    guidance:
      'Chọn 1 cantrip Warlock đã biết gây sát thương: cộng thêm bonus Charisma vào damage roll của cantrip đó. Lặp lại được — mỗi lần chọn 1 cantrip khác.',
  },
  {
    id: 'inv-armor-of-shadows',
    name: 'Armor of Shadows',
    guidance: 'Cast Mage Armor lên bản thân không tốn spell slot.',
  },
  {
    id: 'inv-ascendant-step',
    name: 'Ascendant Step',
    prerequisite: 'Warlock cấp 5+',
    guidance: 'Cast Levitate lên bản thân không tốn spell slot.',
  },
  {
    id: 'inv-devils-sight',
    name: "Devil's Sight",
    prerequisite: 'Warlock cấp 2+',
    guidance: 'Nhìn rõ trong Dim Light và Darkness (kể cả bóng tối phép thuật) trong phạm vi 120ft.',
  },
  {
    id: 'inv-devouring-blade',
    name: 'Devouring Blade',
    prerequisite: 'Warlock cấp 12+, có Thirsting Blade',
    guidance: 'Extra Attack của Thirsting Blade cho thêm 2 đòn phụ thay vì 1.',
  },
  {
    id: 'inv-eldritch-mind',
    name: 'Eldritch Mind',
    guidance: 'Advantage khi cứu Constitution để giữ Concentration.',
  },
  {
    id: 'inv-eldritch-smite',
    name: 'Eldritch Smite',
    prerequisite: 'Warlock cấp 5+, có Pact of the Blade',
    guidance:
      '1 lần/lượt khi trúng đòn bằng pact weapon: tốn 1 spell slot để gây thêm 1d8 Force + 1d8 mỗi cấp slot, có thể làm mục tiêu Prone nếu Huge trở xuống.',
  },
  {
    id: 'inv-eldritch-spear',
    name: 'Eldritch Spear',
    prerequisite: 'Warlock cấp 2+, có cantrip Warlock gây sát thương',
    repeatable: true,
    guidance:
      'Chọn 1 cantrip Warlock gây sát thương có tầm ≥10ft: tăng tầm thêm 30ft × cấp Warlock. Lặp lại được, mỗi lần chọn 1 cantrip khác.',
  },
  {
    id: 'inv-fiendish-vigor',
    name: 'Fiendish Vigor',
    prerequisite: 'Warlock cấp 2+',
    guidance:
      'Cast False Life lên bản thân không tốn spell slot; luôn nhận số Temp HP cao nhất có thể (không roll dice).',
  },
  {
    id: 'inv-gaze-of-two-minds',
    name: 'Gaze of Two Minds',
    prerequisite: 'Warlock cấp 5+',
    guidance:
      'Bonus Action chạm 1 sinh vật sẵn lòng để nhìn/nghe qua giác quan của nó tới hết lượt sau; có thể duy trì mỗi lượt bằng Bonus Action (cùng mặt phẳng tồn tại). Khi đang dùng, có thể cast phép như đang ở vị trí sinh vật đó nếu trong 60ft.',
  },
  {
    id: 'inv-gift-of-the-depths',
    name: 'Gift of the Depths',
    prerequisite: 'Warlock cấp 5+',
    guidance:
      'Thở được dưới nước, có Swim Speed = Speed. Cast Water Breathing 1 lần không tốn slot, hồi lại khi Long Rest.',
  },
  {
    id: 'inv-gift-of-the-protectors',
    name: 'Gift of the Protectors',
    prerequisite: 'Warlock cấp 9+, có Pact of the Tome',
    guidance:
      'Book of Shadows có thêm 1 trang ghi tên (số lượng = mod Charisma, tối thiểu 1). Sinh vật có tên trên trang khi xuống 0 HP mà không chết hẳn thì dừng ở 1 HP thay vì 0 — 1 lần tới khi Long Rest. Có thể xóa tên bằng Magic action.',
  },
  {
    id: 'inv-investment-of-the-chain-master',
    name: 'Investment of the Chain Master',
    prerequisite: 'Warlock cấp 5+, có Pact of the Chain',
    guidance:
      'Familiar (từ Find Familiar) được: Fly hoặc Swim Speed 40ft; Bonus Action ra lệnh tấn công; đổi damage type Bludgeoning/Piercing/Slashing thành Necrotic hoặc Radiant; dùng Spell Save DC của mình; Reaction cho Familiar Resistance khi nó bị đánh trúng.',
  },
  {
    id: 'inv-lessons-of-the-first-ones',
    name: 'Lessons of the First Ones',
    prerequisite: 'Warlock cấp 2+',
    repeatable: true,
    guidance: 'Nhận 1 Origin feat tuỳ chọn. Lặp lại được, mỗi lần chọn 1 Origin feat khác.',
  },
  {
    id: 'inv-lifedrinker',
    name: 'Lifedrinker',
    prerequisite: 'Warlock cấp 9+, có Pact of the Blade',
    guidance:
      '1 lần/lượt khi trúng đòn bằng pact weapon: gây thêm 1d6 Necrotic/Psychic/Radiant (chọn 1) và có thể tốn 1 Hit Die để hồi HP = kết quả roll + mod Constitution (tối thiểu 1).',
  },
  {
    id: 'inv-mask-of-many-faces',
    name: 'Mask of Many Faces',
    prerequisite: 'Warlock cấp 2+',
    guidance: 'Cast Disguise Self không tốn spell slot.',
  },
  {
    id: 'inv-master-of-myriad-forms',
    name: 'Master of Myriad Forms',
    prerequisite: 'Warlock cấp 5+',
    guidance: 'Cast Alter Self không tốn spell slot.',
  },
  {
    id: 'inv-misty-visions',
    name: 'Misty Visions',
    prerequisite: 'Warlock cấp 2+',
    guidance: 'Cast Silent Image không tốn spell slot.',
  },
  {
    id: 'inv-one-with-shadows',
    name: 'One with Shadows',
    prerequisite: 'Warlock cấp 5+',
    guidance: 'Khi đang đứng trong Dim Light/Darkness: cast Invisibility lên bản thân không tốn spell slot.',
  },
  {
    id: 'inv-otherworldly-leap',
    name: 'Otherworldly Leap',
    prerequisite: 'Warlock cấp 2+',
    guidance: 'Cast Jump lên bản thân không tốn spell slot.',
  },
  {
    id: 'inv-pact-of-the-blade',
    name: 'Pact of the Blade',
    guidance:
      'Bonus Action triệu hồi pact weapon (vũ khí cận chiến Simple/Martial tuỳ chọn) hoặc bond với 1 vũ khí phép đang chạm (không ai khác đang attune, không Warlock khác đang bond). Có proficiency với vũ khí, dùng được làm Spellcasting Focus. Tấn công bằng vũ khí này dùng Charisma thay Strength/Dexterity, damage type có thể đổi thành Necrotic/Psychic/Radiant. Bond mất khi dùng lại Bonus Action này, vũ khí cách xa >5ft từ 1 phút trở lên, hoặc chết.',
  },
  {
    id: 'inv-pact-of-the-chain',
    name: 'Pact of the Chain',
    guidance:
      'Học Find Familiar, cast được như Magic action không tốn slot. Khi cast có thể chọn thêm dạng đặc biệt: Imp, Pseudodragon, Quasit, Skeleton, Slaad Tadpole, Sphinx of Wonder, Sprite, Venomous Snake. Khi dùng Attack action, có thể bỏ 1 đòn của mình để familiar tấn công bằng Reaction của nó.',
  },
  {
    id: 'inv-pact-of-the-tome',
    name: 'Pact of the Tome',
    guidance:
      'Cuối Short/Long Rest, triệu hồi Book of Shadows: chọn 3 cantrip + 2 phép cấp 1 có tag Ritual (từ bất kỳ class nào, chưa prepare sẵn) — coi như luôn đã prepare, hoạt động như phép Warlock khi sách còn bên người. Dùng được làm Spellcasting Focus. Sách biến mất nếu triệu hồi sách khác hoặc chết.',
  },
  {
    id: 'inv-repelling-blast',
    name: 'Repelling Blast',
    prerequisite: 'Warlock cấp 2+, có cantrip Warlock gây sát thương bằng attack roll',
    repeatable: true,
    guidance:
      'Chọn 1 cantrip Warlock cần attack roll: khi trúng sinh vật Large trở xuống, có thể đẩy lùi tối đa 10ft. Lặp lại được, mỗi lần chọn 1 cantrip khác.',
  },
  {
    id: 'inv-thirsting-blade',
    name: 'Thirsting Blade',
    prerequisite: 'Warlock cấp 5+, có Pact of the Blade',
    guidance: 'Có Extra Attack riêng cho pact weapon: tấn công 2 lần thay vì 1 khi dùng Attack action.',
  },
  {
    id: 'inv-visions-of-distant-realms',
    name: 'Visions of Distant Realms',
    prerequisite: 'Warlock cấp 9+',
    guidance: 'Cast Arcane Eye không tốn spell slot.',
  },
  {
    id: 'inv-whispers-of-the-grave',
    name: 'Whispers of the Grave',
    prerequisite: 'Warlock cấp 7+',
    guidance: 'Cast Speak with Dead không tốn spell slot.',
  },
  {
    id: 'inv-witch-sight',
    name: 'Witch Sight',
    prerequisite: 'Warlock cấp 15+',
    guidance: 'Có Truesight với tầm 30ft.',
  },
];

export function findInvocationDraft(name: string): InvocationDef | undefined {
  const n = name.toLowerCase().trim();
  return WARLOCK_INVOCATIONS_DRAFT.find((i) => i.name.toLowerCase() === n);
}

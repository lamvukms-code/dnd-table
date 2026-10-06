import { spellFromCantrip, type CantripDef } from './cantrips.js';
import { magicItemActive } from './magicItems.js';
import type { CharacterSheet } from './types.js';

export const TOPHAT_SPELL_ID = 'item:tophat-mockery';

/** Top Hat of Mental Anguish's cantrip. Shaped like Eldritch Blast (fixed die, more separate
 *  attacks at levels 5 / 11 / 17 via `multiAttack`). The "Disadvantage on its next attack roll" rider
 *  is advisory — the attack flow does not apply a spell's `effect` on a hit. */
const GREAT_FOOL_MOCKERY: CantripDef = {
  id: 'great-fool-vicious-mockery',
  name: "Great Fool's Vicious Mockery",
  school: 'Enchantment',
  classes: [],
  combat: true,
  castKind: 'attack',
  damageDie: '1d6',
  damageType: 'psychic',
  range: '60ft',
  multiAttack: true,
  guidance:
    'Từ Top Hat of Mental Anguish: đòn phép tầm xa vào 1 sinh vật nhìn thấy trong 60ft. Trúng: 1d6 Psychic và mục tiêu bất lợi đòn tấn công kế tiếp của nó trước cuối lượt kế (tự áp dụng tay). 2/3/4 đòn ở cấp 5/11/17, mỗi đòn một lần roll — bấm phép nhiều lần hoặc theo số tia.',
};

/** Keeps the sheet's spell list in step with worn magic items: adds the hat's cantrip while it is
 *  worn + attuned (re-scaled to the current level), removes it the moment it is not. Pure. */
export function syncMagicItemSpells(sheet: CharacterSheet): CharacterSheet {
  const has = sheet.spells.find((sp) => sp.id === TOPHAT_SPELL_ID);
  const want = magicItemActive(sheet, 'tophat-mockery');
  if (!want) return has ? { ...sheet, spells: sheet.spells.filter((sp) => sp.id !== TOPHAT_SPELL_ID) } : sheet;
  const fresh = { ...spellFromCantrip(GREAT_FOOL_MOCKERY, sheet, TOPHAT_SPELL_ID), itemSource: 'tophat-mockery' };
  if (!has) return { ...sheet, spells: [...sheet.spells, fresh] };
  // already granted: only refresh the level-scaled parts (keeps any note the player added)
  const same = JSON.stringify([has.damage, has.beams]) === JSON.stringify([fresh.damage, fresh.beams]);
  return same
    ? sheet
    : { ...sheet, spells: sheet.spells.map((sp) => (sp.id === TOPHAT_SPELL_ID ? { ...sp, damage: fresh.damage, beams: fresh.beams } : sp)) };
}

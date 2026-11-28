import type { CharacterSheet, Currency, Spell } from './types.js';
import { classLevelOf } from './rules.js';
import { payFromPurse, purseCp } from './shop.js';

/**
 * Wizard spellbook (SRD 5.2.1): the book holds six level 1 spells at level 1 and two more of the
 * Wizard's choice each level after that; anything else is copied in for 2 hours and 50 GP per
 * spell level. Arcane Recovery and Ritual Adept live here too.
 */

export const wizardLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, 'wizard');

/** A leveled spell this sheet keeps in the Wizard's spellbook. */
export function isSpellbookSpell(sheet: CharacterSheet, sp: Spell): boolean {
  if (sp.level <= 0 || sp.fromSpecies || sp.itemSource) return false;
  const classes = sheet.classes ?? [];
  if (classes.length > 1) return (sp.castingClass ?? '').toLowerCase().includes('wizard');
  return wizardLevel(sheet) > 0;
}

/** Spells the book gets for free from leveling: 6 at level 1, +2 per Wizard level after. */
export const freeSpellbookSpells = (sheet: CharacterSheet): number => {
  const wl = wizardLevel(sheet);
  return wl > 0 ? 6 + 2 * (wl - 1) : 0;
};

export function spellbookCounts(sheet: CharacterSheet): { total: number; free: number; copied: number; freeLeft: number } {
  const book = (sheet.spells ?? []).filter((s) => isSpellbookSpell(sheet, s));
  const copied = book.filter((s) => s.scribed === 'copied').length;
  // spells added before the spellbook existed count against the free ones
  const free = book.length - copied;
  return { total: book.length, free, copied, freeLeft: Math.max(0, freeSpellbookSpells(sheet) - free) };
}

/** Copying a spell into the book: 2 hours and 50 GP per spell level. */
export const scribeCost = (level: number): { gp: number; hours: number } => ({ gp: 50 * level, hours: 2 * level });

/** Highest spell level the character has slots for (the most a Wizard can copy). */
export function highestSlotLevel(sheet: CharacterSheet): number {
  return Math.max(0, ...sheet.spellSlots.filter((s) => s.max > 0).map((s) => s.level));
}

/**
 * Put a spell in the book. `free` uses one of the level-up spells; otherwise the gold is paid from
 * the purse (coins broken as needed). Returns the new sheet or why it can't.
 */
export function scribeSpell(sheet: CharacterSheet, sp: Spell, mode: 'free' | 'copied'): CharacterSheet | string {
  if (sp.level <= 0) return 'Cantrip không chép vào sổ';
  const top = highestSlotLevel(sheet);
  if (top && sp.level > top) return `Chỉ chép được phép tới cấp ${top} (cấp ô phép cao nhất)`;
  const entry: Spell = { ...sp, scribed: mode, castingClass: sp.castingClass ?? ((sheet.classes?.length ?? 0) > 1 ? 'Wizard' : undefined) };
  if (mode === 'free') {
    if (spellbookCounts(sheet).freeLeft <= 0) return 'Hết lượt phép miễn phí khi lên cấp — phải chép (tốn vàng)';
    return { ...sheet, spells: [...sheet.spells, entry] };
  }
  const cost = scribeCost(sp.level);
  const purse: Currency | null = payFromPurse(sheet.currency, cost.gp * 100);
  if (!purse) return `Không đủ tiền: cần ${cost.gp} gp, đang có ${Math.floor(purseCp(sheet.currency) / 100)} gp`;
  return { ...sheet, currency: purse, spells: [...sheet.spells, entry] };
}

// --- Arcane Recovery ----------------------------------------------------------------------

export const ARCANE_RECOVERY_ID = 'wiz-arcane-recovery';

/** Arcane Recovery budget: slot levels adding up to half the Wizard level (round up), none 6+. */
export const arcaneRecoveryBudget = (sheet: CharacterSheet): number => Math.ceil(wizardLevel(sheet) / 2);

/** Once per long rest after a short rest: regain expended slots whose levels add up to the budget. */
export function arcaneRecovery(sheet: CharacterSheet, levels: number[]): CharacterSheet | string {
  if (wizardLevel(sheet) < 1) return 'Cần Wizard';
  if (sheet.subclassUses?.[ARCANE_RECOVERY_ID]) return 'Đã dùng Arcane Recovery từ lần nghỉ dài trước';
  if (!levels.length) return 'Chưa chọn ô phép nào';
  if (levels.some((l) => l >= 6)) return 'Không hồi được ô cấp 6 trở lên';
  const sum = levels.reduce((a, b) => a + b, 0);
  if (sum > arcaneRecoveryBudget(sheet)) return `Tổng cấp tối đa ${arcaneRecoveryBudget(sheet)}`;
  const slots = sheet.spellSlots.map((s) => ({ ...s }));
  for (const l of levels) {
    const s = slots.find((x) => x.level === l);
    if (!s || s.used <= 0) return `Không có ô cấp ${l} đã dùng`;
    s.used -= 1;
  }
  return { ...sheet, spellSlots: slots, subclassUses: { ...(sheet.subclassUses ?? {}), [ARCANE_RECOVERY_ID]: 1 } };
}

/** Ritual casting: a Wizard casts any ritual in the book (prepared or not); others need it prepared. */
export function canCastAsRitual(sheet: CharacterSheet, sp: Spell): boolean {
  if (!sp.ritual || sp.level <= 0) return false;
  return sp.prepared || isSpellbookSpell(sheet, sp);
}

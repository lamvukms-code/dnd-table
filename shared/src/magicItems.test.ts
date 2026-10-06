import { describe, expect, it } from 'vitest';
import { circletTempHp, monkFocusMax, sneakAttackDice, spellAttackBonus, spellSaveDc } from './rules.js';
import { magicItemActive, magicItemKeyOf, magicItemPresets } from './magicItems.js';
import { syncMagicItemSpells, TOPHAT_SPELL_ID } from './magicItemSpells.js';
import { blankSheetForTests } from './visibility.testutil.js';
import type { CharacterSheet } from './types.js';

const worn = (name: string, over: Partial<CharacterSheet['inventory'][number]> = {}) => ({
  id: 'i-' + name, name, type: 'gear' as const, quantity: 1, weight: 0, equipped: true, attuned: true, notes: '', ...over,
});
const withItem = (s: CharacterSheet, ...items: CharacterSheet['inventory']) => ({ ...s, inventory: items });
const rogue = (lvl: number) => ({ ...blankSheetForTests('o', 'R'), className: 'Rogue', level: lvl, proficiencyBonus: lvl >= 9 ? 4 : lvl >= 5 ? 3 : 2 });
const monk = (lvl: number) => ({ ...blankSheetForTests('o', 'M'), className: 'Monk', level: lvl, proficiencyBonus: lvl >= 5 ? 3 : 2 });

describe('magic item recognition', () => {
  it('matches English and Vietnamese names, accents optional', () => {
    expect(magicItemKeyOf({ name: 'Necklace of Wolf Fangs' })).toBe('wolf-fangs');
    expect(magicItemKeyOf({ name: 'Vòng cổ nanh sói huyền bí' })).toBe('wolf-fangs');
    expect(magicItemKeyOf({ name: 'hood of empowered ki' })).toBe('hood-ki');
    expect(magicItemKeyOf({ name: 'Mũ Sắt Tổn Thương Tâm Trí' })).toBe('tophat-mockery');
    expect(magicItemKeyOf({ name: 'Circlet of Natural Rejuvenation' })).toBe('circlet-rejuvenation');
    expect(magicItemKeyOf({ name: 'Longsword' })).toBeNull();
  });
  it('is active only while equipped AND attuned', () => {
    const s = (over: object) => withItem(rogue(5), worn('Necklace of Wolf Fangs', over));
    expect(magicItemActive(s({}), 'wolf-fangs')).toBe(true);
    expect(magicItemActive(s({ attuned: false }), 'wolf-fangs')).toBe(false);
    expect(magicItemActive(s({ equipped: false }), 'wolf-fangs')).toBe(false);
  });
  it('presets cover all four items and start un-attuned', () => {
    const p = magicItemPresets(() => 'x');
    expect(p).toHaveLength(4);
    expect(p.every((i) => i.attuned === false && magicItemKeyOf(i) !== null)).toBe(true);
  });
});

describe('Necklace of Wolf Fangs', () => {
  it('adds proficiency-bonus d6s to Sneak Attack, only for a Rogue', () => {
    const r = rogue(5); // base 3d6, PB +3
    expect(sneakAttackDice(r)).toBe(3);
    expect(sneakAttackDice(withItem(r, worn('Necklace of Wolf Fangs')))).toBe(6);
    expect(sneakAttackDice(withItem(monk(5), worn('Necklace of Wolf Fangs')))).toBe(0);
  });
});

describe('Hood of Empowered Ki', () => {
  it('adds proficiency-bonus ki points for a Monk with Focus (lvl 2+)', () => {
    expect(monkFocusMax(monk(4))).toBe(4);
    expect(monkFocusMax(withItem(monk(4), worn('Hood of Empowered Ki')))).toBe(6);
    expect(monkFocusMax(withItem(monk(1), worn('Hood of Empowered Ki')))).toBe(0);
    expect(monkFocusMax(withItem(monk(4), worn('Hood of Empowered Ki', { attuned: false })))).toBe(4);
  });
});

describe('Circlet of Natural Rejuvenation', () => {
  it('grants proficiency bonus + Druid level of temp HP, Druids only', () => {
    const d = { ...blankSheetForTests('o', 'D'), className: 'Druid', level: 6, proficiencyBonus: 3 };
    expect(circletTempHp(d)).toBe(0);
    expect(circletTempHp(withItem(d, worn('Circlet of Natural Rejuvenation')))).toBe(9);
    expect(circletTempHp(withItem(monk(6), worn('Circlet of Natural Rejuvenation')))).toBe(0);
  });
});

describe('Top Hat of Mental Anguish', () => {
  it('grants the cantrip while worn, scaled 1/2/3/4 attacks, and removes it when taken off', () => {
    const m = withItem(monk(5), worn('Top Hat of Mental Anguish'));
    const on = syncMagicItemSpells(m);
    const sp = on.spells.find((x) => x.id === TOPHAT_SPELL_ID)!;
    expect(sp.name).toBe("Great Fool's Vicious Mockery");
    expect(sp.level).toBe(0);
    expect(sp.castKind).toBe('attack');
    expect(sp.damage?.[0]).toMatchObject({ dice: '1d6', type: 'psychic' });
    expect(sp.beams).toBe(2); // level 5
    expect(sp.itemSource).toBe('tophat-mockery');
    expect(syncMagicItemSpells(on)).toBe(on); // idempotent
    const lvl11 = syncMagicItemSpells({ ...on, level: 11 });
    expect(lvl11.spells.find((x) => x.id === TOPHAT_SPELL_ID)?.beams).toBe(3);
    const off = syncMagicItemSpells({ ...on, inventory: [] });
    expect(off.spells.some((x) => x.id === TOPHAT_SPELL_ID)).toBe(false);
  });
  it('casts with Charisma when the wearer has no spellcasting ability', () => {
    const m = withItem({ ...monk(5), abilities: { ...monk(5).abilities, cha: 16 } }, worn('Top Hat of Mental Anguish'));
    const sp = syncMagicItemSpells(m).spells[0];
    expect(spellAttackBonus(m, sp)).toBe(3 + 3); // PB 3 + CHA +3
    expect(spellSaveDc(m, sp)).toBe(8 + 3 + 3);
    expect(spellAttackBonus(m)).toBeNull(); // an ordinary spell on a non-caster is unchanged
  });
});

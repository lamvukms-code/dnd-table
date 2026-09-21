import { describe, expect, it } from 'vitest';
import { actionDamageParts, effectAttackRiders, effectSaveAdvantage, effectiveArmorClass } from './index.js';
import { attacksPerAction, economyKindOf, oldWaysClass, spellLimits, spendEconomy, woodWoseEffect } from './turnRules.js';
import type { CharacterSheet } from './types.js';

const sheet = (over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className: 'Druid', level: 6, proficiencyBonus: 3, subclass: 'Circle of the Old Ways',
    abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 },
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 40, currentHp: 40, tempHp: 0,
    armorClass: 10, acOverride: null, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], resources: [],
    spellSlots: [], spells: [], feats: [], features: [], inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', ...over,
  }) as CharacterSheet;

describe('Wood Wose', () => {
  it('only for an Old Ways druid; builds AC / temp HP / advantage / end conditions', () => {
    expect(woodWoseEffect(sheet({ subclass: 'Circle of the Moon' }), 1)).toBeNull();
    expect(oldWaysClass(sheet())).toBeTruthy();
    const { effect, tempHp } = woodWoseEffect(sheet(), 5)!;
    expect(tempHp).toBe(4 + 3); // WIS +4, PB +3
    expect(effect).toMatchObject({ name: 'Wood Wose', acBase: 14, turnTempHp: 7, expiresRound: 105, endsWhenDown: true, saveAdvantage: ['str', 'con'] });
    expect(effectiveArmorClass(sheet(), [{ id: 'e', ...effect }]).ac).toBe(14 + 2); // 10 + WIS + DEX
    expect(effect.attackRiders?.[0].label).toBe('Gnarled Thorns'); // level 6
    expect(effect.retaliate).toBeUndefined(); // Bramblebark is level 10
    expect(effect.resist).toBeUndefined(); // Mighty Trunk is level 14
  });
  it('level 10 adds Bramblebark, level 14 Mighty Trunk', () => {
    expect(woodWoseEffect(sheet({ level: 10 }), 1)!.effect.retaliate).toEqual({ dice: '1d8', type: 'piercing', always: true });
    expect(woodWoseEffect(sheet({ level: 14 }), 1)!.effect.resist).toEqual(['bludgeoning', 'piercing']);
  });
  it('Oaken Resolve advantage and Gnarled Thorns ride the right attacks', () => {
    const { effect } = woodWoseEffect(sheet(), 1)!;
    const eff = [{ id: 'e', ...effect }];
    expect(effectSaveAdvantage(eff, 'str')).toBe(true);
    expect(effectSaveAdvantage(eff, 'dex')).toBe(false);
    const melee = { id: 'weapon:x', name: 'Staff', actionType: 'action' as const, attackBonus: 5, damage: '1d6+4', damageType: 'bludgeoning', attackKind: 'weapon' as const, attackRange: 'melee' as const };
    expect(actionDamageParts(sheet(), melee, eff).map((p) => p.label)).toContain('Gnarled Thorns');
    expect(effectAttackRiders(eff, { ...melee, attackRange: 'ranged' })).toEqual([]);
    expect(effectAttackRiders(eff, { ...melee, attackKind: 'spell' })).toEqual([]);
  });
});

describe('action economy', () => {
  it('maps action types to Action / Bonus / Reaction', () => {
    expect(economyKindOf('bonus')).toBe('bonus');
    expect(economyKindOf('reaction')).toBe('reaction');
    expect(economyKindOf('free')).toBeNull();
  });
  it('spending twice warns; attacks count against Extra Attack', () => {
    const a = spendEconomy(undefined, 'bonus');
    expect(a.warning).toBeUndefined();
    expect(spendEconomy(a.used, 'bonus').warning).toMatch(/Bonus/);
    let u = spendEconomy(undefined, 'action', { attack: true, maxAttacks: 2 });
    expect(u.warning).toBeUndefined();
    u = spendEconomy(u.used, 'action', { attack: true, maxAttacks: 2 });
    expect(u.warning).toBeUndefined();
    expect(spendEconomy(u.used, 'action', { attack: true, maxAttacks: 2 }).warning).toMatch(/Extra Attack/);
    // the Action was already spent on a spell → an attack warns
    expect(spendEconomy({ action: true }, 'action', { attack: true, maxAttacks: 2 }).warning).toMatch(/Action/);
  });
  it('Extra Attack does not stack across classes; Fighter scales', () => {
    const mc = (classes: { name: string; level: number }[]) => sheet({ classes, level: classes.reduce((n, c) => n + c.level, 0) });
    expect(attacksPerAction(mc([{ name: 'Barbarian', level: 5 }, { name: 'Monk', level: 5 }]))).toBe(2);
    expect(attacksPerAction(mc([{ name: 'Fighter', level: 11 }, { name: 'Paladin', level: 5 }]))).toBe(3);
    expect(attacksPerAction(mc([{ name: 'Rogue', level: 5 }]))).toBe(1);
  });
});

describe('prepared spell limits per class', () => {
  it('SRD table numbers, counted per casting class', () => {
    const s = sheet({
      classes: [{ name: 'Wizard', level: 3 }, { name: 'Cleric', level: 2 }], level: 5,
      spells: [
        { id: '1', name: 'A', level: 1, prepared: true, castKind: 'utility', castingClass: 'Wizard' },
        { id: '2', name: 'B', level: 1, prepared: true, castKind: 'utility', castingClass: 'Cleric' },
        { id: '3', name: 'C', level: 0, prepared: true, castKind: 'utility', castingClass: 'Wizard' },
      ] as CharacterSheet['spells'],
    });
    const lim = spellLimits(s);
    expect(lim.map((l) => [l.cls, l.preparedMax, l.cantripsMax, l.preparedUsed, l.cantripsUsed])).toEqual([
      ['Wizard', 6, 3, 1, 1],
      ['Cleric', 5, 3, 1, 0],
    ]);
  });
});

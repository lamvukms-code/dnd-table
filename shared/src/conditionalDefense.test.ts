import { describe, expect, it } from 'vitest';
import { parseConditionalDefense } from './import5etools.js';
import { actionDamageParts, applyDamageDefenses, derivedActions, emptyCurrency, legendaryActionCost, statblockDamageParts } from './rules.js';
import { emptyDefenses, type CharacterSheet, type Defenses } from './types.js';

const def = (text: string, kind: 'resist' | 'immune' = 'resist'): Defenses => ({
  ...emptyDefenses(),
  conditional: [parseConditionalDefense(kind, text)!],
});

describe('conditional defences', () => {
  it('parses the usual stat-block wordings', () => {
    expect(parseConditionalDefense('resist', "bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered or moongilded")).toMatchObject({
      types: ['bludgeoning', 'piercing', 'slashing'],
      bypassedBy: ['magical', 'silvered', 'moongilded'],
    });
    expect(parseConditionalDefense('resist', "bludgeoning, piercing, and slashing from attacks that aren't moongilded")?.bypassedBy).toEqual(['moongilded']);
    expect(parseConditionalDefense('immune', 'bludgeoning, piercing, and slashing from magical attacks')).toMatchObject({ bypassedBy: [], onlyIf: ['magical'] });
    expect(parseConditionalDefense('resist', 'damage from spells')).toBeNull();
    expect(parseConditionalDefense('vulnerable', 'bludgeoning, piercing, and slashing from moongilded attacks')).toMatchObject({ bypassedBy: [], onlyIf: ['moongilded'] });
  });

  it('applies unless the attack has a bypassing trait', () => {
    const d = def("bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered");
    expect(applyDamageDefenses(10, 'slashing', d).final).toBe(5);
    expect(applyDamageDefenses(10, 'slashing', d, ['silvered']).final).toBe(10);
    expect(applyDamageDefenses(10, 'slashing', d, ['magical']).final).toBe(10);
    expect(applyDamageDefenses(10, 'fire', d).final).toBe(10);
    expect(applyDamageDefenses(10, 'slashing', d).notes[0]).toContain('đòn không phép/bạc');
    const moon = def("bludgeoning, piercing, and slashing from attacks that aren't moongilded");
    expect(applyDamageDefenses(10, 'piercing', moon, ['magical']).final).toBe(5); // magic doesn't help here
    expect(applyDamageDefenses(10, 'piercing', moon, ['moongilded']).final).toBe(10);
    const onlyMagic = def('bludgeoning, piercing, and slashing from magical attacks', 'immune');
    expect(applyDamageDefenses(10, 'slashing', onlyMagic).final).toBe(10);
    expect(applyDamageDefenses(10, 'slashing', onlyMagic, ['magical']).final).toBe(0);
  });

  it('weapon traits flow from the item / spell attack into the damage parts', () => {
    const sheet = {
      id: 's', ownerId: 'p', name: 'A', className: 'Fighter', level: 1, proficiencyBonus: 2,
      abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 10, currentHp: 10, tempHp: 0,
      armorClass: 10, acOverride: null, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], spells: [],
      resources: [], spellSlots: [], feats: [], features: [], currency: emptyCurrency(), notes: '',
      inventory: [{ id: 'w', name: 'Silver Sword', type: 'weapon', equipped: true, proficient: true, damage: '1d8', damageType: 'slashing', weaponTraits: ['silvered'] }],
    } as unknown as CharacterSheet;
    const [sword] = derivedActions(sheet);
    expect(actionDamageParts(sheet, sword)[0].traits).toEqual(['silvered']);
    expect(statblockDamageParts({ id: 'a', name: 'Bolt', actionType: 'action', attackBonus: 5, damage: '2d6', damageType: 'force', description: 'Ranged Spell Attack: +5 to hit' })[0].traits).toEqual(['magical']);
    expect(statblockDamageParts({ id: 'b', name: 'Claw', actionType: 'action', attackBonus: 5, damage: '2d6', damageType: 'slashing' })[0].traits).toBeUndefined();
  });

  it('legendary action cost comes from "(Costs N Actions)"', () => {
    expect(legendaryActionCost({ name: 'Shatter Mind (Costs 2 Actions)' })).toBe(2);
    expect(legendaryActionCost({ name: 'Tentacle Attack' })).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { acBonusByHp, defenseDisadvantageWhy, detectMechanics, initiativeAdvantageWhy } from './monsterMechanics.js';
import { legendaryInfo, legendaryOncePerTurn } from './rules.js';
import type { SheetAction } from './types.js';

const sb = (name: string, description: string) => ({ traits: [{ name, description }] });

describe('initiative, defense, healing and AC traits', () => {
  it('initiative advantage, unless a condition or only near its kind', () => {
    const a = detectMechanics(sb('Keen Watch', 'If the hound is not blinded, it has advantage on its initiative roll.'));
    expect(a).toEqual([{ kind: 'initiativeAdvantage', unless: ['blinded'], nearSameFt: undefined, from: 'Keen Watch' }]);
    expect(initiativeAdvantageWhy(a, { conditions: [], sameKindWithin: () => false })).toEqual(['Keen Watch']);
    expect(initiativeAdvantageWhy(a, { conditions: ['blinded'], sameKindWithin: () => false })).toEqual([]);
    const b = detectMechanics(
      sb('Swarm Sense', 'As long as a crawler is within 60 feet of at least one other crawler, it has advantage on initiative rolls. In addition, a crawler gains a bonus to attack and damage rolls equal to the number of crawlers within 60 feet of it (maximum +5).'),
    );
    expect(b.map((m) => m.kind)).toEqual(['initiativeAdvantage', 'hiveBonus']);
    expect(b[1]).toMatchObject({ radiusFt: 60, max: 5 });
    expect(initiativeAdvantageWhy(b, { conditions: [], sameKindWithin: (ft) => ft === 60 && false })).toEqual([]);
  });

  it('ranged weapon attacks against it have disadvantage', () => {
    const m = detectMechanics(sb('Shadow Body', 'Its body is made of shadows; ranged weapon attacks against it are made with disadvantage.'));
    expect(defenseDisadvantageWhy(m, { ranged: true, spell: false })).toEqual(['Shadow Body']);
    expect(defenseDisadvantageWhy(m, { ranged: true, spell: true })).toEqual([]);
    expect(defenseDisadvantageWhy(m, { ranged: false, spell: false })).toEqual([]);
  });

  it('heals after a hit, and AC by HP thresholds', () => {
    expect(detectMechanics(sb('Hunger', 'After hitting a non-construct creature with an attack, the bear eats part of it, regaining 8 (1d10 + 3) hit points.'))).toEqual([
      { kind: 'healOnHit', dice: '1d10+3', notTypes: ['construct'], from: 'Hunger' },
    ]);
    const ac = detectMechanics(sb('Hard Hide', 'While the knight has fewer than 100, 60, or 30 hit points, it gains a +1, +2, or +3 bonus to its AC, respectively.'));
    expect(acBonusByHp(ac, 120)).toBe(0);
    expect(acBonusByHp(ac, 80)).toBe(1);
    expect(acBonusByHp(ac, 10)).toBe(3);
  });

  it('a sound or damage type it dreads: D20 tests at disadvantage', () => {
    expect(detectMechanics(sb('Drum Fear', 'When the beast hears a drum, or takes Thunder damage, it has Disadvantage on D20 Tests until the end of its next turn.'))[0]).toEqual({
      kind: 'aversion',
      damageType: 'thunder',
      disadvantage: ['attack', 'check', 'save'],
      from: 'Drum Fear',
    });
  });
});

describe('emanation auras', () => {
  it('start / end of turn in an N-foot Emanation, in its space, no save', () => {
    expect(
      detectMechanics(sb('Stench', 'Constitution Saving Throw: DC 10, any creature that starts its turn in a 5-foot Emanation originating from the ghoul. Failure: The target has the Poisoned condition until the start of its next turn. Success: The target is immune to this Stench for 24 hours.'))[0],
    ).toMatchObject({ kind: 'aura', radiusFt: 5, trigger: 'startTurn', save: { ability: 'con', dc: 10 }, onFail: { condition: 'poisoned' }, immuneOnSave: true });
    expect(detectMechanics(sb('Bees', 'Constitution Saving Throw: DC 16, each creature that ends its turn in a 10-foot Emanation originating from it. Failure: The target has the Poisoned condition until the end of its next turn.'))[0]).toMatchObject({
      trigger: 'endTurn',
      radiusFt: 10,
    });
    expect(detectMechanics(sb('Mist', 'Constitution Saving Throw: DC 13, a creature that starts its turn in the mist\'s space. Failure: 10 (3d6) Necrotic damage. Success: Half damage.'))[0]).toMatchObject({
      radiusFt: 0,
      onFail: { damage: { dice: '3d6', type: 'necrotic' } },
      halfOnSave: true,
    });
    expect(detectMechanics(sb('Rot', 'The ground in a 20-foot Emanation originating from it is Difficult Terrain. A creature that ends its turn in the Emanation takes 5 (1d10) Necrotic damage.'))[0]).toMatchObject({
      trigger: 'endTurn',
      radiusFt: 20,
      onFail: { damage: { dice: '1d10', type: 'necrotic' } },
    });
    // "an effect that ends the Poisoned condition" is no poison aura
    expect(detectMechanics(sb('Sickness', 'Constitution Saving Throw: DC 12, any creature that starts its turn in the swarm\'s space. Failure: The target contracts a disease. It repeats the save when targeted by an effect that ends the Poisoned condition.'))).toEqual([]);
  });
});

describe('legendary actions written among the actions', () => {
  const act = (name: string, description: string, actionType: SheetAction['actionType'] = 'other') => ({ id: name, name, description, actionType }) as SheetAction;
  it('reads the uses and the options after the header', () => {
    const li = legendaryInfo({
      actions: [
        act('Claw', 'Melee Attack Roll: +5', 'action'),
        act('Legendary Actions', 'Legendary Action Uses: 2 (3 in Lair). Immediately after another creature\'s turn…'),
        act('Strike', 'It makes one Claw attack. It can\'t take this action again until the start of its next turn.'),
        act('Move', 'It moves up to half its Speed.'),
      ],
    });
    expect(li?.perRound).toBe(2);
    expect(li?.options.map((o) => o.name)).toEqual(['Strike', 'Move']);
    expect(li!.options.map(legendaryOncePerTurn)).toEqual([true, false]);
    expect(legendaryInfo({ actions: [act('Claw', '', 'action')] })).toBeNull();
    expect(legendaryInfo({ legendaryActions: [act('Tail', '', 'legendary')], legendaryActionsPerRound: 3 })?.perRound).toBe(3);
  });
});

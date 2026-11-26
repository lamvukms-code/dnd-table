import { describe, expect, it } from 'vitest';
import { activeLightRules, detectMechanics, lightAt, lightRuleHolds } from './monsterMechanics.js';

const sb = (name: string, description: string) => ({ traits: [{ name, description }] });

describe('light-dependent traits', () => {
  it('sunlight damage and disadvantage', () => {
    const m = detectMechanics(sb('Sunlight', 'The vampire takes 20 Radiant damage if it starts its turn in sunlight. While in sunlight, it has Disadvantage on attack rolls and ability checks.'));
    expect(m).toEqual([{ kind: 'light', when: 'sun', startDamage: { dice: '20', type: 'radiant' }, disadvantage: ['attack', 'check'], from: 'Sunlight' }]);
    expect(detectMechanics(sb('Sunlight Weakness', 'While in sunlight, the shadow has Disadvantage on D20 Tests.'))[0]).toMatchObject({ disadvantage: ['attack', 'check', 'save'] });
  });

  it('moonlight conditions and dim-light reminders', () => {
    expect(detectMechanics(sb('Lunar Veil', 'While not in moonlight, the creature is invisible and incapacitated.'))[0]).toMatchObject({ when: 'notMoon', conditions: ['incapacitated', 'invisible'] });
    expect(detectMechanics(sb('Shadow Step', 'While in dim light or darkness, the creature can take the Hide action as a bonus action.'))[0]).toMatchObject({ when: 'dimOrDark' });
  });

  it('aversion to a damage type and to weapons', () => {
    expect(detectMechanics(sb('Aversion to Fire', 'If the golem takes Fire damage, it has Disadvantage on attack rolls and ability checks until the end of its next turn.'))[0]).toEqual({
      kind: 'aversion',
      damageType: 'fire',
      disadvantage: ['attack', 'check'],
      from: 'Aversion to Fire',
    });
    expect(
      detectMechanics(sb('Fear of Blades', "At the start of the creature's turn, if it can see a creature holding a Shortsword, a Longsword, or a Greatsword, it has the Frightened condition until the start of its next turn."))[0],
    ).toEqual({ kind: 'weaponAversion', weapons: ['shortsword', 'longsword', 'greatsword'], condition: 'frightened', from: 'Fear of Blades' });
  });

  it('light where a token stands', () => {
    expect(lightAt({ light: 'sun' }, { light: 'dark' })).toBe('dark');
    expect(lightAt({ light: null, moon: { key: 'x' } }, {})).toBe('moon');
    expect(lightAt({}, {})).toBeUndefined();
    expect(lightRuleHolds({ when: 'notMoon' }, undefined)).toBe(false);
    expect(lightRuleHolds({ when: 'notMoon' }, 'bright')).toBe(true);
    expect(lightRuleHolds({ when: 'dimOrDark' }, 'moon')).toBe(true);
    const mechs = detectMechanics(sb('Sunlight Sensitivity', 'While in sunlight, it has Disadvantage on attack rolls and Wisdom (Perception) checks.'));
    expect(activeLightRules(mechs, 'sun').attack).toEqual(['Sunlight Sensitivity']);
    expect(activeLightRules(mechs, 'dim').attack).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  automatedFeatures,
  critExtraParts,
  critMin,
  detectMechanics,
  hasEvasion,
  immuneConditions,
  lifestealFor,
  mechanicAttackAdvantage,
  mechanicAutoCrit,
  mechanicSaveAdvantage,
  monsterMechanics,
  onHitGrappleFor,
  registerMonsterMechanics,
} from './monsterMechanics.js';
import type { SheetAction } from './types.js';
import { parseMultiattack } from './monsterActions.js';

const act = (name: string, description: string, attackBonus?: number) => ({ id: name, name, actionType: 'action', description, attackBonus }) as SheetAction;
const facts = { melee: true, allyAdjacentToTarget: false, targetAdjacentToItsAlly: false, targetGrappledBySelf: false, targetDamaged: false, targetConditions: [] as string[] };

describe('monster mechanics: detection from stat-block wording', () => {
  const sb = {
    name: 'Test Brute',
    traits: [
      { name: 'Condition Immunities', description: 'charmed, frightened, poisoned' },
      { name: 'Magic Resistance', description: 'The brute has advantage on saving throws against spells and other magical effects.' },
      { name: 'Stubborn', description: 'The brute has advantage on saving throws against being charmed or frightened.' },
      { name: 'Mighty', description: 'The brute has advantage on Strength checks and Strength saving throws.' },
      { name: 'Glare', description: 'Creatures near it have disadvantage on Charisma saving throws.' },
      { name: 'Pack Tactics', description: 'Advantage on an attack roll against a creature if at least one of its allies is within 5 feet of the creature.' },
      { name: 'Hungry', description: 'The brute has advantage on melee attack rolls against any creature that doesn\'t have all its hit points.' },
      { name: 'Savage Crit', description: 'The brute deals an additional 4 (1d8) piercing damage when determining the extra damage for a critical hit it scores with a melee attack.' },
      { name: 'Evasion', description: 'If subjected to a Dexterity save for half damage...' },
    ],
    actions: [
      act('Bite', 'Melee Weapon Attack: +5 to hit. Hit: 7 (1d8 + 3) piercing damage. This attack scores a critical hit on a roll of 19 or 20.', 5),
      act('Claw', 'Melee Weapon Attack: +5 to hit. Hit: 7 piercing damage, and the target is grappled (escape DC 14) if it is a Large or smaller creature.', 5),
      act('Crush', 'Melee Weapon Attack: +5 to hit. Hit: 9 bludgeoning damage. If the target is grappled by the brute, the attack is a critical hit.', 5),
      act('Drain', 'Melee Weapon Attack: +5 to hit. Hit: 5 (1d6 + 2) piercing damage plus 3 (1d6) necrotic damage, and the brute regains hit points equal to the piercing damage dealt.', 5),
      act('Feast', 'Ranged Spell Attack: +5 to hit. Hit: 10 psychic damage. If the target is frightened, the brute regains hit points equal to the damage dealt.', 5),
    ],
  };
  const m = detectMechanics(sb);
  it('immunities, save advantages (never from "disadvantage"), evasion', () => {
    expect(immuneConditions(m)).toEqual(['charmed', 'frightened', 'poisoned']);
    expect(mechanicSaveAdvantage(m, { ability: 'wis', magical: true })).toBe('Magic Resistance');
    expect(mechanicSaveAdvantage(m, { ability: 'wis', vsCondition: 'frightened' })).toBe('Stubborn');
    expect(mechanicSaveAdvantage(m, { ability: 'str' })).toBe('Mighty');
    expect(mechanicSaveAdvantage(m, { ability: 'cha' })).toBeNull();
    expect(hasEvasion(m)).toBe(true);
  });
  it('attack advantage only when its condition holds', () => {
    expect(mechanicAttackAdvantage(m, facts)).toEqual([]);
    expect(mechanicAttackAdvantage(m, { ...facts, allyAdjacentToTarget: true })).toEqual(['Pack Tactics']);
    expect(mechanicAttackAdvantage(m, { ...facts, targetDamaged: true })).toEqual(['Hungry']);
    expect(mechanicAttackAdvantage(m, { ...facts, melee: false, targetDamaged: true })).toEqual([]);
  });
  it('crit range per action, auto-crit vs grappled, crit extra dice', () => {
    expect(critMin(m, 'Bite')).toBe(19);
    expect(critMin(m, 'Claw')).toBe(20);
    expect(mechanicAutoCrit(m, 'Crush', { targetGrappledBySelf: true })).toBe('Crush');
    expect(mechanicAutoCrit(m, 'Crush', { targetGrappledBySelf: false })).toBeNull();
    expect(critExtraParts(m, true, 'slashing')).toEqual([{ dice: '1d8', type: 'piercing', label: 'Savage Crit' }]);
    expect(critExtraParts(m, false, 'slashing')).toEqual([]);
  });
  it('grapple on hit with escape DC and size cap; life drain by type or condition', () => {
    expect(onHitGrappleFor(m, 'Claw')).toMatchObject({ escapeDc: 14, maxSize: 'large' });
    expect(onHitGrappleFor(m, 'Bite')).toBeNull();
    expect(lifestealFor(m, 'Drain')).toMatchObject({ type: 'piercing' });
    expect(lifestealFor(m, 'Feast')).toMatchObject({ ifTargetCondition: 'frightened' });
    expect(automatedFeatures(m).has('magic resistance')).toBe(true);
  });
  it('local entries add to / override detection for the same feature', () => {
    registerMonsterMechanics({ 'Test Brute': [{ kind: 'saveAdvantage', abilities: ['cha'], from: 'Glare' }] });
    const all = monsterMechanics(sb);
    expect(mechanicSaveAdvantage(all, { ability: 'cha' })).toBe('Glare');
    expect(immuneConditions(all)).toContain('poisoned');
  });
});

describe('multiattack wording', () => {
  it('"one with its bite and two with its claws"', () => {
    const acts = [act('Bite', '', 9), act('Claw', '', 9)];
    expect(parseMultiattack('The beast makes three attacks: one with its bite and two with its claws.', acts).map((s) => `${s.count}×${s.name}`)).toEqual(['1×Bite', '2×Claw']);
  });
});

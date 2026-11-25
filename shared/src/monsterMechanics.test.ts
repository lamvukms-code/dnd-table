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
  regenSuppressed,
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

describe('monster mechanics wave 2: turn hooks and death', () => {
  const sb = {
    name: 'Test Horror',
    traits: [
      { name: 'Regeneration', description: 'The horror regains 10 hit points at the start of its turn. If the horror takes fire or acid damage, this trait doesn\'t function at the start of the horror\'s next turn. The horror dies only if it starts its turn with 0 hit points and doesn\'t regenerate.' },
      { name: 'Dread Aura', description: 'Any creature that starts its turn within 30 feet of the horror must make a DC 15 Wisdom saving throw. On a failed save, the creature is frightened until the start of its next turn. If a creature\'s saving throw is successful, the creature is immune to the horror\'s Dread Aura for the next 24 hours.' },
      { name: 'Grinding Grip', description: 'A creature that the horror is grappling takes 7 (2d6) slashing damage at the start of each of its turns and the horror\'s turns.' },
      { name: 'Death Burst', description: 'When the horror dies, it explodes. Each creature within 10 feet of it must make a DC 13 Dexterity saving throw, taking 14 (4d6) fire damage on a failed save, or half as much damage on a successful one.' },
    ],
    actions: [act('Undying Howl (1/Day)', 'When the horror is reduced to 0 hit points, it howls, instantly regaining 22 (4d10) hit points.')],
  };
  const m = detectMechanics(sb);
  const find = (k: string) => m.find((x) => x.kind === k) as Record<string, unknown> | undefined;
  it('regeneration with what stops it', () => {
    expect(find('regeneration')).toMatchObject({ hp: '10', suppressedBy: ['fire', 'acid'], diesOnlyAtTurnStart: true });
    expect(regenSuppressed({ suppressedBy: ['fire', 'acid'] }, ['slashing', 'fire'])).toBe(true);
    expect(regenSuppressed({ suppressedBy: ['fire', 'acid'] }, ['cold'])).toBe(false);
  });
  it('start-of-turn aura with immunity on a save', () => {
    expect(find('aura')).toMatchObject({ radiusFt: 30, trigger: 'startTurn', save: { ability: 'wis', dc: 15 }, onFail: { condition: 'frightened', rounds: 1 }, immuneOnSave: true });
  });
  it('grip damage on the held creature and its own turn; burst at 0 HP; revive N/day', () => {
    expect(find('turnDamage')).toMatchObject({ targets: 'grappled', dice: '2d6', type: 'slashing', alsoOwnTurn: true });
    expect(find('deathBurst')).toMatchObject({ radiusFt: 10, save: { ability: 'dex', dc: 13 }, damage: [{ dice: '4d6', type: 'fire' }], halfOnSave: true });
    expect(find('reviveAtZero')).toMatchObject({ hp: '4d10', uses: 1 });
  });
});

describe('monster mechanics wave 3: reactions', () => {
  const r = (name: string, description: string) => ({ id: name, name, actionType: 'reaction', description }) as SheetAction;
  const sb = {
    name: 'Test Duelist',
    traits: [
      { name: 'Spiked Hide', description: 'Whenever a creature within 5 feet of the duelist hits it with a melee attack, the creature takes 3 (1d6) piercing damage.' },
      { name: 'Quick', description: 'The duelist can take one reaction on every turn in combat.' },
      { name: 'Flyby', description: 'The duelist doesn\'t provoke opportunity attacks when it flies out of an enemy\'s reach.' },
    ],
    actions: [
      r('Parry', 'The duelist adds 3 to its AC against one melee attack that would hit it.'),
      r('Sidestep (3/Short Rest)', 'When targeted by a melee attack, it moves 5 feet and makes a Dexterity saving throw with a DC equal to the attack roll\'s total.'),
      r('Deflect (3/Short Rest)', 'It deflects an attack it can see. It reduces the attack\'s damage by 9 (1d10 + 4).'),
      r('Snare', 'When a creature starts its turn within 5 feet of the duelist, or enters the area for the first time on a turn, the duelist can snare it. DC 15 Dexterity saving throw.'),
      r('Guard', 'When another creature within 5 feet of the duelist takes damage, the duelist halves it.'),
      r('Punish Healing', 'When a spell that restores hit points is being cast within 60 feet of the duelist, it attacks the caster.'),
    ],
  };
  const m = detectMechanics(sb);
  const find = (k: string, from?: string) => m.find((x) => x.kind === k && (!from || x.from === from)) as Record<string, unknown> | undefined;
  it('defensive reactions run automatically', () => {
    expect(find('parry')).toMatchObject({ ac: 3, actionId: 'Parry' });
    expect(find('dodgeSave')).toMatchObject({ meleeOnly: true });
    expect(find('reduceDamage')).toMatchObject({ dice: '1d10+4' });
  });
  it('passives: thorns, reactive, flyby', () => {
    expect(find('thorns')).toMatchObject({ radiusFt: 5, dice: '1d6', type: 'piercing' });
    expect(find('reactive')).toBeTruthy();
    expect(find('flyby')).toBeTruthy();
  });
  it('other reactions get a trigger the DM is asked on', () => {
    expect(find('reaction', 'Snare')).toMatchObject({ trigger: 'nearStart', radiusFt: 5, enters: true });
    expect(find('reaction', 'Guard')).toMatchObject({ trigger: 'allyDamaged', radiusFt: 5 });
    expect(find('reaction', 'Punish Healing')).toMatchObject({ trigger: 'healCast', radiusFt: 60 });
  });
});

describe('monster mechanics wave 4: swallow, limbs, registry by id', () => {
  const sb = {
    name: 'Test Maw',
    id: 'test-maw',
    traits: [{ name: 'Fragile Body', description: 'Whenever the maw takes more than 30 damage, one of its limbs falls off (each of its two arms first, then each of its two legs).' }],
    actions: [
      {
        id: 'swallow', name: 'Swallow', actionType: 'bonus',
        description: 'Strength Saving Throw: DC 15, one Medium or smaller creature Grappled by the maw. Failure: The target is swallowed, and the Grappled condition ends. A swallowed creature has the Blinded and Restrained conditions and takes 10 (3d6) acid damage at the start of each of the maw\'s turns. If the maw takes 20 damage or more on a single turn from a creature inside it, it regurgitates.',
        save: { ability: 'str', dc: 15 },
      } as SheetAction,
    ],
  };
  it('swallow on a failed save, with turn damage and the escape threshold', () => {
    expect(detectMechanics(sb).find((m) => m.kind === 'engulf')).toMatchObject({
      actions: ['Swallow'], requiresGrappled: true, maxSize: 'medium', blinded: true, turnDamage: { dice: '3d6', type: 'acid' }, escapeDamage: 20,
    });
    expect(detectMechanics(sb).find((m) => m.kind === 'limbs')).toMatchObject({ count: 4, loseOver: 30 });
  });
  it('"id:" local entries pick one of two stat blocks that share a name', () => {
    registerMonsterMechanics({ 'id:test-maw': [{ kind: 'stance', name: 'Rage', patch: { size: 'huge' } }] });
    expect(monsterMechanics(sb).some((m) => m.kind === 'stance')).toBe(true);
    expect(monsterMechanics({ ...sb, id: 'other-maw' }).some((m) => m.kind === 'stance')).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { computeSpeed, effectiveArmorClass } from './derived.js';
import { actionDamageParts, derivedDefenses, extraAttackClasses, skillBonus, unarmedAction } from './rules.js';
import { featureRiders, registerFeatureDefs } from './featurePassives.js';
import { buildFeatureEffect, featureActionDice, resolveFeatureNumber } from './featureActions.js';
import type { SubclassFeatureDef } from './classFeatures.js';
import type { CharacterSheet, InventoryItem, SheetAction } from './types.js';

// Generic fixtures: made-up subclasses exercising each passive kind (no setting content here).
const DEFS: SubclassFeatureDef[] = [
  { id: 'mut', class: 'fighter', subclass: 'Test Mutant', level: 3, name: 'Mutation', description: '', passive: { ac: { base: 11, add: ['dex', 'con'] }, resist: ['poison'] } },
  { id: 'brute', class: 'barbarian', subclass: 'Test Brute', level: 3, name: 'Fists', description: '', passive: { unarmed: { byLevel: { 3: '1d6', 6: '1d8' } }, checkAdd: [{ ability: 'str', add: 'con' }] } },
  {
    id: 'smash', class: 'barbarian', subclass: 'Test Brute', level: 5, name: 'Smash', description: '',
    passive: { riders: [{ label: 'Smash', dice: '3d12', type: 'bludgeoning', scope: 'melee', whileRaging: true, armed: true }] },
  },
  { id: 'strike', class: 'cleric', subclass: 'Test Ward', level: 8, name: 'Strike', description: '', passive: { riders: [{ label: 'Strike', byLevel: { 8: '1d8', 14: '2d8' }, type: 'radiant', armed: true }] } },
  { id: 'heart', class: 'druid', subclass: 'Test Grove', level: 6, name: 'Heart', description: '', passive: { riders: [{ label: 'Heart', dice: 'mod:wis', type: 'same', scope: 'melee' }], extraAttack: true, acMin: 16 } },
  { id: 'march', class: 'jaeger', subclass: 'Test Chapter', level: 3, name: 'March', description: '', passive: { speed: { bonus: 10, lightArmorOnly: true }, mediumArmorAbility: 'con' } },
  { id: 'doc', class: 'wizard', subclass: 'Test Bones', level: 2, name: 'Doc', description: '', passive: { skillAdd: [{ skill: 'medicine', add: 'int' }] } },
];

const sheet = (className: string, subclass: string, level: number, over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className, subclass, level, proficiencyBonus: 3,
    classes: [{ name: className, subclass, level }],
    abilities: { str: 16, dex: 14, con: 16, int: 14, wis: 14, cha: 10 },
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 40, currentHp: 40, tempHp: 0,
    armorClass: 10, acOverride: null, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], resources: [],
    spellSlots: [], spells: [], feats: [], features: [], inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', ...over,
  }) as CharacterSheet;
const armor = (armorBase: number, cat: 'light' | 'medium' | 'heavy'): InventoryItem =>
  ({ id: 'a', name: 'Armor', type: 'armor', quantity: 1, weight: 0, equipped: true, notes: '', armorBase, armorCategory: cat }) as InventoryItem;
const sword: SheetAction = { id: 'weapon:x', name: 'Sword', actionType: 'action', attackBonus: 6, damage: '1d8+3', damageType: 'slashing', attackKind: 'weapon', attackRange: 'melee', source: 'weapon' } as SheetAction;
const bow: SheetAction = { ...sword, id: 'weapon:b', name: 'Bow', attackRange: 'ranged', damageType: 'piercing' };

describe('feature passives', () => {
  registerFeatureDefs(DEFS);
  afterEach(() => registerFeatureDefs(DEFS));

  it('unarmored AC formula and resistances', () => {
    const s = sheet('Fighter', 'Test Mutant', 3);
    expect(effectiveArmorClass(s, []).ac).toBe(16); // 11 + DEX 2 + CON 3
    expect(effectiveArmorClass({ ...s, inventory: [armor(14, 'medium')] }, []).ac).toBe(16); // armor 14 + 2
    expect(derivedDefenses(s)?.resistances).toContain('poison');
    // below the feature's level: nothing
    expect(effectiveArmorClass(sheet('Fighter', 'Test Mutant', 2), []).ac).toBe(12);
  });

  it('unarmed die by level, check bonus on STR skills', () => {
    expect(unarmedAction(sheet('Barbarian', 'Test Brute', 3)).damage).toBe('1d6+3');
    expect(unarmedAction(sheet('Barbarian', 'Test Brute', 7)).damage).toBe('1d8+3');
    const s = sheet('Barbarian', 'Test Brute', 3);
    expect(skillBonus(s, 'athletics')).toBe(3 + 3); // STR 3 + CON 3, not proficient
  });

  it('armed riders only when armed (and raging when required), with level scaling', () => {
    const s = sheet('Barbarian', 'Test Brute', 5);
    const id = featureRiders(s).find((r) => r.label === 'Smash')!.id;
    const labels = (x: CharacterSheet, a = sword) => actionDamageParts(x, a).map((p) => p.label);
    expect(labels(s)).not.toContain('Smash');
    expect(labels({ ...s, featureRidersArmed: [id] })).not.toContain('Smash'); // not raging
    expect(labels({ ...s, featureRidersArmed: [id], raging: true })).toContain('Smash');
    expect(labels({ ...s, featureRidersArmed: [id], raging: true }, bow)).not.toContain('Smash'); // melee only
    const c = sheet('Cleric', 'Test Ward', 14);
    expect(featureRiders(c)[0].dice).toBe('2d8');
  });

  it('standing rider (type follows the weapon), extra attack, AC floor', () => {
    const s = sheet('Druid', 'Test Grove', 6);
    const heart = actionDamageParts(s, sword).find((p) => p.label === 'Heart')!;
    expect(heart).toMatchObject({ dice: '2', type: 'slashing' });
    expect(extraAttackClasses(s)).toEqual(['Druid']);
    expect(effectiveArmorClass(s, []).ac).toBe(16);
  });

  it('speed in light armor only; medium armor uses CON', () => {
    const s = sheet('Jaeger', 'Test Chapter', 3);
    expect(computeSpeed(s).speed).toBe(40);
    expect(computeSpeed({ ...s, inventory: [armor(14, 'medium')] }).speed).toBe(30);
    expect(effectiveArmorClass({ ...s, abilities: { ...s.abilities, dex: 10 }, inventory: [armor(14, 'medium')] }, []).ac).toBe(16); // CON +3 capped at +2
  });

  it('skill add (INT to Medicine)', () => {
    expect(skillBonus(sheet('Wizard', 'Test Bones', 2), 'medicine')).toBe(2 + 2);
  });

  it('no registered data → nothing changes', () => {
    registerFeatureDefs([]);
    expect(effectiveArmorClass(sheet('Fighter', 'Test Mutant', 3), []).ac).toBe(12);
  });
});

describe('feature action helpers', () => {
  const s = sheet('Wizard', 'Test Bones', 7);
  it('numbers: halves and min 1', () => {
    expect(resolveFeatureNumber('mod:wis/2', s)).toBe(1);
    expect(resolveFeatureNumber('max1:lvl/3', { ...s, level: 2, classes: [{ name: 'Wizard', subclass: 'x', level: 2 }] }, 'wizard')).toBe(1);
    expect(resolveFeatureNumber('5+5*lvl', s, 'wizard')).toBe(40);
  });
  it('dice by level', () => {
    expect(featureActionDice({ diceByLevel: { 3: '2*mod:con', 14: '3*mod:con' } }, s, 'wizard')).toBe('6');
    expect(featureActionDice({ dice: 'mod:cond8' }, s)).toBe('3d8');
  });
  it('effect: formulas resolved', () => {
    const e = buildFeatureEffect(
      { label: 'Dance', kind: 'effect', effect: { acBonus: 'mod:wis/2', resist: ['fire'], attackRiders: [{ dice: 'mod:wis', type: 'fire', melee: true }], rounds: 1 } },
      s, 'wizard', 4, 'Dance',
    )!;
    expect(e).toMatchObject({ acBonus: 1, resist: ['fire'], expiresRound: 5 });
    expect(e.attackRiders![0]).toMatchObject({ dice: '2', type: 'fire', melee: true });
  });
  it('effect: a target mark carries its rider and source', () => {
    const e = buildFeatureEffect({ label: 'Mark', kind: 'effect', effect: { rider: { dice: '1d6', type: 'radiant' }, rounds: 10 } }, s, 'wizard', 1, 'Mark')!;
    expect(e).toMatchObject({ rider: { dice: '1d6', type: 'radiant' }, sourceSheetId: s.id, expiresRound: 11 });
    const grown = (lvl: number) =>
      buildFeatureEffect(
        { label: 'Mark', kind: 'effect', effect: { rider: { dice: '1d6', type: 'radiant', diceByLevel: { 8: '2d6', 16: '3d6' } } } },
        sheet('Paladin', 'x', lvl), 'paladin', 1, 'Mark',
      )!.rider!.dice;
    expect([grown(3), grown(8), grown(15), grown(16)]).toEqual(['1d6', '2d6', '2d6', '3d6']);
  });
});

describe('sheet damage riders (scope, same type)', () => {
  const s = sheet('Paladin', 'x', 5, {
    damageRiders: [
      { id: 'a', name: 'Smite', dice: '2d8', type: 'radiant', scope: 'melee', once: true, enabled: true },
      { id: 'b', name: 'Bane edge', dice: '1d6', type: 'same', scope: 'weapon', enabled: true },
      { id: 'c', name: 'Off', dice: '9d9', type: 'fire', enabled: false },
    ],
  });
  it('melee-only rider skips ranged attacks; "same" takes the weapon type', () => {
    const melee = actionDamageParts(s, sword);
    expect(melee.find((p) => p.label === 'Smite')).toBeTruthy();
    expect(melee.find((p) => p.label === 'Bane edge')!.type).toBe('slashing');
    expect(melee.find((p) => p.label === 'Off')).toBeFalsy();
    const ranged = actionDamageParts(s, bow);
    expect(ranged.find((p) => p.label === 'Smite')).toBeFalsy();
    expect(ranged.find((p) => p.label === 'Bane edge')!.type).toBe('piercing');
  });
});

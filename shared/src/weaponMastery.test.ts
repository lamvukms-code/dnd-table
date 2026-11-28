import { describe, expect, it } from 'vitest';
import { actionDamageParts, computeArmorClass, derivedActions, unarmedAction } from './rules.js';
import { minDieBonus } from './dice.js';
import { masterySlots, weaponInfo } from './weaponMastery.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const item = (over: Partial<InventoryItem>): InventoryItem =>
  ({ id: over.name ?? 'w', type: 'weapon', quantity: 1, weight: 1, equipped: true, notes: '', proficient: true, ...over }) as InventoryItem;

const sheet = (inv: InventoryItem[], feats: string[] = [], over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's',
    name: 'Hero',
    className: 'Fighter',
    level: 5,
    classes: [{ name: 'Fighter', level: 5 }],
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: 3,
    inventory: inv,
    actions: [],
    damageRiders: [],
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
    ...over,
  }) as unknown as CharacterSheet;

const longsword = item({ name: 'Longsword', damage: '1d8', damageType: 'slashing', weaponAbility: 'str' });
const longbow = item({ name: 'Longbow', damage: '1d8', damageType: 'piercing', weaponAbility: 'dex', rangeText: '150/600 ft' });
const greatsword = item({ name: '+1 Greatsword', damage: '2d6', damageType: 'slashing', weaponAbility: 'str' });
const dagger = item({ id: 'd1', name: 'Dagger', damage: '1d4', damageType: 'piercing', weaponAbility: 'finesse', rangeText: '20/60 ft (ném)', attackRange: 'melee' });
const shortsword = item({ id: 'ss', name: 'Shortsword', damage: '1d6', damageType: 'piercing', weaponAbility: 'finesse' });
const chain = { id: 'a', name: 'Chain Mail', type: 'armor', equipped: true, armorBase: 16, armorCategory: 'heavy', quantity: 1, weight: 1, notes: '' } as InventoryItem;

describe('weapon table', () => {
  it('finds the SRD weapon by kind or by name', () => {
    expect(weaponInfo(greatsword)?.mastery).toBe('graze');
    expect(weaponInfo({ name: 'Light Crossbow', type: 'weapon' })?.kind).toBe('light crossbow');
    expect(weaponInfo({ name: 'Thanh kiếm của cha', type: 'weapon', weaponKind: 'rapier' })?.mastery).toBe('vex');
    expect(weaponInfo({ name: 'Gậy lạ', type: 'weapon' })).toBeUndefined();
  });
  it('mastery slots by class and level', () => {
    expect(masterySlots(sheet([]))).toBe(4); // Fighter 5
    expect(masterySlots(sheet([], [], { classes: [{ name: 'Rogue', level: 3 }] } as never))).toBe(2);
    expect(masterySlots(sheet([], ['Weapon Master'], { classes: [{ name: 'Wizard', level: 3 }] } as never))).toBe(1);
  });
});

describe('fighting styles', () => {
  it('Archery: +2 to hit with ranged weapons only', () => {
    const [sword, bow] = derivedActions(sheet([longsword, longbow], ['Archery']));
    expect(sword.attackBonus).toBe(3 + 3);
    expect(bow.attackBonus).toBe(2 + 3 + 2);
  });
  it('Dueling: +2 damage with a one-handed melee weapon and no other in hand', () => {
    expect(derivedActions(sheet([longsword], ['Dueling']))[0].damage).toBe('1d8+5');
    expect(derivedActions(sheet([greatsword], ['Dueling']))[0].damage).toBe('2d6+3');
    expect(derivedActions(sheet([longsword, { ...dagger, id: 'd2' }], ['Dueling']))[0].damage).toBe('1d8+3');
  });
  it('Great Weapon Fighting: damage dice count 1–2 as 3 on two-handed melee weapons', () => {
    const s = sheet([greatsword], ['Great Weapon Fighting']);
    const [row] = derivedActions(s);
    expect(row.minDie).toBe(3);
    expect(actionDamageParts(s, row).every((p) => p.minDie === 3)).toBe(true);
    expect(derivedActions(sheet([longsword, { id: 'sh', name: 'Shield', type: 'shield', equipped: true } as InventoryItem], ['Great Weapon Fighting']))[0].minDie).toBeUndefined();
    expect(minDieBonus([1, 2, 5, 3], 3)).toBe(3);
  });
  it('Thrown Weapon Fighting: +2 damage when the thrown weapon is thrown', () => {
    expect(derivedActions(sheet([{ ...dagger, attackRange: 'ranged' }], ['Thrown Weapon Fighting']))[0].damage).toBe('1d4+5');
    expect(derivedActions(sheet([dagger], ['Thrown Weapon Fighting']))[0].damage).toBe('1d4+3');
  });
  it('Defense: +1 AC in armor', () => {
    expect(computeArmorClass(sheet([chain], ['Defense'])).ac).toBe(17);
    expect(computeArmorClass(sheet([], ['Defense'])).ac).toBe(12);
  });
  it('Unarmed Fighting: 1d6, 1d8 with empty hands', () => {
    expect(unarmedAction(sheet([], ['Unarmed Fighting'])).damage).toBe('1d8+3');
    expect(unarmedAction(sheet([longsword], ['Unarmed Fighting'])).damage).toBe('1d6+3');
  });
});

describe('two light weapons and Weapon Mastery', () => {
  it('the off-hand attack: Bonus Action, no ability modifier unless Two-Weapon Fighting', () => {
    const acts = derivedActions(sheet([dagger, shortsword]));
    const off = acts.find((a) => a.id === 'offhand:ss')!;
    expect(off.actionType).toBe('bonus');
    expect(off.damage).toBe('1d6');
    const twf = derivedActions(sheet([dagger, shortsword], ['Two-Weapon Fighting'])).find((a) => a.id === 'offhand:ss')!;
    expect(twf.damage).toBe('1d6+3');
  });
  it('Nick: the off-hand dagger attack costs no Bonus Action', () => {
    const acts = derivedActions(sheet([dagger, shortsword], [], { weaponMasteries: ['dagger'] }));
    expect(acts.find((a) => a.id === 'offhand:d1')!.actionType).toBe('free');
    expect(acts.find((a) => a.id === 'offhand:ss')!.actionType).toBe('bonus');
  });
  it('a mastered weapon carries its mastery, DC and base dice', () => {
    const [row] = derivedActions(sheet([greatsword], [], { weaponMasteries: ['greatsword'] }));
    expect(row.mastery).toEqual({ kind: 'graze', mod: 3, dc: 8 + 3 + 3 });
    expect(row.baseDamage).toBe('2d6');
    expect(derivedActions(sheet([greatsword]))[0].mastery).toBeUndefined();
  });
});

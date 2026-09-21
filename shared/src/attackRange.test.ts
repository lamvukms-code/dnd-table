import { describe, expect, it } from 'vitest';
import { attackRangeOf, derivedActions, inferAttackRange, rangedAtCloseQuarters } from './rules.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const weapon = (over: Partial<InventoryItem>): InventoryItem =>
  ({ id: 'w', name: 'W', type: 'weapon', quantity: 1, weight: 1, equipped: true, notes: '', damage: '1d6', proficient: true, ...over }) as InventoryItem;
const sheetWith = (inv: InventoryItem[]): CharacterSheet =>
  ({ abilities: { str: 14, dex: 14, con: 10, int: 10, wis: 10, cha: 10 }, proficiencyBonus: 2, inventory: inv, actions: [] }) as unknown as CharacterSheet;

describe('melee / ranged tag', () => {
  it('infers from the range text', () => {
    expect(inferAttackRange('5 ft')).toBe('melee');
    expect(inferAttackRange('Chạm')).toBe('melee');
    expect(inferAttackRange('reach 10 ft')).toBe('melee');
    expect(inferAttackRange('80/320 ft')).toBe('ranged');
    expect(inferAttackRange('60ft')).toBe('ranged');
    expect(inferAttackRange(undefined)).toBe('melee');
  });
  it('an explicit tag wins over the range text; stat-block wording is understood', () => {
    expect(attackRangeOf({ attackRange: 'melee', range: '20/60 ft' })).toBe('melee');
    expect(attackRangeOf({ description: 'Ranged Attack Roll: +4, range 80/320 ft.' })).toBe('ranged');
    expect(attackRangeOf({ description: 'Melee or Ranged Attack Roll: +4, reach 5 ft. or range 20/60 ft.' })).toBe('melee');
  });
  it('equipped weapons carry the tag (item override or inferred)', () => {
    const acts = derivedActions(
      sheetWith([
        weapon({ id: 'sword', rangeText: '5 ft' }),
        weapon({ id: 'bow', rangeText: '80/320 ft' }),
        weapon({ id: 'dagger', rangeText: '20/60 ft', attackRange: 'melee' }),
      ]),
    );
    expect(acts.map((a) => [a.id, a.attackRange])).toEqual([
      ['weapon:sword', 'melee'],
      ['weapon:bow', 'ranged'],
      ['weapon:dagger', 'melee'],
    ]);
  });
  it('a ranged attack at point-blank range is the disadvantage case', () => {
    expect(rangedAtCloseQuarters('ranged', 5)).toBe(true);
    expect(rangedAtCloseQuarters('ranged', 30)).toBe(false);
    expect(rangedAtCloseQuarters('melee', 5)).toBe(false);
  });
});

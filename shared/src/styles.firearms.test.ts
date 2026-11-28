import { describe, expect, it } from 'vitest';
import { carriedWeight, derivedActions } from './rules.js';
import { reloadCosts } from './firearms.js';
import { hasStyle } from './weaponMastery.js';
import { registerFeatDefs } from './featurePassives.js';
import { blankSheetForTests } from './visibility.testutil.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const weapon = (id: string, name: string, x: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id, name, type: 'weapon', quantity: 1, weight: 2, equipped: true, notes: '', weaponAbility: 'dex', damage: '1d6', damageType: 'piercing', proficient: true, ...x }) as InventoryItem;
function pc(x: Partial<CharacterSheet> = {}): CharacterSheet {
  return Object.assign(blankSheetForTests('p1', 'Pc'), { className: 'Fighter', level: 5, proficiencyBonus: 3, abilities: { str: 16, dex: 16, con: 12, int: 10, wis: 10, cha: 10 } }, x);
}

describe("a class's own Fighting Style choice counts like the feat", () => {
  it('dueling / two-weapon picked on the class panel apply; no pick = no style (control)', () => {
    expect(hasStyle(pc(), 'dueling')).toBe(false);
    expect(hasStyle(pc({ jaeger: { fightingStyle: 'dueling' } }), 'dueling')).toBe(true);
    expect(hasStyle(pc({ jaeger: { fightingStyle: 'great-weapon' } }), 'great-weapon-fighting')).toBe(true);
    expect(hasStyle(pc({ jaeger: { fightingStyle: 'two-weapon' } }), 'two-weapon-fighting')).toBe(true);
    expect(hasStyle(pc({ jaeger: { fightingStyle: 'dueling' } }), 'archery')).toBe(false);
  });

  it('flexible style: any two one-handed weapons (a pistol too) get an off-hand attack and +1 damage', () => {
    const inv = [weapon('a', 'Longsword', { weaponAbility: 'str', damage: '1d8', attackRange: 'melee' }), weapon('b', 'Pistol', { damage: '1d10', attackRange: 'ranged', rangeText: '40/120 ft' })];
    const plain = derivedActions(pc({ inventory: inv }));
    expect(plain.some((a) => a.id.startsWith('offhand:'))).toBe(false); // neither is Light: no off-hand normally
    const flex = derivedActions(pc({ inventory: inv, jaeger: { fightingStyle: 'flexible' } }));
    const main = flex.find((a) => a.id === 'weapon:a')!;
    expect(main.damage).toBe('1d8+4'); // STR +3, +1 flexible
    const off = flex.find((a) => a.id === 'offhand:b')!;
    expect(off).toBeTruthy();
    expect(off.attackRange).toBe('ranged');
    expect(off.damage).toBe('1d10+1'); // no ability mod on the off-hand, +1 flexible
    // a two-handed weapon doesn't qualify: one one-handed weapon left = no flexible pair
    const two = derivedActions(pc({ inventory: [inv[0], weapon('c', 'Greatsword', { damage: '2d6', attackRange: 'melee' })], jaeger: { fightingStyle: 'flexible' } }));
    expect(two.find((a) => a.id === 'weapon:a')!.damage).toBe('1d8+3');
  });
});

describe('artillery expert feat (artilleryExpert passive)', () => {
  registerFeatDefs([{ id: 'test-artillery', name: 'Test Artillerist', category: 'general', guidance: '', passive: { artilleryExpert: true } } as never]);
  const cannon = weapon('k', 'Cannon', { weaponAbility: 'str', damage: '2d10', attackRange: 'ranged', weight: 100, proficient: false, firearm: { barrel: 1, reload: 'artillery' } });
  const feat = { id: 'f', name: 'Test Artillerist', description: '' };

  it('reloads artillery as a bonus action, is proficient with it and carries it at half weight', () => {
    const without = pc({ inventory: [cannon] });
    const withFeat = pc({ inventory: [cannon], feats: [feat] });
    expect(reloadCosts(cannon, without)).toEqual(['action']);
    expect(reloadCosts(cannon, withFeat)).toEqual(['bonus', 'action']);
    const atk = (s: CharacterSheet) => derivedActions(s).find((a) => a.id === 'weapon:k')!.attackBonus;
    expect(atk(withFeat)! - atk(without)!).toBe(3); // + proficiency
    expect(carriedWeight(withFeat)).toBe(carriedWeight(without) - 50);
    // a non-artillery gun is untouched (control)
    const pistol = weapon('p', 'Pistol', { firearm: { barrel: 4, reload: 'slow' } });
    expect(reloadCosts(pistol, withFeat)).toEqual(['action']);
  });
});

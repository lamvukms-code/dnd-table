import { describe, expect, it } from 'vitest';
import { computeArmorClass, derivedActions, initiativeBonus } from './rules.js';
import { featureRiders, passiveHas, passiveRangedCover, passiveReactions, featFeatureDefs } from './featurePassives.js';
import { passiveSpeedBonus } from './featurePassives.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const W = (id: string, name: string, extra: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id, name, type: 'weapon', quantity: 1, weight: 1, equipped: true, notes: '', damage: '1d8', damageType: 'slashing', proficient: true, ...extra }) as InventoryItem;
const pc = (feats: string[], inv: InventoryItem[] = []): CharacterSheet =>
  ({
    id: 's', name: 'X', className: 'Fighter', level: 5, classes: [{ name: 'Fighter', level: 5 }],
    abilities: { str: 16, dex: 18, con: 14, int: 10, wis: 10, cha: 10 }, proficiencyBonus: 3, initiativeMisc: 0,
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], features: [], actions: [], inventory: inv,
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
  }) as unknown as CharacterSheet;

describe('SRD feats with mechanics', () => {
  it('Alert adds the Proficiency Bonus to Initiative; Speedy +10 ft', () => {
    expect(initiativeBonus(pc(['Alert']))).toBe(4 + 3);
    expect(passiveSpeedBonus(pc(['Speedy'])).bonus).toBe(10);
  });
  it('Great Weapon Master: + PB on heavy weapon hits', () => {
    const s = pc(['Great Weapon Master'], [W('gs', 'Greatsword', { damage: '2d6' })]);
    expect(featureRiders(s).find((r) => r.label === 'Great Weapon Master')?.dice).toBe('3');
  });
  it('Sharpshooter ignores half and three-quarters cover', () => {
    const s = pc(['Sharpshooter']);
    expect(passiveRangedCover(s, 'threequarters')).toBe('none');
    expect(passiveRangedCover(s, 'total')).toBe('total');
    expect(passiveHas(s, 'noLongRangePenalty')).toBe(true);
  });
  it('Medium Armor Master lets DEX add +3', () => {
    const s = pc(['Medium Armor Master'], [{ id: 'a', name: 'Breastplate', type: 'armor', quantity: 1, weight: 20, equipped: true, notes: '', armorBase: 14, armorCategory: 'medium' } as InventoryItem]);
    expect(computeArmorClass(s).ac).toBe(17);
  });
  it('Polearm Master adds a d4 Bonus Action strike; Dual Wielder an off-hand non-Light weapon', () => {
    const pole = derivedActions(pc(['Polearm Master'], [W('q', 'Quarterstaff', { damage: '1d6', damageType: 'bludgeoning' })]));
    expect(pole.find((a) => a.id === 'polearm:q')).toMatchObject({ actionType: 'bonus', damage: '1d4+3', damageType: 'bludgeoning' });
    const inv = [W('d', 'Dagger', { damage: '1d4', damageType: 'piercing' }), W('l', 'Longsword')];
    expect(derivedActions(pc([], inv)).some((a) => a.id === 'offhand:l')).toBe(false);
    expect(derivedActions(pc(['Dual Wielder'], inv)).some((a) => a.id === 'offhand:l')).toBe(true);
  });
  it('Defensive Duelist is a reaction, Lucky a pool of PB uses', () => {
    expect(passiveReactions(pc(['Defensive Duelist']))[0].reaction.kind).toBe('parry');
    expect(featFeatureDefs(pc(['Lucky'])).find((d) => d.name.startsWith('Lucky'))?.uses).toEqual({ max: 'prof', recharge: 'long' });
  });
});

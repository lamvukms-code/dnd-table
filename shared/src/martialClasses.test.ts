import { describe, expect, it } from 'vitest';
import { initiativeBonus, skillBonus } from './rules.js';
import { subclassUsesMax } from './classFeatures.js';
import { auraSaveBonusFor, featFeatureDefs, featureRiders, passiveAuraSave, passiveSpeedBonus } from './featurePassives.js';
import { buildFeatureEffect } from './featureActions.js';
import type { CharacterSheet } from './types.js';

const pc = (className: string, level: number): CharacterSheet =>
  ({
    id: 's', name: 'X', className, level, classes: [{ name: className, level }],
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 14, cha: 16 }, proficiencyBonus: level >= 5 ? 3 : 2, initiativeMisc: 0,
    saveProficiencies: [], skillProficiencies: ['persuasion'], skillExpertise: [], feats: [], features: [], inventory: [], actions: [],
  }) as unknown as CharacterSheet;
const def = (s: CharacterSheet, id: string) => featFeatureDefs(s).find((d) => d.id === id);

describe('Fighter / Paladin / Ranger / Bard / Cleric features', () => {
  it('use pools by class-level table and by class formula', () => {
    expect(subclassUsesMax('tbl:fighter:1=2,4=3,10=4', pc('Fighter', 4))).toBe(3);
    expect(subclassUsesMax('tbl:fighter:2=1,17=2', pc('Fighter', 1))).toBe(0);
    expect(subclassUsesMax('paladin:5*lvl', pc('Paladin', 3))).toBe(15);
  });
  it('Second Wind and Action Surge buttons; Lay On Hands pool', () => {
    const f = pc('Fighter', 2);
    expect(def(f, 'fighter-second-wind')?.actions?.[0]).toMatchObject({ kind: 'heal', cost: 'bonus', dice: '1d10+lvl' });
    expect(def(f, 'fighter-second-wind')?.uses?.recharge).toBe('shortOne');
    expect(def(f, 'fighter-action-surge')?.actions?.[0].kind).toBe('surge');
    expect(def(pc('Paladin', 1), 'paladin-lay-on-hands')?.actions?.[0].kind).toBe('poolHeal');
  });
  it('Aura of Protection: CHA to saves of allies in 10 ft (30 ft at 18)', () => {
    expect(passiveAuraSave(pc('Paladin', 5))).toBeNull();
    expect(passiveAuraSave(pc('Paladin', 6))).toMatchObject({ bonus: 3, feet: 10 });
    expect(passiveAuraSave(pc('Paladin', 18))?.feet).toBe(30);
    const pal = { sheet: pc('Paladin', 6), token: { id: 'p', x: 0, y: 0 } };
    const near = { id: 'a', x: 2, y: 0 };
    const far = { id: 'b', x: 5, y: 0 };
    const dist = (a: { x: number }, b: { x: number }) => Math.abs(a.x - b.x) * 5;
    expect(auraSaveBonusFor(near, [pal], dist, () => true)?.bonus).toBe(3);
    expect(auraSaveBonusFor(far, [pal], dist, () => true)).toBeNull();
    expect(auraSaveBonusFor(near, [pal], dist, () => false)).toBeNull();
  });
  it('Radiant Strikes rider, Roving speed', () => {
    expect(featureRiders(pc('Paladin', 11)).some((r) => r.label === 'Radiant Strikes' && r.dice === '1d8')).toBe(true);
    expect(passiveSpeedBonus(pc('Ranger', 6)).bonus).toBe(10);
  });
  it('Jack of All Trades: half PB on non-proficient skills and Initiative', () => {
    const b = pc('Bard', 5);
    expect(skillBonus(b, 'athletics')).toBe(3 + 1);
    expect(skillBonus(b, 'persuasion')).toBe(3 + 3);
    expect(initiativeBonus(b)).toBe(2 + 1);
  });
  it('Bardic Inspiration note shows the die for the level', () => {
    const b = pc('Bard', 5);
    const a = def(b, 'bard-inspiration')!.actions![0];
    expect(buildFeatureEffect(a, b, 'bard', 1, 'Bardic Inspiration')?.note).toMatch(/1d8/);
  });
});

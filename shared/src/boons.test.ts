import { describe, expect, it } from 'vitest';
import { passiveFreeCast, featFeatureDefs } from './featurePassives.js';
import { applyToughFeat } from './levelUp.js';
import { emptyDefenses } from './types.js';
import { resolveDamageParts, skillBonus } from './rules.js';
import type { CharacterSheet } from './types.js';

const pc = (feats: string[], features: string[] = []): CharacterSheet =>
  ({
    id: 's', name: 'X', className: 'Warlock', level: 19, classes: [{ name: 'Warlock', level: 19 }],
    abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 20 }, proficiencyBonus: 6, initiativeMisc: 0,
    currentHp: 100, maxHp: 150, saveProficiencies: [], skillProficiencies: [], skillExpertise: [], inventory: [], actions: [],
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
    features: features.map((name, i) => ({ id: `x${i}`, name, source: 'Eldritch Invocation', description: '' })),
  }) as unknown as CharacterSheet;

describe('invocation free casts and Epic Boons', () => {
  it('free casts: at will or once per long rest', () => {
    expect(passiveFreeCast(pc([], ['Mask of Many Faces']), 'Disguise Self')).toBe('atWill');
    expect(passiveFreeCast(pc([], ['Gift of the Depths']), 'water breathing')).toBe('daily');
    expect(passiveFreeCast(pc([]), 'Disguise Self')).toBeNull();
  });
  it('Boon of Fortitude: +40 max HP once, kept in step', () => {
    const s = applyToughFeat(pc(['Boon of Fortitude']));
    expect(s.maxHp).toBe(190);
    expect(s.currentHp).toBe(140);
    expect(applyToughFeat(s).maxHp).toBe(190);
    expect(applyToughFeat({ ...s, feats: [] }).maxHp).toBe(150);
  });
  it('Boon of Skill: proficient in every skill', () => {
    expect(skillBonus(pc(['Boon of Skill']), 'athletics')).toBe(0 + 6);
  });
  it('Irresistible Offense parts ignore resistance', () => {
    const def = { ...emptyDefenses(), resistances: ['slashing'] };
    expect(resolveDamageParts([{ part: { dice: '10', type: 'slashing' }, raw: 10 }], def).totalFinal).toBe(5);
    expect(resolveDamageParts([{ part: { dice: '10', type: 'slashing', ignoreResist: true }, raw: 10 }], def).totalFinal).toBe(10);
  });
  it('Boon of Recovery: a pool of 10 d10 behind a button', () => {
    const d = featFeatureDefs(pc(['Boon of Recovery'])).find((x) => x.name.startsWith('Boon of Recovery'));
    expect(d?.uses).toEqual({ max: 10, recharge: 'long' });
    expect(d?.actions?.[0]).toMatchObject({ kind: 'poolHeal', poolDie: 'd10' });
  });
});

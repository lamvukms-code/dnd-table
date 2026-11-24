import { describe, expect, it } from 'vitest';
import { resolveFeatureAttack, resolveFeatureDc, resolveFeatureFormula } from './featureActions.js';
import type { CharacterSheet } from './types.js';

const sh = { className: 'Fighter', level: 7, classes: undefined, proficiencyBonus: 3,
  abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 13, cha: 10 } } as unknown as CharacterSheet;

describe('feature formulas', () => {
  it('substitutes pb / lvl / mods and folds constants', () => {
    expect(resolveFeatureFormula('1d6+mod:str', sh)).toBe('1d6+3');
    expect(resolveFeatureFormula('2*mod:con', sh)).toBe('4');
    expect(resolveFeatureFormula('2*lvl', sh, 'fighter')).toBe('14');
    expect(resolveFeatureFormula('1d8+mod:int', sh)).toBe('1d8-1');
    expect(resolveFeatureFormula('1d6+pb+mod:wis', sh)).toBe('1d6+4');
    expect(resolveFeatureFormula('lvl d4', sh)).toBe('7d4');
  });
  it('DCs and attack bonuses', () => {
    expect(resolveFeatureDc('dc:con', sh)).toBe(13);
    expect(resolveFeatureDc('dc:int|con', sh)).toBe(13);
    expect(resolveFeatureDc(15, sh)).toBe(15);
    expect(resolveFeatureAttack('str', sh)).toBe(6);
    expect(resolveFeatureAttack('finesse', sh)).toBe(6);
  });
});

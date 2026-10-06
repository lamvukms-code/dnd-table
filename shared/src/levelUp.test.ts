import { describe, expect, it } from 'vitest';
import { applyToughFeat, bumpLevel, hasToughFeat, levelUpDie, levelUpHp, needsPityReroll } from './levelUp.js';
import { blankSheetForTests } from './visibility.testutil.js';

const monk = () => ({ ...blankSheetForTests('o', 'M'), className: 'Monk', level: 4, maxHp: 34, currentHp: 30 });

describe('level-up HP', () => {
  it('rolls hit die + CON mod, min 1', () => {
    expect(levelUpHp(8, 14, 5)).toMatchObject({ used: 5, conMod: 2, gain: 7 });
    expect(levelUpHp(6, 6, 3).gain).toBe(1); // 3 + (-2) = 1
    expect(levelUpHp(6, 4, 2).gain).toBe(1); // 2 + (-3) → floor 1
  });
  it('pity: a first roll of 1 is replaced by the second, even when lower', () => {
    expect(needsPityReroll(1)).toBe(true);
    expect(needsPityReroll(2)).toBe(false);
    expect(levelUpHp(8, 14, 1, 6)).toMatchObject({ first: 1, second: 6, used: 6, gain: 8 });
    expect(levelUpHp(8, 14, 1, 1)).toMatchObject({ used: 1, gain: 3 }); // second also 1 → stays 1
    expect(levelUpHp(8, 14, 4, 8)).toMatchObject({ used: 4, second: undefined }); // no pity unless first was 1
  });
  it('finds the hit die of the leveling class', () => {
    expect(levelUpDie(monk())).toBe(8);
    expect(levelUpDie({ ...monk(), className: '' })).toBeNull();
    const mc = { ...monk(), classes: [{ name: 'Monk', level: 3 }, { name: 'Wizard', level: 1 }] };
    expect(levelUpDie(mc, 1)).toBe(6);
  });
  it('bumps single-class level or the chosen multiclass entry', () => {
    expect(bumpLevel(monk()).level).toBe(5);
    const mc = { ...monk(), classes: [{ name: 'Monk', level: 3 }, { name: 'Wizard', level: 1 }] };
    expect(bumpLevel(mc, 1).classes).toEqual([{ name: 'Monk', level: 3 }, { name: 'Wizard', level: 2 }]);
  });
});

describe('Tough feat', () => {
  const tough = (s: ReturnType<typeof monk>) => ({ ...s, feats: [{ id: 'f', name: 'Tough', description: '' }] });
  it('grants +2 HP per level retroactively, once', () => {
    expect(hasToughFeat(tough(monk()))).toBe(true);
    const a = applyToughFeat(tough(monk())); // level 4 → +8
    expect(a).toMatchObject({ maxHp: 42, currentHp: 38, toughBonus: 8 });
    expect(applyToughFeat(a)).toBe(a); // idempotent
  });
  it('adds another +2 on each level gained', () => {
    const a = applyToughFeat(tough(monk()));
    const b = applyToughFeat({ ...a, level: 5 });
    expect(b).toMatchObject({ maxHp: 44, toughBonus: 10 });
  });
  it('removes the bonus when the feat is dropped', () => {
    const a = applyToughFeat(tough(monk()));
    const b = applyToughFeat({ ...a, feats: [] });
    expect(b.maxHp).toBe(34);
    expect(b.currentHp).toBeLessThanOrEqual(34);
    expect(b.toughBonus).toBeUndefined();
  });
  it('ignores sheets without the feat', () => {
    const m = monk();
    expect(applyToughFeat(m)).toBe(m);
  });
});

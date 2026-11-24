import { describe, expect, it } from 'vitest';
import { afterShots, canFire, fanFireShots, firearmLoaded, firearmSaveDc, reloadCosts, reloaded, stepUpDie } from './firearms.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const pistol = { firearm: { barrel: 6, reload: 'slow' } } as Pick<InventoryItem, 'firearm'>;
const sh = { proficiencyBonus: 3, abilities: { str: 14, dex: 18, con: 12, int: 10, wis: 10, cha: 10 } } as unknown as CharacterSheet;

describe('firearms', () => {
  it('starts full, spends shots, blocks when empty or jammed', () => {
    expect(firearmLoaded(pistol)).toBe(6);
    let g = afterShots(pistol, 5);
    expect(firearmLoaded(g)).toBe(1);
    expect(canFire(g).ok).toBe(true);
    expect(canFire(g, 2).ok).toBe(false);
    g = afterShots(g);
    expect(canFire(g)).toEqual({ ok: false, reason: 'Hết đạn trong nòng: phải nạp đạn.' });
    expect(firearmLoaded(reloaded(g))).toBe(6);
    expect(canFire({ firearm: { barrel: 1, reload: 'fast', jammed: true } }).ok).toBe(false);
    expect(canFire({}).ok).toBe(true);
  });
  it('reload costs, save DC, fan fire, twinned die', () => {
    expect(reloadCosts({ firearm: { barrel: 1, reload: 'fast' } })).toEqual(['bonus', 'action']);
    expect(reloadCosts(pistol)).toEqual(['action']);
    expect(firearmSaveDc(sh, pistol)).toBe(15);
    expect(firearmSaveDc(sh, { firearm: { barrel: 1, reload: 'artillery' } })).toBe(13);
    expect(fanFireShots(sh, pistol)).toBe(4);
    expect(fanFireShots(sh, afterShots(pistol, 5))).toBe(1);
    expect(stepUpDie('1d10')).toBe('1d12');
    expect(stepUpDie('2d4')).toBe('2d6');
    expect(stepUpDie('1d12')).toBe('1d12');
  });
});

import { describe, expect, it } from 'vitest';
import { onDamageWhileDown, onDrop, rollDeathSave, rollsDeathSaves } from './deathSaves.js';

describe('death saves', () => {
  it('dropping to 0: fresh tally, massive damage kills outright', () => {
    expect(onDrop(5, 30)).toEqual({ success: 0, fail: 0 });
    expect(onDrop(30, 30).dead).toBe(true);
  });
  it('rolls: 10+ success, under 10 fail, 1 = two fails, 20 = revive', () => {
    expect(rollDeathSave(undefined, 10).ds).toMatchObject({ success: 1, fail: 0 });
    expect(rollDeathSave(undefined, 9).ds).toMatchObject({ success: 0, fail: 1 });
    expect(rollDeathSave(undefined, 1).ds.fail).toBe(2);
    expect(rollDeathSave({ success: 2, fail: 2 }, 20).outcome).toBe('revive');
    expect(rollDeathSave({ success: 2, fail: 0 }, 15).ds.stable).toBe(true);
    expect(rollDeathSave({ success: 0, fail: 2 }, 3).ds.dead).toBe(true);
    expect(rollDeathSave(undefined, 8, 2).outcome).toBe('success'); // Bless-style bonus
  });
  it('damage while down: one fail, two on a crit, max HP kills, breaks stability', () => {
    expect(onDamageWhileDown({ success: 1, fail: 0, stable: true }, 3, 30, false)).toMatchObject({ fail: 1, stable: false });
    expect(onDamageWhileDown(undefined, 3, 30, true).fail).toBe(2);
    expect(onDamageWhileDown({ success: 0, fail: 2 }, 1, 30, false).dead).toBe(true);
    expect(onDamageWhileDown(undefined, 30, 30, false).dead).toBe(true);
  });
  it('who rolls', () => {
    expect(rollsDeathSaves(0, undefined)).toBe(true);
    expect(rollsDeathSaves(0, { success: 3, fail: 0, stable: true })).toBe(false);
    expect(rollsDeathSaves(5, undefined)).toBe(false);
  });
});

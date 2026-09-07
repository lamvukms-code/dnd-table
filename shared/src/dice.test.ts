import { describe, expect, it } from 'vitest';
import { d20Check, resolveAttack, rollNotation, type Rng } from './dice.js';

/** Deterministic RNG cycling through given [0,1) values. */
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollNotation', () => {
  it('rolls a flat modifier only', () => {
    expect(rollNotation('5').total).toBe(5);
  });

  it('rolls NdM + mod', () => {
    // 0.0 -> 1, so 2d6 => 1 + 1, + 3 => 5
    const r = rollNotation('2d6+3', seq([0, 0]));
    expect(r.total).toBe(5);
    expect(r.terms[0].rolls).toHaveLength(2);
  });

  it('keeps highest with kh (advantage)', () => {
    // rolls 1 (0.0) then 20 (0.9999)
    const r = rollNotation('2d20kh1', seq([0, 0.9999]));
    expect(r.total).toBe(20);
    expect(r.d20?.natural).toBe(20);
    expect(r.d20?.isCrit).toBe(true);
  });

  it('keeps lowest with kl (disadvantage)', () => {
    const r = rollNotation('2d20kl1', seq([0.9999, 0]));
    expect(r.total).toBe(1);
    expect(r.d20?.isFumble).toBe(true);
  });

  it('handles multiple dice terms', () => {
    const r = rollNotation('1d8+1d6+2', seq([0, 0]));
    expect(r.total).toBe(1 + 1 + 2);
  });

  it('supports subtraction', () => {
    const r = rollNotation('1d20-1', seq([0.5]));
    expect(r.total).toBe(11 - 1);
  });

  it('rejects garbage', () => {
    expect(() => rollNotation('abc')).toThrow();
  });
});

describe('d20Check', () => {
  it('builds notation per mode', () => {
    expect(d20Check(5)).toBe('1d20+5');
    expect(d20Check(-1)).toBe('1d20-1');
    expect(d20Check(3, 'advantage')).toBe('2d20kh1+3');
    expect(d20Check(0, 'disadvantage')).toBe('2d20kl1');
  });
});

describe('resolveAttack', () => {
  it('hits when total >= AC', () => {
    const roll = rollNotation('1d20+7', seq([0.5])); // 11 + 7 = 18
    expect(resolveAttack(roll, 15).hit).toBe(true);
  });

  it('nat 20 always crits and hits', () => {
    const roll = rollNotation('1d20+0', seq([0.9999]));
    const res = resolveAttack(roll, 99);
    expect(res.hit).toBe(true);
    expect(res.crit).toBe(true);
  });

  it('nat 1 always misses', () => {
    const roll = rollNotation('1d20+20', seq([0]));
    expect(resolveAttack(roll, 5).hit).toBe(false);
  });
});

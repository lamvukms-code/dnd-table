import { describe, expect, it } from 'vitest';
import {
  d20Check,
  describeNotation,
  doubleDiceCounts,
  externalRollResult,
  homebrewCritDamage,
  normalizeNotation,
  resolveAttack,
  rollNotation,
  rollStats,
  type Rng,
} from './dice.js';

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

describe('normalizeNotation', () => {
  it('strips spaces and fixes implied 1', () => {
    expect(normalizeNotation('2d6 + 8')).toBe('2d6+8');
    expect(normalizeNotation('  D20 ')).toBe('1d20');
    expect(normalizeNotation('1d8 + d4')).toBe('1d8+1d4');
    expect(normalizeNotation('2d6 – 1')).toBe('2d6-1');
  });
  it('rolls a "2d6 + 8" style formula the player typed', () => {
    const r = rollNotation('2d6 + 8', () => 0);
    expect(r.total).toBe(1 + 1 + 8);
  });
});

describe('rollStats / describeNotation', () => {
  it('computes min/max/average for 2d6+8', () => {
    expect(rollStats('2d6+8')).toEqual({ min: 10, max: 20, average: 15 });
  });
  it('averages advantage above 10.5', () => {
    const s = rollStats('2d20kh1');
    expect(s.min).toBe(1);
    expect(s.max).toBe(20);
    expect(s.average).toBeGreaterThan(13);
  });
  it('describeNotation flags invalid input', () => {
    const bad = describeNotation('greatsword');
    expect(bad.valid).toBe(false);
    const good = describeNotation('2d6+8');
    expect(good).toMatchObject({ valid: true, canonical: '2d6+8', min: 10, max: 20 });
  });
});

describe('doubleDiceCounts', () => {
  it('doubles dice, leaves flat modifiers', () => {
    expect(doubleDiceCounts('1d8+3')).toBe('2d8+3');
    expect(doubleDiceCounts('2d6+1d4+2')).toBe('4d6+2d4+2');
    expect(doubleDiceCounts('d10')).toBe('2d10');
  });
});

describe('homebrewCritDamage', () => {
  it('maxes original dice, adds one extra die per source (rogue example)', () => {
    // dagger 1d4 + sneak attack 2d6 + STR/DEX +4
    expect(homebrewCritDamage('1d4+2d6+4')).toBe('1d4+1d6+20');
  });
  it('single source', () => {
    expect(homebrewCritDamage('1d8+3')).toBe('1d8+11'); // 8 maxed + 3 mod
  });
  it('no flat modifier', () => {
    expect(homebrewCritDamage('3d6')).toBe('1d6+18');
  });
});

describe('externalRollResult', () => {
  it('wraps dddice-style values into a RollResult', () => {
    const r = externalRollResult('1d20+5', { total: 23, faces: [18], d20Natural: 18 });
    expect(r.total).toBe(23);
    expect(r.d20).toEqual({ natural: 18, isCrit: false, isFumble: false });
  });

  it('flags a natural 20 from an external roll', () => {
    const r = externalRollResult('1d20', { total: 20, faces: [20], d20Natural: 20 });
    expect(r.d20?.isCrit).toBe(true);
    expect(resolveAttack(r, 25).hit).toBe(true);
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

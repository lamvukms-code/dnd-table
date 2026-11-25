import { describe, expect, it } from 'vitest';
import { rangeBand, weaponRangePair } from './rules.js';

describe('weapon range bands', () => {
  it('reads normal/long from range text', () => {
    expect(weaponRangePair('80/320 ft')).toEqual({ normal: 80, long: 320 });
    expect(weaponRangePair('Ranged Weapon Attack: +5 to hit, range 30/120 ft.')).toEqual({ normal: 30, long: 120 });
    expect(weaponRangePair('120 ft')).toBeNull();
  });
  it('normal / long (disadvantage) / out, with a range multiplier', () => {
    expect(rangeBand('80/320 ft', 60)).toBe('normal');
    expect(rangeBand('80/320 ft', 85)).toBe('long');
    expect(rangeBand('80/320 ft', 325)).toBe('out');
    expect(rangeBand('80/320 ft', 150, 2)).toBe('normal');
    expect(rangeBand('80/320 ft', 600, 2)).toBe('long');
    expect(rangeBand(undefined, 600)).toBeNull();
  });
});

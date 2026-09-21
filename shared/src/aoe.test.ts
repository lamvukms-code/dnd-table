import { describe, expect, it } from 'vitest';
import { aoeTokenIds, parseArea, type AoeToken } from './aoe.js';

const tok = (id: string, x: number, y: number, span = 1): AoeToken => ({ id, x, y, span });

describe('parseArea', () => {
  it('reads English stat block text', () => {
    expect(parseArea('each creature in a 30-foot Cone. Failure: 21')).toEqual({ shape: 'cone', size: 30 });
    expect(parseArea('a 20-foot Emanation originating from the elemental')).toEqual({ shape: 'emanation', size: 20 });
    expect(parseArea('each creature in a 20-foot-radius Sphere')).toEqual({ shape: 'sphere', size: 20 });
    expect(parseArea('a 60-foot Line that is 10 feet wide')).toEqual({ shape: 'line', size: 60, width: 10 });
  });
  it('reads the Vietnamese spell-DB labels', () => {
    expect(parseArea('cầu 20ft')).toEqual({ shape: 'sphere', size: 20 });
    expect(parseArea('nón 15ft')).toEqual({ shape: 'cone', size: 15 });
    expect(parseArea('tia dài 100ft, rộng 5ft')).toEqual({ shape: 'line', size: 100, width: 5 });
    expect(parseArea('toả 15ft')).toEqual({ shape: 'emanation', size: 15 });
    expect(parseArea('nhiều mục tiêu trong tầm')).toBeNull();
  });
});

describe('aoeTokenIds', () => {
  const caster = tok('c', 10, 10);
  const east = { x: 20, y: 10.5 };
  const origin = { x: 10.5, y: 10.5 };
  it('30-ft cone east catches targets ahead, not behind or off to the side', () => {
    const t = [caster, tok('ahead', 13, 10), tok('far', 18, 10), tok('behind', 8, 10), tok('side', 12, 15)];
    const ids = aoeTokenIds({ shape: 'cone', size: 30 }, 'self', origin, east, t, 'c');
    expect(ids).toContain('ahead');
    expect(ids).not.toContain('far');
    expect(ids).not.toContain('behind');
    expect(ids).not.toContain('side');
    expect(ids).not.toContain('c');
  });
  it('sphere catches tokens within its radius of the point', () => {
    const t = [tok('in', 20, 20), tok('out', 26, 20)];
    const ids = aoeTokenIds({ shape: 'sphere', size: 20 }, 'point', { x: 20.5, y: 20.5 }, { x: 20.5, y: 20.5 }, t);
    expect(ids).toEqual(['in']);
  });
  it('line only catches the row it runs through', () => {
    const t = [caster, tok('on', 14, 10), tok('off', 14, 12)];
    const ids = aoeTokenIds({ shape: 'line', size: 60, width: 5 }, 'self', origin, east, t, 'c');
    expect(ids).toEqual(['on']);
  });
  it('emanation excludes the source and reaches n cells out', () => {
    const t = [caster, tok('near', 13, 10), tok('far', 15, 10)];
    const ids = aoeTokenIds({ shape: 'emanation', size: 15 }, 'self', origin, origin, t, 'c');
    expect(ids).toEqual(['near']);
  });
});

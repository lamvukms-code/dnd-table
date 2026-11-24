import { describe, expect, it } from 'vitest';
import { jsonEqual, mergeSheetEdit } from './sheetMerge.js';
import type { CharacterSheet } from './types.js';

const s = (over: Partial<CharacterSheet>) => ({ id: 's', name: 'A', currentHp: 30, ...over }) as CharacterSheet;

describe('mergeSheetEdit', () => {
  it('keeps server changes on fields the client did not touch', () => {
    const base = s({ currentHp: 30, sneakAttackArmed: true, notes: '' });
    const server = s({ currentHp: 20, sneakAttackArmed: false, notes: '' }); // hit for 10, rider spent
    const incoming = { ...base, notes: 'ghi chú' }; // player typed a note on a stale draft
    expect(mergeSheetEdit(server, base, incoming)).toMatchObject({ currentHp: 20, sneakAttackArmed: false, notes: 'ghi chú' });
  });

  it('applies fields the client changed, including clearing one', () => {
    const base = s({ currentHp: 30, boomingBladeArmed: true });
    const server = s({ currentHp: 20, boomingBladeArmed: true });
    const merged = mergeSheetEdit(server, base, { ...base, currentHp: 25, boomingBladeArmed: undefined });
    expect(merged.currentHp).toBe(25);
    expect('boomingBladeArmed' in merged).toBe(false);
  });

  it('compares nested values structurally', () => {
    expect(jsonEqual({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});

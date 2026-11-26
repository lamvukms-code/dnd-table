import { describe, expect, it } from 'vitest';
import {
  actionAvailable,
  actionLimit,
  failCondition,
  parseMultiattack,
  parseUpcast,
  rechargeSucceeds,
  scaleDice,
  upcastDamagePart,
} from './monsterActions.js';
import type { SheetAction } from './types.js';

const act = (id: string, name: string, attackBonus?: number): SheetAction => ({ id, name, actionType: 'action', attackBonus, damage: '1d6', source: 'manual' }) as SheetAction;

describe('actionLimit', () => {
  it('reads Recharge and X/Day from the name', () => {
    expect(actionLimit({ name: 'Frost Breath (Recharge 5-6)' })).toEqual({ kind: 'recharge', min: 5 });
    expect(actionLimit({ name: 'Fire Breath (Recharge 5–6)' })).toEqual({ kind: 'recharge', min: 5 });
    expect(actionLimit({ name: 'Bite (Recharge 6)' })).toEqual({ kind: 'recharge', min: 6 });
    expect(actionLimit({ name: 'Hexed Lantern (1/Day)' })).toEqual({ kind: 'perDay', max: 1 });
    expect(actionLimit({ name: 'Teleport (3/Day each)' })).toEqual({ kind: 'perDay', max: 3 });
    expect(actionLimit({ name: 'Claw' })).toBeNull();
  });
  it('tracks availability and recharge rolls', () => {
    const r = actionLimit({ name: 'Breath (Recharge 5-6)' })!;
    expect(actionAvailable(r, 0)).toBe(true);
    expect(actionAvailable(r, 1)).toBe(false);
    expect(rechargeSucceeds(r, 4)).toBe(false);
    expect(rechargeSucceeds(r, 5)).toBe(true);
    const d = actionLimit({ name: 'X (2/Day)' })!;
    expect(actionAvailable(d, 1)).toBe(true);
    expect(actionAvailable(d, 2)).toBe(false);
  });
});

describe('parseMultiattack', () => {
  const actions = [act('m', 'Multiattack'), act('c', 'Claws', 5), act('t', 'Tusks', 5), act('b', 'Frost Breath (Recharge 5-6)')];
  it('reads named attacks with counts', () => {
    expect(parseMultiattack('The alpengrendel makes one Claws attack and one Tusks attack.', actions)).toEqual([
      { actionId: 'c', name: 'Claws', count: 1 },
      { actionId: 't', name: 'Tusks', count: 1 },
    ]);
    expect(parseMultiattack('The elemental makes two Hexed Slam attacks.', [act('h', 'Hexed Slam', 6)])).toEqual([
      { actionId: 'h', name: 'Hexed Slam', count: 2 },
    ]);
  });
  it('prefers the longest matching name', () => {
    const a = [act('cc', 'Rending Claw', 7), act('cl', 'Claw', 5)];
    expect(parseMultiattack('The ghoul lord makes two Rending Claw attacks, and it can replace one attack with a use of Grab.', a)).toEqual([
      { actionId: 'cc', name: 'Rending Claw', count: 2 },
    ]);
  });
  it('falls back for "makes two attacks, using X or Y"', () => {
    const a = [act('cl', 'Claw', 5), act('pe', 'Acid Spit', 5)];
    expect(parseMultiattack('The swamp lurker makes two attacks, using Claw or Acid Spit in any combination.', a)).toEqual([
      { actionId: 'cl', name: 'Claw', count: 2 },
    ]);
  });
  it('returns nothing it cannot resolve', () => {
    expect(parseMultiattack('The hag uses Spellcasting.', actions)).toEqual([]);
  });
});

describe('failCondition', () => {
  it('2024 Failure: text', () => {
    expect(failCondition('Dexterity Saving Throw: DC 15. Failure: 10 (3d6) Cold damage, and the target has the Restrained condition. Success: Half damage.')).toBe('restrained');
  });
  it('2014 "or be" text', () => {
    expect(failCondition('must succeed on a DC 13 Strength saving throw or be knocked prone.')).toBe('prone');
    expect(failCondition('must succeed on a DC 12 Constitution saving throw or be poisoned for 1 minute.')).toBe('poisoned');
  });
  it('nothing when no condition', () => {
    expect(failCondition('Failure: 22 (4d10) Fire damage. Success: Half damage.')).toBeUndefined();
  });
});

describe('upcast', () => {
  it('parses the guidance', () => {
    expect(parseUpcast('Nón 15ft, save DEX, 3d6 lửa. Nâng ô: +1d6.')).toBe('1d6');
    expect(parseUpcast('3 tia 1d4+1. Nâng ô: +1 tia (+1d4+1). Chia tia…')).toBe('1d4+1');
    expect(parseUpcast('Hồi 2d4. Nâng ô: +2d4 mỗi cấp — sửa tay.')).toBe('2d4');
    expect(parseUpcast('Không sát thương.')).toBeUndefined();
  });
  it('scales dice', () => {
    expect(scaleDice('1d6', 2)).toBe('2d6');
    expect(scaleDice('1d4+1', 3)).toBe('3d4+3');
    expect(scaleDice('2d8', 0)).toBe('');
  });
  it('builds the extra part only when upcast', () => {
    expect(upcastDamagePart('1d6', 3, 5, 'fire')).toEqual({ dice: '2d6', type: 'fire', label: 'Nâng ô +2' });
    expect(upcastDamagePart('1d6', 3, 3, 'fire')).toBeUndefined();
    expect(upcastDamagePart('1d6', 0, 5, 'fire')).toBeUndefined();
  });
});

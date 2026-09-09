import { describe, expect, it } from 'vitest';
import { emptyCurrency } from './rules.js';
import {
  cantripTier,
  cantripsForSheet,
  findCantrip,
  rescaleCantripSpell,
  scaleCantripDie,
  spellFromCantrip,
  SRD_CANTRIPS,
} from './cantrips.js';
import type { CharacterSheet } from './types.js';

function sheet(patch: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 's1',
    ownerId: 'p1',
    name: 'Test',
    className: 'Wizard',
    level: 1,
    proficiencyBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 12, cha: 10 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 8,
    currentHp: 8,
    tempHp: 0,
    armorClass: 10,
    acOverride: null,
    speed: 30,
    initiativeMisc: 0,
    actions: [],
    damageRiders: [],
    spells: [],
    resources: [],
    spellSlots: [],
    feats: [],
    features: [],
    inventory: [],
    currency: emptyCurrency(),
    notes: '',
    ...patch,
  };
}

describe('cantrip scaling', () => {
  it('tiers at 1 / 5 / 11 / 17', () => {
    expect(cantripTier(1)).toBe(1);
    expect(cantripTier(4)).toBe(1);
    expect(cantripTier(5)).toBe(2);
    expect(cantripTier(11)).toBe(3);
    expect(cantripTier(17)).toBe(4);
  });
  it('multiplies the die count', () => {
    expect(scaleCantripDie('1d10', 1)).toBe('1d10');
    expect(scaleCantripDie('1d10', 5)).toBe('2d10');
    expect(scaleCantripDie('1d8', 11)).toBe('3d8');
    expect(scaleCantripDie('2d6', 17)).toBe('8d6');
  });
});

describe('spellFromCantrip', () => {
  it('builds an attack cantrip with scaled damage', () => {
    const s = sheet({ className: 'Wizard', level: 11 });
    const sp = spellFromCantrip(findCantrip('Fire Bolt')!, s, 'x1');
    expect(sp.level).toBe(0);
    expect(sp.castKind).toBe('attack');
    expect(sp.damage).toEqual([{ dice: '3d10', type: 'fire', label: 'Fire Bolt' }]);
    expect(sp.notes).toBeTruthy();
  });

  it('builds a save cantrip with the save ability and fail damage', () => {
    const s = sheet({ className: 'Cleric', level: 5 });
    const sp = spellFromCantrip(findCantrip('Sacred Flame')!, s, 'x2');
    expect(sp.castKind).toBe('save');
    expect(sp.save).toEqual({ ability: 'dex' });
    expect(sp.damage).toEqual([{ dice: '2d8', type: 'radiant', label: 'Sacred Flame' }]);
  });

  it('utility cantrips carry guidance but no damage', () => {
    const sp = spellFromCantrip(findCantrip('Mage Hand')!, sheet(), 'x3');
    expect(sp.castKind).toBe('utility');
    expect(sp.damage).toBeUndefined();
  });

  it('Guidance is semi-auto: a check roll-bonus effect on its target', () => {
    const sp = spellFromCantrip(findCantrip('Guidance')!, sheet(), 'x4');
    expect(sp.castKind).toBe('utility');
    expect(sp.concentration).toBe(true);
    expect(sp.effect?.rollBonus).toEqual({ dice: '1d4', scope: 'check' });
  });
});

describe('cantripsForSheet', () => {
  it('splits by the class spell list', () => {
    const { own, others } = cantripsForSheet(sheet({ className: 'Wizard', level: 1 }));
    expect(own.some((c) => c.name === 'Fire Bolt')).toBe(true);
    expect(own.some((c) => c.name === 'Eldritch Blast')).toBe(false);
    expect(others.some((c) => c.name === 'Eldritch Blast')).toBe(true);
  });
});

describe('rescaleCantripSpell', () => {
  it('re-scales a known cantrip to the current level, else null', () => {
    const s = sheet({ className: 'Warlock', level: 17 });
    const sp = spellFromCantrip(findCantrip('Eldritch Blast')!, sheet({ className: 'Warlock', level: 1 }), 'x4');
    expect(sp.damage![0].dice).toBe('1d10');
    expect(rescaleCantripSpell(sp, s)).toEqual({
      damage: [{ dice: '4d10', type: 'force', label: 'Eldritch Blast' }],
    });
    expect(rescaleCantripSpell({ ...sp, name: 'Guidance' }, s)).toBeNull();
  });
});

it('every cantrip has unique id and non-empty guidance', () => {
  const ids = new Set(SRD_CANTRIPS.map((c) => c.id));
  expect(ids.size).toBe(SRD_CANTRIPS.length);
  expect(SRD_CANTRIPS.every((c) => c.guidance.length > 10)).toBe(true);
});

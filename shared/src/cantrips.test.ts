import { describe, expect, it } from 'vitest';
import { emptyCurrency } from './rules.js';
import {
  cantripTier,
  cantripsForSheet,
  findCantrip,
  l1SpellsForSheet,
  l2SpellsForSheet,
  rescaleCantripSpell,
  scaleCantripDie,
  spellFromCantrip,
  SRD_CANTRIPS,
  SRD_L1_SPELLS,
  SRD_L2_SPELLS,
  SRD_SPELLS,
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

describe('level-1 spells', () => {
  it('Healing Word builds a heal spell (mod added at cast time, not here)', () => {
    const sp = spellFromCantrip(findCantrip('Healing Word')!, sheet({ className: 'Cleric', level: 5 }), 'h');
    expect(sp.level).toBe(1);
    expect(sp.castKind).toBe('heal');
    expect(sp.heal).toBe('2d4');
    expect(sp.actionType).toBe('bonus');
    expect(sp.damage).toBeUndefined();
  });

  it('Magic Missile is auto-hit damage with fixed dice', () => {
    const sp = spellFromCantrip(findCantrip('Magic Missile')!, sheet(), 'm');
    expect(sp.castKind).toBe('damage');
    expect(sp.damage).toEqual([{ dice: '3d4+3', type: 'force', label: 'Magic Missile' }]);
  });

  it('Burning Hands is a half-on-save AoE with fixed damage', () => {
    const sp = spellFromCantrip(findCantrip('Burning Hands')!, sheet(), 'b');
    expect(sp.save).toEqual({ ability: 'dex', halfOnSave: true });
    expect(sp.damage).toEqual([{ dice: '3d6', type: 'fire', label: 'Burning Hands' }]);
  });

  it('l1SpellsForSheet splits by class list', () => {
    const { own, others } = l1SpellsForSheet(sheet({ className: 'Cleric', level: 3 }));
    expect(own.some((c) => c.name === 'Healing Word')).toBe(true);
    expect(own.some((c) => c.name === 'Burning Hands')).toBe(false);
    expect(others.some((c) => c.name === 'Burning Hands')).toBe(true);
  });

  it('every L1 spell has a unique id and guidance', () => {
    const ids = new Set(SRD_L1_SPELLS.map((c) => c.id));
    expect(ids.size).toBe(SRD_L1_SPELLS.length);
    expect(SRD_L1_SPELLS.every((c) => c.level === 1 && c.guidance.length > 10)).toBe(true);
  });

  it('rider spells (Hex, Hunter\'s Mark) carry a rider', () => {
    const hex = spellFromCantrip(findCantrip('Hex')!, sheet({ className: 'Warlock' }), 'hx');
    expect(hex.castKind).toBe('rider');
    expect(hex.rider).toEqual({ dice: '1d6', type: 'necrotic' });
    expect(hex.concentration).toBe(true);
  });
});

describe('level-2 spells', () => {
  it('every SRD spell def has a unique id, and levels 0/1/2 are all present', () => {
    const ids = new Set(SRD_SPELLS.map((c) => c.id));
    expect(ids.size).toBe(SRD_SPELLS.length);
    expect(SRD_SPELLS.every((c) => c.guidance.length > 10)).toBe(true);
    expect(new Set(SRD_SPELLS.map((c) => c.level ?? 0))).toEqual(new Set([0, 1, 2]));
    expect(SRD_L2_SPELLS.every((c) => c.level === 2)).toBe(true);
  });

  it('Hold Person: WIS save, Paralyzed, concentration, no damage', () => {
    const sp = spellFromCantrip(findCantrip('Hold Person')!, sheet({ className: 'Cleric', level: 5 }), 'hp');
    expect(sp.level).toBe(2);
    expect(sp.save).toEqual({ ability: 'wis', halfOnSave: undefined });
    expect(sp.effect?.condition).toBe('paralyzed');
    expect(sp.concentration).toBe(true);
    expect(sp.damage).toBeUndefined();
  });

  it('Scorching Ray: attack, 6d6 fire', () => {
    const sp = spellFromCantrip(findCantrip('Scorching Ray')!, sheet(), 'sr');
    expect(sp.castKind).toBe('attack');
    expect(sp.damage).toEqual([{ dice: '6d6', type: 'fire', label: 'Scorching Ray' }]);
  });

  it('Spiritual Weapon bakes the casting modifier into the damage', () => {
    const s = sheet({ className: 'Cleric', level: 5, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 18, cha: 10 } });
    const sp = spellFromCantrip(findCantrip('Spiritual Weapon')!, s, 'sw');
    expect(sp.damage).toEqual([{ dice: '1d8+4', type: 'force', label: 'Spiritual Weapon' }]);
    expect(sp.actionType).toBe('bonus');
  });

  it('Moonbeam: half-on-save concentration AoE', () => {
    const sp = spellFromCantrip(findCantrip('Moonbeam')!, sheet(), 'mb');
    expect(sp.save).toEqual({ ability: 'con', halfOnSave: true });
    expect(sp.concentration).toBe(true);
    expect(sp.damage).toEqual([{ dice: '2d10', type: 'radiant', label: 'Moonbeam' }]);
  });

  it('l2SpellsForSheet splits by class list', () => {
    const { own, others } = l2SpellsForSheet(sheet({ className: 'Druid', level: 3 }));
    expect(own.some((c) => c.name === 'Moonbeam')).toBe(true);
    expect(own.some((c) => c.name === 'Scorching Ray')).toBe(false);
    expect(others.some((c) => c.name === 'Scorching Ray')).toBe(true);
  });
});

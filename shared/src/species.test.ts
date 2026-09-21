import { describe, expect, it } from 'vitest';
import { applySpecies, derivedSpeciesFeatures, findSpecies, matchSpecies, speciesUsesMax, syncSpeciesSpells, type SpeciesDef } from './species.js';
import type { CharacterSheet } from './types.js';

// Invented species for testing — the repo ships no real species data.
const testborn: SpeciesDef = {
  id: 'testborn',
  name: 'Testborn',
  speed: 35,
  darkvision: 60,
  spells: [
    { name: 'Minor Illusion', level: 0 },
    { name: 'Charm Person', level: 1, minLevel: 3 },
  ],
  features: [
    { id: 't-a', name: 'Alpha', description: 'always' },
    { id: 't-b', name: 'Beta', description: 'level 5', level: 5, uses: { max: 'prof', recharge: 'long' } },
  ],
};
const otherborn: SpeciesDef = { id: 'otherborn', name: 'Otherborn', speed: 30, spells: [{ name: 'Guidance', level: 0 }], features: [] };

const sheet = (over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className: 'Rogue', level: 1, proficiencyBonus: 2,
    abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 12, cha: 10 },
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], maxHp: 10, currentHp: 10, tempHp: 0,
    armorClass: 10, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [], resources: [], spellSlots: [],
    spells: [], feats: [], features: [], inventory: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '',
    ...over,
  }) as CharacterSheet;

let n = 0;
const id = () => `id${++n}`;

describe('species', () => {
  it('finds a species loosely by name', () => {
    expect(findSpecies([testborn], 'testBORN')?.id).toBe('testborn');
    expect(findSpecies([testborn], 'nope')).toBeUndefined();
  });
  it('forgives typos when matching a species name from a PDF', () => {
    expect(matchSpecies([testborn, otherborn], 'Testbron')?.id).toBe('testborn');
    expect(matchSpecies([testborn, otherborn], 'Human')).toBeUndefined();
  });
  it('derives only the traits earned at the character level', () => {
    expect(derivedSpeciesFeatures(sheet({ level: 1 }), testborn).map((f) => f.id)).toEqual(['t-a']);
    expect(derivedSpeciesFeatures(sheet({ level: 5 }), testborn).map((f) => f.id)).toEqual(['t-a', 't-b']);
  });
  it('resolves PB-based uses', () => {
    expect(speciesUsesMax('prof', sheet({ proficiencyBonus: 3 }))).toBe(3);
    expect(speciesUsesMax(2, sheet())).toBe(2);
  });
  it('applying a species sets speed + its level-1 spells, tagged for later removal', () => {
    const s = applySpecies(sheet(), testborn, id);
    expect(s.species).toBe('Testborn');
    expect(s.speed).toBe(35);
    expect(s.spells.map((x) => x.name)).toEqual(['Minor Illusion']);
    expect(s.spells[0].fromSpecies).toBe('Testborn');
    expect(s.spellcastingAbility).toBe('wis'); // Rogue has no casting of its own
  });
  it('adds the level-3 spell when the character reaches it', () => {
    const s3 = syncSpeciesSpells({ ...applySpecies(sheet(), testborn, id), level: 3 }, testborn, id);
    expect(s3.spells.map((x) => x.name).sort()).toEqual(['Charm Person', 'Minor Illusion']);
  });
  it('swapping species replaces the previous species spells but keeps the rest', () => {
    const withOwn = sheet({ spells: [{ id: 'mine', name: 'Shocking Grasp', level: 0, prepared: true, castKind: 'attack' } as never] });
    const a = applySpecies(withOwn, testborn, id);
    const b = applySpecies(a, otherborn, id);
    expect(b.spells.map((x) => x.name).sort()).toEqual(['Guidance', 'Shocking Grasp']);
    expect(b.species).toBe('Otherborn');
  });
  it('clearing the species removes its spells', () => {
    const cleared = applySpecies(applySpecies(sheet(), testborn, id), undefined, id);
    expect(cleared.species).toBeUndefined();
    expect(cleared.spells).toEqual([]);
  });
});

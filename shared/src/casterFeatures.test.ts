import { describe, expect, it } from 'vitest';
import {
  metamagicCost,
  metamagicDamage,
  metamagicProblem,
  pointsToSlot,
  slotToPoints,
  sorcerousRestoration,
  sorceryPointsLeft,
  sorceryPointsMax,
  metamagicKnownMax,
} from './sorcerer.js';
import { arcaneRecovery, canCastAsRitual, scribeSpell, spellbookCounts } from './spellbook.js';
import { applyWildShape, beastFormProblem, endWildShape, wildShapeLimits } from './wildShape.js';
import { applyLongRest, applySpellProgression, derivedActions } from './rules.js';
import { rerollLowestDice } from './dice.js';
import type { CharacterSheet, Spell, Statblock } from './types.js';

const base = (className: string, level: number, over: Partial<CharacterSheet> = {}): CharacterSheet =>
  applySpellProgression({
    id: 's',
    name: 'X',
    className,
    level,
    classes: [{ name: className, level, ...(over.subclass ? { subclass: over.subclass } : {}) }],
    abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 14, cha: 18 },
    proficiencyBonus: 3,
    currentHp: 30,
    maxHp: 30,
    tempHp: 0,
    speed: 30,
    initiativeMisc: 0,
    acOverride: null,
    actions: [],
    damageRiders: [],
    resources: [],
    spellSlots: [],
    spells: [],
    feats: [],
    features: [],
    inventory: [],
    currency: { pp: 0, gp: 120, ep: 0, sp: 0, cp: 0 },
    notes: '',
    ...over,
  } as unknown as CharacterSheet);

const spell = (name: string, level: number, extra: Partial<Spell> = {}): Spell => ({ id: name, name, level, prepared: false, castKind: 'utility', ...extra }) as Spell;

describe('Sorcerer', () => {
  it('Sorcery Points and Metamagic known by level', () => {
    expect(sorceryPointsMax(base('Sorcerer', 1))).toBe(0);
    expect(sorceryPointsMax(base('Sorcerer', 5))).toBe(5);
    expect(metamagicKnownMax(base('Sorcerer', 10))).toBe(4);
  });

  it('Font of Magic: slot → points, points → slot (a refill or a new slot that lasts until the long rest)', () => {
    let s: CharacterSheet = { ...base('Sorcerer', 5), sorceryUsed: 4 };
    const r = slotToPoints(s, 2);
    expect(typeof r).not.toBe('string');
    s = r as CharacterSheet;
    expect(sorceryPointsLeft(s)).toBe(3);
    expect(s.spellSlots.find((x) => x.level === 2)?.used).toBe(1);
    // the expended level-2 slot comes back (3 points)
    s = pointsToSlot(s, 2) as CharacterSheet;
    expect(s.spellSlots.find((x) => x.level === 2)?.used).toBe(0);
    expect(s.createdSlots ?? {}).toEqual({});
    // nothing expended: a 4th level-1 slot on top, kept by the slot table until the long rest
    s = pointsToSlot({ ...s, sorceryUsed: 0 }, 1) as CharacterSheet;
    expect(applySpellProgression(s).spellSlots.find((x) => x.level === 1)?.max).toBe(5);
    const rested = applySpellProgression(applyLongRest(s));
    expect(rested.spellSlots.find((x) => x.level === 1)?.max).toBe(4);
    expect(rested.sorceryUsed).toBe(0);
    expect(pointsToSlot(base('Sorcerer', 4), 3)).toMatch(/cấp 5/);
  });

  it('Sorcerous Restoration once per long rest', () => {
    const s = { ...base('Sorcerer', 6), sorceryUsed: 5 };
    const r = sorcerousRestoration(s) as CharacterSheet;
    expect(r.sorceryUsed).toBe(2);
    expect(sorcerousRestoration(r)).toMatch(/Đã dùng/);
  });

  it('one Metamagic per spell, except the ones that stack', () => {
    expect(metamagicProblem(['quickened', 'twinned'])).toBeTruthy();
    expect(metamagicProblem(['quickened', 'empowered', 'seeking'])).toBeNull();
    expect(metamagicProblem(['quickened', 'twinned'], { incarnate: true })).toBeNull();
    expect(metamagicCost(['quickened', 'empowered'])).toBe(3);
  });

  it('Transmuted and Empowered change the damage parts', () => {
    const s = { ...base('Sorcerer', 5), metamagicTransmute: 'cold' };
    const out = metamagicDamage([{ dice: '8d6', type: 'fire' }, { dice: '2', type: 'radiant' }], ['transmuted', 'empowered'], s);
    expect(out).toEqual([{ dice: '8d6', type: 'cold', rerollLowest: 4 }, { dice: '2', type: 'radiant' }]);
  });

  it('Empowered rerolls only the lowest dice below average, up to the count', () => {
    expect(rerollLowestDice('4d6', [1, 2, 6, 5], 1, () => 0.99)).toEqual({ delta: 5, faces: [6, 2, 6, 5] });
    expect(rerollLowestDice('4d6', [1, 2, 6, 5], 3, () => 0.99).faces).toEqual([6, 6, 6, 5]);
  });
});

describe('Wizard spellbook', () => {
  it('free spells by level, then copying costs gold', () => {
    let s = base('Wizard', 1);
    for (let i = 0; i < 6; i++) s = scribeSpell(s, spell(`S${i}`, 1), 'free') as CharacterSheet;
    expect(spellbookCounts(s).freeLeft).toBe(0);
    expect(scribeSpell(s, spell('Extra', 1), 'free')).toMatch(/Hết lượt/);
    s = scribeSpell(s, spell('Extra', 1), 'copied') as CharacterSheet;
    expect(s.currency.gp).toBe(70);
    expect(s.spells.at(-1)?.scribed).toBe('copied');
    expect(scribeSpell(s, spell('Too High', 3), 'copied')).toMatch(/cấp 1/);
    expect(scribeSpell({ ...s, currency: { pp: 0, gp: 10, ep: 0, sp: 0, cp: 0 } }, spell('Poor', 1), 'copied')).toMatch(/Không đủ tiền/);
  });

  it('Arcane Recovery: up to half the level, once per long rest', () => {
    const s = base('Wizard', 6);
    const spent = { ...s, spellSlots: s.spellSlots.map((x) => ({ ...x, used: x.max })) };
    expect(arcaneRecovery(spent, [3, 1])).toMatch(/Tổng/);
    const r = arcaneRecovery(spent, [2, 1]) as CharacterSheet;
    expect(r.spellSlots.find((x) => x.level === 2)?.used).toBe(2);
    expect(arcaneRecovery(r, [1])).toMatch(/Đã dùng/);
  });

  it('rituals from the book without preparing them', () => {
    const s = base('Wizard', 3);
    expect(canCastAsRitual(s, spell('Detect Magic', 1, { ritual: true }))).toBe(true);
    expect(canCastAsRitual(base('Cleric', 3), spell('Detect Magic', 1, { ritual: true }))).toBe(false);
  });
});

const wolf = {
  id: 'srd-wolf',
  name: 'Wolf',
  meta: 'Medium Beast, Unaligned',
  cr: '1/4',
  size: 'medium',
  ac: 12,
  maxHp: 11,
  speed: 40,
  abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  traits: [{ name: 'Pack Tactics', description: '…' }],
  actions: [{ id: 'wolf-1', name: 'Bite', actionType: 'action', attackBonus: 4, damage: '1d6+2', damageType: 'piercing' }],
} as unknown as Statblock;
const bear = { ...wolf, id: 'srd-brown-bear', name: 'Brown Bear', cr: '1', size: 'large', ac: 11 } as Statblock;
const eagle = { ...wolf, id: 'srd-eagle', name: 'Eagle', cr: '0', speedNote: 'Fly 60 ft.' } as Statblock;

describe('Wild Shape', () => {
  it('limits by Druid level and the Moon circle', () => {
    const d2 = base('Druid', 2);
    expect(beastFormProblem(d2, wolf)).toBeNull();
    expect(beastFormProblem(d2, bear)).toMatch(/CR/);
    expect(beastFormProblem(d2, eagle)).toMatch(/bay/);
    expect(wildShapeLimits(base('Druid', 6, { subclass: 'Circle of the Moon' }))).toMatchObject({ maxCr: 2, tempHp: 18 });
  });

  it('taking and leaving a form swaps the physical numbers and the actions', () => {
    const d = { ...base('Druid', 4), inventory: [{ id: 'q', name: 'Quarterstaff', type: 'weapon', quantity: 1, weight: 4, equipped: true, notes: '', damage: '1d6', damageType: 'bludgeoning' }] } as unknown as CharacterSheet;
    const w = applyWildShape(d, wolf, 'medium');
    expect(w.abilities).toMatchObject({ str: 14, dex: 15, con: 12, int: 16, wis: 14 });
    expect(w.acOverride).toBe(12);
    expect(w.speed).toBe(40);
    expect(w.tempHp).toBe(4);
    expect(w.actions.map((a) => a.name)).toEqual(['Bite']);
    expect(derivedActions(w)).toEqual([]);
    const back = endWildShape(w);
    expect(back.abilities).toEqual(d.abilities);
    expect(back.acOverride).toBeNull();
    expect(back.speed).toBe(30);
    expect(back.actions).toEqual([]);
    expect(back.wildShape).toBeNull();
  });

  it('Moon druid AC is at least 13 + WIS', () => {
    const m = base('Druid', 3, { subclass: 'Circle of the Moon' });
    expect(applyWildShape(m, wolf).acOverride).toBe(15);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { derivedActions, spellAttackParts, cantripSaveExtras } from './rules.js';
import { attacksPerAction } from './turnRules.js';
import { activePassives, featureRiderParts, featureRiders, featFeatureDefs, passiveHas, registerInvocationDefs } from './featurePassives.js';
import { subclassUsesMax } from './classFeatures.js';
import { buildFeatureEffect } from './featureActions.js';
import { rerollLowDice } from './dice.js';
import { WARLOCK_INVOCATIONS_DRAFT, type InvocationDef } from './invocations.draft.js';
import type { CharacterSheet, InventoryItem } from './types.js';

const sheet = (features: string[], inv: InventoryItem[] = [], over: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 'w',
    name: 'Warlock',
    className: 'Warlock',
    level: 7,
    classes: [{ name: 'Warlock', level: 7 }],
    abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 10, cha: 18 },
    proficiencyBonus: 3,
    inventory: inv,
    actions: [],
    damageRiders: [],
    feats: [],
    features: features.map((name, i) => ({ id: `f${i}`, name, source: 'Eldritch Invocation', description: '' })),
    pactSlots: { level: 4, max: 2, used: 0 },
    ...over,
  }) as unknown as CharacterSheet;

const sword = { id: 'ls', name: 'Longsword', type: 'weapon', quantity: 1, weight: 3, equipped: true, notes: '', damage: '1d8', damageType: 'slashing', weaponAbility: 'str', proficient: false, pactWeapon: true } as InventoryItem;

// a local pact boon in the same shape the DM's data file uses (generic names here)
const LOCAL: InvocationDef[] = [
  {
    id: 't-pact',
    name: 'Test Pact',
    guidance: '',
    actions: [{ label: 'Mode A', kind: 'form', form: 'a' }],
    passive: { cantripVolley: true, whileForm: '*' },
    forms: { a: { spellNoCloseRangedPenalty: true }, b: { spellIgnoreHalfCover: true } },
  },
  { id: 't-shots', name: 'Test Shots', guidance: '', passive: { riders: [{ label: 'Shots', dice: 'mod:cha', type: 'same', scope: 'spell', cantripOnly: true, whileForm: '*' }] } },
  { id: 't-reckless', name: 'Test Reckless', guidance: '', passive: { cantripRerollBelow: 3, whileForm: '*' } },
  { id: 't-bullets', name: 'Test Bullets', guidance: '', uses: { max: '2*mod:cha', recharge: 'long' } },
];
const before = WARLOCK_INVOCATIONS_DRAFT.length;
registerInvocationDefs(LOCAL);
afterAll(() => WARLOCK_INVOCATIONS_DRAFT.splice(before));

describe('older invocations', () => {
  it('Pact of the Blade: CHA and proficiency with the pact weapon', () => {
    const [row] = derivedActions(sheet(['Pact of the Blade'], [sword]));
    expect(row.attackBonus).toBe(4 + 3);
    expect(row.damage).toBe('1d8+4');
    expect(derivedActions(sheet([], [sword]))[0].attackBonus).toBe(0);
  });
  it('Thirsting / Devouring Blade: extra attacks with a pact weapon in hand', () => {
    expect(attacksPerAction(sheet(['Pact of the Blade', 'Thirsting Blade'], [sword]))).toBe(2);
    expect(attacksPerAction(sheet(['Thirsting Blade', 'Devouring Blade'], [sword]))).toBe(3);
    expect(attacksPerAction(sheet(['Thirsting Blade'], [{ ...sword, pactWeapon: false }]))).toBe(1);
  });
  it('Eldritch Smite: an armed rider of (pact slot level + 1)d8 on pact weapon hits only', () => {
    const s = sheet(['Pact of the Blade', 'Eldritch Smite'], [sword, { ...sword, id: 'dg', name: 'Dagger', pactWeapon: false }]);
    const r = featureRiders(s).find((x) => x.label === 'Eldritch Smite')!;
    expect(r.dice).toBe('5d8');
    expect(r.rider.spendsPactSlot).toBe(true);
    const armed = { ...s, featureRidersArmed: [r.id] };
    expect(featureRiderParts(armed, 'weapon', { id: 'weapon:ls' }, 'slashing').map((p) => p.label)).toContain('Eldritch Smite');
    expect(featureRiderParts(armed, 'weapon', { id: 'weapon:dg' }, 'slashing').map((p) => p.label)).not.toContain('Eldritch Smite');
  });
  it('Armor of Shadows / Eldritch Mind', () => {
    const s = sheet(['Armor of Shadows', 'Eldritch Mind']);
    const defs = featFeatureDefs(s);
    expect(defs.find((d) => d.name.startsWith('Armor of Shadows'))?.actions?.[0].effect?.acBase).toBe(13);
    expect(passiveHas(s, 'concentrationAdvantage')).toBe(true);
  });
});

describe('a local pact boon with forms', () => {
  it('passives follow the active form', () => {
    const none = sheet(['Test Pact']);
    expect(passiveHas(none, 'cantripVolley')).toBe(false);
    const a = { ...none, activeForm: 'a' };
    expect(passiveHas(a, 'cantripVolley')).toBe(true);
    expect(passiveHas(a, 'spellNoCloseRangedPenalty')).toBe(true);
    expect(passiveHas(a, 'spellIgnoreHalfCover')).toBe(false);
    expect(passiveHas({ ...none, activeForm: 'b' }, 'spellIgnoreHalfCover')).toBe(true);
    expect(activePassives({ ...none, activeForm: 'b' }).some((p) => p.passive.spellNoCloseRangedPenalty)).toBe(false);
  });
  it('cantrip-only riders and the low-die reroll apply to cantrips in a form', () => {
    const s = { ...sheet(['Test Pact', 'Test Shots', 'Test Reckless']), activeForm: 'a' };
    const cantrip = spellAttackParts(s, [{ dice: '1d10', type: 'fire' }], { level: 0 });
    expect(cantrip).toEqual([
      { dice: '1d10', type: 'fire', rerollBelow: 3 },
      { dice: '4', type: 'fire', label: 'Shots' },
    ]);
    expect(spellAttackParts(s, [{ dice: '3d6', type: 'fire' }], { level: 1 })).toEqual([{ dice: '3d6', type: 'fire' }]);
    expect(cantripSaveExtras(s, [{ dice: '1d8', type: 'radiant' }], 0).map((p) => p.label ?? p.dice)).toEqual(['1d8', 'Shots']);
    expect(spellAttackParts({ ...s, activeForm: null }, [{ dice: '1d10', type: 'fire' }], { level: 0 })).toEqual([{ dice: '1d10', type: 'fire' }]);
  });
  it('uses by formula, and effects that end on their own', () => {
    expect(subclassUsesMax('2*mod:cha', sheet([]))).toBe(8);
    expect(subclassUsesMax('cha-mod', sheet([]))).toBe(4);
    const fx = buildFeatureEffect(
      { label: 'Aim', kind: 'effect', effect: { rollAdvantage: ['attack'], speedPenalty: 999, untilEndOfTurn: true } },
      { ...sheet([]), tokenId: 'tk' } as CharacterSheet,
      'warlock',
      1,
      'Aim',
    );
    expect(fx).toMatchObject({ rollAdvantage: ['attack'], speedPenalty: 999, endsAfterOwnTurns: 1 });
  });
  it('rerolls only the low faces, keeping the new roll', () => {
    expect(rerollLowDice('2d10+3', [1, 9], 3, () => 0.5)).toEqual({ delta: 5, faces: [6, 9] });
  });
});

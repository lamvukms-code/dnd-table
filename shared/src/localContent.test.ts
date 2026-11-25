import { describe, expect, it } from 'vitest';
import { burstDice, canRecastNow, findCantrip, recastForm, recastOf, registerExtraSpells, spellFromCantrip, upcastEffect, type CantripDef } from './cantrips.js';
import { featFeatureDefs, featureAttackMod, featureRiders, isProficientHeavy, passiveNoCloseRangedPenalty, passiveRangedCover, registerFeatDefs } from './featurePassives.js';
import { SRD_FEATS_DRAFT } from './feats.draft.js';
import { actionDamageParts } from './rules.js';
import type { CharacterSheet, SheetAction, Spell } from './types.js';

const sheet = (feats: string[]): CharacterSheet =>
  ({
    id: 's', ownerId: 'o', name: 'T', className: 'Fighter', level: 5, proficiencyBonus: 3, classes: [{ name: 'Fighter', level: 5 }],
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 }, saveProficiencies: [], skillProficiencies: [], skillExpertise: [],
    maxHp: 40, currentHp: 40, tempHp: 0, armorClass: 10, acOverride: null, speed: 30, initiativeMisc: 0, actions: [], damageRiders: [],
    resources: [], spellSlots: [], spells: [], feats: feats.map((n, i) => ({ id: String(i), name: n, description: '' })), features: [],
    inventory: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '',
  }) as CharacterSheet;
const axe = { id: 'weapon:a', name: 'Axe', actionType: 'action', attackBonus: 6, damage: '1d12+3', damageType: 'slashing', attackKind: 'weapon', attackRange: 'melee', source: 'weapon' } as SheetAction;

describe('local spells', () => {
  it('registered spells are found by name, keep their extras, and never duplicate', () => {
    const def: CantripDef = {
      id: 'x-zap', name: 'Test Zap', school: 'Evocation', classes: ['wizard'], level: 1, combat: true, castKind: 'damage',
      fixedDamage: '1d12', damageType: 'lightning', guidance: 'Nâng ô: +1d12.', source: 'Test',
      followSave: { ability: 'con', effect: { name: 'Zapped', condition: 'stunned' } },
    };
    registerExtraSpells([def, { ...def, id: 'dup' }]);
    expect(findCantrip('test zap')?.id).toBe('x-zap');
    const sp = spellFromCantrip(findCantrip('Test Zap')!, sheet([]), 'id');
    expect(sp.followSave?.ability).toBe('con');
    expect(sp.damage?.[0]).toMatchObject({ dice: '1d12', type: 'lightning' });
  });
});

describe('local feats', () => {
  registerFeatDefs([
    { id: 'x-eye', name: 'Test Eye', category: 'general', guidance: '', passive: { noCloseRangedPenalty: true } },
    { id: 'x-cleave', name: 'Test Cleave', category: 'general', guidance: '', passive: { riders: [{ label: 'Cleave', dice: '10', type: 'same', scope: 'melee', armed: true, attackMod: -5 }] } },
    { id: 'x-pool', name: 'Test Pool', category: 'general', guidance: '', uses: { max: 1, recharge: 'short' } },
  ]);
  it('join the feat picker list', () => {
    expect(SRD_FEATS_DRAFT.some((f) => f.name === 'Test Eye')).toBe(true);
  });
  it('apply only to sheets that have them', () => {
    expect(passiveNoCloseRangedPenalty(sheet(['Test Eye']))).toBe(true);
    expect(passiveNoCloseRangedPenalty(sheet([]))).toBe(false);
    expect(featFeatureDefs(sheet(['Test Pool', 'Alert'])).map((f) => f.id)).toEqual(['feat:x-pool']);
  });
  it('armed −5/+10 rider: attack mod and damage only while armed', () => {
    const s = sheet(['Test Cleave']);
    const id = featureRiders(s)[0].id;
    expect(featureAttackMod(s, 'weapon', axe)).toBe(0);
    const armed = { ...s, featureRidersArmed: [id] };
    expect(featureAttackMod(armed, 'weapon', axe)).toBe(-5);
    expect(actionDamageParts(armed, axe).find((p) => p.label === 'Cleave')).toMatchObject({ dice: '10', type: 'slashing' });
  });
});

describe('recast (lasting spells re-used without a slot)', () => {
  const sh = sheet([]);
  it('Call Lightning: re-use only while concentrating on it, action economy, no new concentration', () => {
    const sp = spellFromCantrip(findCantrip('Call Lightning')!, sh, 'x');
    expect(canRecastNow(sp, undefined)).toBe(false);
    expect(canRecastNow(sp, 'Đang tập trung: Bless')).toBe(false);
    expect(canRecastNow(sp, 'Đang tập trung: Call Lightning')).toBe(true);
    const r = recastForm(sp, recastOf(sp)!);
    expect(r.concentration).toBe(false);
    expect(r.actionType).toBe('action');
    expect(r.level).toBe(3); // keeps upcast dice
    expect(r.save?.ability).toBe('dex');
  });
  it('Witch Bolt repeat: auto 1d12, no attack roll, no upcast', () => {
    const sp = spellFromCantrip(findCantrip('Witch Bolt')!, sh, 'x');
    const r = recastForm(sp, recastOf(sp)!);
    expect(r.castKind).toBe('damage');
    expect(r.damage?.[0]).toMatchObject({ dice: '1d12', type: 'lightning' });
    expect(r.level).toBe(0);
  });
  it('non-concentration spells (Spiritual Weapon) stay re-usable; concentration effects are not placed again', () => {
    const sw = spellFromCantrip(findCantrip('Spiritual Weapon')!, sh, 'x');
    expect(canRecastNow(sw, undefined)).toBe(true);
    expect(recastForm(sw, recastOf(sw)!).actionType).toBe('bonus');
    const hm = spellFromCantrip(findCantrip('Heat Metal')!, sh, 'x');
    expect(recastForm(hm, recastOf(hm)!).effect).toBeUndefined();
    expect(canRecastNow(spellFromCantrip(findCantrip('Fireball')!, sh, 'x'), undefined)).toBe(false);
  });
});

describe('local-content mechanics', () => {
  it('upcastEffect: dice table, per-level dice, charges', () => {
    const claws = { attackRiders: [{ dice: '1d4', type: 'slashing', label: 'Test Claws', melee: true }], upcast: { byLevel: { '2': '1d8', '4': '2d8' } } };
    expect(upcastEffect(claws, 1, 1).attackRiders![0].dice).toBe('1d4');
    expect(upcastEffect(claws, 1, 3).attackRiders![0].dice).toBe('1d8');
    expect(upcastEffect(claws, 1, 7).attackRiders![0].dice).toBe('2d8');
    const thorns = { retaliate: { dice: '1d6', type: 'piercing', always: true }, upcast: { perLevel: '1d6' } };
    expect(upcastEffect(thorns, 1, 3).retaliate!.dice).toBe('3d6');
    const charged = { charges: 4, upcast: { chargesPerLevel: 3 } };
    expect(upcastEffect(charged, 2, 4).charges).toBe(10);
    const dot = { turnDamage: { dice: '1d8', type: 'piercing' }, upcast: { perLevel: '1d8' } };
    expect(upcastEffect(dot, 3, 5).turnDamage!.dice).toBe('3d8');
  });
  it('burst dice and multi-type damage', () => {
    expect(burstDice({ radiusFt: 15, save: 'con', dice: '4d6', type: 'thunder', perLevel: '1d6' }, 3, 5)).toBe('6d6');
    registerExtraSpells([{ id: 't-rs', name: 'Test Split', school: 'Evocation', classes: ['wizard'], level: 3, combat: true, castKind: 'save', save: 'dex',
      fixedDamage: '2d8', damageType: 'fire', extraDamage: [{ dice: '1d8', type: 'cold' }], halfOnSave: true, saveDisadvantageWithin: 10, guidance: 'x' } as CantripDef]);
    const sp = spellFromCantrip(findCantrip('Test Split')!, sheet([]), 'x');
    expect(sp.damage?.map((p) => `${p.dice} ${p.type}`)).toEqual(['2d8 fire', '1d8 cold']);
    expect(sp.saveDisadvantageWithin).toBe(10);
  });
  it('recast as a save with its own dice keeps the upcast level', () => {
    const sp = { id: 'x', name: 'Tail', level: 2, prepared: true, castKind: 'utility', concentration: false, effect: { name: 'Tail' } } as Spell;
    const r = recastForm(sp, { economy: 'free', castKind: 'save', save: 'dex', dice: '1d6', type: 'piercing', upcast: true });
    expect(r).toMatchObject({ castKind: 'save', level: 2, save: { ability: 'dex' }, damage: [{ dice: '1d6', type: 'piercing' }] });
    expect(r.effect).toBeUndefined();
  });
  it('heavy-only rider on proficient heavy weapons; cover-reducing feat', () => {
    registerFeatDefs([
      { id: 't-gwa', name: 'T GWA', category: 'general', guidance: '', passive: { riders: [{ label: 'GWA', dice: '10', type: 'same', scope: 'melee', armed: true, attackMod: -5, heavyOnly: true }] } },
      { id: 't-ss', name: 'T SS', category: 'general', guidance: '', passive: { rangedCoverReduce: true } },
    ] as never);
    const s = { ...sheet(['T GWA', 'T SS']), inventory: [
      { id: 'gs', name: 'Greatsword', type: 'weapon', quantity: 1, weight: 6, equipped: true, proficient: true },
      { id: 'ls', name: 'Longsword', type: 'weapon', quantity: 1, weight: 3, equipped: true, proficient: true },
    ] } as unknown as CharacterSheet;
    const rid = featureRiders(s).find((r) => r.label === 'GWA')!.id;
    const armed = { ...s, featureRidersArmed: [rid] };
    const row = (id: string) => ({ id, attackRange: 'melee' as const, range: '5 ft' });
    expect(featureAttackMod(armed, 'weapon', row('weapon:gs'))).toBe(-5);
    expect(featureAttackMod(armed, 'weapon', row('weapon:ls'))).toBe(0);
    expect(isProficientHeavy(s, { id: 'weapon:gs' })).toBe(true);
    expect(passiveRangedCover(s, 'half')).toBe('none');
    expect(passiveRangedCover(s, 'threequarters')).toBe('half');
    expect(passiveRangedCover(sheet([]), 'half')).toBe('half');
  });
});

import { describe, expect, it } from 'vitest';
import {
  actionDamageParts,
  allActions,
  applyDamageDefenses,
  applyLongRest,
  applyShortRest,
  applySpellProgression,
  barbarianLevel,
  carriedWeight,
  casterTypeOf,
  combineRollModes,
  computePactSlots,
  computeSpellSlots,
  computeArmorClass,
  concentrationDc,
  conditionAttackMode,
  conditionAutoCrit,
  coverAcBonus,
  currencyInGp,
  derivedActions,
  derivedDefenses,
  emptyCurrency,
  druidLevel,
  martialArtsDie,
  mergeDefenses,
  ATTUNEMENT_SLOTS,
  attackKindOf,
  attunementCount,
  clampToRange,
  gridFeet,
  monkFocusMax,
  parseRangeFeet,
  tokenIsGrappled,
  walkSpeed,
  monkUnarmedAction,
  pendingRollBonus,
  riderParts,
  spellAttackParts,
  spellRiderParts,
  unarmedAction,
  rageDamageBonus,
  rageMax,
  resolveDamageParts,
  wildShapeMax,
  skillBonus,
  sneakAttackDice,
  spellAttackBonus,
  spellSaveDc,
  statblockInitiativeMod,
  targetRiderParts,
  tokenSaveBonus,
  tokenStatblockFrom,
} from './rules.js';
import {
  derivedClassFeatures,
  derivedSubclassFeatures,
  subclassUsesMax,
  type SubclassFeatureDef,
} from './classFeatures.js';
import { emptyDefenses } from './types.js';
import type { CharacterSheet, InventoryItem, Statblock } from './types.js';

function sheet(over: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 's1',
    ownerId: 'p1',
    name: 'Test',
    className: 'Fighter',
    level: 3,
    proficiencyBonus: 2,
    abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 28,
    currentHp: 28,
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
    ...over,
  };
}

function item(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    name: 'Item',
    type: 'gear',
    quantity: 1,
    weight: 0,
    equipped: false,
    notes: '',
    ...over,
  };
}

describe('computeArmorClass', () => {
  it('unarmored = 10 + DEX', () => {
    expect(computeArmorClass(sheet()).ac).toBe(12);
  });

  it('override wins', () => {
    expect(computeArmorClass(sheet({ acOverride: 17 })).ac).toBe(17);
  });

  it('medium armor caps DEX at +2, shield adds 2', () => {
    const s = sheet({
      abilities: { str: 16, dex: 18, con: 12, int: 10, wis: 10, cha: 8 },
      inventory: [
        item({ id: 'a', type: 'armor', equipped: true, armorBase: 14, armorCategory: 'medium' }),
        item({ id: 'sh', type: 'shield', equipped: true, armorBase: 2 }),
      ],
    });
    expect(computeArmorClass(s).ac).toBe(14 + 2 + 2);
  });

  it('heavy armor ignores DEX', () => {
    const s = sheet({
      inventory: [item({ id: 'a', type: 'armor', equipped: true, armorBase: 18, armorCategory: 'heavy' })],
    });
    expect(computeArmorClass(s).ac).toBe(18);
  });

  it('unequipped armor does not count', () => {
    const s = sheet({
      inventory: [item({ id: 'a', type: 'armor', equipped: false, armorBase: 18, armorCategory: 'heavy' })],
    });
    expect(computeArmorClass(s).ac).toBe(12);
  });
});

describe('derivedActions', () => {
  it('builds an attack from an equipped proficient weapon', () => {
    const s = sheet({
      inventory: [
        item({
          id: 'w',
          name: 'Longsword',
          type: 'weapon',
          equipped: true,
          weaponAbility: 'str',
          damage: '1d8',
          damageType: 'chém',
          proficient: true,
        }),
      ],
    });
    const [atk] = derivedActions(s);
    expect(atk.attackBonus).toBe(3 + 2); // STR +3, prof +2
    expect(atk.damage).toBe('1d8+3');
    expect(atk.source).toBe('weapon');
    expect(atk.actionType).toBe('action');
  });

  it('finesse uses the better of STR/DEX and adds magic bonus', () => {
    const s = sheet({
      abilities: { str: 10, dex: 18, con: 12, int: 10, wis: 10, cha: 8 },
      inventory: [
        item({
          id: 'd',
          name: 'Dagger +1',
          type: 'weapon',
          equipped: true,
          weaponAbility: 'finesse',
          damage: '1d4',
          proficient: true,
          attackBonusMisc: 1,
          damageBonusMisc: 1,
        }),
      ],
    });
    const [atk] = derivedActions(s);
    expect(atk.attackBonus).toBe(4 + 2 + 1); // DEX +4, prof +2, magic +1
    expect(atk.damage).toBe('1d4+5'); // DEX +4 + magic +1
  });

  it('allActions merges the sheet actions + derived weapons', () => {
    const s = sheet({
      actions: [
        { id: 'm', name: 'Shove', actionType: 'action', notation: '1d4', source: 'manual' },
      ],
      inventory: [item({ id: 'w', type: 'weapon', equipped: true, damage: '1d6', proficient: true })],
    });
    // derived weapon + always-available unarmed strike + the manual action
    expect(allActions(s)).toHaveLength(3);
    expect(allActions(s)[0].source).toBe('weapon');
    expect(allActions(s).some((a) => a.id === 'unarmed')).toBe(true);
  });
});

describe('rests', () => {
  const base = () =>
    sheet({
      maxHp: 30,
      currentHp: 5,
      tempHp: 4,
      resources: [
        { id: 'ki', name: 'Ki', max: 5, used: 4, recharge: 'short' },
        { id: 'rage', name: 'Rage', max: 3, used: 2, recharge: 'long' },
      ],
      spellSlots: [{ level: 1, max: 3, used: 3 }],
      pactSlots: { level: 2, max: 2, used: 2 },
    });

  it('short rest restores only short-recharge resources', () => {
    const s = applyShortRest(base());
    expect(s.resources.find((r) => r.id === 'ki')!.used).toBe(0);
    expect(s.resources.find((r) => r.id === 'rage')!.used).toBe(2);
    expect(s.currentHp).toBe(5);
    expect(s.pactSlots!.used).toBe(0); // pact magic recharges on a short rest
    expect(s.spellSlots[0].used).toBe(3); // Vancian slots do not
  });

  it('long rest restores HP, slots and all rechargeable resources', () => {
    const s = applyLongRest(base());
    expect(s.currentHp).toBe(30);
    expect(s.tempHp).toBe(0);
    expect(s.resources.every((r) => r.used === 0)).toBe(true);
    expect(s.spellSlots[0].used).toBe(0);
    expect(s.pactSlots!.used).toBe(0);
  });
});

describe('multi-source damage', () => {
  it('actionDamageParts = primary + action extras + enabled riders', () => {
    const s = sheet({
      damageRiders: [
        { id: 'ring', name: 'Ring', dice: '1d4', type: 'fire', enabled: true },
        { id: 'off', name: 'Off', dice: '1d6', type: 'cold', enabled: false },
      ],
    });
    const weaponAction = {
      id: 'w', name: 'Sword', actionType: 'action' as const,
      attackBonus: 5, damage: '2d6+3', damageType: 'slashing', source: 'weapon' as const,
      extraDamage: [{ dice: '1d10', type: 'necrotic' }],
    };
    const parts = actionDamageParts(s, weaponAction);
    expect(parts.map((p) => `${p.dice} ${p.type}`)).toEqual([
      '2d6+3 slashing',
      '1d10 necrotic',
      '1d4 fire', // ring (enabled)
    ]);
  });

  it('rider scope: weapon rows skip spell-only riders; spell attacks skip weapon riders', () => {
    const s = sheet({
      damageRiders: [
        { id: 'w', name: 'Wpn', dice: '1d4', type: 'fire', enabled: true }, // default 'weapon'
        { id: 'sp', name: 'Spl', dice: '1d6', type: 'psychic', enabled: true, scope: 'spell' as const },
        { id: 'any', name: 'Any', dice: '1d8', type: 'force', enabled: true, scope: 'any' as const },
      ],
    });
    const wpn = {
      id: 'w', name: 'Sword', actionType: 'action' as const,
      attackBonus: 4, damage: '1d8', damageType: 'slashing', source: 'weapon' as const,
    };
    expect(actionDamageParts(s, wpn).map((p) => p.label)).toEqual([undefined, 'Wpn', 'Any']);
    expect(spellRiderParts(s).map((p) => p.label)).toEqual(['Spl', 'Any']);
    expect(spellAttackParts(s, [{ dice: '2d10', type: 'fire' }]).map((p) => p.dice)).toEqual([
      '2d10', '1d6', '1d8',
    ]);
  });

  it('spell-tagged attack rows skip weapon riders + Rage/Sneak', () => {
    const s = sheet({
      className: 'Rogue',
      classes: [{ name: 'Rogue', level: 6 }],
      raging: false,
      sneakAttackArmed: true,
      damageRiders: [
        { id: 'w', name: 'Wpn', dice: '1d4', type: 'fire', enabled: true },
        { id: 'sp', name: 'Spl', dice: '1d6', type: 'force', enabled: true, scope: 'spell' as const },
      ],
    });
    const spellAtk = {
      id: 'x', name: 'Chromatic Orb', actionType: 'action' as const,
      attackBonus: 6, damage: '3d8', damageType: 'fire', attackKind: 'spell' as const,
    };
    const labels = actionDamageParts(s, spellAtk).map((p) => p.label);
    expect(labels).toEqual([undefined, 'Spl']); // primary + spell rider; no Wpn, no Sneak Attack
    expect(attackKindOf(spellAtk)).toBe('spell');
    expect(attackKindOf({ id: 'y', name: 'Club', actionType: 'action' })).toBe('weapon');
    expect(riderParts(s, 'weapon').map((p) => p.label)).toEqual(['Wpn']);
  });

  it('unarmedAction: 1 + STR mod bludgeoning; allActions always offers one', () => {
    const s = sheet({ abilities: { ...sheet().abilities, str: 16 } });
    const u = unarmedAction(s);
    expect(u.damage).toBe('4'); // 1 + 3
    expect(u.damageType).toBe('bludgeoning');
    expect(u.attackBonus).toBe(3 + s.proficiencyBonus);
    expect(allActions(s).some((a) => a.id === 'unarmed')).toBe(true);
    // a Monk gets the Martial Arts version instead
    const monk = sheet({ classes: [{ name: 'Monk', level: 1 }] });
    expect(allActions(monk).some((a) => a.id === 'monk-unarmed')).toBe(true);
    expect(allActions(monk).some((a) => a.id === 'unarmed')).toBe(false);
  });

  it('pendingRollBonus finds a one-shot check die on a token', () => {
    const tok = {
      effects: [
        { id: 'e1', name: 'Guidance (+1d4)', rollBonus: { dice: '1d4', scope: 'check' as const } },
      ],
    };
    expect(pendingRollBonus(tok, 'check')).toEqual({ id: 'e1', name: 'Guidance (+1d4)', dice: '1d4' });
    expect(pendingRollBonus(tok, 'save')).toBeUndefined();
    expect(pendingRollBonus(undefined, 'check')).toBeUndefined();
  });

  it('riders do not attach to non-attack actions', () => {
    const s = sheet({
      damageRiders: [{ id: 'ring', name: 'Ring', dice: '1d4', type: 'fire', enabled: true }],
    });
    const utility = {
      id: 'u', name: 'Healing Word', actionType: 'bonus' as const,
      notation: '1d4+3', source: 'manual' as const,
    };
    expect(actionDamageParts(s, utility)).toHaveLength(0);
  });

  it('resolveDamageParts applies per-part types and totals', () => {
    const def = { ...emptyDefenses(), resistances: ['fire'], immunities: ['poison'] };
    const out = resolveDamageParts(
      [
        { part: { dice: '2d6', type: 'slashing' }, raw: 8 },
        { part: { dice: '1d4', type: 'fire' }, raw: 4 },
        { part: { dice: '1d6', type: 'poison' }, raw: 5 },
      ],
      def,
    );
    // 8 slashing + 2 fire(÷2) + 0 poison(×0) = 10
    expect(out.totalFinal).toBe(10);
    expect(out.totalRaw).toBe(17);
  });
});

describe('adamantine / concentration / riders', () => {
  it('derivedDefenses grants crit immunity only from an equipped adamantine item', () => {
    const off = sheet({ inventory: [item({ type: 'armor', equipped: false, grantsCritImmune: true })] });
    expect(derivedDefenses(off)).toBeUndefined();
    const on = sheet({ inventory: [item({ type: 'armor', equipped: true, grantsCritImmune: true })] });
    expect(derivedDefenses(on)?.critImmune).toBe(true);
    expect(derivedDefenses(sheet())).toBeUndefined();
  });

  it('mergeDefenses ORs crit immunity and unions the type lists', () => {
    const a = { ...emptyDefenses(), resistances: ['fire'] };
    const b = { ...emptyDefenses(), critImmune: true, resistances: ['cold'] };
    const m = mergeDefenses(a, b)!;
    expect(m.critImmune).toBe(true);
    expect(m.resistances.sort()).toEqual(['cold', 'fire']);
    expect(mergeDefenses(undefined, b)).toBe(b);
  });

  it('concentrationDc is DC 10 or half the damage, whichever is higher', () => {
    expect(concentrationDc(9)).toBe(10);
    expect(concentrationDc(22)).toBe(11);
    expect(concentrationDc(60)).toBe(30);
  });

  it('targetRiderParts only fires for the matching attacker', () => {
    const target = {
      effects: [
        { id: 'h', name: 'Hex', sourceSheetId: 's1', concentration: true, rider: { dice: '1d6', type: 'necrotic' } },
        { id: 'x', name: 'Stunned', condition: 'stunned' as const },
      ],
    };
    expect(targetRiderParts(target, { sheetId: 's1' })).toEqual([
      { dice: '1d6', type: 'necrotic', label: 'Hex' },
    ]);
    expect(targetRiderParts(target, { sheetId: 'other' })).toEqual([]);
  });
});

describe('spellcasting (5e 2024)', () => {
  it('caster type is derived from class, then subclass, then the override', () => {
    expect(casterTypeOf(sheet({ className: 'Wizard' }))).toBe('full');
    expect(casterTypeOf(sheet({ className: 'Paladin' }))).toBe('half');
    expect(casterTypeOf(sheet({ className: 'Warlock' }))).toBe('pact');
    expect(casterTypeOf(sheet({ className: 'Fighter' }))).toBe('none');
    expect(casterTypeOf(sheet({ className: 'Fighter', subclass: 'Eldritch Knight' }))).toBe('third');
    expect(casterTypeOf(sheet({ className: 'Fighter', casterTypeOverride: 'full' }))).toBe('full');
  });

  it('spell save DC = 8 + prof + ability mod, spell attack = prof + mod', () => {
    const wiz = sheet({
      className: 'Wizard',
      proficiencyBonus: 3,
      abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    });
    expect(spellSaveDc(wiz)).toBe(8 + 3 + 4);
    expect(spellAttackBonus(wiz)).toBe(3 + 4);
    expect(spellSaveDc(sheet({ className: 'Fighter' }))).toBeNull();
  });
});

describe('spell-slot progression (5e 2024)', () => {
  const slots = (s: ReturnType<typeof computeSpellSlots>) => s.map((x) => x.max);

  it('full caster follows the standard table', () => {
    expect(slots(computeSpellSlots(sheet({ className: 'Wizard', level: 1 })))).toEqual([2]);
    expect(slots(computeSpellSlots(sheet({ className: 'Wizard', level: 5 })))).toEqual([4, 3, 2]);
    expect(slots(computeSpellSlots(sheet({ className: 'Sorcerer', level: 20 })))).toEqual([
      4, 3, 3, 3, 3, 2, 2, 1, 1,
    ]);
  });

  it('half caster (Paladin, 2024) gets slots from level 1', () => {
    expect(slots(computeSpellSlots(sheet({ className: 'Paladin', level: 1 })))).toEqual([2]);
    expect(slots(computeSpellSlots(sheet({ className: 'Ranger', level: 5 })))).toEqual([4, 2]);
  });

  it('third caster (Eldritch Knight) starts at level 3', () => {
    expect(computeSpellSlots(sheet({ className: 'Fighter', subclass: 'Eldritch Knight', level: 2 }))).toEqual([]);
    expect(slots(computeSpellSlots(sheet({ className: 'Fighter', subclass: 'Eldritch Knight', level: 3 })))).toEqual([2]);
  });

  it('Warlock uses the pact table', () => {
    expect(computePactSlots(sheet({ className: 'Warlock', level: 5 }))).toMatchObject({ level: 3, max: 2 });
    expect(computePactSlots(sheet({ className: 'Warlock', level: 17 }))).toMatchObject({ level: 5, max: 4 });
    expect(computePactSlots(sheet({ className: 'Fighter', level: 5 }))).toBeNull();
  });

  it('multiclass sums full + floor(half/2) + floor(third/3)', () => {
    // Wizard 5 + Cleric 1 -> caster level 6 -> [4,3,3]
    const s = sheet({ classes: [{ name: 'Wizard', level: 5 }, { name: 'Cleric', level: 1 }] });
    expect(slots(computeSpellSlots(s))).toEqual([4, 3, 3]);
    // Paladin 2 in a multiclass contributes 0 (floor(2/2)=1 -> actually 1) ; Paladin 3 -> floor(3/2)=1
    const s2 = sheet({ classes: [{ name: 'Fighter', level: 3 }, { name: 'Paladin', level: 2 }] });
    expect(slots(computeSpellSlots(s2))).toEqual([2]); // caster level 1
  });

  it('applySpellProgression recomputes maxima and keeps used', () => {
    const s = sheet({ className: 'Wizard', level: 5, spellSlots: [{ level: 1, max: 99, used: 3 }] });
    const out = applySpellProgression(s);
    expect(out.spellSlots.map((x) => x.max)).toEqual([4, 3, 2]);
    expect(out.spellSlots.find((x) => x.level === 1)!.used).toBe(3);
  });
});

describe('class features (Rogue / Barbarian)', () => {
  it('derivedClassFeatures returns only earned features', () => {
    const r3 = derivedClassFeatures(sheet({ className: 'Rogue', level: 3 }));
    expect(r3.some((f) => f.id === 'rogue-sneak-attack')).toBe(true);
    expect(r3.some((f) => f.id === 'rogue-cunning-action')).toBe(true);
    expect(r3.some((f) => f.id === 'rogue-uncanny-dodge')).toBe(false); // level 5
    expect(derivedClassFeatures(sheet({ className: 'Fighter', level: 10 }))).toHaveLength(0);
  });

  it('sneak attack dice = ceil(rogue level / 2)', () => {
    expect(sneakAttackDice(sheet({ className: 'Rogue', level: 1 }))).toBe(1);
    expect(sneakAttackDice(sheet({ className: 'Rogue', level: 5 }))).toBe(3);
    expect(sneakAttackDice(sheet({ className: 'Rogue', level: 20 }))).toBe(10);
    expect(sneakAttackDice(sheet({ className: 'Wizard', level: 20 }))).toBe(0);
  });

  it('rage bonus +2 / +3 at 9 / +4 at 16; uses 2..6', () => {
    expect(rageDamageBonus(sheet({ className: 'Barbarian', level: 8 }))).toBe(2);
    expect(rageDamageBonus(sheet({ className: 'Barbarian', level: 9 }))).toBe(3);
    expect(rageDamageBonus(sheet({ className: 'Barbarian', level: 16 }))).toBe(4);
    expect(rageMax(sheet({ className: 'Barbarian', level: 1 }))).toBe(2);
    expect(rageMax(sheet({ className: 'Barbarian', level: 6 }))).toBe(4);
    expect(rageMax(sheet({ className: 'Barbarian', level: 17 }))).toBe(6);
    expect(barbarianLevel(sheet({ classes: [{ name: 'Barbarian', level: 4 }, { name: 'Fighter', level: 2 }] }))).toBe(4);
  });

  it('actionDamageParts adds Rage flat dmg while raging on a weapon attack', () => {
    const s = sheet({ className: 'Barbarian', level: 9, raging: true });
    const atk = { id: 'w', name: 'Greataxe', actionType: 'action' as const, attackBonus: 7, damage: '1d12+4', damageType: 'slashing', source: 'weapon' as const };
    const parts = actionDamageParts(s, atk);
    expect(parts).toContainEqual({ dice: '3', type: 'slashing', label: 'Rage' });
    // not raging -> no rage part
    expect(actionDamageParts({ ...s, raging: false }, atk).some((p) => p.label === 'Rage')).toBe(false);
  });

  it('actionDamageParts adds Sneak Attack dice when armed', () => {
    const s = sheet({ className: 'Rogue', level: 5, sneakAttackArmed: true });
    const atk = { id: 'w', name: 'Dagger', actionType: 'action' as const, attackBonus: 6, damage: '1d4+3', damageType: 'piercing', source: 'weapon' as const };
    expect(actionDamageParts(s, atk)).toContainEqual({ dice: '3d6', type: 'piercing', label: 'Sneak Attack' });
  });

  it('derivedDefenses grants b/p/s resistance while raging', () => {
    const raging = derivedDefenses(sheet({ className: 'Barbarian', level: 5, raging: true }))!;
    expect(raging.resistances.sort()).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(derivedDefenses(sheet({ className: 'Barbarian', level: 5, raging: false }))).toBeUndefined();
  });

  it('rests: short rest recovers one rage, long rest resets rage + raging', () => {
    const s = sheet({ className: 'Barbarian', level: 5, rageUsed: 3, raging: true });
    expect(applyShortRest(s).rageUsed).toBe(2);
    const long = applyLongRest(s);
    expect(long.rageUsed).toBe(0);
    expect(long.raging).toBe(false);
  });

  it('Monk: martial arts die scales, focus = level from 2, unarmed action uses the die', () => {
    expect(martialArtsDie(sheet({ className: 'Monk', level: 1 }))).toBe('1d6');
    expect(martialArtsDie(sheet({ className: 'Monk', level: 5 }))).toBe('1d8');
    expect(martialArtsDie(sheet({ className: 'Monk', level: 17 }))).toBe('1d12');
    expect(monkFocusMax(sheet({ className: 'Monk', level: 1 }))).toBe(0);
    expect(monkFocusMax(sheet({ className: 'Monk', level: 6 }))).toBe(6);

    const s = sheet({
      className: 'Monk',
      level: 5,
      proficiencyBonus: 3,
      abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 },
    });
    const a = monkUnarmedAction(s)!;
    expect(a.attackBonus).toBe(3 + 3); // DEX +3, prof +3
    expect(a.damage).toBe('1d8+3');
    expect(derivedClassFeatures(s).some((f) => f.id === 'monk-stunning-strike')).toBe(true);
  });

  it('Warlock features derive; short rest clears Monk focus', () => {
    expect(derivedClassFeatures(sheet({ className: 'Warlock', level: 11 })).some((f) => f.id === 'warlock-mystic-arcanum-6')).toBe(true);
    expect(applyShortRest(sheet({ className: 'Monk', level: 6, focusUsed: 4 })).focusUsed).toBe(0);
  });

  it('derivedSubclassFeatures matches class + subclass (loose) + level', () => {
    const defs: SubclassFeatureDef[] = [
      { id: 's3', class: 'rogue', subclass: 'Sinner', level: 3, name: 'Hex Slinger', description: '', uses: { max: 'cha-mod', recharge: 'short' } },
      { id: 's9', class: 'rogue', subclass: 'Sinner', level: 9, name: 'Borrowed Luck', description: '' },
      { id: 'x', class: 'rogue', subclass: 'Other', level: 3, name: 'Nope', description: '' },
    ];
    const s = sheet({ className: 'Rogue', subclass: 'sinner!', level: 5 });
    const got = derivedSubclassFeatures(s, defs);
    expect(got.map((f) => f.id)).toEqual(['s3']); // s9 needs level 9, "Other" doesn't match
    expect(derivedSubclassFeatures(sheet({ className: 'Rogue', level: 5 }), defs)).toHaveLength(0); // no subclass set
    expect(subclassUsesMax('cha-mod', sheet({ abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 18 } }))).toBe(4);
    expect(subclassUsesMax(3, s)).toBe(3);
  });

  it('Druid: Wild Shape uses 2/3/4, features derive, rests recover', () => {
    expect(wildShapeMax(sheet({ className: 'Druid', level: 1 }))).toBe(0);
    expect(wildShapeMax(sheet({ className: 'Druid', level: 2 }))).toBe(2);
    expect(wildShapeMax(sheet({ className: 'Druid', level: 6 }))).toBe(3);
    expect(wildShapeMax(sheet({ className: 'Druid', level: 17 }))).toBe(4);
    expect(druidLevel(sheet({ classes: [{ name: 'Druid', level: 8 }] }))).toBe(8);
    const feats = derivedClassFeatures(sheet({ className: 'Druid', level: 7 }));
    expect(feats.some((f) => f.id === 'druid-wild-shape')).toBe(true);
    expect(feats.some((f) => f.id === 'druid-elemental-fury')).toBe(true);
    const s = sheet({ className: 'Druid', level: 6, wildShapeUsed: 3 });
    expect(applyShortRest(s).wildShapeUsed).toBe(2);
    expect(applyLongRest(s).wildShapeUsed).toBe(0);
    // Druid is a full WIS caster (already wired since 0.14/0.15)
    expect(spellSaveDc(sheet({ className: 'Druid', level: 5, proficiencyBonus: 3, abilities: { str: 8, dex: 12, con: 12, int: 10, wis: 18, cha: 10 } }))).toBe(8 + 3 + 4);
  });
});

describe('thin-auto conditions', () => {
  it('target advantage / attacker disadvantage / cancel', () => {
    expect(conditionAttackMode([], ['restrained']).mode).toBe('advantage');
    expect(conditionAttackMode(['blinded'], []).mode).toBe('disadvantage');
    expect(conditionAttackMode(['poisoned'], ['stunned']).mode).toBe('normal'); // adv+dis cancel
    expect(conditionAttackMode([], []).mode).toBe('normal');
  });
  it('paralyzed / unconscious target auto-crits', () => {
    expect(conditionAutoCrit(['paralyzed'])).toBe(true);
    expect(conditionAutoCrit(['prone'])).toBe(false);
  });
  it('combineRollModes: advantage + disadvantage = normal', () => {
    expect(combineRollModes('advantage', 'advantage')).toBe('advantage');
    expect(combineRollModes('advantage', 'disadvantage')).toBe('normal');
    expect(combineRollModes('normal', 'disadvantage')).toBe('disadvantage');
  });
});

describe('cover + damage defences (homebrew)', () => {
  it('cover AC bonus', () => {
    expect(coverAcBonus('none')).toBe(0);
    expect(coverAcBonus('half')).toBe(2);
    expect(coverAcBonus('threequarters')).toBe(5);
    expect(coverAcBonus('total')).toBe(0); // handled separately
  });

  it('resistance halves, vulnerability doubles, DR subtracts, immunity zeroes', () => {
    const d = { ...emptyDefenses(), resistances: ['fire'], damageReduction: 3 };
    // 20 fire → ÷2 = 10 → −3 DR = 7
    expect(applyDamageDefenses(20, 'fire', d).final).toBe(7);

    const v = { ...emptyDefenses(), vulnerabilities: ['cold'] };
    expect(applyDamageDefenses(10, 'cold', v).final).toBe(20);

    const im = { ...emptyDefenses(), immunities: ['poison'] };
    expect(applyDamageDefenses(30, 'poison', im).final).toBe(0);

    // wrong type → DR still applies, no res
    expect(applyDamageDefenses(20, 'slashing', d).final).toBe(17);

    // vuln then resist (both) → net unchanged
    const both = { ...emptyDefenses(), resistances: ['acid'], vulnerabilities: ['acid'] };
    expect(applyDamageDefenses(12, 'acid', both).final).toBe(12);
  });
});

describe('skillBonus', () => {
  const s = () =>
    sheet({
      abilities: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
      proficiencyBonus: 3,
    });
  it('no proficiency = ability mod only', () => {
    expect(skillBonus(s(), 'stealth')).toBe(3); // DEX +3
  });
  it('proficiency adds the bonus once', () => {
    expect(skillBonus(sheet({ ...s(), skillProficiencies: ['stealth'] }), 'stealth')).toBe(3 + 3);
  });
  it('expertise adds twice the proficiency bonus', () => {
    const sh = sheet({ ...s(), skillProficiencies: ['stealth'], skillExpertise: ['stealth'] });
    expect(skillBonus(sh, 'stealth')).toBe(3 + 3 * 2); // DEX +3, expertise +6
  });
});

describe('stat blocks', () => {
  const goblin: Statblock = {
    id: 'g',
    name: 'Goblin',
    meta: '',
    cr: '1/4',
    size: 'small',
    ac: 15,
    maxHp: 7,
    hpFormula: '2d6',
    speed: 30,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    proficiencyBonus: 2,
    saveProficiencies: ['dex'],
    skills: [{ skill: 'stealth', bonus: 6 }],
    traits: [],
    actions: [{ id: 'a', name: 'Scimitar', actionType: 'action', attackBonus: 4, damage: '1d6+2' }],
    color: '#000',
    tags: [],
    notes: '',
  };

  it('initiative mod = DEX mod', () => {
    expect(statblockInitiativeMod(goblin)).toBe(2);
  });

  it('tokenStatblockFrom copies combat data incl. skills', () => {
    const t = tokenStatblockFrom(goblin);
    expect(t.initiativeMod).toBe(2);
    expect(t.skills).toEqual([{ skill: 'stealth', bonus: 6 }]);
    expect(t.actions).toHaveLength(1);
    expect(t.fromId).toBe('g');
  });

  it('tokenSaveBonus adds proficiency only where proficient', () => {
    const t = tokenStatblockFrom(goblin);
    expect(tokenSaveBonus(t, 'dex')).toBe(2 + 2); // DEX +2, prof +2
    expect(tokenSaveBonus(t, 'str')).toBe(-1); // STR -1, no prof
  });
});

describe('currency & weight', () => {
  it('sums currency in gp', () => {
    expect(currencyInGp({ pp: 1, gp: 2, ep: 0, sp: 5, cp: 10 })).toBeCloseTo(10 + 2 + 0.5 + 0.1);
  });

  it('carried weight includes items and coins at 50/lb', () => {
    const s = sheet({
      inventory: [item({ weight: 3, quantity: 2 })],
      currency: { pp: 0, gp: 100, ep: 0, sp: 0, cp: 0 },
    });
    expect(carriedWeight(s)).toBe(6 + 2); // 6 lb items + 100 coins / 50
  });

  it('gridFeet is Chebyshev × 5; clampToRange caps distance', () => {
    expect(gridFeet({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(15);
    expect(gridFeet({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
    // move 6 cells (30 ft) but budget 15 ft → clamp to 3 cells along the line
    const c = clampToRange({ x: 0, y: 0 }, { x: 6, y: 0 }, 15);
    expect(c).toEqual({ x: 3, y: 0 });
    // within budget → unchanged
    expect(clampToRange({ x: 0, y: 0 }, { x: 2, y: 1 }, 30)).toEqual({ x: 2, y: 1 });
  });

  it('parseRangeFeet reads common range strings', () => {
    expect(parseRangeFeet('120 ft')).toBe(120);
    expect(parseRangeFeet('20/60 ft')).toBe(20);
    expect(parseRangeFeet('Nón 15ft')).toBe(15);
    expect(parseRangeFeet('Chạm')).toBe(5);
    expect(parseRangeFeet('Bản thân')).toBe(5);
    expect(parseRangeFeet(undefined)).toBe(0);
  });

  it('walkSpeed: sheet > statblock > 30; grappled = 0', () => {
    expect(walkSpeed(25, undefined, false)).toBe(25);
    expect(walkSpeed(undefined, 40, false)).toBe(40);
    expect(walkSpeed(undefined, undefined, false)).toBe(30);
    expect(walkSpeed(30, undefined, true)).toBe(0);
  });

  it('tokenIsGrappled detects the grappled condition or a grapple-named effect', () => {
    expect(tokenIsGrappled({ effects: [{ id: 'e', name: 'x', condition: 'grappled' }] })).toBe(true);
    expect(tokenIsGrappled({ effects: [{ id: 'e', name: 'Bị ghì (Grapple)' }] })).toBe(true);
    expect(tokenIsGrappled({ effects: [{ id: 'e', name: 'Blessed' }] })).toBe(false);
    expect(tokenIsGrappled(undefined)).toBe(false);
  });

  it('attunementCount counts attuned items; slots = 3', () => {
    expect(ATTUNEMENT_SLOTS).toBe(3);
    const s = sheet({
      inventory: [
        item({ id: 'a', attuned: true }),
        item({ id: 'b', attuned: true }),
        item({ id: 'c', attuned: false }),
        item({ id: 'd' }),
      ],
    });
    expect(attunementCount(s)).toBe(2);
    expect(attunementCount(sheet())).toBe(0);
  });
});

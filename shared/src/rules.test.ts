import { describe, expect, it } from 'vitest';
import {
  actionDamageParts,
  allActions,
  applyDamageDefenses,
  applyLongRest,
  applyShortRest,
  carriedWeight,
  casterTypeOf,
  combineRollModes,
  computeArmorClass,
  concentrationDc,
  conditionAttackMode,
  conditionAutoCrit,
  coverAcBonus,
  currencyInGp,
  derivedActions,
  derivedDefenses,
  emptyCurrency,
  mergeDefenses,
  resolveDamageParts,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
  statblockInitiativeMod,
  targetRiderParts,
  tokenSaveBonus,
  tokenStatblockFrom,
} from './rules.js';
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
    expect(allActions(s)).toHaveLength(2);
    expect(allActions(s)[0].source).toBe('weapon');
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
});

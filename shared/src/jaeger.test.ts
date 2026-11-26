import { describe, expect, it } from 'vitest';
import {
  breakingBlowOptions,
  jaegerBloodMagicDc,
  jaegerChapter,
  jaegerKnownArts,
  expendJaegerMomentum,
  jaegerBleedDc,
  jaegerDamageParts,
  jaegerFinisherDc,
  jaegerFinishersKnown,
  jaegerFocusArtsKnown,
  jaegerFocusLeft,
  jaegerFocusMax,
  jaegerKnownFinishers,
  jaegerMomentum,
  jaegerMomentumDie,
  jaegerMomentumMax,
  jaegerVolleyDc,
  regainJaegerFocus,
  jaegerCanRegain,
  spendJaegerFocus,
  viciousCritMin,
  viciousFinisherDamage,
} from './jaeger.js';
import { actionDamageParts, applyLongRest, applyShortRest } from './rules.js';
import { classDefaults, multiclassProficiencies, recommendedHp, registerCustomClass } from './classDefaults.js';
import { derivedClassFeatures } from './classFeatures.js';
import { attacksPerAction } from './turnRules.js';
import { extraAttackClasses } from './rules.js';
import { emptyCurrency } from './rules.js';
import type { CharacterSheet, SheetAction } from './types.js';

function sheet(level: number, over: Partial<CharacterSheet> = {}): CharacterSheet {
  const pb = level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
  return {
    id: 's1',
    ownerId: 'p1',
    name: 'Hunter',
    className: 'Jaeger',
    level,
    proficiencyBonus: pb,
    abilities: { str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 8 },
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    maxHp: 20,
    currentHp: 20,
    tempHp: 0,
    armorClass: 14,
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

describe('Jaeger resources', () => {
  it('Focus Points follow the 1 / +1 at 2, 5, 9, 13, 17 progression', () => {
    expect([1, 2, 4, 5, 8, 9, 12, 13, 16, 17, 20].map((l) => jaegerFocusMax(sheet(l)))).toEqual([
      1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
    expect(jaegerFocusMax(sheet(5, { jaeger: { fightingStyle: 'focused' } }))).toBe(4);
    expect(jaegerFocusMax(sheet(5, { className: 'Fighter' }))).toBe(0);
  });

  it('Momentum die grows d6 → d8 at 11 → d10 at 17, none at level 1', () => {
    expect([1, 2, 10, 11, 16, 17].map((l) => jaegerMomentumDie(sheet(l)))).toEqual([null, 'd6', 'd6', 'd8', 'd8', 'd10']);
  });

  it('Momentum cap = PB (house rule)', () => {
    expect(jaegerMomentumMax(sheet(1))).toBe(0);
    expect(jaegerMomentumMax(sheet(2))).toBe(2);
    expect(jaegerMomentumMax(sheet(5, { abilities: { str: 20, dex: 12, con: 10, int: 10, wis: 10, cha: 10 } }))).toBe(3);
  });

  it('Focus regain in combat: once per round', () => {
    const s = sheet(5, { jaeger: { focusUsed: 3 } });
    expect(jaegerCanRegain(s, 2)).toBe(true);
    const once = { ...s, jaeger: regainJaegerFocus(s, 1, 2) };
    expect(once.jaeger.focusUsed).toBe(2);
    expect(jaegerCanRegain(once, 2)).toBe(false);
    expect(jaegerCanRegain(once, 3)).toBe(true);
    expect(jaegerCanRegain(once)).toBe(true); // out of combat: no cap
    expect(jaegerCanRegain(sheet(5))).toBe(false); // nothing to regain
  });

  it('spending Focus grants Momentum from level 2 (capped) and fails when empty', () => {
    const s1 = sheet(1);
    const after1 = spendJaegerFocus(s1)!;
    expect(after1.focusUsed).toBe(1);
    expect(after1.momentum).toBe(0); // no Momentum at level 1
    expect(spendJaegerFocus({ ...s1, jaeger: after1 })).toBeNull();

    const s2 = sheet(2, { jaeger: { momentum: 1 } });
    const after2 = spendJaegerFocus(s2, 1, 1)!; // e.g. Flourish: +1 extra die
    expect(after2.momentum).toBe(2); // capped at PB 2
    expect(jaegerFocusLeft({ ...s2, jaeger: after2 })).toBe(1);
    expect(regainJaegerFocus({ ...s2, jaeger: after2 }).focusUsed).toBe(0);
  });

  it('known Focus Arts / Finishers counts', () => {
    expect([1, 2, 7, 13, 17].map((l) => jaegerFocusArtsKnown(sheet(l)))).toEqual([2, 3, 4, 5, 6]);
    expect([1, 2, 4, 6, 8, 12].map((l) => jaegerFinishersKnown(sheet(l)))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(jaegerKnownFinishers(sheet(1))).toEqual([]);
    expect(jaegerKnownFinishers(sheet(4, { jaeger: { finishers: ['vicious', 'brutal'] } }))).toEqual(['brutal', 'vicious']);
  });

  it('chapters grant their own Arts / Finishers on top of the known limits', () => {
    expect(jaegerChapter(sheet(3, { subclass: 'Sanguine Chapter' }))).toBe('sanguine');
    expect(jaegerKnownFinishers(sheet(3, { subclass: 'Sanguine Chapter' }))).toEqual(['brutal', 'blood-drain']);
    expect(jaegerKnownArts(sheet(3, { subclass: 'Sanguine' }))).not.toContain('blood-craze');
    expect(jaegerKnownArts(sheet(17, { subclass: 'Sanguine' }))).toContain('blood-craze');
    expect(jaegerKnownArts(sheet(3, { subclass: 'Heretic Chapter' }))).toEqual(['weapon-parry', 'dodge-step', 'spell-flurry']);
    expect(jaegerKnownFinishers(sheet(3, { subclass: 'Marauder' }))).toContain('great-cleave');
    expect(jaegerChapter(sheet(3, { className: 'Fighter', subclass: 'Sanguine' }))).toBeNull();
    expect(jaegerBloodMagicDc(sheet(5))).toBe(8 + 3 + 2); // CON 14 beats INT 12
  });

  it('rests: short restores Focus, long also clears Momentum + Piercing Gaze', () => {
    const s = sheet(5, { jaeger: { focusUsed: 3, momentum: 2, armedFinisher: 'brutal', gazeUsed: true } });
    expect(applyShortRest(s).jaeger).toMatchObject({ focusUsed: 0, momentum: 2, gazeUsed: true });
    expect(applyLongRest(s).jaeger).toMatchObject({ focusUsed: 0, momentum: 0, armedFinisher: null, gazeUsed: false });
  });
});

describe('Jaeger finishers', () => {
  it('DCs: finisher uses the better of STR/DEX, volley DEX, bleed adds half the dice left', () => {
    const s = sheet(5, { abilities: { str: 18, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } });
    expect(jaegerFinisherDc(s)).toBe(8 + 3 + 4);
    expect(jaegerVolleyDc(s)).toBe(8 + 3 + 2);
    expect(jaegerBleedDc(s, 3)).toBe(15 + 1);
  });

  it('Breaking Blow rows unlock by dice; Vicious crit range bottoms out at 10', () => {
    expect(breakingBlowOptions(3).map((r) => r.condition)).toEqual(['prone', 'blinded', 'restrained']);
    expect(breakingBlowOptions(9).at(-1)).toMatchObject({ save: 'con', condition: 'paralyzed' });
    expect([0, 1, 3, 5, 7].map(viciousCritMin)).toEqual([20, 18, 14, 10, 10]);
    expect(viciousFinisherDamage(sheet(11, { jaeger: { momentum: 3 } }))).toBe('1d12+3+3d8'); // DEX 16 beats STR 10
  });

  it('an armed Brutal Finisher adds the held dice to a weapon attack; expending clears them', () => {
    const blade: SheetAction = { id: 'a1', name: 'Saber', actionType: 'action', attackBonus: 5, damage: '1d8+3', damageType: 'slashing', source: 'manual' };
    const armed = sheet(5, { jaeger: { momentum: 3, armedFinisher: 'brutal' } });
    expect(jaegerDamageParts(armed, 'slashing')).toEqual([{ dice: '3d6', type: 'slashing', label: 'Brutal Finisher' }]);
    expect(actionDamageParts(armed, blade).some((p) => p.label === 'Brutal Finisher')).toBe(true);
    expect(jaegerDamageParts(sheet(5, { jaeger: { momentum: 3 } }), 'slashing')).toEqual([]);
    const spent = expendJaegerMomentum(armed);
    expect(jaegerMomentum({ ...armed, jaeger: spent })).toBe(0);
    expect(spent.armedFinisher).toBeNull();
  });
});

describe('custom (local) class registration', () => {
  it('a registered class gets defaults, HP, multiclass profs and its feature list', () => {
    registerCustomClass({
      key: 'jaeger',
      name: 'Jaeger',
      hitDie: 8,
      saves: ['dex', 'int'],
      skillPick: 2,
      skillOptions: ['acrobatics', 'stealth'],
      multiclass: { armor: ['light', 'medium'], shield: false, weapons: 'Martial', skillPick: 0, skillOptions: null },
      features: [
        { id: 'j1', level: 1, name: 'A', description: 'a' },
        { id: 'j5', level: 5, name: 'B', description: 'b' },
      ],
      extraAttack: [[5, 2]],
    });
    expect(classDefaults('Jaeger')?.hitDie).toBe(8);
    expect(multiclassProficiencies('jaeger')?.armor).toEqual(['light', 'medium']);
    const s = sheet(3); // CON 14 → +2
    expect(recommendedHp(s)).toBe(8 + 2 + 2 * (5 + 2));
    expect(derivedClassFeatures(s).map((f) => f.id)).toEqual(['j1']);
    expect(derivedClassFeatures(sheet(5)).map((f) => f.id)).toEqual(['j1', 'j5']);
  });

  it('a registered Extra Attack table counts (2 attacks from level 5); Blood Frenzy makes it 3 while bloodied', () => {
    expect(attacksPerAction(sheet(4))).toBe(1);
    expect(attacksPerAction(sheet(5))).toBe(2);
    expect(extraAttackClasses(sheet(5))).toEqual(['Jaeger']);
    expect(extraAttackClasses(sheet(4))).toEqual([]);
    const frenzy = sheet(17, { subclass: 'Sanguine Chapter', maxHp: 100, currentHp: 50 });
    expect(attacksPerAction(frenzy)).toBe(3);
    expect(attacksPerAction({ ...frenzy, currentHp: 51 })).toBe(2);
    expect(attacksPerAction({ ...frenzy, subclass: 'Absolute Chapter' })).toBe(2);
  });
});

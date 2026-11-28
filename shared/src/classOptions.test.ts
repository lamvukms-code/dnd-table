import { describe, expect, it } from 'vitest';
import { brutalOnHit, cunningOnHit, cunningStrikeDc, strikePickProblem } from './strikeOptions.js';
import { featFeatureDefs, featureRiders, passiveCheckBonus } from './featurePassives.js';
import { skillBonus } from './rules.js';
import type { CharacterSheet } from './types.js';

const pc = (className: string, level: number, extra: Partial<CharacterSheet> = {}): CharacterSheet =>
  ({
    id: 's', name: 'X', className, level, classes: [{ name: className, level }],
    abilities: { str: 16, dex: 18, con: 14, int: 10, wis: 16, cha: 10 }, proficiencyBonus: level >= 9 ? 4 : 3, initiativeMisc: 0,
    saveProficiencies: [], skillProficiencies: [], skillExpertise: [], feats: [], features: [], inventory: [], actions: [],
    ...extra,
  }) as unknown as CharacterSheet;

describe('Cunning Strike / Brutal Strike', () => {
  it('limits by level and Sneak Attack dice', () => {
    expect(strikePickProblem(pc('Rogue', 5), 'cunning', ['poison'])).toBeNull();
    expect(strikePickProblem(pc('Rogue', 5), 'cunning', ['poison', 'trip'])).toMatch(/Tối đa 1/);
    expect(strikePickProblem(pc('Rogue', 14), 'cunning', ['knockout', 'trip'])).toBeNull();
    expect(strikePickProblem(pc('Rogue', 14), 'cunning', ['knockout', 'obscure'])).toMatch(/xúc xắc/);
    expect(strikePickProblem(pc('Barbarian', 9), 'brutal', ['forceful', 'hamstring'])).toMatch(/Tối đa 1/);
  });
  it('on-hit effects carry the save and the effect', () => {
    const r = pc('Rogue', 5);
    expect(cunningStrikeDc(r)).toBe(8 + 4 + 3);
    const [poison] = cunningOnHit(r, ['poison'], { round: 2 });
    expect(poison).toMatchObject({ save: { ability: 'con', dc: 15 }, effect: { condition: 'poisoned', expiresRound: 12 } });
    expect(brutalOnHit(['forceful', 'hamstring'], { round: 1, attackerTokenId: 'b' })).toMatchObject([
      { pushFeet: 15 },
      { effect: { speedPenalty: 15, sourceTokenId: 'b', untilSourceTurnStart: true } },
    ]);
  });
});

describe('feature choices and new buttons', () => {
  it('Elemental Fury / Blessed Strikes follow the choice', () => {
    expect(featureRiders(pc('Druid', 7)).some((x) => x.label === 'Primal Strike')).toBe(false);
    const fire = pc('Druid', 7, { featureChoices: { 'druid-elemental-fury': 'primal-fire' } });
    expect(featureRiders(fire).find((x) => x.label === 'Primal Strike')).toMatchObject({ dice: '1d8', type: 'fire' });
    const fire15 = pc('Druid', 15, { featureChoices: { 'druid-elemental-fury': 'primal-fire' } });
    expect(featureRiders(fire15).find((x) => x.label === 'Primal Strike')?.dice).toBe('2d8');
    const cl = pc('Cleric', 7, { featureChoices: { 'cleric-blessed-strikes': 'potent' } });
    expect(featureRiders(cl).find((x) => x.label === 'Potent Spellcasting')?.rider.cantripOnly).toBe(true);
  });
  it('Thaumaturge adds WIS to Religion', () => {
    const t = pc('Cleric', 1, { featureChoices: { 'cleric-divine-order': 'thaumaturge' } });
    expect(skillBonus(t, 'religion') - skillBonus(pc('Cleric', 1), 'religion')).toBe(3);
    expect(passiveCheckBonus(t, 'int', 'arcana')).toBe(3);
  });
  it('Reckless Attack, Uncanny Metabolism, Superior Defense, Magical Cunning, Wild Resurgence buttons', () => {
    const ids = (s: CharacterSheet) => featFeatureDefs(s).filter((d) => d.actions).map((d) => d.id);
    expect(featFeatureDefs(pc('Barbarian', 2)).find((d) => d.id === 'barb-reckless-attack')?.actions?.[0].extraEffect?.attackersAdvantage).toBe(true);
    expect(ids(pc('Monk', 18))).toEqual(expect.arrayContaining(['monk-uncanny-metabolism', 'monk-superior-defense']));
    expect(ids(pc('Warlock', 2))).toContain('warlock-magical-cunning');
    expect(ids(pc('Druid', 5))).toContain('druid-wild-resurgence');
  });
});

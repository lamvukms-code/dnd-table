import { describe, expect, it } from 'vitest';
import { saveBonus } from './rules.js';
import { featFeatureDefs, passiveCheckFloor, passiveHas, passiveReactions, passiveSaveAdvantage } from './featurePassives.js';
import type { CharacterSheet } from './types.js';

const pc = (className: string, level: number): CharacterSheet =>
  ({
    id: 's', name: 'X', className, level, classes: [{ name: className, level }],
    abilities: { str: 18, dex: 16, con: 14, int: 10, wis: 12, cha: 8 }, proficiencyBonus: 4,
    saveProficiencies: ['dex', 'int'], skillProficiencies: [], skillExpertise: [], feats: [], features: [], inventory: [], actions: [],
  }) as unknown as CharacterSheet;

describe('base-class features with mechanics', () => {
  it('Slippery Mind / Disciplined Survivor add save proficiencies', () => {
    expect(saveBonus(pc('Rogue', 14), 'wis')).toBe(1);
    expect(saveBonus(pc('Rogue', 15), 'wis')).toBe(5);
    expect(saveBonus(pc('Monk', 14), 'cha')).toBe(-1 + 4);
  });
  it('Danger Sense, Feral Instinct, Evasion, Elusive flags by level', () => {
    expect(passiveSaveAdvantage(pc('Barbarian', 2), 'dex')).toBe('Danger Sense');
    expect(passiveSaveAdvantage(pc('Barbarian', 1), 'dex')).toBeNull();
    expect(passiveHas(pc('Barbarian', 7), 'initiativeAdvantage')).toBe(true);
    expect(passiveHas(pc('Monk', 7), 'evasion')).toBe(true);
    expect(passiveHas(pc('Rogue', 17), 'elusive')).toBe(false);
    expect(passiveHas(pc('Rogue', 18), 'elusive')).toBe(true);
  });
  it('Reliable Talent and Indomitable Might floors', () => {
    expect(passiveCheckFloor(pc('Rogue', 7), 'dex', { proficient: true }).d20Min).toBe(10);
    expect(passiveCheckFloor(pc('Rogue', 7), 'dex', { proficient: false }).d20Min).toBeUndefined();
    expect(passiveCheckFloor(pc('Barbarian', 18), 'str', { save: true }).totalMin).toBe(18);
    expect(passiveCheckFloor(pc('Barbarian', 18), 'dex').totalMin).toBeUndefined();
  });
  it('Steady Aim is a button; Uncanny Dodge and Deflect Attacks are reactions', () => {
    const aim = featFeatureDefs(pc('Rogue', 3)).find((d) => d.id === 'rogue-steady-aim');
    expect(aim?.actions?.[0]).toMatchObject({ cost: 'bonus', effect: { rollAdvantage: ['attack'], untilEndOfTurn: true } });
    expect(passiveReactions(pc('Rogue', 5)).map((r) => r.reaction.kind)).toEqual(['halve']);
    expect(passiveReactions(pc('Monk', 3))[0]).toMatchObject({ classKey: 'monk', reaction: { kind: 'reduce' } });
  });
});

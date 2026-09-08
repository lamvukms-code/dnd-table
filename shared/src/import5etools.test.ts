import { describe, expect, it } from 'vitest';
import {
  convert5eToolsMonster,
  crToProficiency,
  flattenEntries,
  parse5eToolsBestiary,
  stripTags,
} from './import5etools.js';

const goblin = {
  name: 'Goblin Warrior',
  source: 'XMM',
  size: ['S'],
  type: { type: 'goblinoid', tags: ['goblin'] },
  alignment: ['C', 'E'],
  ac: [{ ac: 15, from: ['leather armor', '{@item shield|phb}'] }],
  hp: { average: 10, formula: '3d6' },
  speed: { walk: 30 },
  str: 8,
  dex: 15,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  save: { dex: '+4' },
  skill: { stealth: '+6', 'sleight of hand': '+2' },
  senses: ['darkvision 60 ft.'],
  passive: 9,
  resist: ['cold'],
  immune: [{ immune: ['poison'], note: 'x' }],
  languages: ['Common', 'Goblin'],
  cr: '1/8',
  trait: [{ name: 'Nimble Escape', entries: ['The goblin takes the Disengage or Hide action as a Bonus Action.'] }],
  action: [
    {
      name: 'Scimitar',
      entries: [
        '{@atkr m} {@hit 4} to hit, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage.',
      ],
    },
    {
      name: 'Shortbow',
      entries: ['*Ranged Attack Roll:* +4, range 80/320 ft. *Hit:* 5 (1d6 + 2) Piercing damage.'],
    },
  ],
  bonus: [{ name: 'Cunning Action', entries: ['The goblin takes the Dash action.'] }],
};

describe('5etools import', () => {
  it('crToProficiency follows the 5e table', () => {
    expect(crToProficiency('1/8')).toBe(2);
    expect(crToProficiency('4')).toBe(2);
    expect(crToProficiency('5')).toBe(3);
    expect(crToProficiency('17')).toBe(6);
  });

  it('stripTags removes 5etools markup', () => {
    expect(stripTags('{@hit 4} to hit, {@h}5 ({@damage 1d6 + 2}) Slashing')).toBe(
      '+4 to hit, Hit: 5 (1d6 + 2) Slashing',
    );
    expect(stripTags('the {@condition prone|phb|prone} condition')).toBe('the prone condition');
  });

  it('flattenEntries handles nested lists', () => {
    expect(flattenEntries(['A', { type: 'list', items: ['x', 'y'] }])).toBe('A\n• x\n• y');
  });

  it('converts a creature to a Statblock', () => {
    const sb = convert5eToolsMonster(goblin);
    expect(sb.name).toBe('Goblin Warrior');
    expect(sb.size).toBe('small');
    expect(sb.ac).toBe(15);
    expect(sb.maxHp).toBe(10);
    expect(sb.hpFormula).toBe('3d6');
    expect(sb.abilities.dex).toBe(15);
    expect(sb.proficiencyBonus).toBe(2);
    expect(sb.saveProficiencies).toEqual(['dex']);
    expect(sb.skills).toContainEqual({ skill: 'stealth', bonus: 6 });
    expect(sb.skills).toContainEqual({ skill: 'sleight-of-hand', bonus: 2 });
    expect(sb.defenses).toMatchObject({ resistances: ['cold'], immunities: ['poison'] });
    expect(sb.cr).toBe('1/8');
    expect(sb.meta).toContain('Small');
    expect(sb.meta).toContain('Chaotic Evil');
  });

  it('parses attack bonus + damage from action text (2024 and 2014 wording)', () => {
    const sb = convert5eToolsMonster(goblin);
    const scimitar = sb.actions.find((a) => a.name === 'Scimitar')!;
    expect(scimitar.attackBonus).toBe(4);
    expect(scimitar.damage).toBe('1d6+2');
    expect(scimitar.damageType).toBe('slashing');
    const bow = sb.actions.find((a) => a.name === 'Shortbow')!;
    expect(bow.attackBonus).toBe(4);
    expect(bow.damage).toBe('1d6+2');
    const bonus = sb.actions.find((a) => a.name === 'Cunning Action')!;
    expect(bonus.actionType).toBe('bonus');
  });

  it('parse5eToolsBestiary accepts object / array / { monster: [] }', () => {
    expect(parse5eToolsBestiary(goblin).statblocks).toHaveLength(1);
    expect(parse5eToolsBestiary([goblin, goblin]).statblocks).toHaveLength(2);
    expect(parse5eToolsBestiary({ monster: [goblin] }).statblocks).toHaveLength(1);
    const bad = parse5eToolsBestiary({ foo: 1 });
    expect(bad.statblocks).toHaveLength(0);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('skips _copy entries with a warning', () => {
    const r = parse5eToolsBestiary([{ name: 'Variant', _copy: { name: 'Goblin' } }]);
    expect(r.statblocks).toHaveLength(0);
    expect(r.errors[0]).toContain('_copy');
  });
});

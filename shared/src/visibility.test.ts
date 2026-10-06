import { describe, expect, it } from 'vitest';
import {
  healthTierOf,
  rollLogForPlayers,
  sheetsForPlayer,
  statblockHiddenFromPlayers,
  statsHiddenFromPlayers,
  tokenForPlayers,
} from './visibility.js';
import { blankSheetForTests } from './visibility.testutil.js';
import type { RollLogEntry, Token, TokenStatblock } from './types.js';

const sb: TokenStatblock = {
  name: 'Alpengrendel',
  meta: 'Large giant, chaotic evil',
  abilities: { str: 22, dex: 8, con: 20, int: 5, wis: 10, cha: 6 },
  proficiencyBonus: 3,
  saveProficiencies: ['con'],
  skills: [],
  initiativeMod: -1,
  speed: 40,
  actions: [],
  traits: [],
  fromId: 'bestiary-1',
};
const monster = (over: Partial<Token> = {}): Token => ({
  id: 'm1',
  label: 'Quái lạ',
  x: 3,
  y: 4,
  size: 'large',
  color: '#a00',
  currentHp: 40,
  maxHp: 85,
  tempHp: 5,
  armorClass: 15,
  hidden: false,
  statblock: sb,
  defenses: { resist: ['fire'] } as unknown as Token['defenses'],
  legendaryActionsRemaining: 2,
  effects: [{ id: 'e1', name: 'Poisoned', condition: 'poisoned' }],
  ...over,
});
const pc = (): Token => ({ id: 'p1', label: 'Tịnh Chúng', x: 1, y: 1, size: 'medium', color: '#0a0', currentHp: 20, maxHp: 34, armorClass: 17, hidden: false });

describe('healthTierOf', () => {
  it('maps HP ratio to a coarse tier', () => {
    expect(healthTierOf(85, 85)).toBe('full');
    expect(healthTierOf(60, 85)).toBe('hurt');
    expect(healthTierOf(42, 85)).toBe('bloodied');
    expect(healthTierOf(21, 85)).toBe('critical');
    expect(healthTierOf(0, 85)).toBe('down');
    expect(healthTierOf(undefined, 85)).toBeUndefined();
  });
});

describe('tokenForPlayers', () => {
  it('strips every number a player could use to learn an enemy’s AC / HP / statblock', () => {
    const out = tokenForPlayers(monster())!;
    const json = JSON.stringify(out);
    expect(out.currentHp).toBeUndefined();
    expect(out.maxHp).toBeUndefined();
    expect(out.tempHp).toBeUndefined();
    expect(out.armorClass).toBeUndefined();
    expect(out.defenses).toBeUndefined();
    expect(out.legendaryActionsRemaining).toBeUndefined();
    expect(out.healthTier).toBe('bloodied');
    expect(out.statblock?.abilities.str).toBe(10);
    expect(out.statblock?.speed).toBe(40);
    expect(json).not.toContain('Alpengrendel');
    expect(json).not.toContain('chaotic evil');
    expect(json).not.toContain('bestiary-1');
    // what the whole table can see anyway survives
    expect(out.x).toBe(3);
    expect(out.label).toBe('Quái lạ');
    expect(out.effects?.[0].name).toBe('Poisoned');
  });

  it('leaves PC tokens, player-controlled NPCs and DM-revealed monsters untouched', () => {
    const p = pc();
    expect(tokenForPlayers(p)).toBe(p);
    const pet = monster({ controllerId: 'player-1' });
    expect(tokenForPlayers(pet)).toBe(pet);
    expect(statsHiddenFromPlayers(p)).toBe(false);
    expect(statblockHiddenFromPlayers(p)).toBe(false);
  });

  it('revealStats shows AC / HP but never the statblock or defenses', () => {
    const out = tokenForPlayers(monster({ revealStats: true }))!;
    expect(out.currentHp).toBe(40);
    expect(out.armorClass).toBe(15);
    expect(out.healthTier).toBeUndefined();
    expect(out.defenses).toBeUndefined();
    expect(out.statblock?.abilities.str).toBe(10);
    expect(out.statblock?.actions).toEqual([]);
  });

  it('drops DM-hidden tokens entirely', () => {
    expect(tokenForPlayers(monster({ hidden: true }))).toBeNull();
    expect(tokenForPlayers({ ...pc(), hidden: true })).toBeNull();
  });

  it('does not mutate the original token', () => {
    const m = monster();
    tokenForPlayers(m);
    expect(m.currentHp).toBe(40);
    expect(m.armorClass).toBe(15);
  });
});

describe('rollLogForPlayers', () => {
  const entry = (targetTokenId: string): RollLogEntry =>
    ({
      id: 'r',
      ts: 0,
      actorId: 'a',
      actorName: 'A',
      label: 'Hit',
      result: { total: 17, rolls: [], notation: '1d20+5', breakdown: '' } as unknown as RollLogEntry['result'],
      attack: { targetTokenId, targetName: 'x', targetAc: 15, hit: true, crit: false, fumble: false },
    }) as RollLogEntry;

  it('drops targetAc for hidden / vanished targets but keeps hit/miss', () => {
    const [hidden, shown, gone] = rollLogForPlayers([entry('m1'), entry('p1'), entry('zzz')], new Set(['p1']));
    expect(hidden.attack?.targetAc).toBeUndefined();
    expect(hidden.attack?.hit).toBe(true);
    expect(shown.attack?.targetAc).toBe(15);
    expect(gone.attack?.targetAc).toBeUndefined();
  });

  it('drops the DM’s private rolls entirely', () => {
    const secret = { ...entry('p1'), private: true };
    expect(rollLogForPlayers([secret, entry('p1')], new Set(['p1']))).toHaveLength(1);
  });
});

describe('sheetsForPlayer', () => {
  it('gives a player their own sheet in full and everyone else’s as blank stubs', () => {
    const mine = blankSheetForTests('me', 'Tịnh Chúng');
    const other = { ...blankSheetForTests('them', 'Elderroot'), className: 'Druid', level: 7, maxHp: 55, notes: 'secret plan', tokenId: 'tok9' };
    const [a, b] = sheetsForPlayer([mine, other], 'me');
    expect(a).toBe(mine);
    expect(b.redacted).toBe(true);
    expect(b.name).toBe('Elderroot');
    expect(b.tokenId).toBe('tok9');
    expect(b.ownerId).toBe('them');
    const json = JSON.stringify(b);
    expect(json).not.toContain('Druid');
    expect(json).not.toContain('secret plan');
    expect(b.maxHp).toBe(1);
    expect(b.level).toBe(1);
  });

  it('shows the DM-less viewer nothing of a sheet they do not own, even with no owner match', () => {
    const [s] = sheetsForPlayer([blankSheetForTests('them', 'X')], 'someone-else');
    expect(s.redacted).toBe(true);
  });
});

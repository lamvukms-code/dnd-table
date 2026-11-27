import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClientAction, Participant, SheetAction, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const abil = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function sb(name: string, actions: SheetAction[], extra: Partial<TokenStatblock> = {}): TokenStatblock {
  return { name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions, traits: [], ...extra };
}
function tok(id: string, x: number, statblock: TokenStatblock, hp = 100): Token {
  return { id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: hp, maxHp: hp, armorClass: 10, statblock, effects: [] } as Token;
}
const claw: SheetAction = { id: 'claw', name: 'Claw', actionType: 'action', attackBonus: 100, damage: '10', damageType: 'slashing' } as SheetAction;
const glare: SheetAction = {
  id: 'glare',
  name: 'Warding Glare',
  actionType: 'reaction',
  description: 'When the warden is attacked by a creature within 30 feet of it that it can see, the warden can impose disadvantage on the attack roll.',
} as SheetAction;

function setup(tokens: Token[], order: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'room-react-'));
  const room = new Room(join(dir, 'room.json'), join(dir, 'bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.initiative = {
    entries: order.map((id, i) => ({ id: `e${i}`, name: id, initiative: 20 - i, tokenId: id, isActive: false, hasGone: false })),
    round: 1,
    turnIndex: 0,
    running: false,
  };
  expect(room.apply(dm, { t: 'initStart' })).toBeNull();
  return room;
}
const attack = (label: string, from: string, to: string): ClientAction => ({
  t: 'attack',
  label,
  attackNotation: '1d20+100',
  damageParts: [{ dice: '10', type: 'slashing' }],
  targetTokenId: to,
  attackerTokenId: from,
  attackRange: 'melee',
  actionName: 'Claw',
});

describe('a reaction to being attacked comes before the roll', () => {
  it('holds the attack (and the rest of the Multiattack) until the DM answers', () => {
    const room = setup([tok('brute', 0, sb('Brute', [claw])), tok('warden', 1, sb('Warden', [glare]))], ['brute', 'warden']);
    const warden = () => room.state.tokens.find((t) => t.id === 'warden')!;
    expect(room.apply(dm, attack('Claw 1/2', 'brute', 'warden'))).toBeNull();
    expect(room.apply(dm, attack('Claw 2/2', 'brute', 'warden'))).toBeNull();
    // nothing landed yet: both swings wait for the reaction answer
    expect(warden().currentHp).toBe(100);
    const p = room.state.reactPrompts!;
    expect(p).toHaveLength(1);
    expect(p[0].holdsAttack).toBeTruthy();

    expect(room.apply(dm, { t: 'reactResolve', id: p[0].id, use: true })).toBeNull();
    // both swings resolved, in order; the first one rolled with disadvantage
    expect(warden().currentHp).toBe(80);
    const atk = room.state.rollLog.filter((r) => r.attack).map((r) => r.label);
    expect(atk).toHaveLength(2);
    expect(atk[0]).toMatch(/Claw 1\/2.*Warding Glare: BẤT LỢI/);
    expect(atk[1]).toMatch(/Claw 2\/2/);
    expect(atk[1]).not.toMatch(/BẤT LỢI/);
    expect(warden().turnUsed?.reaction).toBe(true);
    expect(room.state.reactPrompts).toHaveLength(0);
  });

  it('skipping lets the attack land normally, and the next swing asks again', () => {
    const room = setup([tok('brute', 0, sb('Brute', [claw])), tok('warden', 1, sb('Warden', [glare]))], ['brute', 'warden']);
    room.apply(dm, attack('Claw 1/2', 'brute', 'warden'));
    room.apply(dm, attack('Claw 2/2', 'brute', 'warden'));
    room.apply(dm, { t: 'reactResolve', id: room.state.reactPrompts![0].id, use: false });
    expect(room.state.tokens.find((t) => t.id === 'warden')!.currentHp).toBe(90);
    // the reaction is still unspent: the second swing waits for its own answer
    expect(room.state.reactPrompts).toHaveLength(1);
    room.apply(dm, { t: 'reactResolve', id: room.state.reactPrompts![0].id, use: false });
    expect(room.state.tokens.find((t) => t.id === 'warden')!.currentHp).toBe(80);
  });

  it('an ally protecting the creatures it summoned', () => {
    const guard: SheetAction = {
      id: 'guard',
      name: 'Shelter Brood',
      actionType: 'reaction',
      description: 'When a creature summoned by the matron within 30 feet of her is targeted by an attack roll, she can impose disadvantage on the attack roll.',
    } as SheetAction;
    const room = setup(
      [tok('matron', 0, sb('Matron', [guard])), tok('spawn', 1, sb('Spawn', [claw])), tok('hero', 2, sb('Hero', [claw]))],
      ['matron', 'spawn', 'hero'],
    );
    room.state.initiative.entries.find((e) => e.tokenId === 'spawn')!.summonedBy = 'matron';
    room.apply(dm, attack('Hit spawn', 'hero', 'spawn'));
    expect(room.state.reactPrompts?.map((p) => p.tokenId)).toEqual(['matron']);
    // not for a creature it didn't summon
    room.apply(dm, { t: 'reactResolve', id: room.state.reactPrompts![0].id, use: false });
    room.apply(dm, attack('Hit matron', 'hero', 'matron'));
    expect(room.state.reactPrompts).toHaveLength(0);
  });
});

describe('legendary actions', () => {
  const tail: SheetAction = { id: 'tail', name: 'Tail Swipe', actionType: 'legendary', description: 'It swipes.' } as SheetAction;
  const boss = () => tok('boss', 0, sb('Boss', [claw], { legendaryActionsPerRound: 3, legendaryActions: [tail] }));

  it('fire with only two creatures in the fight, at the end of the other one\'s turn', () => {
    const room = setup([boss(), tok('grunt', 3, sb('Grunt', [claw]))], ['boss', 'grunt']);
    expect(room.state.dmPrompt).toBeNull(); // combat just started: no "end of another turn" yet
    room.apply(dm, { t: 'initNext' }); // boss's turn ends → grunt's: the boss can't act at the end of its own turn
    expect(room.state.dmPrompt).toBeNull();
    room.apply(dm, { t: 'initNext' }); // grunt's turn ends → boss's turn starts
    expect(room.state.dmPrompt).toMatchObject({ kind: 'legendaryAction', tokenId: 'boss', remaining: 3 });
  });

  it('what it spends at the end of the previous turn does not eat into its own refill', () => {
    const room = setup([boss(), tok('grunt', 3, sb('Grunt', [claw]))], ['boss', 'grunt']);
    room.apply(dm, { t: 'initNext' });
    room.apply(dm, { t: 'initNext' });
    room.apply(dm, { t: 'dmPromptUse', actionId: 'tail' });
    expect(room.state.dmPrompt).toMatchObject({ kind: 'legendaryAction', remaining: 2 });
    room.apply(dm, { t: 'dmPromptDismiss' });
    expect(room.state.tokens.find((t) => t.id === 'boss')!.legendaryActionsRemaining).toBe(3);
  });

  it('a legendary creature added after combat started counts as full', () => {
    const room = setup([tok('grunt', 3, sb('Grunt', [claw])), tok('imp', 5, sb('Imp', [claw]))], ['grunt', 'imp']);
    room.state.tokens.push(boss()); // dropped on the map mid-fight, never had its turn
    room.apply(dm, { t: 'initNext' });
    expect(room.state.dmPrompt).toMatchObject({ kind: 'legendaryAction', tokenId: 'boss', remaining: 3 });
  });
});

describe('Dash', () => {
  const player: Participant = { id: 'p1', name: 'P', role: 'player', connected: true } as Participant;
  it('spends the Action in combat, and a player cannot Dash again once it is spent', () => {
    const room = setup([tok('hero', 0, sb('Hero', [claw])), tok('grunt', 3, sb('Grunt', [claw]))], ['hero', 'grunt']);
    const hero = () => room.state.tokens.find((t) => t.id === 'hero')!;
    hero().controllerId = 'p1';
    expect(room.apply(player, { t: 'tokenDash', id: 'hero' })).toBeNull();
    expect(hero().turnUsed?.action).toBe(true);
    const once = hero().extraMove;
    expect(room.apply(player, { t: 'tokenDash', id: 'hero' })).toMatch(/không Dash được nữa/);
    expect(hero().extraMove).toBe(once);
    // a Bonus Action Dash (Cunning Action) is still open, once
    expect(room.apply(player, { t: 'tokenDash', id: 'hero', cost: 'bonus' })).toBeNull();
    expect(room.apply(player, { t: 'tokenDash', id: 'hero', cost: 'bonus' })).toMatch(/không Dash được nữa/);
    // the DM can still override
    expect(room.apply(dm, { t: 'tokenDash', id: 'hero' })).toBeNull();
  });
});

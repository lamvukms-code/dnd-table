import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerInvocationDefs, WARLOCK_INVOCATIONS_DRAFT } from '@dnd-table/shared';
import type { CharacterSheet, ClientAction, Participant, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const abil = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const sb = (name: string) => ({ name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions: [], traits: [] }) as unknown as TokenStatblock;
const tok = (id: string, x: number, statblock?: TokenStatblock): Token =>
  ({ id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: 100, maxHp: 100, armorClass: 10, statblock, effects: [] }) as unknown as Token;

const before = WARLOCK_INVOCATIONS_DRAFT.length;
registerInvocationDefs([
  { id: 't-counter', name: 'Test Counter', guidance: '', passive: { reaction: { kind: 'counter', dice: '1d10', type: 'force', stunOnHit: true, spendUseOnDamage: true } }, uses: { max: 1, recharge: 'short' } },
  { id: 't-step', name: 'Test Step', guidance: '', passive: { reaction: { kind: 'stepAway', feet: 5 } }, uses: { max: 'cha-mod', recharge: 'long' } },
]);
afterAll(() => WARLOCK_INVOCATIONS_DRAFT.splice(before));

function warlock(features: string[]): CharacterSheet {
  return {
    id: 'wl',
    ownerId: player.id,
    name: 'Wl',
    className: 'Warlock',
    level: 7,
    classes: [{ name: 'Warlock', level: 7 }],
    abilities: { ...abil, cha: 18 },
    proficiencyBonus: 3,
    currentHp: 40,
    maxHp: 40,
    tempHp: 0,
    inventory: [],
    actions: [],
    damageRiders: [],
    feats: [],
    features: features.map((name, i) => ({ id: `f${i}`, name, source: 'Eldritch Invocation', description: '' })),
    spellcastingAbility: 'cha',
    tokenId: 'wl',
  } as unknown as CharacterSheet;
}
function setup(tokens: Token[], sheets: CharacterSheet[] = []) {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-inv-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.sheets.push(...sheets);
  room.state.participants.push(player);
  room.state.initiative = { entries: tokens.map((t, i) => ({ id: `e${i}`, name: t.id, initiative: 20 - i, tokenId: t.id, isActive: false, hasGone: false })), round: 1, turnIndex: 0, running: false };
  room.apply(dm, { t: 'initStart' });
  return room;
}
const atk = (from: string, to: string, extra: Partial<Extract<ClientAction, { t: 'attack' }>> = {}): ClientAction => ({
  t: 'attack', label: `${from} → ${to}`, attackNotation: '1d20+100', damageParts: [{ dice: '10', type: 'slashing' }], targetTokenId: to, attackerTokenId: from, attackRange: 'melee', ...extra,
});
const T = (room: Room, id: string) => room.state.tokens.find((t) => t.id === id)!;

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('invocation mechanics on the server', () => {
  it('an effect with critMin 19 makes a natural 19 a critical hit', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))]);
    T(room, 'a').effects = [{ id: 'h', name: 'Keen Aim', critMin: 19 }];
    room.apply(dm, atk('a', 'b', { attackNotation: '1d20+5', external: { attack: { total: 24, faces: [19], d20Natural: 19, source: 'dddice' }, crit: false } }));
    expect(room.state.rollLog.find((l) => l.attack)?.attack?.crit).toBe(true);
  });

  it('low damage dice are rolled again once', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))]);
    room.apply(dm, atk('a', 'b', {
      attackNotation: '1d20+5',
      damageParts: [{ dice: '1d6', type: 'fire', rerollBelow: 3 }],
      external: { attack: { total: 20, faces: [15], d20Natural: 15, source: 'dddice' }, crit: false, partTotals: [{ total: 1, faces: [1] }] },
    }));
    expect(T(room, 'b').currentHp).toBe(96); // 1 → rerolled 4
  });

  it('counter-attack: the melee attack waits, the counter hits, the attacker is stunned and its attack fails', () => {
    const room = setup([tok('orc', 0, sb('Orc')), tok('wl', 1)], [warlock(['Test Counter'])]);
    room.apply(dm, atk('orc', 'wl'));
    const p = room.state.reactPrompts!.find((x) => x.style === 'counter')!;
    expect(p.ownerId).toBe(player.id);
    expect(room.apply(player, { t: 'reactResolve', id: p.id, use: true })).toBeNull();
    expect(T(room, 'orc').currentHp).toBe(100 - 6);
    expect(T(room, 'orc').effects?.some((e) => e.condition === 'stunned')).toBe(true);
    expect(room.state.sheets[0].currentHp).toBe(40);
    expect(room.state.sheets[0].subclassUses?.['inv:t-counter']).toBe(1);
    // used up until a short rest: the next melee attack is not held
    T(room, 'wl').turnUsed = undefined;
    room.apply(dm, atk('orc', 'wl'));
    expect(room.state.reactPrompts?.length ?? 0).toBe(0);
  });

  it('step away: out of reach, the attack misses', () => {
    const room = setup([tok('orc', 0, sb('Orc')), tok('wl', 1)], [warlock(['Test Step'])]);
    room.apply(dm, atk('orc', 'wl'));
    const p = room.state.reactPrompts!.find((x) => x.style === 'stepAway')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    expect(T(room, 'wl').x).toBe(2);
    expect(room.state.sheets[0].currentHp).toBe(40);
    expect(T(room, 'wl').turnUsed?.reaction).toBe(true);
  });

  it('declining lets the attack land', () => {
    const room = setup([tok('orc', 0, sb('Orc')), tok('wl', 1)], [warlock(['Test Step'])]);
    room.apply(dm, atk('orc', 'wl'));
    const p = room.state.reactPrompts!.find((x) => x.style === 'stepAway')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: false });
    expect(room.state.sheets[0].currentHp).toBe(30);
  });
});

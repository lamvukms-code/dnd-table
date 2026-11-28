import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterSheet, ClientAction, Participant, SheetAction, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const abil = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function sb(name: string): TokenStatblock {
  return { name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions: [], traits: [] } as unknown as TokenStatblock;
}
function tok(id: string, x: number, statblock?: TokenStatblock, hp = 100): Token {
  return { id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: hp, maxHp: hp, armorClass: 10, statblock, effects: [] } as unknown as Token;
}
function pcSheet(id: string, tokenId: string, feats: string[], inventory: unknown[] = []): CharacterSheet {
  return {
    id,
    ownerId: player.id,
    name: id,
    className: 'Fighter',
    level: 5,
    classes: [{ name: 'Fighter', level: 5 }],
    abilities: abil,
    proficiencyBonus: 2,
    currentHp: 50,
    maxHp: 50,
    tempHp: 0,
    inventory,
    actions: [],
    damageRiders: [],
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
    tokenId,
  } as unknown as CharacterSheet;
}

function setup(tokens: Token[], order: string[], sheets: CharacterSheet[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'room-mastery-'));
  const room = new Room(join(dir, 'room.json'), join(dir, 'bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.sheets.push(...sheets);
  room.state.participants.push(player);
  room.state.initiative = {
    entries: order.map((id, i) => ({ id: `e${i}`, name: id, initiative: 20 - i, tokenId: id, isActive: false, hasGone: false })),
    round: 1,
    turnIndex: 0,
    running: false,
  };
  expect(room.apply(dm, { t: 'initStart' })).toBeNull();
  return room;
}
const atk = (from: string, to: string, extra: Partial<Extract<ClientAction, { t: 'attack' }>> = {}): ClientAction => ({
  t: 'attack',
  label: `${from} → ${to}`,
  attackNotation: '1d20+100',
  damageParts: [{ dice: '10', type: 'slashing' }],
  targetTokenId: to,
  attackerTokenId: from,
  attackRange: 'melee',
  ...extra,
});
const mastery = (kind: NonNullable<SheetAction['mastery']>['kind'], dc = 13) => ({ mastery: { kind, mod: 3, dc } });
const T = (room: Room, id: string) => room.state.tokens.find((t) => t.id === id)!;

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('weapon mastery on the server', () => {
  it('Graze: a miss still deals the ability modifier', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))], ['a', 'b']);
    expect(room.apply(dm, atk('a', 'b', { attackNotation: '1d20-100', ...mastery('graze') }))).toBeNull();
    expect(T(room, 'b').currentHp).toBe(97);
  });

  it('Vex: advantage marker on the target, used up by the next attack of the same attacker', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))], ['a', 'b']);
    room.apply(dm, atk('a', 'b', mastery('vex')));
    expect(T(room, 'b').effects?.some((e) => e.vexBy === 'a')).toBe(true);
    room.apply(dm, atk('a', 'b'));
    expect(T(room, 'b').effects?.some((e) => e.vexBy === 'a')).toBe(false);
  });

  it("Sap: the target's next attack has disadvantage, once", () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))], ['a', 'b']);
    room.apply(dm, atk('a', 'b', mastery('sap')));
    expect(T(room, 'b').effects?.find((e) => e.consumeOnAttack)?.rollDisadvantage).toEqual(['attack']);
    room.apply(dm, atk('b', 'a'));
    expect(T(room, 'b').effects?.some((e) => e.consumeOnAttack)).toBe(false);
  });

  it('Slow (no stacking), Topple (failed CON save → prone), Push (10 ft)', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))], ['a', 'b']);
    room.apply(dm, atk('a', 'b', mastery('slow')));
    room.apply(dm, atk('a', 'b', mastery('slow')));
    expect(T(room, 'b').effects?.filter((e) => e.speedPenalty).length).toBe(1);
    room.apply(dm, atk('a', 'b', mastery('topple', 100)));
    expect(T(room, 'b').effects?.some((e) => e.condition === 'prone')).toBe(true);
    const x0 = T(room, 'b').x;
    room.apply(dm, atk('a', 'b', mastery('push')));
    expect(T(room, 'b').x - x0).toBe(2);
  });

  it('Cleave: one extra attack after a melee hit, once per turn', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B')), tok('c', 1, sb('C'))], ['a', 'b', 'c']);
    expect(room.apply(dm, atk('a', 'c', { cleave: true }))).toMatch(/Cleave/);
    room.apply(dm, atk('a', 'b', mastery('cleave')));
    expect(T(room, 'a').turnUsed?.cleaveReady).toBe(true);
    expect(room.apply(dm, atk('a', 'c', { cleave: true }))).toBeNull();
    expect(room.apply(dm, atk('a', 'c', { cleave: true }))).toMatch(/Cleave/);
  });

  it('Great Weapon Fighting: a 1 on a damage die counts as 3', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 1, sb('B'))], ['a', 'b']);
    room.apply(
      dm,
      atk('a', 'b', {
        attackNotation: '1d20+5',
        damageParts: [{ dice: '1d6', type: 'slashing', minDie: 3 }],
        external: { attack: { total: 20, faces: [15], d20Natural: 15, source: 'dddice' }, crit: false, partTotals: [{ total: 1, faces: [1] }] },
      }),
    );
    expect(T(room, 'b').currentHp).toBe(97);
  });
});

describe('Protection / Interception (fighting style reactions)', () => {
  const shield = { id: 'sh', name: 'Shield', type: 'shield', equipped: true, quantity: 1, weight: 6, notes: '' };

  it('Protection: the attack waits for the player, then rolls with disadvantage', () => {
    const room = setup([tok('orc', 0, sb('Orc')), tok('ally', 1), tok('guard', 2)], ['orc', 'ally', 'guard'], [
      pcSheet('Ally', 'ally', []),
      pcSheet('Guard', 'guard', ['Protection'], [shield]),
    ]);
    expect(room.apply(dm, atk('orc', 'ally'))).toBeNull();
    const p = room.state.reactPrompts?.find((x) => x.style === 'protection');
    expect(p?.ownerId).toBe(player.id);
    expect(room.state.sheets.find((s) => s.id === 'Ally')!.currentHp).toBe(50); // held
    expect(room.apply(player, { t: 'reactResolve', id: p!.id, use: true })).toBeNull();
    expect(room.state.rollLog.some((l) => /Protection/.test(l.label))).toBe(true);
    expect(T(room, 'guard').turnUsed?.reaction).toBe(true);
  });

  it('Interception: on the hit, the damage drops by 1d10 + PB', () => {
    const room = setup([tok('orc', 0, sb('Orc')), tok('ally', 1), tok('guard', 2)], ['orc', 'ally', 'guard'], [
      pcSheet('Ally', 'ally', []),
      pcSheet('Guard', 'guard', ['Interception'], [{ id: 'ls', name: 'Longsword', type: 'weapon', equipped: true, quantity: 1, weight: 3, notes: '' }]),
    ]);
    room.apply(dm, atk('orc', 'ally', { damageParts: [{ dice: '12', type: 'slashing' }] }));
    const p = room.state.reactPrompts!.find((x) => x.style === 'interception')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    // Math.random 0.5 → d10 = 6, + PB 2 = 8 off 12
    expect(room.state.sheets.find((s) => s.id === 'Ally')!.currentHp).toBe(50 - 4);
    expect(T(room, 'guard').turnUsed?.reaction).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterSheet, ClientAction, Participant, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const abil = { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 };
const sb = (name: string) => ({ name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions: [], traits: [] }) as unknown as TokenStatblock;
const tok = (id: string, x: number, statblock?: TokenStatblock): Token =>
  ({ id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: 100, maxHp: 100, armorClass: 10, statblock, effects: [] }) as unknown as Token;

function pc(className: string, level: number, extra: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 'pc',
    ownerId: player.id,
    name: 'Pc',
    className,
    level,
    classes: [{ name: className, level }],
    abilities: { ...abil },
    proficiencyBonus: 3,
    saveProficiencies: [],
    skillProficiencies: [],
    skillExpertise: [],
    currentHp: 40,
    maxHp: 40,
    tempHp: 0,
    speed: 30,
    acOverride: null,
    inventory: [],
    actions: [],
    damageRiders: [],
    resources: [],
    spellSlots: [],
    spells: [],
    feats: [],
    features: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    notes: '',
    tokenId: 'pc',
    ...extra,
  } as unknown as CharacterSheet;
}
function setup(tokens: Token[], sheets: CharacterSheet[] = []) {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-cls-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.sheets.push(...sheets);
  room.state.participants.push(player);
  return room;
}
const hit = (dmg: string, type = 'slashing', range: 'melee' | 'ranged' = 'melee'): ClientAction => ({
  t: 'attack', label: 'orc → pc', attackNotation: '1d20+100', damageParts: [{ dice: dmg, type }], targetTokenId: 'pc', attackerTokenId: 'orc', attackRange: range,
});
const T = (room: Room, id: string) => room.state.tokens.find((t) => t.id === id)!;

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('class feature reactions', () => {
  it('Uncanny Dodge: chosen before the roll, a hit deals half and spends the reaction', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Rogue', 5)]);
    room.apply(dm, hit('10', 'slashing', 'ranged'));
    const p = room.state.reactPrompts!.find((x) => x.style === 'halve')!;
    expect(p.ownerId).toBe(player.id);
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    expect(room.state.sheets[0].currentHp).toBe(35);
    expect(T(room, 'pc').turnUsed?.reaction).toBe(true);
  });

  it('Uncanny Dodge on a miss keeps the reaction', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Rogue', 5)]);
    room.apply(dm, { ...hit('10'), attackNotation: '1d20-100' } as ClientAction);
    const p = room.state.reactPrompts!.find((x) => x.style === 'halve')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    expect(room.state.sheets[0].currentHp).toBe(40);
    expect(T(room, 'pc').turnUsed?.reaction).toBeFalsy();
  });

  it('Deflect Attacks cuts 1d10 + DEX + Monk level off bludgeoning/piercing/slashing only', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Monk', 3)]);
    room.apply(dm, hit('20'));
    const p = room.state.reactPrompts!.find((x) => x.style === 'reduce')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    expect(room.state.sheets[0].currentHp).toBe(40 - (20 - (6 + 3 + 3)));
    // fire: nothing to offer until Deflect Energy
    const room2 = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Monk', 3)]);
    room2.apply(dm, hit('20', 'fire'));
    expect(room2.state.reactPrompts?.length ?? 0).toBe(0);
    const room3 = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Monk', 13)]);
    room3.apply(dm, hit('20', 'fire'));
    expect(room3.state.reactPrompts?.some((x) => x.style === 'reduce')).toBe(true);
  });
});

describe('class feature passives on the server', () => {
  it('Evasion: a failed DEX save for half takes half, a success none', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1 → fail
    const room = setup([tok('pc', 0)], [pc('Rogue', 7)]);
    room.apply(dm, { t: 'spellSave', targetTokenId: 'pc', ability: 'dex', dc: 15, label: 'Fireball', damageOnFail: [{ dice: '20', type: 'fire' }], damageHalfOnSave: true });
    expect(room.state.sheets[0].currentHp).toBe(30);
  });

  it('Danger Sense gives the DEX save advantage', () => {
    const seq = [0, 0.95];
    vi.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0.5);
    const room = setup([tok('pc', 0)], [pc('Barbarian', 2)]);
    room.apply(dm, { t: 'spellSave', targetTokenId: 'pc', ability: 'dex', dc: 15, label: 'Trap', damageOnFail: [{ dice: '10', type: 'fire' }] });
    expect(room.state.sheets[0].currentHp).toBe(40); // 1 and 20 → keeps 20
  });

  it('Relentless Rage keeps a raging Barbarian up at 2 × level HP, DC rising each time', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc('Barbarian', 11, { raging: true, currentHp: 10 })]);
    room.apply(dm, hit('50'));
    const s = room.state.sheets[0];
    expect(s.currentHp).toBe(22);
    expect(s.subclassUses?.['barb-relentless-rage']).toBe(1);
  });

  it('roll floors: a low d20 and a low total', () => {
    const room = setup([tok('pc', 0)], [pc('Rogue', 7)]);
    room.apply(player, { t: 'roll', label: 'Stealth', notation: '1d20+5', external: { total: 8, faces: [3], d20Natural: 3, source: 'dddice' }, d20Min: 10, floorWhy: 'Reliable Talent' });
    const l = room.state.rollLog.at(-1)!;
    expect(l.result.total).toBe(15);
    expect(l.label).toMatch(/Reliable Talent/);
    room.apply(player, { t: 'roll', label: 'Athletics', notation: '1d20+4', external: { total: 6, faces: [2], d20Natural: 2, source: 'dddice' }, totalMin: 20 });
    expect(room.state.rollLog.at(-1)!.result.total).toBe(20);
  });

  it('Aura of Protection adds the paladin CHA to an ally save in 10 ft', () => {
    const pal = pc('Paladin', 6, { abilities: { ...abil, cha: 16 } });
    const ally = { ...tok('ally', 2), controllerId: player.id } as Token;
    const room = setup([tok('pc', 0), ally], [pal]);
    room.apply(dm, { t: 'spellSave', targetTokenId: 'ally', ability: 'dex', dc: 14, label: 'Trap', damageOnFail: [{ dice: '10', type: 'fire' }] });
    expect(T(room, 'ally').currentHp).toBe(100); // 11 + 3 = 14
    const far = { ...tok('far', 6), controllerId: player.id } as Token;
    const room2 = setup([tok('pc', 0), far], [pc('Paladin', 6, { abilities: { ...abil, cha: 16 } })]);
    room2.apply(dm, { t: 'spellSave', targetTokenId: 'far', ability: 'dex', dc: 14, label: 'Trap', damageOnFail: [{ dice: '10', type: 'fire' }] });
    expect(T(room2, 'far').currentHp).toBe(90);
  });
});

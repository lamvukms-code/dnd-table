import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterSheet, ClientAction, InventoryItem, Participant, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const abil = { str: 16, dex: 16, con: 14, int: 10, wis: 10, cha: 10 };
const sb = (name: string) => ({ name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions: [], traits: [] }) as unknown as TokenStatblock;
const tok = (id: string, x: number, statblock?: TokenStatblock): Token =>
  ({ id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: 100, maxHp: 100, armorClass: 10, statblock, effects: [] }) as unknown as Token;
const item = (x: Partial<InventoryItem>) => ({ id: 'i' + Math.random(), quantity: 1, weight: 1, equipped: true, notes: '', ...x }) as InventoryItem;

function pc(feats: string[], inv: InventoryItem[] = [], extra: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 'pc', ownerId: player.id, name: 'Pc', className: 'Fighter', level: 5, classes: [{ name: 'Fighter', level: 5 }],
    abilities: { ...abil }, proficiencyBonus: 3, saveProficiencies: [], skillProficiencies: [], skillExpertise: [],
    currentHp: 40, maxHp: 40, tempHp: 0, speed: 30, acOverride: null, inventory: inv, actions: [], damageRiders: [], resources: [],
    spellSlots: [], spells: [], features: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', tokenId: 'pc',
    feats: feats.map((name, i) => ({ id: `f${i}`, name, description: '' })),
    ...extra,
  } as unknown as CharacterSheet;
}
function setup(tokens: Token[], sheets: CharacterSheet[] = []) {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-feat-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.sheets.push(...sheets);
  room.state.participants.push(player);
  return room;
}
const T = (room: Room, id: string) => room.state.tokens.find((t) => t.id === id)!;
const ext = (total: number, nat: number) => ({ attack: { total, faces: [nat], d20Natural: nat, source: 'dddice' as const }, crit: false });

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('feats on the server', () => {
  it('Defensive Duelist: + PB AC turns a near hit into a miss', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc(['Defensive Duelist'], [item({ name: 'Rapier', type: 'weapon', damage: '1d8' })], { acOverride: 15 })]);
    room.apply(dm, { t: 'attack', label: 'orc → pc', attackNotation: '1d20+5', damageParts: [{ dice: '8', type: 'slashing' }], targetTokenId: 'pc', attackerTokenId: 'orc', attackRange: 'melee', external: ext(16, 11) });
    const p = room.state.reactPrompts!.find((x) => x.style === 'parry')!;
    room.apply(player, { t: 'reactResolve', id: p.id, use: true });
    expect(room.state.sheets[0].currentHp).toBe(40);
    expect(T(room, 'pc').turnUsed?.reaction).toBe(true);
  });

  it('Heavy Armor Master: − PB from slashing in heavy armor', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc(['Heavy Armor Master'], [item({ name: 'Plate', type: 'armor', armorBase: 18, armorCategory: 'heavy' })])]);
    room.apply(dm, { t: 'attack', label: 'orc → pc', attackNotation: '1d20+100', damageParts: [{ dice: '10', type: 'slashing' }], targetTokenId: 'pc', attackerTokenId: 'orc', attackRange: 'melee' });
    expect(room.state.sheets[0].currentHp).toBe(33);
  });

  it('Savage Attacker keeps the higher of two damage rolls, once per turn', () => {
    const room = setup([tok('pc', 0), tok('orc', 1, sb('Orc'))], [pc(['Savage Attacker'])]);
    room.apply(player, { t: 'attack', label: 'pc → orc', attackNotation: '1d20+5', damageParts: [{ dice: '1d10', type: 'slashing' }], targetTokenId: 'orc', attackerTokenId: 'pc', attackerSheetId: 'pc', attackRange: 'melee', external: { ...ext(20, 15), partTotals: [{ total: 1, faces: [1] }] } });
    expect(T(room, 'orc').currentHp).toBe(94); // 1 vs 6 → 6
    expect(T(room, 'pc').turnUsed?.featOnce).toContain('savage');
  });

  it('Crusher pushes 5 ft, Slasher slows by 10 ft', () => {
    const room = setup([tok('pc', 0), tok('orc', 1, sb('Orc'))], [pc(['Crusher', 'Slasher'])]);
    room.apply(player, { t: 'attack', label: 'pc → orc', attackNotation: '1d20+100', damageParts: [{ dice: '5', type: 'bludgeoning' }], targetTokenId: 'orc', attackerTokenId: 'pc', attackerSheetId: 'pc', attackRange: 'melee' });
    expect(T(room, 'orc').x).toBe(2);
    room.apply(player, { t: 'attack', label: 'pc → orc', attackNotation: '1d20+100', damageParts: [{ dice: '5', type: 'slashing' }], targetTokenId: 'orc', attackerTokenId: 'pc', attackerSheetId: 'pc', attackRange: 'melee' });
    expect(T(room, 'orc').effects?.some((e) => e.name === 'Slasher' && e.speedPenalty === 10)).toBe(true);
  });

  it('Shield Master: a successful DEX save for half takes nothing with a shield', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 = 20
    const room = setup([tok('pc', 0)], [pc(['Shield Master'], [item({ name: 'Shield', type: 'shield' })])]);
    room.apply(dm, { t: 'spellSave', targetTokenId: 'pc', ability: 'dex', dc: 15, label: 'Fireball', damageOnFail: [{ dice: '20', type: 'fire' }], damageHalfOnSave: true });
    expect(room.state.sheets[0].currentHp).toBe(40);
  });

  it('Boon of Combat Prowess turns one miss per turn into a hit', () => {
    const room = setup([tok('pc', 0), tok('orc', 1, sb('Orc'))], [pc(['Boon of Combat Prowess'])]);
    const miss = (): ClientAction => ({ t: 'attack', label: 'pc → orc', attackNotation: '1d20+0', damageParts: [{ dice: '5', type: 'slashing' }], targetTokenId: 'orc', attackerTokenId: 'pc', attackerSheetId: 'pc', attackRange: 'melee', external: ext(3, 3) });
    room.apply(player, miss());
    expect(T(room, 'orc').currentHp).toBe(95);
    room.apply(player, miss());
    expect(T(room, 'orc').currentHp).toBe(95);
  });

  it('Boon of Recovery keeps the character up once per long rest', () => {
    const room = setup([tok('orc', 1, sb('Orc')), tok('pc', 0)], [pc(['Boon of Recovery'])]);
    room.apply(dm, { t: 'attack', label: 'orc → pc', attackNotation: '1d20+100', damageParts: [{ dice: '60', type: 'slashing' }], targetTokenId: 'pc', attackerTokenId: 'orc', attackRange: 'melee' });
    expect(room.state.sheets[0].currentHp).toBe(21);
    room.apply(dm, { t: 'attack', label: 'orc → pc', attackNotation: '1d20+100', damageParts: [{ dice: '60', type: 'slashing' }], targetTokenId: 'pc', attackerTokenId: 'orc', attackRange: 'melee' });
    expect(room.state.sheets[0].currentHp).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyWildShape } from '@dnd-table/shared';
import type { CharacterSheet, ClientAction, Participant, Statblock, Token, TokenStatblock } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const abil = { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 };
const sb = (name: string) => ({ name, abilities: abil, proficiencyBonus: 2, saveProficiencies: [], skills: [], initiativeMod: 0, actions: [], traits: [] }) as unknown as TokenStatblock;
const tok = (id: string, x: number, statblock?: TokenStatblock): Token =>
  ({ id, label: id, x, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: 100, maxHp: 100, armorClass: 10, statblock, effects: [] }) as unknown as Token;

function druid(): CharacterSheet {
  return {
    id: 'dr',
    ownerId: player.id,
    name: 'Dr',
    className: 'Druid',
    level: 4,
    classes: [{ name: 'Druid', level: 4 }],
    abilities: { ...abil },
    proficiencyBonus: 2,
    currentHp: 20,
    maxHp: 20,
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
    tokenId: 'dr',
  } as unknown as CharacterSheet;
}
const bear = {
  id: 'srd-brown-bear',
  name: 'Brown Bear',
  meta: 'Large Beast, Unaligned',
  cr: '1',
  size: 'large',
  ac: 11,
  maxHp: 22,
  speed: 40,
  abilities: { str: 17, dex: 12, con: 15, int: 2, wis: 13, cha: 7 },
  traits: [],
  actions: [{ id: 'bb-1', name: 'Bite', actionType: 'action', attackBonus: 5, damage: '1d8+3', damageType: 'piercing' }],
} as unknown as Statblock;

function setup(tokens: Token[], sheets: CharacterSheet[] = []) {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-cf-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.tokens.push(...tokens);
  room.state.sheets.push(...sheets);
  room.state.participants.push(player);
  return room;
}
const atk = (extra: Partial<Extract<ClientAction, { t: 'attack' }>>): ClientAction => ({
  t: 'attack', label: 'a → b', attackNotation: '1d20+2', damageParts: [{ dice: '10', type: 'fire' }], targetTokenId: 'b', attackerTokenId: 'a', attackRange: 'ranged', attackKind: 'spell', ...extra,
});
const T = (room: Room, id: string) => room.state.tokens.find((t) => t.id === id)!;

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

describe('Metamagic on the server', () => {
  it('Seeking Spell: a miss rolls the d20 again and the new roll stands', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 3, sb('B'))]);
    room.apply(dm, atk({ rerollMiss: true, external: { attack: { total: 5, faces: [3], d20Natural: 3, source: 'dddice' }, crit: false } }));
    const log = room.state.rollLog.find((l) => l.attack);
    expect(log?.attack?.hit).toBe(true); // 3 → 11, +2 = 13 vs AC 10
    expect(T(room, 'b').currentHp).toBe(90);
  });

  it('without Seeking the miss stays a miss', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 3, sb('B'))]);
    room.apply(dm, atk({ external: { attack: { total: 5, faces: [3], d20Natural: 3, source: 'dddice' }, crit: false } }));
    expect(T(room, 'b').currentHp).toBe(100);
  });

  it('Empowered Spell rerolls the lowest damage dice', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 3, sb('B'))]);
    room.apply(dm, atk({
      damageParts: [{ dice: '2d6', type: 'fire', rerollLowest: 1 }],
      external: { attack: { total: 18, faces: [16], d20Natural: 16, source: 'dddice' }, crit: false, partTotals: [{ total: 2, faces: [1, 1] }] },
    }));
    expect(T(room, 'b').currentHp).toBe(95); // one 1 → 4
  });

  it('Extended Spell: concentration it starts keeps advantage', () => {
    const room = setup([tok('a', 0, sb('A')), tok('b', 3, sb('B'))]);
    room.apply(dm, { t: 'applyEffect', targetTokenId: 'b', effect: { id: '', name: 'Hold', sourceTokenId: 'a', concentration: true, concAdvantage: true } });
    expect(T(room, 'a').concentration).toMatchObject({ name: 'Hold', advantage: true });
  });
});

describe('Wild Shape on the server', () => {
  it('the token takes the beast size, and the form ends at 0 HP', () => {
    const room = setup([tok('dr', 0), tok('orc', 1, sb('Orc'))], [druid()]);
    const shaped = applyWildShape(druid(), bear, 'medium');
    expect(room.apply(player, { t: 'upsertSheet', sheet: shaped })).toBeNull();
    expect(T(room, 'dr').size).toBe('large');
    room.apply(dm, { t: 'attack', label: 'orc → dr', attackNotation: '1d20+100', damageParts: [{ dice: '40', type: 'slashing' }], targetTokenId: 'dr', attackerTokenId: 'orc', attackRange: 'melee' });
    const s = room.state.sheets[0];
    expect(s.wildShape).toBeNull();
    expect(s.abilities.str).toBe(10);
    expect(T(room, 'dr').size).toBe('medium');
  });

  it('leaving the form by choice puts the size back', () => {
    const room = setup([tok('dr', 0)], [druid()]);
    const shaped = applyWildShape(druid(), bear, 'medium');
    room.apply(player, { t: 'upsertSheet', sheet: shaped });
    room.apply(player, { t: 'upsertSheet', sheet: { ...room.state.sheets[0], wildShape: null } });
    expect(T(room, 'dr').size).toBe('medium');
  });
});

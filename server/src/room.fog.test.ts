import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Participant, Token } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
function setup() {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-fog-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.participants.push(player);
  room.apply(dm, { t: 'updateMap', patch: { cols: 4, rows: 2, walls: [{ id: 'd', x1: 2, y1: 0, x2: 2, y2: 2, door: true, open: false }] } });
  return room;
}

describe('dynamic fog on the server', () => {
  it('explored cells are kept only while fog + explore are on', () => {
    const room = setup();
    room.apply(player, { t: 'fogExplore', cells: [0, 1] });
    expect(room.state.map.explored ?? '').toBe('');
    room.apply(dm, { t: 'updateMap', patch: { fog: { enabled: true, explore: true } } });
    room.apply(player, { t: 'fogExplore', cells: [0, 1, 99, -1] });
    expect(room.state.map.explored).toBe('11000000');
    room.apply(player, { t: 'fogExplore', cells: [5] });
    expect(room.state.map.explored).toBe('11000100');
  });
  it('anyone can open / close a door; only the DM edits walls', () => {
    const room = setup();
    expect(room.apply(player, { t: 'toggleDoor', wallId: 'd' })).toBeNull();
    expect(room.state.map.walls?.[0].open).toBe(true);
    expect(room.apply(player, { t: 'updateMap', patch: { walls: [] } })).toMatch(/DM/);
  });
  it('a player may light a torch on their own token', () => {
    const room = setup();
    room.state.tokens.push({ id: 't', label: 't', x: 0, y: 0, size: 'medium', color: '#fff', hidden: false, controllerId: player.id } as Token);
    room.apply(player, { t: 'updateToken', id: 't', patch: { lightSource: { bright: 20, dim: 20 }, darkvision: 60 } });
    expect(room.state.tokens[0]).toMatchObject({ lightSource: { bright: 20, dim: 20 }, darkvision: 60 });
  });
});

describe('effect hints on the roll log', () => {
  it('an attack and its damage carry who / whom / how', () => {
    const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-fx-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
    room.state.tokens.push(
      { id: 'bear', label: 'Bear', x: 0, y: 0, size: 'large', color: '#fff', hidden: false, currentHp: 30, maxHp: 30, armorClass: 11 } as Token,
      { id: 'pc', label: 'Pc', x: 2, y: 0, size: 'medium', color: '#fff', hidden: false, currentHp: 30, maxHp: 30, armorClass: 10 } as Token,
    );
    room.apply(dm, { t: 'attack', label: 'Bear · Bite', actionName: 'Bite', attackNotation: '1d20+100', damageParts: [{ dice: '5', type: 'piercing' }], targetTokenId: 'pc', attackerTokenId: 'bear', attackRange: 'melee' });
    const fx = room.state.rollLog.filter((l) => l.fx).map((l) => l.fx);
    expect(fx.length).toBe(2);
    expect(fx[0]).toMatchObject({ from: 'bear', to: 'pc', name: 'Bite', range: 'melee', kind: 'weapon', types: ['piercing'] });
  });
});

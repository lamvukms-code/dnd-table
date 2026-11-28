import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sheetsForPlayer, sheetsForStream, type CharacterSheet, type Participant } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const p1: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;
const p2: Participant = { id: 'p2', name: 'Bình', role: 'player', connected: true } as Participant;

function sheet(id: string, ownerId: string, extra: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id, ownerId, name: id, className: 'Fighter', level: 3, classes: [{ name: 'Fighter', level: 3 }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, proficiencyBonus: 2, saveProficiencies: [],
    skillProficiencies: [], skillExpertise: [], currentHp: 20, maxHp: 20, tempHp: 0, speed: 30, acOverride: null, inventory: [],
    actions: [], damageRiders: [], resources: [], spellSlots: [], spells: [], features: [], feats: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '', ...extra,
  } as unknown as CharacterSheet;
}
function setup() {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-meta-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.participants.push(dm, p1, p2);
  room.state.sheets.push(sheet('pc1', 'p1'), sheet('npc1', 'dm', { kind: 'companion', hiddenFromPlayers: true }));
  return room;
}
const S = (room: Room, id: string) => room.state.sheets.find((s) => s.id === id)!;

describe('DM sheet management', () => {
  it('only the DM changes owner / kind / visibility; the token follows the new owner', () => {
    const room = setup();
    room.apply(p1, { t: 'addToken', token: { label: 'pc1', x: 0, y: 0, color: '#fff' } });
    const tk = room.state.tokens[0];
    room.apply(p1, { t: 'upsertSheet', sheet: { ...S(room, 'pc1'), tokenId: tk.id } });
    expect(room.apply(p1, { t: 'setSheetMeta', id: 'pc1', ownerId: 'p2' })).toBeTruthy(); // refused
    expect(S(room, 'pc1').ownerId).toBe('p1');
    room.apply(dm, { t: 'setSheetMeta', id: 'pc1', ownerId: 'p2', kind: 'npc', hiddenFromPlayers: true });
    expect(S(room, 'pc1')).toMatchObject({ ownerId: 'p2', kind: 'npc', hiddenFromPlayers: true });
    expect(room.state.tokens[0].controllerId).toBe('p2');
    expect(room.apply(dm, { t: 'setSheetMeta', id: 'pc1', ownerId: 'nobody' })).toBeTruthy(); // unknown participant
    room.apply(dm, { t: 'setSheetMeta', id: 'pc1', kind: 'pc', hiddenFromPlayers: false });
    expect(S(room, 'pc1').kind).toBeUndefined();
    expect(S(room, 'pc1').hiddenFromPlayers).toBeUndefined();
  });

  it("a player's save can't hand the sheet away, unhide it or relabel it", () => {
    const room = setup();
    room.apply(dm, { t: 'setSheetMeta', id: 'pc1', hiddenFromPlayers: true });
    room.apply(p1, { t: 'upsertSheet', sheet: { ...S(room, 'pc1'), ownerId: 'p2', hiddenFromPlayers: false, kind: 'npc', name: 'Renamed' } });
    expect(S(room, 'pc1')).toMatchObject({ ownerId: 'p1', hiddenFromPlayers: true, name: 'Renamed' });
    expect(S(room, 'pc1').kind).toBeUndefined();
    // a new sheet from a player is always theirs
    room.apply(p1, { t: 'upsertSheet', sheet: sheet('new', 'p2') });
    expect(S(room, 'new').ownerId).toBe('p1');
  });

  it('hidden sheets never reach other players or the stream view (control: the owner still gets theirs)', () => {
    const room = setup();
    const forP2 = sheetsForPlayer(room.state.sheets, 'p2').map((s) => s.id);
    expect(forP2).toEqual(['pc1']);
    expect(sheetsForStream(room.state.sheets).map((s) => s.id)).toEqual(['pc1']);
    room.apply(dm, { t: 'setSheetMeta', id: 'pc1', hiddenFromPlayers: true });
    expect(sheetsForPlayer(room.state.sheets, 'p1').map((s) => s.id)).toEqual(['pc1']); // own sheet stays
    expect(sheetsForPlayer(room.state.sheets, 'p2')).toEqual([]);
    room.apply(dm, { t: 'setSheetMeta', id: 'npc1', hiddenFromPlayers: false });
    expect(sheetsForPlayer(room.state.sheets, 'p2').map((s) => s.id)).toEqual(['npc1']);
  });
});

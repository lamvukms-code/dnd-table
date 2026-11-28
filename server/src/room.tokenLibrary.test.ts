import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CharacterSheet, InventoryItem, Participant } from '@dnd-table/shared';
import { Room } from './room.js';

const dm: Participant = { id: 'dm', name: 'DM', role: 'dm', connected: true } as Participant;
const player: Participant = { id: 'p1', name: 'An', role: 'player', connected: true } as Participant;

function sheet(extra: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 'pc', ownerId: player.id, name: 'Pc', className: 'Fighter', level: 3, classes: [{ name: 'Fighter', level: 3 }],
    abilities: { str: 14, dex: 19, con: 13, int: 7, wis: 12, cha: 10 }, proficiencyBonus: 2, saveProficiencies: [], skillProficiencies: [],
    skillExpertise: [], currentHp: 30, maxHp: 30, tempHp: 0, speed: 30, acOverride: null, inventory: [], actions: [], damageRiders: [],
    resources: [], spellSlots: [], spells: [], features: [], feats: [], currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, notes: '',
    ...extra,
  } as unknown as CharacterSheet;
}
function setup() {
  const room = new Room(join(mkdtempSync(join(tmpdir(), 'room-lib-')), 'room.json'), join(tmpdir(), 'none-bestiary.json'));
  room.state.participants.push(dm, player);
  room.state.sheets.push(sheet());
  return room;
}

describe('token library & remembered sheet look', () => {
  it('a token with art is kept when deleted, the sheet keeps its portrait and re-places the same art', () => {
    const room = setup();
    room.apply(player, { t: 'addToken', token: { label: 'Pc art', x: 1, y: 1, color: '#123', imageUrl: '/uploads/a.webp' } });
    const tk = room.state.tokens.find((t) => t.label === 'Pc art')!;
    expect(room.state.tokenLibrary?.map((e) => e.imageUrl)).toEqual(['/uploads/a.webp']);
    // link it to the sheet, then delete it from the map
    room.apply(player, { t: 'upsertSheet', sheet: { ...room.state.sheets[0], tokenId: tk.id } });
    expect(room.state.sheets[0].tokenLook?.imageUrl).toBe('/uploads/a.webp');
    room.apply(player, { t: 'removeToken', id: tk.id });
    expect(room.state.tokens.some((t) => t.id === tk.id)).toBe(false);
    expect(room.state.sheets[0].tokenId).toBeUndefined();
    expect(room.state.sheets[0].tokenLook?.imageUrl).toBe('/uploads/a.webp');
    expect(room.state.tokenLibrary).toHaveLength(1); // same art: no duplicate entry
    // "📍 Đặt lên bản đồ" brings back a token with the same art
    room.apply(player, { t: 'placeSheetToken', sheetId: 'pc', x: 3, y: 3 });
    const back = room.state.tokens.find((t) => t.id === room.state.sheets[0].tokenId)!;
    expect(back.imageUrl).toBe('/uploads/a.webp');
    expect(back.currentHp).toBe(30);
  });

  it('places a library entry, and only the owner or the DM removes it', () => {
    const room = setup();
    room.apply(player, { t: 'addToken', token: { label: 'Wolf', x: 1, y: 1, color: '#123', imageUrl: '/uploads/w.webp' } });
    const id = room.state.tokenLibrary![0].id;
    room.apply(player, { t: 'tokenLibPlace', id, x: 5, y: 5 });
    expect(room.state.tokens.filter((t) => t.imageUrl === '/uploads/w.webp')).toHaveLength(2);
    const other: Participant = { id: 'p2', name: 'B', role: 'player', connected: true } as Participant;
    room.state.participants.push(other);
    expect(room.apply(other, { t: 'tokenLibRemove', id })).toBeTruthy(); // refused
    expect(room.state.tokenLibrary).toHaveLength(1);
    room.apply(dm, { t: 'tokenLibRemove', id });
    expect(room.state.tokenLibrary).toHaveLength(0);
  });

  it('a DM-saved entry is flagged and players cannot place it; art-less and stat-block tokens are not saved', () => {
    const room = setup();
    room.apply(dm, { t: 'addToken', token: { label: 'Hidden NPC', x: 1, y: 1, color: '#123', imageUrl: '/uploads/n.webp' } });
    room.apply(dm, { t: 'addToken', token: { label: 'Plain', x: 2, y: 1, color: '#123' } });
    expect(room.state.tokenLibrary).toHaveLength(1);
    expect(room.state.tokenLibrary![0].dm).toBe(true);
    expect(room.apply(player, { t: 'tokenLibPlace', id: room.state.tokenLibrary![0].id, x: 0, y: 0 })).toBeTruthy();
  });

  it('a sheet saved with "Studded leather" typed as plain gear wears it as armor (AC 16 at DEX 19)', () => {
    const room = setup();
    const inv = [{ id: 'a', name: 'Studded leather', type: 'gear', quantity: 1, weight: 0, equipped: true, notes: '' } as InventoryItem];
    room.apply(player, { t: 'addToken', token: { label: 'A', x: 1, y: 1, color: '#123' } });
    const tk = room.state.tokens.find((t) => t.label === 'A')!;
    room.apply(player, { t: 'upsertSheet', sheet: { ...room.state.sheets[0], inventory: inv, tokenId: tk.id } });
    expect(room.state.sheets[0].inventory[0]).toMatchObject({ type: 'armor', armorBase: 12 });
    expect(tk.armorClass).toBe(16);
  });
});

import { describe, expect, it } from 'vitest';
import type { RoomState } from '@dnd-table/shared';
import { GLOSSARY_TEMPLATE, mergeNames, parseGlossary, roomNames } from './glossary.js';

describe('glossary', () => {
  it('reads the DM list: groups, notes, comments skipped', () => {
    const g = parseGlossary(`${GLOSSARY_TEMPLATE}Con Quạ Đen — quán rượu\n\n# Phe\nHội Bóng Đêm\n`);
    expect(g).toEqual([
      { title: 'Phe phái / vật phẩm', items: [{ name: 'Con Quạ Đen', note: 'quán rượu' }] },
      { title: 'Phe', items: [{ name: 'Hội Bóng Đêm' }] },
    ]);
    expect(parseGlossary('Mira\n')).toEqual([{ title: 'Tên riêng', items: [{ name: 'Mira' }] }]);
  });

  it("takes the room's characters, maps and NPC tokens; respects anonymous players", () => {
    const state = {
      participants: [
        { id: 'dm', name: 'Vũ', role: 'dm' },
        { id: 'p1', name: 'An', role: 'player' },
        { id: 'p2', name: 'Bình', role: 'player', anon: true },
      ],
      sheets: [
        { ownerId: 'p1', name: 'Mira', species: 'Elf', className: 'Ranger', tokenId: 't1' },
        { ownerId: 'p2', name: 'Torvak', className: 'Fighter' },
      ],
      scenes: [{ name: 'Cảng Sương Mù', tokens: [{ id: 't3', label: 'Goblin 2' }] }],
      tokens: [
        { id: 't1', label: 'Mira' },
        { id: 't2', label: 'Goblin 1' },
        { id: 't4', label: 'Ông Bảy' },
      ],
      shops: [{ name: 'Lò rèn Đá Xám' }],
    } as unknown as RoomState;
    const g = roomNames(state);
    expect(g[0].items).toEqual([
      { name: 'Mira', note: 'Elf Ranger, người chơi: An' },
      { name: 'Torvak', note: 'Fighter' },
    ]);
    const merged = mergeNames([{ title: 'NPC', items: [{ name: 'ông bảy', note: 'chủ quán' }] }], g);
    const flat = merged.flatMap((x) => x.items.map((i) => i.name));
    expect(flat).toEqual(['ông bảy', 'Mira', 'Torvak', 'Cảng Sương Mù', 'Goblin', 'Lò rèn Đá Xám']);
  });
});

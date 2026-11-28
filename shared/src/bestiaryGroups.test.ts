import { describe, expect, it } from 'vitest';
import { bestiaryMatches, groupBestiary, type BestiaryGroupDef } from './bestiaryGroups.js';

const sb = (name: string, cr: string, tags: string[], source?: string) => ({ name, cr, tags, source, meta: '' });

const groups: BestiaryGroupDef[] = [
  { key: 'book-a', label: 'Book A', tags: ['book-a'], sources: ['book a'] },
  { key: 'campaign', label: 'Chiến dịch', tags: ['campaign'] },
  { key: 'book-b', label: 'Book B', tags: ['book-b'] },
  { key: 'srd', label: 'SRD', tags: ['srd'] },
];

describe('groupBestiary', () => {
  const list = [
    sb('Goblin', '1/4', ['srd']),
    sb('Beast Two', '3', ['book-a']),
    sb('Beast One', '1', ['book-a']),
    sb('Lính gác', '1/8', ['campaign']),
    sb('Beast Three', '5', ['book-b']),
    sb('Kẻ địch mới', '', []),
  ];

  it('follows the configured group order and sorts each group by CR', () => {
    const g = groupBestiary(list, '', groups);
    expect(g.map((x) => x.key)).toEqual(['book-a', 'campaign', 'book-b', 'srd', 'other']);
    expect(g[0].items.map((x) => x.name)).toEqual(['Beast One', 'Beast Two']);
  });

  it('a group-name search finds every entry in it, with no cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => sb(`Thing ${i}`, '1', ['book-a']));
    expect(groupBestiary(many, 'book a', groups)[0].items).toHaveLength(60);
  });

  it('ignores Vietnamese diacritics and needs every word', () => {
    expect(bestiaryMatches(list[3], 'linh', groups)).toBe(true);
    expect(bestiaryMatches(list[1], 'book a cr 3', groups)).toBe(true);
    expect(bestiaryMatches(list[1], 'book goblin', groups)).toBe(false);
  });

  it('matches by source prefix when the tag is missing', () => {
    expect(groupBestiary([sb('X', '2', [], 'Book A (local)')], '', groups)[0].key).toBe('book-a');
  });

  it('without a config, uses generic defaults', () => {
    expect(groupBestiary(list).map((x) => x.key)).toEqual(['campaign', 'srd', 'other']);
  });
});

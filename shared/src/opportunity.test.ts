import { describe, expect, it } from 'vitest';
import { edgeFeet, opportunityReactors } from './opportunity.js';
import type { Token } from './types.js';

const tok = (id: string, x: number, y: number, extra: Partial<Token> = {}): Token =>
  ({ id, label: id, x, y, size: 'medium', color: '#000', hidden: false, ...extra }) as Token;
const pcs = new Set(['pc']);
const side = (t: Token) => pcs.has(t.id);

describe('opportunity attacks', () => {
  it('edge distance between footprints', () => {
    expect(edgeFeet({ x: 0, y: 0 }, 1, { x: 1, y: 1 }, 1)).toBe(5);
    expect(edgeFeet({ x: 0, y: 0 }, 1, { x: 3, y: 0 }, 1)).toBe(15);
    expect(edgeFeet({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 2)).toBe(5); // large creature to the right
    expect(edgeFeet({ x: 3, y: 0 }, 1, { x: 1, y: 0 }, 2)).toBe(0 + 5);
  });
  it('leaving reach of a hostile with its reaction triggers; allies, spent reactions and the downed do not', () => {
    const pc = tok('pc', 5, 5);
    const goblin = tok('gob', 6, 5, { currentHp: 7 });
    const ally = tok('ally', 4, 5);
    const spent = tok('spent', 5, 6, { turnUsed: { reaction: true } });
    const down = tok('down', 6, 6, { currentHp: 0 });
    pcs.add('ally');
    const r = opportunityReactors(pc, { x: 5, y: 5 }, { x: 2, y: 5 }, [pc, goblin, ally, spent, down], side);
    expect(r.map((t) => t.id)).toEqual(['gob']);
    // staying adjacent: no OA
    expect(opportunityReactors(pc, { x: 5, y: 5 }, { x: 5, y: 4 }, [pc, goblin], side)).toEqual([]);
  });
  it('reach 10 ft stat blocks', () => {
    const pc = tok('pc', 5, 5);
    const ogre = tok('ogre', 7, 5, { statblock: { actions: [{ id: 'a', name: 'Glaive', actionType: 'action', description: 'Melee Weapon Attack: +6 to hit, reach 10 ft.' }] } as never });
    expect(opportunityReactors(pc, { x: 5, y: 5 }, { x: 5, y: 4 }, [pc, ogre], side)).toEqual([]); // still within 10 ft
    expect(opportunityReactors(pc, { x: 5, y: 5 }, { x: 4, y: 5 }, [pc, ogre], side).map((t) => t.id)).toEqual(['ogre']);
  });
});

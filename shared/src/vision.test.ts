import { describe, expect, it } from 'vitest';
import { blockingSegments, buildVision, exploredMark, lineClear, newlySeenCells, parseUvtt, pointSeen, tokenDarkvision, tokenSeen, visibilityPolygon, pointInPolygon, type Wall } from './vision.js';
import type { CharacterSheet, Token } from './types.js';

const tok = (id: string, x: number, y: number, extra: Partial<Token> = {}): Token => ({ id, label: id, x, y, size: 'medium', color: '#fff', hidden: false, ...extra }) as Token;
// a 10 × 10 room split by a wall at x = 5 (with a door from y 4 to 6)
const walls: Wall[] = [
  { id: 'w1', x1: 5, y1: 0, x2: 5, y2: 4 },
  { id: 'd1', x1: 5, y1: 4, x2: 5, y2: 6, door: true, open: false },
  { id: 'w2', x1: 5, y1: 6, x2: 5, y2: 10 },
];
const map = { cols: 10, rows: 10, walls };

describe('line of sight', () => {
  it('a wall blocks, the map edge bounds the polygon', () => {
    const segs = blockingSegments(map);
    expect(lineClear({ x: 2.5, y: 2.5 }, { x: 4.5, y: 8.5 }, segs)).toBe(true);
    expect(lineClear({ x: 2.5, y: 2.5 }, { x: 7.5, y: 2.5 }, segs)).toBe(false);
    const poly = visibilityPolygon({ x: 2.5, y: 5 }, segs);
    expect(pointInPolygon({ x: 1, y: 9 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 5 }, poly)).toBe(false);
  });
  it('an open door lets sight through', () => {
    const open = { ...map, walls: walls.map((w) => (w.door ? { ...w, open: true } : w)) };
    const poly = visibilityPolygon({ x: 2.5, y: 5 }, blockingSegments(open));
    expect(pointInPolygon({ x: 8, y: 5 }, poly)).toBe(true);
  });
});

describe('light and darkvision', () => {
  const hero = tok('h', 2, 4); // centre 2.5, 4.5
  it('a lit scene shows everything in line of sight', () => {
    const v = buildVision(map, 'sun', [{ token: hero, darkvisionFt: 0 }], [hero]);
    expect(pointSeen(v, { x: 0.5, y: 9.5 })).toBe(true);
    expect(pointSeen(v, { x: 8, y: 5 })).toBe(false);
  });
  it('darkness: only darkvision and lights (lights blocked by walls too)', () => {
    const dark = buildVision(map, 'dark', [{ token: hero, darkvisionFt: 0 }], [hero]);
    expect(pointSeen(dark, { x: 3, y: 4.5 })).toBe(false);
    const dv = buildVision(map, 'dark', [{ token: hero, darkvisionFt: 10 }], [hero]);
    expect(pointSeen(dv, { x: 3.5, y: 4.5 })).toBe(true); // 1 cell = 5 ft away
    expect(pointSeen(dv, { x: 2.5, y: 9 })).toBe(false); // 22 ft away
    const torch = tok('t', 0, 8, { lightSource: { bright: 20, dim: 20 } });
    const lit = buildVision(map, 'dark', [{ token: hero, darkvisionFt: 0 }], [hero, torch]);
    expect(pointSeen(lit, { x: 1, y: 7 })).toBe(true);
    expect(tokenSeen(lit, torch)).toBe(true);
    const lamp = buildVision({ ...map, lights: [{ id: 'l', x: 8, y: 8, bright: 20, dim: 20 }] }, 'dark', [{ token: hero, darkvisionFt: 0 }], [hero]);
    expect(pointSeen(lamp, { x: 8, y: 8 })).toBe(false); // lit, but behind the wall
  });
});

describe('explored memory and imports', () => {
  it('marks newly seen cells once', () => {
    const hero = tok('h', 2, 4);
    const v = buildVision(map, 'sun', [{ token: hero, darkvisionFt: 0 }], [hero]);
    const cells = newlySeenCells(v, 10, 10, undefined);
    expect(cells.length).toBe(50); // the left half
    const ex = exploredMark(undefined, 10, 10, cells);
    expect(newlySeenCells(v, 10, 10, ex)).toEqual([]);
  });
  it('reads walls, doors and lights from a Universal VTT file', () => {
    let n = 0;
    const r = parseUvtt(
      {
        resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 15 }, pixels_per_grid: 140 },
        line_of_sight: [[{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }]],
        portals: [{ bounds: [{ x: 5, y: 4 }, { x: 5, y: 5 }], closed: true }],
        lights: [{ position: { x: 3, y: 3 }, range: 6 }],
      },
      () => `id${n++}`,
    );
    expect(r.walls).toHaveLength(3);
    expect(r.walls[2]).toMatchObject({ door: true, open: false });
    expect(r.lights[0]).toEqual({ x: 3, y: 3, feet: 30 });
    expect(r.size).toEqual({ x: 20, y: 15 });
  });
  it('darkvision from the sheet: species, features, Devil’s Sight', () => {
    const sheet = (o: Partial<CharacterSheet>) => ({ features: [], feats: [], ...o }) as unknown as CharacterSheet;
    expect(tokenDarkvision({}, sheet({ species: 'Dwarf' }))).toBe(120);
    expect(tokenDarkvision({}, sheet({ species: 'Human' }))).toBe(0);
    expect(tokenDarkvision({}, sheet({ features: [{ id: 'a', name: 'Superior Darkvision', description: 'Darkvision 120 ft.' }] as never }))).toBe(120);
    expect(tokenDarkvision({ darkvision: 30 }, sheet({ species: 'Dwarf' }))).toBe(30);
  });
});

import type { BattleMap, CharacterSheet, SceneLight, Token, TokenSize } from './types.js';
import { hasInvocation } from './featurePassives.js';

/**
 * Dynamic fog & sight. Everything is in grid cells (like token x / y): a wall runs between two
 * points on the board, a token sees from its centre. What a viewer sees:
 *  - line of sight: the area no closed wall / door blocks (a visibility polygon), within the map;
 *  - light: in a lit scene (sun / bright / moon / dim, or light not tracked) everything in line of
 *    sight shows; in darkness only what a light source reaches (its own line of sight, its radius)
 *    or what the viewer's darkvision covers.
 */

interface Pt {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A door: blocks sight only while closed. */
  door?: boolean;
  open?: boolean;
}

export interface VisionSeg {
  a: Pt;
  b: Pt;
}

export const FEET_PER_CELL_VISION = 5;

const SPAN: Record<TokenSize, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
export const tokenCentre = (t: Pick<Token, 'x' | 'y' | 'size'>): Pt => ({ x: t.x + SPAN[t.size] / 2, y: t.y + SPAN[t.size] / 2 });

/** Segments that block sight: closed walls / doors, plus the map's edge. */
export function blockingSegments(map: Pick<BattleMap, 'cols' | 'rows'> & { walls?: Wall[] }): VisionSeg[] {
  const out: VisionSeg[] = (map.walls ?? []).filter((w) => !(w.door && w.open)).map((w) => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } }));
  const W = map.cols;
  const H = map.rows;
  out.push({ a: { x: 0, y: 0 }, b: { x: W, y: 0 } }, { a: { x: W, y: 0 }, b: { x: W, y: H } }, { a: { x: W, y: H }, b: { x: 0, y: H } }, { a: { x: 0, y: H }, b: { x: 0, y: 0 } });
  return out;
}

/** Distance along the ray (origin + t·dir) to segment s, or null when it misses. */
function rayHit(o: Pt, dx: number, dy: number, s: VisionSeg): number | null {
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((s.a.x - o.x) * sy - (s.a.y - o.y) * sx) / den;
  const u = ((s.a.x - o.x) * dy - (s.a.y - o.y) * dx) / den;
  if (t < 0 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

/**
 * The visibility polygon from `o`: rays toward every segment end (and just either side of it), each
 * stopped at the nearest segment. `segs` must include the map edge so every ray hits something.
 */
export function visibilityPolygon(o: Pt, segs: VisionSeg[]): Pt[] {
  const angles: number[] = [];
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  const hits: { a: number; p: Pt }[] = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (const s of segs) {
      const t = rayHit(o, dx, dy, s);
      if (t != null && t < best) best = t;
    }
    if (best < Infinity) hits.push({ a, p: { x: o.x + dx * best, y: o.y + dy * best } });
  }
  hits.sort((p, q) => p.a - q.a);
  return hits.map((h) => h.p);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Is the straight line between two points free of blocking walls? (cheap check for one point) */
export function lineClear(a: Pt, b: Pt, segs: VisionSeg[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  for (const s of segs) {
    const t = rayHit(a, dx / len, dy / len, s);
    if (t != null && t < len - 1e-6) return false;
  }
  return true;
}

/** Light presets (feet): bright radius, then dim beyond it. */
export const LIGHT_PRESETS: { key: string; label: string; bright: number; dim: number }[] = [
  { key: 'candle', label: 'Nến', bright: 5, dim: 5 },
  { key: 'torch', label: 'Đuốc', bright: 20, dim: 20 },
  { key: 'light', label: 'Phép Light', bright: 20, dim: 20 },
  { key: 'lantern', label: 'Đèn lồng', bright: 30, dim: 30 },
  { key: 'bullseye', label: 'Đèn pha', bright: 60, dim: 60 },
  { key: 'daylight', label: 'Phép Daylight', bright: 60, dim: 60 },
];

/** The scene is lit enough to see without a light source (untracked light counts as lit). */
export const sceneIsLit = (light: SceneLight | null | undefined): boolean => light !== 'dark';

const DARKVISION_SPECIES: [RegExp, number][] = [
  [/drow|duergar|deep gnome|svirfneblin/i, 120],
  [/dwarf|orc/i, 120],
  [/elf|gnome|tiefling|aasimar|half-orc|goblin|kobold|tabaxi|yuan/i, 60],
];

/**
 * Darkvision in feet: the token's own setting, else what its sheet says — a feature or trait that
 * names darkvision ("Darkvision 60 ft"), the species, Devil's Sight (120).
 */
export function tokenDarkvision(t: Pick<Token, 'darkvision'>, sheet?: CharacterSheet): number {
  if (typeof t.darkvision === 'number') return t.darkvision;
  if (!sheet) return 0;
  let best = 0;
  for (const f of sheet.features ?? []) {
    if (!/darkvision|nhìn trong bóng tối/i.test(`${f.name} ${f.description ?? ''}`)) continue;
    const m = /darkvision[^0-9]{0,20}(\d{2,3})|(\d{2,3})\s*(?:ft|feet|foot)[^.]{0,30}darkvision/i.exec(`${f.name} ${f.description ?? ''}`);
    best = Math.max(best, m ? Number(m[1] ?? m[2]) : 60);
  }
  for (const [re, ft] of DARKVISION_SPECIES) if (re.test(sheet.species ?? '')) best = Math.max(best, ft);
  if (hasInvocation(sheet, "Devil's Sight")) best = Math.max(best, 120);
  if (sheet.wildShape) best = Math.max(best, 60);
  return best;
}

export interface Viewer {
  id: string;
  o: Pt;
  /** Darkvision radius in cells. */
  dv: number;
  poly: Pt[];
}
export interface LightSource {
  id: string;
  o: Pt;
  /** Bright + dim radius in cells. */
  r: number;
  poly: Pt[];
}

/** Everything the fog needs for one viewpoint: the viewers' sight polygons and the lights' reach. */
export interface VisionModel {
  lit: boolean;
  viewers: Viewer[];
  lights: LightSource[];
}

export function buildVision(
  map: Pick<BattleMap, 'cols' | 'rows' | 'lights'> & { walls?: Wall[] },
  light: SceneLight | null | undefined,
  viewerTokens: { token: Token; darkvisionFt: number }[],
  allTokens: Token[],
): VisionModel {
  const segs = blockingSegments(map);
  const lit = sceneIsLit(light);
  const viewers = viewerTokens.map(({ token, darkvisionFt }) => {
    const o = tokenCentre(token);
    return { id: token.id, o, dv: darkvisionFt / FEET_PER_CELL_VISION, poly: visibilityPolygon(o, segs) };
  });
  const lights = lit
    ? []
    : allTokens
        .filter((t) => t.lightSource && t.lightSource.bright + t.lightSource.dim > 0)
        .map((t) => {
          const o = tokenCentre(t);
          return { id: t.id, o, r: (t.lightSource!.bright + t.lightSource!.dim) / FEET_PER_CELL_VISION, poly: visibilityPolygon(o, segs) };
        })
        .concat(
          (map.lights ?? []).map((l) => {
            const o = { x: l.x, y: l.y };
            return { id: l.id, o, r: (l.bright + l.dim) / FEET_PER_CELL_VISION, poly: visibilityPolygon(o, segs) };
          }),
        );
  return { lit, viewers, lights };
}

/** Can the viewers see this point? */
export function pointSeen(v: VisionModel, p: Pt): boolean {
  for (const w of v.viewers) {
    if (!pointInPolygon(p, w.poly)) continue;
    if (v.lit) return true;
    if (w.dv > 0 && Math.hypot(p.x - w.o.x, p.y - w.o.y) <= w.dv) return true;
    for (const l of v.lights) if (Math.hypot(p.x - l.o.x, p.y - l.o.y) <= l.r && pointInPolygon(p, l.poly)) return true;
  }
  return false;
}

/** Is any part of the token seen? (centre, or a point near each corner) */
export function tokenSeen(v: VisionModel, t: Pick<Token, 'x' | 'y' | 'size'>): boolean {
  const s = SPAN[t.size];
  const pts = [tokenCentre(t), { x: t.x + 0.2, y: t.y + 0.2 }, { x: t.x + s - 0.2, y: t.y + 0.2 }, { x: t.x + 0.2, y: t.y + s - 0.2 }, { x: t.x + s - 0.2, y: t.y + s - 0.2 }];
  return pts.some((p) => pointSeen(v, p));
}

// --- explored cells -------------------------------------------------------------------------

/** Explored cells as a string of '0' / '1', row by row (cols × rows). */
export function exploredGet(explored: string | undefined, cols: number, x: number, y: number): boolean {
  return explored?.[y * cols + x] === '1';
}

/** Cells whose centre the viewers see now that aren't marked explored yet (indices). */
export function newlySeenCells(v: VisionModel, cols: number, rows: number, explored: string | undefined): number[] {
  const out: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (explored?.[i] === '1') continue;
      if (pointSeen(v, { x: x + 0.5, y: y + 0.5 })) out.push(i);
    }
  return out;
}

/** Mark cells explored. */
export function exploredMark(explored: string | undefined, cols: number, rows: number, cells: number[]): string {
  const n = cols * rows;
  const arr = (explored ?? '').padEnd(n, '0').slice(0, n).split('');
  for (const i of cells) if (i >= 0 && i < n) arr[i] = '1';
  return arr.join('');
}

// --- Universal VTT import (.dd2vtt / .uvtt from Dungeondraft and others) -----------------------

interface UvttFile {
  resolution?: { map_origin?: Pt; map_size?: Pt; pixels_per_grid?: number };
  line_of_sight?: Pt[][];
  objects_line_of_sight?: Pt[][];
  portals?: { bounds?: Pt[]; closed?: boolean }[];
  lights?: { position?: Pt; range?: number }[];
}

/** Walls, doors and lights from a Universal VTT file (grid units already). */
export function parseUvtt(json: unknown, idOf: () => string): { walls: Wall[]; lights: { x: number; y: number; feet: number }[]; size?: Pt } {
  const f = json as UvttFile;
  const org = f.resolution?.map_origin ?? { x: 0, y: 0 };
  const walls: Wall[] = [];
  const add = (a: Pt, b: Pt, door?: boolean, open?: boolean) =>
    walls.push({ id: idOf(), x1: a.x - org.x, y1: a.y - org.y, x2: b.x - org.x, y2: b.y - org.y, ...(door ? { door: true, open: !!open } : {}) });
  for (const line of [...(f.line_of_sight ?? []), ...(f.objects_line_of_sight ?? [])]) for (let i = 1; i < line.length; i++) add(line[i - 1], line[i]);
  for (const p of f.portals ?? []) if (p.bounds && p.bounds.length >= 2) add(p.bounds[0], p.bounds[1], true, p.closed === false);
  const lights = (f.lights ?? [])
    .filter((l) => l.position)
    .map((l) => ({ x: l.position!.x - org.x, y: l.position!.y - org.y, feet: Math.round((l.range ?? 4) * FEET_PER_CELL_VISION) }));
  return { walls, lights, size: f.resolution?.map_size };
}

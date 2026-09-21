/**
 * Area-of-effect templates: parse "30-foot Cone" / "cầu 20ft" text, and work out which grid
 * tokens fall inside a template placed on the map. Coordinates are in grid cells (5 ft each);
 * a token is tested by its centre, with a small allowance for larger creatures.
 */

export type AreaShape = 'cone' | 'line' | 'cube' | 'sphere' | 'emanation';

export interface AreaSpec {
  shape: AreaShape;
  /** Cone/line length, cube side, sphere radius, emanation reach — in feet. */
  size: number;
  /** Line width in feet (default 5). */
  width?: number;
}

/** Whether the template is anchored on the caster ('self') or dropped on a chosen point. */
export type AreaAnchor = 'self' | 'point';

export interface Pt {
  x: number;
  y: number;
}
export interface AoeToken {
  id: string;
  x: number;
  y: number;
  /** Size in cells (1 = Medium, 2 = Large, …). */
  span: number;
}

export type AoeGeometry =
  | { kind: 'poly'; pts: Pt[] }
  | { kind: 'circle'; cx: number; cy: number; r: number };

const FT = 5;

/** Read an AoE template out of English rules text or a Vietnamese `area` label. */
export function parseArea(text: string | undefined): AreaSpec | null {
  if (!text) return null;
  const t = text.toLowerCase();

  let m = /(\d+)[- ](?:foot|feet|ft)(?:[- ]radius)?(?:,\s*[\d-]+[- ](?:foot|feet|ft)[- ]high)?\s+(cone|line|cube|sphere|emanation|cylinder)/.exec(t);
  if (m) {
    const shape = m[2] === 'cylinder' ? 'sphere' : (m[2] as AreaShape);
    const spec: AreaSpec = { shape, size: Number(m[1]) };
    if (shape === 'line') {
      const w = /(\d+)[- ](?:foot|feet|ft)[- ]wide/.exec(t);
      spec.width = w ? Number(w[1]) : FT;
    }
    return spec;
  }

  // Vietnamese labels used by the built-in spell DB.
  m = /(cầu|nón|khối|tia|toả|tỏa|trụ)[^\d]*(\d+)\s*(?:ft|feet)?/.exec(t);
  if (!m) return null;
  const size = Number(m[2]);
  switch (m[1]) {
    case 'cầu':
    case 'trụ':
      return { shape: 'sphere', size };
    case 'nón':
      return { shape: 'cone', size };
    case 'khối':
      return { shape: 'cube', size };
    case 'tia': {
      const w = /rộng\s*(\d+)/.exec(t);
      return { shape: 'line', size, width: w ? Number(w[1]) : FT };
    }
    default:
      return { shape: 'emanation', size };
  }
}

/** Default anchoring: cones, lines and emanations start at the caster; the rest go on a point. */
export function defaultAnchor(spec: AreaSpec, rangeFeet: number, selfRange: boolean): AreaAnchor {
  if (spec.shape === 'cone' || spec.shape === 'line' || spec.shape === 'emanation') return 'self';
  return selfRange || rangeFeet <= 0 ? 'self' : 'point';
}

const centre = (t: AoeToken): Pt => ({ x: t.x + t.span / 2, y: t.y + t.span / 2 });
const HALF_CONE = Math.atan(0.5); // 2024 cone: width at the far end equals its length

/** Drawable outline of the template. `origin` = caster centre ('self') or the chosen point. */
export function aoeGeometry(
  spec: AreaSpec,
  anchor: AreaAnchor,
  origin: Pt,
  aim: Pt,
  casterSpan = 1,
): AoeGeometry {
  const len = spec.size / FT;
  const ang = Math.atan2(aim.y - origin.y, aim.x - origin.x);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  switch (spec.shape) {
    case 'sphere':
      return { kind: 'circle', cx: origin.x, cy: origin.y, r: len };
    case 'emanation': {
      const h = casterSpan / 2 + len;
      return {
        kind: 'poly',
        pts: [
          { x: origin.x - h, y: origin.y - h },
          { x: origin.x + h, y: origin.y - h },
          { x: origin.x + h, y: origin.y + h },
          { x: origin.x - h, y: origin.y + h },
        ],
      };
    }
    case 'cone': {
      const a1 = ang - HALF_CONE;
      const a2 = ang + HALF_CONE;
      const far = len / Math.cos(HALF_CONE);
      return {
        kind: 'poly',
        pts: [
          origin,
          { x: origin.x + far * Math.cos(a1), y: origin.y + far * Math.sin(a1) },
          { x: origin.x + far * Math.cos(a2), y: origin.y + far * Math.sin(a2) },
        ],
      };
    }
    case 'line': {
      const w = (spec.width ?? FT) / FT / 2;
      const px = -uy * w;
      const py = ux * w;
      const ex = origin.x + ux * len;
      const ey = origin.y + uy * len;
      return {
        kind: 'poly',
        pts: [
          { x: origin.x + px, y: origin.y + py },
          { x: ex + px, y: ey + py },
          { x: ex - px, y: ey - py },
          { x: origin.x - px, y: origin.y - py },
        ],
      };
    }
    case 'cube': {
      if (anchor === 'point') {
        const h = len / 2;
        return {
          kind: 'poly',
          pts: [
            { x: origin.x - h, y: origin.y - h },
            { x: origin.x + h, y: origin.y - h },
            { x: origin.x + h, y: origin.y + h },
            { x: origin.x - h, y: origin.y + h },
          ],
        };
      }
      // self: the cube grows out of the caster in the dominant aim direction
      const horiz = Math.abs(ux) >= Math.abs(uy);
      const sx = horiz ? Math.sign(ux) || 1 : 0;
      const sy = horiz ? 0 : Math.sign(uy) || 1;
      const edge = casterSpan / 2;
      const x0 = horiz ? origin.x + sx * edge : origin.x - len / 2;
      const y0 = horiz ? origin.y - len / 2 : origin.y + sy * edge;
      const w = horiz ? len : len;
      const x1 = horiz ? (sx > 0 ? x0 + w : x0 - w) : x0 + len;
      const y1 = horiz ? y0 + len : sy > 0 ? y0 + w : y0 - w;
      return {
        kind: 'poly',
        pts: [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      };
    }
  }
}

function pointInPoly(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Ids of the tokens caught in the template (the caster is never included). */
export function aoeTokenIds(
  spec: AreaSpec,
  anchor: AreaAnchor,
  origin: Pt,
  aim: Pt,
  tokens: AoeToken[],
  casterId?: string,
): string[] {
  const caster = casterId ? tokens.find((t) => t.id === casterId) : undefined;
  const len = spec.size / FT;
  const geo = aoeGeometry(spec, anchor, origin, aim, caster?.span ?? 1);
  const hits: string[] = [];
  for (const t of tokens) {
    if (t.id === casterId) continue;
    const c = centre(t);
    const slack = (t.span - 1) / 2; // bigger creatures reach further into the area
    let hit = false;
    if (geo.kind === 'circle') {
      hit = Math.hypot(c.x - geo.cx, c.y - geo.cy) <= geo.r + slack + 0.25;
    } else if (spec.shape === 'cone') {
      const dx = c.x - origin.x;
      const dy = c.y - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > 0) {
        const ang = Math.atan2(aim.y - origin.y, aim.x - origin.x);
        let diff = Math.abs(Math.atan2(dy, dx) - ang);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const wiggle = Math.asin(Math.min(1, (0.35 + slack) / d));
        hit = diff <= HALF_CONE + wiggle + 0.02 && d <= len + slack + 0.25;
      }
    } else if (spec.shape === 'line') {
      const ang = Math.atan2(aim.y - origin.y, aim.x - origin.x);
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const vx = c.x - origin.x;
      const vy = c.y - origin.y;
      const along = vx * ux + vy * uy;
      const perp = Math.abs(vx * uy - vy * ux);
      const half = (spec.width ?? FT) / FT / 2;
      hit = along >= -0.5 && along <= len + slack + 0.25 && perp <= half + slack + 0.01;
    } else {
      // cube / emanation: axis-aligned box (grown by the token's own reach)
      const xs = geo.pts.map((p) => p.x);
      const ys = geo.pts.map((p) => p.y);
      hit =
        c.x >= Math.min(...xs) - slack - 0.01 &&
        c.x <= Math.max(...xs) + slack + 0.01 &&
        c.y >= Math.min(...ys) - slack - 0.01 &&
        c.y <= Math.max(...ys) + slack + 0.01;
      if (!hit && geo.pts.length > 2) hit = pointInPoly(c, geo.pts);
    }
    if (hit) hits.push(t.id);
  }
  return hits;
}

import { Quaternion, Vector3 } from 'three';

/**
 * The six polyhedral dice as plain geometry: vertices, outward faces (CCW seen from outside), the
 * number each face (or, for the d4, each vertex) shows, and the "features" that are read — the face
 * pointing up, or the d4's vertex pointing up. Faces are found with a small convex-hull pass, so a
 * die is just its vertex list.
 */
export type Sides = 4 | 6 | 8 | 10 | 12 | 20;

export interface DieShape {
  sides: Sides;
  vertices: Vector3[];
  /** Vertex indices per face, CCW around the outward normal. */
  faces: number[][];
  /** 'face': the up face is the result; 'vertex': the up vertex (d4 — numbers sit at the corners). */
  read: 'face' | 'vertex';
  /** Unit directions of what is read (face normals or vertex directions), and the value of each. */
  features: Vector3[];
  values: number[];
  /** Face normals (for drawing and physics), one per face. */
  normals: Vector3[];
  /** Per face: the in-plane direction the painted number's top points to (matches the texture UVs). */
  labelUp: Vector3[];
}

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-6;

function hull(vs: Vector3[]): number[][] {
  const faces: number[][] = [];
  const seen = new Set<string>();
  const n = vs.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const normal = new Vector3().subVectors(vs[b], vs[a]).cross(new Vector3().subVectors(vs[c], vs[a]));
        if (normal.lengthSq() < EPS) continue;
        normal.normalize();
        const d = normal.dot(vs[a]);
        let pos = 0;
        let neg = 0;
        const on: number[] = [];
        for (let i = 0; i < n; i++) {
          const s = normal.dot(vs[i]) - d;
          if (s > 1e-5) pos++;
          else if (s < -1e-5) neg++;
          else on.push(i);
        }
        if (pos && neg) continue;
        if (pos) normal.negate(); // make it point outward (every other vertex behind the plane)
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        // order the face's vertices around its centroid, CCW seen from outside
        const cen = on.reduce((acc, i) => acc.add(vs[i]), new Vector3()).divideScalar(on.length);
        const u = new Vector3().subVectors(vs[on[0]], cen).normalize();
        const w = new Vector3().crossVectors(normal, u);
        on.sort((i, j) => {
          const pi = new Vector3().subVectors(vs[i], cen);
          const pj = new Vector3().subVectors(vs[j], cen);
          return Math.atan2(pi.dot(w), pi.dot(u)) - Math.atan2(pj.dot(w), pj.dot(u));
        });
        faces.push(on);
      }
  return faces;
}

function centroid(vs: Vector3[], f: number[]): Vector3 {
  return f.reduce((acc, i) => acc.add(vs[i]), new Vector3()).divideScalar(f.length);
}

/** Give opposite features values that sum to n + 1 (like real dice), in a stable order. */
function pairValues(dirs: Vector3[]): number[] {
  const n = dirs.length;
  const values = new Array<number>(n).fill(0);
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (values[i]) continue;
    values[i] = next;
    let best = -1;
    let bestDot = 2;
    for (let j = 0; j < n; j++) {
      if (j === i || values[j]) continue;
      const d = dirs[i].dot(dirs[j]);
      if (d < bestDot) {
        bestDot = d;
        best = j;
      }
    }
    if (best >= 0 && bestDot < -0.9) values[best] = n + 1 - next;
    next++;
    while (values.includes(next)) next++;
  }
  // anything left unpaired (d4 vertices, odd cases) takes the missing numbers in order
  const missing = Array.from({ length: n }, (_, k) => k + 1).filter((v) => !values.includes(v));
  return values.map((v) => v || missing.shift()!);
}

function verticesFor(sides: Sides): Vector3[] {
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  switch (sides) {
    case 4:
      return [v(1, 1, 1), v(1, -1, -1), v(-1, 1, -1), v(-1, -1, 1)];
    case 6: {
      const out: Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(v(x, y, z));
      return out;
    }
    case 8:
      return [v(1, 0, 0), v(-1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(0, 0, 1), v(0, 0, -1)];
    case 10: {
      // pentagonal trapezohedron: planar kites need apex height = h (1 + cos36°) / (1 − cos36°)
      const c36 = Math.cos(Math.PI / 5);
      const h = 0.11;
      const apex = (h * (1 + c36)) / (1 - c36);
      const out = [v(0, apex, 0), v(0, -apex, 0)];
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5;
        out.push(v(Math.cos(a), k % 2 ? -h : h, Math.sin(a)));
      }
      return out;
    }
    case 12: {
      const out: Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(v(x, y, z));
      const a = 1 / PHI;
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          out.push(v(0, s * a, t * PHI));
          out.push(v(s * a, t * PHI, 0));
          out.push(v(s * PHI, 0, t * a));
        }
      return out;
    }
    case 20: {
      const out: Vector3[] = [];
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          out.push(v(0, s, t * PHI));
          out.push(v(s, t * PHI, 0));
          out.push(v(s * PHI, 0, t));
        }
      return out;
    }
  }
}

const cache = new Map<Sides, DieShape>();

/** The shape of a die, scaled so its circumradius is 1. */
export function dieShape(sides: Sides): DieShape {
  const hit = cache.get(sides);
  if (hit) return hit;
  const raw = verticesFor(sides);
  const r = Math.max(...raw.map((p) => p.length()));
  const vertices = raw.map((p) => p.clone().divideScalar(r));
  const faces = hull(vertices);
  const normals = faces.map((f) => centroid(vertices, f).normalize());
  const read = sides === 4 ? 'vertex' : 'face';
  const features = read === 'vertex' ? vertices.map((p) => p.clone().normalize()) : normals;
  const values = pairValues(features);
  // the texture's +V axis on each face: n × (first corner − centre), the same basis the UVs use
  const labelUp = faces.map((f, fi) => {
    const c = centroid(vertices, f);
    const u = new Vector3().subVectors(vertices[f[0]], c).normalize();
    return new Vector3().crossVectors(normals[fi], u).normalize();
  });
  const shape: DieShape = { sides, vertices, faces, read, features, values, normals, labelUp };
  cache.set(sides, shape);
  return shape;
}

/** Index of the feature pointing most nearly up (+Y) once the die is turned by `q`. */
export function upFeature(shape: DieShape, q: Quaternion): number {
  let best = 0;
  let bestY = -2;
  shape.features.forEach((f, i) => {
    const y = f.clone().applyQuaternion(q).y;
    if (y > bestY) {
      bestY = y;
      best = i;
    }
  });
  return best;
}

/** A frame (as a quaternion) built from a main direction and a reference direction. */
function frame(main: Vector3, ref: Vector3): Quaternion {
  const y = main.clone().normalize();
  const x = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y))).normalize();
  const z = new Vector3().crossVectors(x, y);
  const m = new Quaternion();
  // rotation matrix columns x, y, z → quaternion
  const m00 = x.x, m01 = y.x, m02 = z.x;
  const m10 = x.y, m11 = y.y, m12 = z.y;
  const m20 = x.z, m21 = y.z, m22 = z.z;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    m.set((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    m.set(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    m.set((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    m.set((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  return m.normalize();
}

/** Reference directions for a feature: the corners of a face, or the neighbouring corners of a vertex. */
function refs(shape: DieShape, i: number): Vector3[] {
  if (shape.read === 'face') return shape.faces[i].map((k) => shape.vertices[k]);
  return shape.vertices.filter((_, k) => k !== i);
}

const symCache = new Map<string, Quaternion[]>();

/**
 * Every rotation that is a symmetry of the die (the solid looks the same) and carries feature `from`
 * onto feature `to` — one per way the feature can sit (3 for a triangle face, 4 for a square…).
 * Turning the drawn die by one before replaying a physics roll that ended on `to` makes it show
 * `from` instead, still resting flat exactly as the simulation left it.
 */
export function symmetriesTo(shape: DieShape, from: number, to: number): Quaternion[] {
  const key = `${shape.sides}:${from}:${to}`;
  const hit = symCache.get(key);
  if (hit) return hit.map((q) => q.clone());
  const a = shape.features[from];
  const b = shape.features[to];
  const inv = frame(a, refs(shape, from)[0]).invert();
  const found: Quaternion[] = [];
  for (const r of refs(shape, to)) {
    const q = frame(b, r).multiply(inv);
    // a symmetry sends every vertex onto some vertex
    const ok = shape.vertices.every((p) => {
      const t = p.clone().applyQuaternion(q);
      return shape.vertices.some((o) => o.distanceToSquared(t) < 1e-4);
    });
    if (ok && !found.some((f) => Math.abs(f.dot(q)) > 0.9999)) found.push(q);
  }
  if (!found.length) found.push(new Quaternion().setFromUnitVectors(a, b));
  symCache.set(key, found);
  return found.map((q) => q.clone());
}

/** The first such symmetry (see `symmetriesTo`). */
export function symmetryTo(shape: DieShape, from: number, to: number): Quaternion {
  return symmetriesTo(shape, from, to)[0];
}

import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Vec3, World } from 'cannon-es';
import { dieShape, symmetriesTo, upFeature, type DieShape, type Sides } from './shapes.js';
import { diceClack } from '../sfx.js';
import { holdFor } from './hold.js';

/**
 * Native 3D dice. The server has already rolled; this only shows it. Each throw is simulated with
 * real physics first (cannon-es), off screen, until every die rests; then each drawn die is turned by
 * a symmetry of its solid so that the face the server rolled is the one on top, and the recorded
 * motion is replayed (three.js) over the map. Same physics, honest-looking tumble, the server's number.
 */

export interface DieSpec {
  sides: number;
  value: number;
  /** Dropped by keep-highest / keep-lowest: drawn dimmed. */
  dropped?: boolean;
}

const SIZE = 0.9; // circumradius of a die, world units
const FPS = 60;
const MAX_FRAMES = FPS * 6;
const HOLD_S = 1.8;
const FADE_S = 0.5;

interface Frame {
  p: Float32Array; // xyz per die
  q: Float32Array; // xyzw per die
}
interface Throw {
  group: Group;
  meshes: Mesh[];
  frames: Frame[];
  clacks: Map<number, number>; // frame → strength
  start: number;
  dims: boolean[];
}

let renderer: WebGLRenderer | null = null;
let scene: Scene;
let camera: PerspectiveCamera;
let host: HTMLElement | null = null;
/** The floor area dice may roll in (world units): the part of the map left uncovered by the HUD and sheet. */
let box = { x0: -10, x1: 10, z0: -7, z1: 7 };
const throws: Throw[] = [];
let raf = 0;

function ensureStage(): boolean {
  if (renderer) return true;
  const area = document.querySelector('.map-area') as HTMLElement | null;
  if (!area) return false;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return false; // no WebGL: the log still shows every roll
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  host = document.createElement('div');
  host.className = 'dice3d-stage';
  host.appendChild(renderer.domElement);
  area.appendChild(host);
  scene = new Scene();
  camera = new PerspectiveCamera(32, 1, 1, 200);
  camera.position.set(0, 42, 12);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 0.75));
  const sun = new DirectionalLight(0xfff3e0, 1.6);
  sun.position.set(-8, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -30;
  sc.right = 30;
  sc.top = 30;
  sc.bottom = -30;
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  resize();
  window.addEventListener('resize', resize);
  // dev builds only: lets the headless checks read where each die came to rest
  if (import.meta.env.DEV) (window as unknown as { __dice3d: unknown }).__dice3d = { throws, get box() { return box; } };
  return true;
}

/** Fit the canvas to the map area and work out how much floor the camera sees (the dice box). */
function resize(): void {
  if (!renderer || !host) return;
  const area = host.parentElement!;
  const w = area.clientWidth || window.innerWidth;
  const h = area.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(); // rays below need the camera's real orientation (set by lookAt)
  const ray = new Raycaster();
  const hit = (x: number, y: number) => {
    ray.setFromCamera(new Vector2(x, y), camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const t = -o.y / d.y;
    return new Vector3(o.x + d.x * t, 0, o.z + d.z * t);
  };
  // free screen rect: below the top HUD, right of the tool column, left of a side-docked sheet
  const ar = area.getBoundingClientRect();
  let left = 70;
  let right = w - 20;
  const top = 70;
  const bottom = h - 50;
  const dock = area.querySelector('.sheet-dock') as HTMLElement | null;
  if (dock) {
    const r = dock.getBoundingClientRect();
    if (r.height > h * 0.6 && r.left - ar.left > w * 0.35) right = Math.min(right, r.left - ar.left - 12);
  }
  if (right - left < 200) left = 20;
  const ndc = (px: number, py: number) => hit((px / w) * 2 - 1, -((py / h) * 2 - 1));
  const tl = ndc(left, top);
  const tr = ndc(right, top);
  const bl = ndc(left, bottom);
  const brr = ndc(right, bottom);
  const m = SIZE * 1.2;
  box = {
    x0: Math.max(tl.x, bl.x) + m,
    x1: Math.min(tr.x, brr.x) - m,
    z0: Math.max(tl.z, tr.z) + m,
    z1: Math.min(bl.z, brr.z) - m,
  };
  if (box.x1 - box.x0 < 6) box = { x0: -4, x1: 4, z0: box.z0, z1: box.z1 };
  if (box.z1 - box.z0 < 5) box = { ...box, z0: -3, z1: 3 };
}

// ----------------------------------------------------------------------------- drawing

function contrast(hex: string): string {
  const c = new Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return l > 0.55 ? '#1c140c' : '#fff6e6';
}

function label(value: number, kind: 'plain' | 'tens' | 'units'): string {
  if (kind === 'tens') return value === 10 ? '00' : `${value}0`;
  if (kind === 'units') return value === 10 ? '0' : String(value);
  return String(value);
}

const matCache = new Map<string, MeshStandardMaterial[]>();

/** One material per face, each with its number painted where the face's UVs put it. */
function materials(shape: DieShape, color: string, kind: 'plain' | 'tens' | 'units', uvs: Vector2[][]): MeshStandardMaterial[] {
  const key = `${shape.sides}|${color}|${kind}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const ink = contrast(color);
  const out = shape.faces.map((face, fi) => {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, S, S);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const px = (uv: Vector2) => new Vector2(uv.x * S, (1 - uv.y) * S);
    const corners = uvs[fi].map(px);
    const mid = corners.reduce((a, c) => a.add(c), new Vector2()).divideScalar(corners.length);
    // the largest circle inside the face (in px) sets the number size
    let inr = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const ab = new Vector2().subVectors(b, a);
      const dist = Math.abs(ab.x * (mid.y - a.y) - ab.y * (mid.x - a.x)) / ab.length();
      inr = Math.min(inr, dist);
    }
    if (shape.read === 'vertex') {
      // d4: each corner shows the number of the vertex it touches, pointing at that corner
      face.forEach((vi, k) => {
        const c = corners[k];
        const at = new Vector2().lerpVectors(mid, c, 0.55);
        const ang = Math.atan2(c.y - mid.y, c.x - mid.x) + Math.PI / 2;
        g.save();
        g.translate(at.x, at.y);
        g.rotate(ang);
        g.font = `700 ${Math.round(inr * 0.85)}px Georgia, serif`;
        g.fillText(String(shape.values[vi]), 0, 0);
        g.restore();
      });
    } else {
      const text = label(shape.values[fi], kind);
      const fs = Math.round(inr * (text.length > 1 ? 1.05 : 1.35));
      g.font = `700 ${fs}px Georgia, serif`;
      g.fillText(text, mid.x, mid.y + fs * 0.04);
      // 6 / 9 (and 66-style) need a mark to tell which way is up
      if (kind === 'plain' && (text === '6' || text === '9') && shape.sides > 6) g.fillRect(mid.x - fs * 0.22, mid.y + fs * 0.45, fs * 0.44, Math.max(2, fs * 0.07));
    }
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return new MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.08, transparent: true });
  });
  matCache.set(key, out);
  return out;
}

const geoCache = new Map<Sides, { geo: BufferGeometry; uvs: Vector2[][] }>();

function geometry(shape: DieShape): { geo: BufferGeometry; uvs: Vector2[][] } {
  const hit = geoCache.get(shape.sides);
  if (hit) return hit;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const geo = new BufferGeometry();
  const faceUvs: Vector2[][] = [];
  let start = 0;
  shape.faces.forEach((face, fi) => {
    const pts = face.map((i) => shape.vertices[i].clone().multiplyScalar(SIZE));
    const c = pts.reduce((a, p) => a.add(p), new Vector3()).divideScalar(pts.length);
    const n = shape.normals[fi];
    const u = new Vector3().subVectors(pts[0], c).normalize();
    const w = new Vector3().crossVectors(n, u);
    const R = Math.max(...pts.map((p) => p.distanceTo(c)));
    const fu = pts.map((p) => {
      const d = new Vector3().subVectors(p, c);
      return new Vector2(0.5 + (0.47 * d.dot(u)) / R, 0.5 + (0.47 * d.dot(w)) / R);
    });
    faceUvs.push(fu);
    for (let k = 1; k < pts.length - 1; k++) {
      for (const j of [0, k, k + 1]) {
        pos.push(pts[j].x, pts[j].y, pts[j].z);
        nor.push(n.x, n.y, n.z);
        uv.push(fu[j].x, fu[j].y);
      }
    }
    const count = (pts.length - 2) * 3;
    geo.addGroup(start, count, fi);
    start += count;
  });
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const out = { geo, uvs: faceUvs };
  geoCache.set(shape.sides, out);
  return out;
}

// ----------------------------------------------------------------------------- physics

function simulate(shapes: DieShape[]): { frames: Frame[]; finals: Quaternion[]; clacks: Map<number, number> } {
  const world = new World({ gravity: new Vec3(0, -60, 0), allowSleep: true });
  const diceMat = new Material('dice');
  const floorMat = new Material('floor');
  world.addContactMaterial(new ContactMaterial(diceMat, floorMat, { friction: 0.35, restitution: 0.35 }));
  world.addContactMaterial(new ContactMaterial(diceMat, diceMat, { friction: 0.2, restitution: 0.45 }));
  const wall = (pos: Vec3, axis: Vec3, angle: number) => {
    const b = new Body({ mass: 0, material: floorMat, shape: new Plane() });
    b.position.copy(pos);
    b.quaternion.setFromAxisAngle(axis, angle);
    world.addBody(b);
  };
  wall(new Vec3(0, 0, 0), new Vec3(1, 0, 0), -Math.PI / 2); // floor (normal +Y)
  const { x0, x1, z0, z1 } = box;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  wall(new Vec3(x0, 0, 0), new Vec3(0, 1, 0), Math.PI / 2); // left (normal +X)
  wall(new Vec3(x1, 0, 0), new Vec3(0, 1, 0), -Math.PI / 2); // right
  wall(new Vec3(0, 0, z0), new Vec3(0, 1, 0), 0); // far (normal +Z)
  wall(new Vec3(0, 0, z1), new Vec3(0, 1, 0), Math.PI); // near

  // throw from a random side of the box toward the middle
  const side = Math.floor(Math.random() * 4);
  const bodies = shapes.map((shape, i) => {
    const poly = new ConvexPolyhedron({
      vertices: shape.vertices.map((p) => new Vec3(p.x * SIZE, p.y * SIZE, p.z * SIZE)),
      faces: shape.faces,
    });
    const b = new Body({ mass: 1, material: diceMat, shape: poly, linearDamping: 0.08, angularDamping: 0.08 });
    b.allowSleep = true;
    b.sleepSpeedLimit = 0.25;
    b.sleepTimeLimit = 0.25;
    const spread = (i - (shapes.length - 1) / 2) * SIZE * 2.3;
    const jitter = () => (Math.random() - 0.5) * 1.5;
    const sx = side === 0 ? x0 + 1.5 : side === 1 ? x1 - 1.5 : cx + spread + jitter();
    const sz = side === 2 ? z0 + 1.5 : side === 3 ? z1 - 1.5 : cz + spread * 0.6 + jitter();
    b.position.set(Math.max(x0 + 1, Math.min(x1 - 1, sx)), 3 + Math.random() * 2 + i * 0.4, Math.max(z0 + 1, Math.min(z1 - 1, sz)));
    const speed = 14 + Math.random() * 8;
    const dir = new Vec3((cx - b.position.x) * 0.6 + jitter() * 2, 0, (cz - b.position.z) * 0.6 + jitter() * 2);
    dir.normalize();
    b.velocity.set(dir.x * speed, -2 - Math.random() * 3, dir.z * speed);
    b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    b.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    world.addBody(b);
    return b;
  });

  const clacks = new Map<number, number>();
  let frameNo = 0;
  for (const b of bodies)
    b.addEventListener('collide', (e: { contact: { getImpactVelocityAlongNormal: () => number } }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 2) clacks.set(frameNo, Math.max(clacks.get(frameNo) ?? 0, Math.min(1, v / 18)));
    });

  const frames: Frame[] = [];
  const record = () => {
    const p = new Float32Array(bodies.length * 3);
    const q = new Float32Array(bodies.length * 4);
    bodies.forEach((b, i) => {
      p.set([b.position.x, b.position.y, b.position.z], i * 3);
      q.set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 4);
    });
    frames.push({ p, q });
  };
  record();
  for (frameNo = 1; frameNo < MAX_FRAMES; frameNo++) {
    world.step(1 / FPS);
    record();
    if (frameNo > 20 && bodies.every((b) => b.sleepState === Body.SLEEPING)) break;
  }
  const finals = bodies.map((b) => new Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
  return { frames, finals, clacks };
}

// ----------------------------------------------------------------------------- throwing

const SUPPORTED = new Set([4, 6, 8, 10, 12, 20]);

/** Show a roll: the dice tumble over the map and come to rest on the given values. */
export function throwDice(dice: DieSpec[], color: string): void {
  if (!dice.length || !ensureStage()) return;
  resize();
  // a d100 is two d10s (tens and units); anything else unusual is skipped
  const parts: { shape: DieShape; value: number; kind: 'plain' | 'tens' | 'units'; dropped?: boolean }[] = [];
  for (const d of dice.slice(0, 24)) {
    if (d.sides === 100) {
      const v = d.value % 100;
      const tens = Math.floor(v / 10);
      const units = v % 10;
      parts.push({ shape: dieShape(10), value: tens === 0 ? 10 : tens, kind: 'tens', dropped: d.dropped });
      parts.push({ shape: dieShape(10), value: units === 0 ? 10 : units, kind: 'units', dropped: d.dropped });
    } else if (SUPPORTED.has(d.sides)) {
      parts.push({ shape: dieShape(d.sides as Sides), value: d.value, kind: 'plain', dropped: d.dropped });
    }
  }
  if (!parts.length) return;
  // a die left leaning (on a wall, on another die) reads badly: throw again, a few tries at most
  const flat = (r: ReturnType<typeof simulate>) =>
    r.finals.every((q, i) => parts[i].shape.features[upFeature(parts[i].shape, q)].clone().applyQuaternion(q).y > 0.97);
  let sim = simulate(parts.map((p) => p.shape));
  for (let tries = 0; tries < 4 && !flat(sim); tries++) sim = simulate(parts.map((p) => p.shape));
  const { frames, finals, clacks } = sim;
  holdFor(frames.length / FPS - 0.15);
  const group = new Group();
  const meshes = parts.map((part, i) => {
    const { geo, uvs } = geometry(part.shape);
    const mats = materials(part.shape, color, part.kind, uvs).map((m) => m.clone());
    const outer = new Mesh(); // follows the physics body
    const inner = new Mesh(geo, mats); // turned by a symmetry so the rolled number ends on top
    inner.castShadow = true;
    const landed = upFeature(part.shape, finals[i]);
    const want = part.shape.values.indexOf(part.value);
    if (want >= 0) {
      // of the turns that put the number on top, take the one that reads upright from the camera
      const options = symmetriesTo(part.shape, want, landed);
      let best = options[0];
      if (part.shape.read === 'face' && options.length > 1) {
        let bestScore = -2;
        for (const q of options) {
          const up = part.shape.labelUp[want].clone().applyQuaternion(q).applyQuaternion(finals[i]);
          const score = -up.z; // toward the top of the screen
          if (score > bestScore) {
            bestScore = score;
            best = q;
          }
        }
      }
      inner.quaternion.copy(best);
    }
    outer.add(inner);
    group.add(outer);
    return outer;
  });
  scene.add(group);
  throws.push({ group, meshes, frames, clacks, start: performance.now(), dims: parts.map((p) => !!p.dropped) });
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number): void {
  raf = 0;
  for (let k = throws.length - 1; k >= 0; k--) {
    const t = throws[k];
    const el = Math.max(0, now - t.start) / 1000; // rAF's timestamp can be a hair before the throw started
    const fi = Math.min(t.frames.length - 1, Math.floor(el * FPS));
    const f = t.frames[fi];
    t.meshes.forEach((m, i) => {
      m.position.set(f.p[i * 3], f.p[i * 3 + 1], f.p[i * 3 + 2]);
      m.quaternion.set(f.q[i * 4], f.q[i * 4 + 1], f.q[i * 4 + 2], f.q[i * 4 + 3]);
    });
    // contact clicks as the replay reaches them
    const prev = (t as Throw & { lastFrame?: number }).lastFrame ?? -1;
    for (let j = prev + 1; j <= fi; j++) {
      const s = t.clacks.get(j);
      if (s) diceClack(s);
    }
    (t as Throw & { lastFrame?: number }).lastFrame = fi;
    const restAt = t.frames.length / FPS;
    const after = el - restAt;
    const fade = after > HOLD_S ? Math.max(0, 1 - (after - HOLD_S) / FADE_S) : 1;
    t.meshes.forEach((m, i) => {
      const dim = t.dims[i] && after > 0 ? 0.4 : 1;
      for (const mat of (m.children[0] as Mesh).material as MeshStandardMaterial[]) mat.opacity = fade * dim;
    });
    if (after > HOLD_S + FADE_S) {
      scene.remove(t.group);
      t.meshes.forEach((m) => {
        for (const mat of (m.children[0] as Mesh).material as MeshStandardMaterial[]) mat.dispose(); // clones; textures stay cached
      });
      throws.splice(k, 1);
    }
  }
  renderer!.render(scene, camera);
  if (throws.length) raf = requestAnimationFrame(tick);
}

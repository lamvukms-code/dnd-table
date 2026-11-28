/**
 * Dice skins for the native 3D dice: a face texture + number ink + material feel. The skins live in
 * the DM's own art folder (`/art/dice/skins.json`, git-ignored — e.g. a set made for a campaign's
 * moons), fetched at runtime; with no file there are no skins and dice use the roller's colour.
 * Light module (no three.js): the settings and the dice layer read it.
 */
export interface DiceSkin {
  /** Unique id ("<set>/<moon>" in a multi-set file, else the moon key). */
  key: string;
  name: string;
  /** Which set it belongs to (a file can hold several looks of the same moons). */
  set: string;
  /** The sky moon this skin goes with, for "follow the moon" (defaults to the key). */
  moon: string;
  /** Square face texture (served path); its centre is the face centre. */
  face?: string;
  base: string;
  ink: string;
  inkStroke?: string | null;
  inkGlow?: string | null;
  roughness?: number;
  metalness?: number;
  emissive?: string | null;
  emissiveIntensity?: number;
}

export interface LoadedSkin extends DiceSkin {
  img?: HTMLImageElement;
}

export interface SkinSet {
  id: string;
  name: string;
}

let skins: Map<string, LoadedSkin> | null = null;
let sets: SkinSet[] = [];
let loading: Promise<Map<string, LoadedSkin>> | null = null;

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v) ? v : null);
const unit = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Fetch the skin list once (and start loading the face pictures). Empty when there is none. */
export function loadSkins(): Promise<Map<string, LoadedSkin>> {
  loading ??= fetch('/art/dice/skins.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { skins: [] }))
    .catch(() => ({ skins: [] }))
    .then((data: { skins?: unknown[]; sets?: unknown[] }) => {
      const out = new Map<string, LoadedSkin>();
      for (const raw of data.skins ?? []) {
        const s = raw as Record<string, unknown>;
        const id = typeof s.id === 'string' ? s.id : s.key;
        if (typeof id !== 'string' || !hex(s.base) || !hex(s.ink)) continue;
        const set = typeof s.set === 'string' ? s.set : 'default';
        const skin: LoadedSkin = {
          key: id,
          set,
          moon: typeof s.moon === 'string' ? s.moon : typeof s.key === 'string' ? s.key : id,
          name: typeof s.name === 'string' ? s.name : id,
          face: typeof s.face === 'string' && s.face.startsWith('/art/') ? s.face : undefined,
          base: hex(s.base)!,
          ink: hex(s.ink)!,
          inkStroke: hex(s.inkStroke),
          inkGlow: hex(s.inkGlow),
          roughness: unit(s.roughness, 0.45),
          metalness: unit(s.metalness, 0.1),
          emissive: hex(s.emissive),
          emissiveIntensity: Math.min(0.5, unit(s.emissiveIntensity, 0)),
        };
        if (skin.face) {
          const img = new Image();
          img.decoding = 'async';
          img.src = skin.face;
          skin.img = img;
        }
        out.set(skin.key, skin);
      }
      skins = out;
      const named = new Map<string, string>();
      for (const raw of data.sets ?? []) {
        const st = raw as Record<string, unknown>;
        if (typeof st.id === 'string') named.set(st.id, typeof st.name === 'string' ? st.name : st.id);
      }
      sets = [...new Set([...out.values()].map((sk) => sk.set))].map((id) => ({ id, name: named.get(id) ?? id }));
      return out;
    });
  return loading;
}

/** The sets found in the file, in order (empty until `loadSkins` has finished). */
export function skinSets(): SkinSet[] {
  return sets;
}

/** The skins already loaded (empty until `loadSkins` has finished). */
export function loadedSkins(): Map<string, LoadedSkin> {
  return skins ?? new Map();
}

const KEY = 'dnd-table.diceSkin';
/** This browser's choice: 'moon' / 'moon@<set>' (follow the moon in the sky, with that set), 'player'
 *  (the roller's colour) or one skin's key. */
export function diceSkinPref(): string {
  try {
    return localStorage.getItem(KEY) || 'moon';
  } catch {
    return 'moon';
  }
}
export function setDiceSkinPref(v: string): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked */
  }
}

/** Which skin to draw now, given the preference and the moon in the sky (null = roller's colour). */
export function resolveSkin(moonKey: string | undefined | null): LoadedSkin | null {
  const all = loadedSkins();
  const pref = diceSkinPref();
  if (pref === 'player') return null;
  if (pref === 'moon' || pref.startsWith('moon@')) {
    if (!moonKey) return null;
    const set = pref.startsWith('moon@') ? pref.slice(5) : sets[0]?.id;
    const list = [...all.values()].filter((sk) => sk.moon === moonKey);
    return list.find((sk) => sk.set === set) ?? list[0] ?? null;
  }
  return all.get(pref) ?? null;
}

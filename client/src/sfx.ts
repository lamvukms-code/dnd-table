import { getSfxVolume } from './sound.js';

/**
 * Attack / spell / heal sound effects for the table, picked from what actually happened: a bite
 * crunches, a claw rakes, an arrow twangs and thuds, a fire bolt roars, frost shimmers… The CC0
 * clips in /sounds (when the server has them) are layered with sounds synthesised in WebAudio, so
 * every cue works even with no files at all. Sounds go into one queue — a multiattack plays its
 * swings one after another instead of all at once — and the queue never runs more than ~3 s ahead.
 */

export { classify, eventsFor, ELEMENTS, type Cue, type Element, type FxEvent } from '@dnd-table/shared';
import type { Element, FxEvent } from '@dnd-table/shared';

// --- audio engine -----------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const files = new Map<string, Promise<AudioBuffer | null>>();
let queueEnd = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // browsers start an AudioContext suspended until the page is clicked
    const resume = () => void ctx?.resume();
    window.addEventListener('pointerdown', resume, { once: true });
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  master!.gain.value = getSfxVolume();
  return ctx;
}

const manifestMods = import.meta.glob('./data/soundManifest.json', { eager: true });
const manifest = ((Object.values(manifestMods)[0] as { default?: unknown } | undefined)?.default ?? {}) as Record<string, string[]>;
/** A clip from the server's sound folders by file-name pattern (random among matches). */
function clipUrl(re: RegExp): string | undefined {
  const all = [...(manifest.combat ?? []), ...(manifest.magic ?? []), ...(manifest.monster ?? [])].filter((u) => re.test(u));
  return all.length ? all[Math.floor(Math.random() * all.length)] : undefined;
}
function loadClip(url: string): Promise<AudioBuffer | null> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => audio()!.decodeAudioData(b))
      .catch(() => null);
    files.set(url, p);
  }
  return p;
}

// synthesis building blocks, all scheduled at absolute time `t`
function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function noiseBurst(t: number, dur: number, peak: number, filter: { type: BiquadFilterType; f0: number; f1?: number; q?: number }) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 1;
  f.frequency.setValueAtTime(filter.f0, t);
  if (filter.f1) f.frequency.exponentialRampToValueAtTime(filter.f1, t + dur);
  const g = c.createGain();
  env(g, t, peak, Math.min(0.02, dur / 4), dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}
function tone(t: number, dur: number, peak: number, f0: number, f1: number = f0, type: OscillatorType = 'sine', detune = 0) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  env(g, t, peak, 0.005, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}
/** Play a matching clip; false when the server has none (the caller falls back to synthesis). */
function clip(t: number, re: RegExp, vol: number, rate = 1): boolean {
  const url = clipUrl(re);
  if (!url) return false;
  void loadClip(url).then((buf) => {
    if (!buf || !ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(master!);
    s.start(Math.max(t, ctx.currentTime));
  });
  return true;
}

const whoosh = (t: number, dur = 0.22, peak = 0.35) => noiseBurst(t, dur, peak, { type: 'bandpass', f0: 500, f1: 2400, q: 1.4 });
const thump = (t: number, f = 110, peak = 0.6, dur = 0.18) => tone(t, dur, peak, f, f * 0.45);

const ELEMENT_SOUND: Record<Element, (t: number, big: boolean) => void> = {
  // recorded spell impacts (lentikula, CC0) when the server has them; the synthesis underneath
  fire: (t, big) => {
    const rec = clip(t, /lk_fire_impact/, 0.8) || clip(t, /spell_fire/, 0.6);
    noiseBurst(t, big ? 0.9 : 0.55, rec ? 0.18 : 0.45, { type: 'lowpass', f0: 2600, f1: 400 });
    thump(t, 70, 0.4, 0.3);
  },
  cold: (t) => {
    const rec = clip(t, /lk_ice_impact/, 0.8);
    for (let i = 0; i < 5; i++) tone(t + i * 0.03, 0.5, rec ? 0.03 : 0.08, 2400 + i * 330, 1400 + i * 200, 'triangle');
    if (!rec) {
      noiseBurst(t, 0.35, 0.18, { type: 'highpass', f0: 5000 });
      clip(t + 0.05, /impactGlass_light/, 0.5);
    }
  },
  lightning: (t) => {
    const rec = clip(t, /lk_lightning_impact/, 0.8);
    for (let i = 0; i < 7; i++) noiseBurst(t + i * 0.035 + Math.random() * 0.02, 0.04, rec ? 0.15 : 0.5, { type: 'highpass', f0: 2500 });
    if (!rec) tone(t, 0.25, 0.12, 900, 120, 'sawtooth');
    thump(t + 0.05, 60, 0.5, 0.4);
  },
  thunder: (t, big) => {
    noiseBurst(t, big ? 1.4 : 0.9, 0.7, { type: 'lowpass', f0: 380, f1: 80 });
    thump(t, 55, 0.8, 0.6);
  },
  acid: (t) => {
    clip(t, /lk_water_impact/, 0.6, 1.25);
    noiseBurst(t, 0.7, 0.3, { type: 'bandpass', f0: 3200, q: 3 });
    for (let i = 0; i < 4; i++) tone(t + i * 0.09, 0.06, 0.12, 700 + Math.random() * 500, 300, 'sine');
  },
  poison: (t) => {
    for (let i = 0; i < 6; i++) tone(t + i * 0.07 + Math.random() * 0.03, 0.07, 0.15, 260 + Math.random() * 240, 520, 'sine');
    noiseBurst(t, 0.5, 0.12, { type: 'bandpass', f0: 900, q: 4 });
  },
  necrotic: (t) => {
    tone(t, 0.7, 0.18, 98, 70, 'sawtooth', 0);
    tone(t, 0.7, 0.18, 98, 66, 'sawtooth', 18);
    noiseBurst(t + 0.05, 0.6, 0.15, { type: 'bandpass', f0: 1800, f1: 600, q: 6 });
  },
  radiant: (t) => {
    for (const [f, d] of [
      [880, 0],
      [1320, 0.02],
      [1760, 0.04],
      [2640, 0.06],
    ] as const)
      tone(t + d, 0.9, 0.12, f, f, 'sine');
    noiseBurst(t, 0.3, 0.1, { type: 'highpass', f0: 6000 });
  },
  force: (t) => {
    tone(t, 0.25, 0.5, 220, 70, 'sine');
    tone(t, 0.12, 0.2, 660, 200, 'triangle');
    noiseBurst(t, 0.08, 0.3, { type: 'bandpass', f0: 1200, q: 2 });
  },
  psychic: (t) => {
    const c = ctx!;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 9;
    depth.gain.value = 180;
    lfo.connect(depth).connect(o.frequency);
    o.frequency.value = 520;
    o.type = 'triangle';
    const g = c.createGain();
    env(g, t, 0.16, 0.05, 0.7);
    o.connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.8);
    lfo.stop(t + 0.8);
  },
};

function playLaunch(t: number, e: FxEvent) {
  switch (e.cue) {
    case 'arrow':
      tone(t, 0.12, 0.22, 240, 180, 'sawtooth');
      whoosh(t + 0.03, 0.25, 0.25);
      break;
    case 'thrown':
      whoosh(t, 0.3, 0.3);
      break;
    case 'spell':
      noiseBurst(t, 0.35, 0.18, { type: 'bandpass', f0: 400, f1: 3000, q: 2 });
      tone(t, 0.35, 0.08, 330, 990, 'triangle');
      break;
    case 'bite':
      noiseBurst(t, 0.12, 0.18, { type: 'lowpass', f0: 900 });
      break;
    case 'claw':
      whoosh(t, 0.15, 0.25);
      break;
    default:
      whoosh(t, e.cue === 'slam' ? 0.3 : 0.2, 0.32);
  }
  // a miss: just the swing / shot going past
  if (e.hit === false) noiseBurst(t + 0.18, 0.18, 0.12, { type: 'bandpass', f0: 1800, f1: 800, q: 1 });
}

function playImpact(t: number, e: FxEvent) {
  const big = !!e.crit || (e.amount ?? 0) >= 20;
  switch (e.cue) {
    case 'heal':
      if (!clip(t, /lk_heal_/, 0.8)) [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, 0.6, 0.12, f, f, 'sine'));
      return;
    case 'bite':
      // jaws: a wet crunch, a low thud, sometimes the creature's snarl
      for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.025, 0.05, 0.4, { type: 'bandpass', f0: 1500 + i * 400, q: 2 });
      thump(t, 90, 0.5, 0.2);
      clip(t, /impactSoft_heavy/, 0.5);
      if (Math.random() < 0.35) clip(t + 0.05, /creature_(misc|monster)/, 0.35);
      break;
    case 'claw':
      for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.06, 0.09, 0.35, { type: 'highpass', f0: 2200 + i * 300 });
      clip(t + 0.04, /impactSoft_medium/, 0.45);
      break;
    case 'slash':
      clip(t, /blade_0|chop/, 0.6);
      noiseBurst(t, 0.12, 0.25, { type: 'highpass', f0: 3000 });
      clip(t + 0.02, /impactSoft_medium/, 0.35);
      break;
    case 'pierce':
      noiseBurst(t, 0.08, 0.3, { type: 'bandpass', f0: 2500, q: 3 });
      clip(t, /impactSoft_medium/, 0.5);
      thump(t, 140, 0.3, 0.12);
      break;
    case 'arrow':
    case 'thrown':
      clip(t, /impactWood_light|impactSoft_medium/, 0.5);
      thump(t, 160, 0.35, 0.1);
      break;
    case 'punch':
      clip(t, /impactPunch_medium/, 0.6);
      thump(t, 100, 0.4, 0.14);
      break;
    case 'slam':
      clip(t, /impactPunch_heavy/, 0.7);
      thump(t, 70, 0.7, 0.3);
      break;
    case 'spell':
      break;
  }
  if (e.element) ELEMENT_SOUND[e.element](t, big);
  if (e.crit) {
    thump(t + 0.02, 50, 0.6, 0.45);
    noiseBurst(t, 0.25, 0.25, { type: 'highpass', f0: 4000 });
  }
}

const seen = new Set<string>();

/** Queue the sound of one effect event. A burst (multiattack) plays its events one by one. */
export function playFx(e: FxEvent, notBefore = 0): void {
  if (seen.has(e.id)) return;
  seen.add(e.id);
  if (seen.size > 500) seen.clear();
  if (getSfxVolume() <= 0) return;
  const c = audio();
  if (!c) return;
  const now = c.currentTime;
  // impacts follow their own launch closely; separate attacks get a breath between them
  const gap = e.phase === 'impact' ? 0.16 : 0.32;
  const t = Math.max(now + 0.02 + notBefore, queueEnd + (queueEnd > now ? gap : 0));
  if (t - now > 3) return; // the backlog is long enough already
  queueEnd = t + (e.phase === 'impact' ? 0.25 : 0.18);
  if (e.phase === 'launch') playLaunch(t, e);
  else playImpact(t, e);
}

/** Seconds until a newly queued event would play (the visual effect waits the same). */
export function fxDelay(): number {
  if (!ctx) return 0;
  return Math.max(0, queueEnd - ctx.currentTime);
}

// --- dddice dice-roll sounds ------------------------------------------------------------------

const DICE_KEY = 'dnd-table.diceSoundVolume';
export function getDiceVolume(): number {
  try {
    const raw = localStorage.getItem(DICE_KEY);
    if (raw === 'off') return 0;
    const n = raw ? Number(raw) : 0.35;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35;
  } catch {
    return 0.35;
  }
}
export function setDiceVolume(v: number): void {
  try {
    localStorage.setItem(DICE_KEY, v <= 0 ? 'off' : String(v));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event('dice-volume'));
}

/** One die hitting the table or another die (native 3D dice); `strength` 0..1. Own volume (dice slider). */
let lastClack = 0;
export function diceClack(strength: number): void {
  const vol = getDiceVolume() * Math.min(1, Math.max(0.15, strength));
  if (vol <= 0.01) return;
  const c = audio();
  if (!c) return;
  if (c.currentTime - lastClack < 0.035) return; // a pile-up of contacts is one click, not ten
  lastClack = c.currentTime;
  const url = clipUrl(/impactGeneric_light|impactPlate_light/);
  if (!url) return;
  void loadClip(url).then((buf) => {
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1.55 + Math.random() * 0.45; // small and hard: a die, not a crate
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(ctx.destination);
    src.start();
  });
}

/** Effects on/off for the visual layer (per browser). */
const VFX_KEY = 'dnd-table.vfx';
export function vfxEnabled(): boolean {
  try {
    return localStorage.getItem(VFX_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setVfxEnabled(on: boolean): void {
  try {
    localStorage.setItem(VFX_KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked */
  }
}


import type { SoundboardSound, SoundboardState } from '@dnd-table/shared';
import { storedCredentials } from './store.js';

/**
 * Soundboard playback on this screen. One-shot clips come as `sfx` events from the server (see
 * server/src/soundboard.ts); looping clips follow `state.soundboard.looping`. Each listener has
 * their own soundboard volume (this browser only); each clip may have its own level on top.
 */

const VOLUME_KEY = 'dnd-table.soundboardVolume';

export function getBoardVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const n = raw == null ? 0.7 : Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
  } catch {
    return 0.7;
  }
}

const oneShots = new Set<HTMLAudioElement>();
const loops = new Map<string, { audio: HTMLAudioElement; sound: SoundboardSound }>();

const level = (s: SoundboardSound) => getBoardVolume() * (s.volume ?? 1);

export function setBoardVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    /* storage blocked */
  }
  for (const { audio, sound } of loops.values()) audio.volume = level(sound);
  for (const a of oneShots) a.volume = Math.min(1, Math.max(0, Number(a.dataset.clip ?? 1) * v));
}

export function playOneShot(sound: SoundboardSound): void {
  const audio = new Audio(sound.url);
  audio.dataset.clip = String(sound.volume ?? 1);
  audio.volume = level(sound);
  oneShots.add(audio);
  const done = () => oneShots.delete(audio);
  audio.addEventListener('ended', done);
  audio.addEventListener('error', done);
  // blocked before this page got any click: nothing to do (the join screen is a click, so rare)
  void audio.play().catch(done);
}

export function stopOneShots(): void {
  for (const a of oneShots) a.pause();
  oneShots.clear();
}

/** Start / stop / re-level the looping clips to match the room. */
export function syncLoops(sb: SoundboardState | undefined): void {
  const want = new Map((sb?.looping ?? []).map((id) => [id, sb?.sounds.find((s) => s.id === id)] as const));
  for (const [id, l] of loops) {
    const s = want.get(id);
    if (!s || s.url !== l.sound.url) {
      l.audio.pause();
      loops.delete(id);
    } else if (s.volume !== l.sound.volume) {
      l.sound = s;
      l.audio.volume = level(s);
    }
  }
  for (const [id, s] of want) {
    if (!s || loops.has(id)) continue;
    const audio = new Audio(s.url);
    audio.loop = true;
    audio.volume = level(s);
    loops.set(id, { audio, sound: s });
    void audio.play().catch(retryOnFirstClick);
  }
}

// A page that was reloaded / reopened mid-session may not play sound before its first click: start
// the background tracks that are meant to be playing on that click.
let retryArmed = false;
function retryOnFirstClick(): void {
  if (retryArmed) return;
  retryArmed = true;
  window.addEventListener(
    'pointerdown',
    () => {
      retryArmed = false;
      for (const { audio } of loops.values()) if (audio.paused) void audio.play().catch(() => {});
    },
    { once: true, capture: true },
  );
}

/** DM: upload one audio file to the board. */
export async function uploadSound(file: File): Promise<void> {
  const c = storedCredentials();
  const qs = new URLSearchParams({ name: file.name, type: file.type });
  const res = await fetch(`/soundboard/upload?${qs}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-participant-id': c.participantId ?? '',
      'x-participant-secret': c.secret ?? '',
    },
    body: file,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || (res.status === 413 ? 'File quá lớn (tối đa 25MB)' : `Tải lên lỗi (${res.status})`));
  }
}

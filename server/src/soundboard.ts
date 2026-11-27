import type { ClientAction, Participant, RoomState, SoundboardSound, SoundboardState } from '@dnd-table/shared';

/**
 * The table's soundboard, like Discord's but without its tiny limits: the DM uploads clips (any
 * number, up to MAX_BYTES each), anyone allowed presses one and the whole table hears it. One-shot
 * clips go out as a `sfx` event (nothing saved); looping clips (background tracks) are kept in
 * `state.soundboard.looping` so a late joiner hears them too. The audio files live in the server's
 * data folder (git-ignored), never in the repo.
 */

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SOUNDS = 500;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024 * 1024;

export type SoundboardAction = Extract<ClientAction, { t: 'sbPlay' | 'sbStop' | 'sbUpdate' | 'sbRemove' | 'sbMove' | 'sbSettings' }>;
const SB_ACTIONS = new Set<string>(['sbPlay', 'sbStop', 'sbUpdate', 'sbRemove', 'sbMove', 'sbSettings']);
export const isSoundboardAction = (a: ClientAction): a is SoundboardAction => SB_ACTIONS.has(a.t);

/** File extension by declared type, then by file name — only real audio containers. */
const EXT_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};
const EXTS = new Set(Object.values(EXT_BY_TYPE));

export function audioExt(type: string, fileName: string): string | null {
  const byType = EXT_BY_TYPE[type.toLowerCase()];
  if (byType) return byType;
  const m = /\.([a-z0-9]{2,5})$/i.exec(fileName);
  const e = m?.[1].toLowerCase() === 'opus' ? 'ogg' : m?.[1].toLowerCase();
  return e && EXTS.has(e) ? e : null;
}

/** Does the file start like an audio file of that kind? (So an upload can't be a page or a script.) */
export function looksLikeAudio(buf: Buffer, ext: string): boolean {
  if (buf.length < 12) return false;
  const ascii = (from: number, len: number) => buf.toString('latin1', from, from + len);
  switch (ext) {
    case 'mp3':
      return ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'aac':
      return ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0);
    case 'ogg':
      return ascii(0, 4) === 'OggS';
    case 'wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
    case 'flac':
      return ascii(0, 4) === 'fLaC' || ascii(0, 3) === 'ID3';
    case 'webm':
      return buf.readUInt32BE(0) === 0x1a45dfa3;
    case 'm4a':
      return ascii(4, 4) === 'ftyp';
    default:
      return false;
  }
}

/** "01 - Tavern Night (loop).mp3" → "Tavern Night (loop)". */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const clean = base.replace(/[_]+/g, ' ').replace(/^\d+\s*[-.]\s*/, '').replace(/\s+/g, ' ').trim();
  return (clean || 'Âm thanh').slice(0, 40);
}

export function soundboardOf(state: RoomState): SoundboardState {
  return (state.soundboard ??= { sounds: [] });
}

export function addSound(state: RoomState, sound: SoundboardSound): void {
  soundboardOf(state).sounds.push(sound);
}

export interface SoundboardResult {
  error?: string;
  /** Something in `state.soundboard` changed: broadcast + save. */
  changed?: boolean;
  /** Tell everyone to play this one-shot clip now. */
  play?: SoundboardSound;
  /** Tell everyone to stop their one-shot clips. */
  stopAll?: boolean;
  /** The file of a removed clip (to delete from disk). */
  removedUrl?: string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Last press per person, per board (a stuck key / spam click can't machine-gun the table). */
const lastPlays = new WeakMap<SoundboardState, Map<string, number>>();

export function applySoundboard(state: RoomState, actor: Participant, a: SoundboardAction, now = Date.now()): SoundboardResult {
  const sb = soundboardOf(state);
  const isDm = actor.role === 'dm';
  const find = (id: string) => sb.sounds.find((s) => s.id === id);

  switch (a.t) {
    case 'sbPlay': {
      if (!isDm && !sb.playersCanPlay) return { error: 'DM chưa cho người chơi bấm soundboard' };
      const s = find(a.id);
      if (!s) return { error: 'Âm thanh này không còn nữa' };
      let lastPlay = lastPlays.get(sb);
      if (!lastPlay) lastPlays.set(sb, (lastPlay = new Map()));
      const gap = isDm ? 150 : 800;
      if (now - (lastPlay.get(actor.id) ?? 0) < gap) return {};
      lastPlay.set(actor.id, now);
      if (s.loop) {
        const on = sb.looping ?? [];
        sb.looping = on.includes(s.id) ? on.filter((x) => x !== s.id) : [...on, s.id];
        return { changed: true };
      }
      return { play: s };
    }
    case 'sbStop': {
      if (!isDm && !sb.playersCanPlay) return { error: 'DM chưa cho người chơi bấm soundboard' };
      if (a.id) {
        if (!sb.looping?.includes(a.id)) return {};
        sb.looping = sb.looping.filter((x) => x !== a.id);
        return { changed: true };
      }
      const had = !!sb.looping?.length;
      sb.looping = [];
      return { changed: had, stopAll: true };
    }
    case 'sbUpdate': {
      if (!isDm) return { error: 'Chỉ DM sửa được soundboard' };
      const s = find(a.id);
      if (!s) return { error: 'Âm thanh này không còn nữa' };
      const p = a.patch;
      if (typeof p.name === 'string') s.name = p.name.trim().slice(0, 40) || s.name;
      if (typeof p.emoji === 'string') s.emoji = [...p.emoji.trim()].slice(0, 4).join('') || undefined;
      if (typeof p.volume === 'number' && Number.isFinite(p.volume)) s.volume = clamp01(p.volume) === 1 ? undefined : clamp01(p.volume);
      if (typeof p.loop === 'boolean') {
        s.loop = p.loop || undefined;
        if (!p.loop && sb.looping?.includes(s.id)) sb.looping = sb.looping.filter((x) => x !== s.id);
      }
      return { changed: true };
    }
    case 'sbRemove': {
      if (!isDm) return { error: 'Chỉ DM xóa được âm thanh' };
      const s = find(a.id);
      if (!s) return {};
      sb.sounds = sb.sounds.filter((x) => x.id !== a.id);
      if (sb.looping?.includes(a.id)) sb.looping = sb.looping.filter((x) => x !== a.id);
      return { changed: true, removedUrl: s.url };
    }
    case 'sbMove': {
      if (!isDm) return { error: 'Chỉ DM sắp xếp được soundboard' };
      const from = sb.sounds.findIndex((s) => s.id === a.id);
      if (from < 0) return {};
      const to = Math.max(0, Math.min(sb.sounds.length - 1, Math.floor(a.to)));
      const [s] = sb.sounds.splice(from, 1);
      sb.sounds.splice(to, 0, s);
      return { changed: true };
    }
    case 'sbSettings': {
      if (!isDm) return { error: 'Chỉ DM đổi được cài đặt soundboard' };
      sb.playersCanPlay = a.playersCanPlay || undefined;
      return { changed: true };
    }
  }
}

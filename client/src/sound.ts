import manifest from './data/soundManifest.json';
import type { RollLogEntry } from '@dnd-table/shared';

type Pool = 'combat' | 'magic' | 'monster' | 'ui' | 'ambience';
const pools = manifest as Record<Pool, string[]>;

const PHYSICAL_TYPES = new Set(['bludgeoning', 'piercing', 'slashing', 'đập', 'xuyên', 'chém']);

const VOLUME_KEY = 'dnd-table.sfxVolume'; // '0'..'1', or 'off'

export function getSfxVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw === 'off') return 0;
  const n = raw ? Number(raw) : 0.5;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

export function setSfxVolume(v: number): void {
  localStorage.setItem(VOLUME_KEY, v <= 0 ? 'off' : String(v));
}

function pick(pool: Pool): string | undefined {
  const list = pools[pool];
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

function play(url: string | undefined) {
  const vol = getSfxVolume();
  if (!url || vol <= 0) return;
  const audio = new Audio(url);
  audio.volume = vol;
  // Autoplay can be blocked before the user has interacted with the page at all — harmless no-op.
  void audio.play().catch(() => {});
}

/** Play the swing/impact sound(s) implied by one new roll-log entry, if any. */
export function playForRollLogEntry(entry: RollLogEntry): void {
  if (entry.attack) {
    play(pick('combat'));
  }
  if (entry.damage) {
    const types = (entry.damage.damageType ?? '').toLowerCase().split(/\s*\+\s*/);
    const isMagic = types.length > 0 && types.every((t) => t && !PHYSICAL_TYPES.has(t));
    play(pick(isMagic ? 'magic' : 'combat'));
  }
}

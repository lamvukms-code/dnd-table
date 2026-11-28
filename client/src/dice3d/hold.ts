/**
 * How long the native 3D dice still need to land — the map's sound / visual effects wait for it, so
 * the sword hits after the d20 shows its number. Kept apart from the 3D code so the effects layer can
 * read it without loading three.js.
 */
let busyUntil = 0;

export function holdFor(seconds: number): void {
  busyUntil = Math.max(busyUntil, performance.now() + seconds * 1000);
}

/** Seconds until the dice in flight come to rest (0 when none). */
export function diceHold(): number {
  return Math.max(0, (busyUntil - performance.now()) / 1000);
}

const KEY = 'dnd-table.dice3d';
/** Native 3D dice on/off for this browser (default on; dddice, when the table uses it, takes over). */
export function nativeDiceEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setNativeDiceEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked */
  }
}

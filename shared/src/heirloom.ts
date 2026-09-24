import type { HeirloomDef, HeirloomFeature } from './types.js';

/** Features whose `minLevel` the given character level has reached — safe to show in full. */
export function unlockedHeirloomFeatures(def: HeirloomDef, level: number): HeirloomFeature[] {
  return def.features.filter((f) => f.minLevel <= level);
}

/** How many features are still locked at this level — for a "🔒 N more" count with no spoilers. */
export function lockedHeirloomFeatureCount(def: HeirloomDef, level: number): number {
  return def.features.filter((f) => f.minLevel > level).length;
}

/** The lowest `minLevel` among this heirloom's still-locked features, i.e. when the next one
 *  unlocks — or undefined once everything is unlocked. */
export function nextHeirloomUnlockLevel(def: HeirloomDef, level: number): number | undefined {
  const locked = def.features.filter((f) => f.minLevel > level).map((f) => f.minLevel);
  return locked.length ? Math.min(...locked) : undefined;
}

/**
 * Setting moons (e.g. a campaign's "Eldritch Moons") live in a git-ignored local file built from
 * purchased content: client/src/data/moons.local.json. The repo ships none — without the file the
 * moon tracker simply doesn't show.
 */
export interface MoonEffect {
  text: string;
  sub?: string[];
  /** DM-only line (campaign secrets). */
  dm?: boolean;
}
export interface MoonDef {
  key: string;
  name: string;
  pages?: string;
  /** d100 range on the random-moon table. */
  d100?: [number, number];
  short?: string;
  tagline?: string;
  /** Accent colour (chip border, map tint). */
  tint?: string;
  image?: string;
  effects: MoonEffect[];
}

const mods = import.meta.glob('./data/moons.local.json', { eager: true });
export const MOONS: MoonDef[] = Object.values(mods).flatMap((m) => {
  const a = (m as { default?: unknown }).default;
  return Array.isArray(a) ? (a as MoonDef[]) : [];
});

export const moonByKey = (key: string | undefined | null): MoonDef | undefined =>
  key ? MOONS.find((m) => m.key === key) : undefined;

/** Roll d100 on the moon table (falls back to a uniform pick when no ranges are given). */
export function rollMoon(): { roll: number; moon: MoonDef } | null {
  if (!MOONS.length) return null;
  const roll = 1 + Math.floor(Math.random() * 100);
  const hit = MOONS.find((m) => m.d100 && roll >= m.d100[0] && roll <= m.d100[1]);
  return { roll, moon: hit ?? MOONS[Math.floor(Math.random() * MOONS.length)] };
}

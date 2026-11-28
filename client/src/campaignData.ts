import type { BackgroundDef, BestiaryGroupDef, CustomClassDef, HeirloomDef, Statblock } from '@dnd-table/shared';
import { DEFAULT_BESTIARY_GROUPS, registerCustomClass } from '@dnd-table/shared';

/**
 * Campaign reference data — all OPTIONAL, all git-ignored `client/src/data/*.local.json`.
 *
 * The repo ships no campaign content (a published setting isn't SRD and doesn't belong in a
 * public repo). Every feature below keeps working for whatever campaign you run: drop the
 * matching file in `client/src/data/` and rebuild/restart Vite. A missing file just means an
 * empty list (and the related topbar button hides itself). Same pattern as `speciesData.ts` /
 * `subclassData.ts`. Shapes: see `client/src/data/README.md`.
 *
 * `import.meta.glob` needs a literal pattern per call, hence one glob per file.
 */
function arrayFrom<T>(mods: Record<string, unknown>): T[] {
  return Object.values(mods).flatMap((m) => {
    const v = (m as { default?: unknown }).default;
    return Array.isArray(v) ? (v as T[]) : [];
  });
}
function objectFrom<T>(mods: Record<string, unknown>): Record<string, T> {
  const v = (Object.values(mods)[0] as { default?: unknown } | undefined)?.default;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {};
}

/** Bestiary grouping/order (book names, which open first); falls back to generic defaults. */
const bestiaryGroupsLocal = arrayFrom<BestiaryGroupDef>(
  import.meta.glob('./data/bestiaryGroups.local.json', { eager: true }),
);
export const BESTIARY_GROUPS: BestiaryGroupDef[] = bestiaryGroupsLocal.length
  ? bestiaryGroupsLocal
  : DEFAULT_BESTIARY_GROUPS;

/** Character backgrounds for the sheet picker. */
export const BACKGROUND_DEFS: BackgroundDef[] = arrayFrom(
  import.meta.glob('./data/backgrounds.local.json', { eager: true }),
);

/** DM-only NPC roster (statblocks; `tags` starting with "ch" group them by chapter). */
export const NPC_CATALOG: Statblock[] = arrayFrom(import.meta.glob('./data/npcs.local.json', { eager: true }));

/** Optional pretty names for NPC chapter tags, e.g. { "ch3-the-keep": "Ch.3 The Keep" }. */
export const NPC_CHAPTER_LABELS: Record<string, string> = objectFrom(
  import.meta.glob('./data/npcChapters.local.json', { eager: true }),
);

/** Level-gated heirloom/legacy items (unlock logic lives in shared `heirloom` helpers). */
export const HEIRLOOMS: HeirloomDef[] = arrayFrom(import.meta.glob('./data/heirlooms.local.json', { eager: true }));

export interface ZoneLibraryEntry {
  code: string;
  name: string;
  /** Boxed read-aloud text. */
  readAloud?: string;
  /** DM-only mechanics/notes. */
  dmNotes?: string;
  chapter?: string;
  source?: string;
}
/** Room/area texts the zone tool can search to auto-fill a drawn zone. */
export const ZONE_LIBRARY: ZoneLibraryEntry[] = arrayFrom(
  import.meta.glob('./data/zones.local.json', { eager: true }),
);

export interface ZoneLayoutRoom {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ZoneLayout {
  chapter: string;
  rooms: ZoneLayoutRoom[];
}
/** Per-map room rectangles, keyed by the map image's file id (see BattleMap auto-zones). */
export const ZONE_LAYOUTS: Record<string, ZoneLayout> = objectFrom(
  import.meta.glob('./data/zoneLayouts.local.json', { eager: true }),
);

/** One pickable option of a custom class (a Focus Art, a Finisher, a Fighting Style…). */
export interface ClassOptionDef {
  id: string;
  name: string;
  /** What using it costs on your turn. */
  action?: 'action' | 'bonus' | 'reaction' | 'special';
  description: string;
}
export interface ClassOptions {
  focusArts?: ClassOptionDef[];
  finishers?: ClassOptionDef[];
  fightingStyles?: ClassOptionDef[];
}
interface ClassesFile {
  classes?: CustomClassDef[];
  /** Per-class option lists, keyed by class key (e.g. "jaeger"). */
  options?: Record<string, ClassOptions>;
}
const classesFile: ClassesFile =
  ((Object.values(import.meta.glob('./data/classes.local.json', { eager: true }))[0] as { default?: unknown } | undefined)
    ?.default as ClassesFile | undefined) ?? {};

/**
 * Classes that aren't in the repo (third-party classes the DM owns), from `classes.local.json`.
 * Registered on load so hit die / saves / skills / multiclass profs / feature list work like a
 * built-in class. Class-specific mechanics (e.g. Jaeger's Focus/Momentum) are separate code.
 */
export const CUSTOM_CLASSES: CustomClassDef[] = Array.isArray(classesFile.classes) ? classesFile.classes : [];
for (const c of CUSTOM_CLASSES) registerCustomClass(c);
export const CUSTOM_CLASS_NAMES: string[] = CUSTOM_CLASSES.map((c) => c.name);
/** Custom classes players may pick (the DM's `enemyOnly` ones are left out). */
export const PLAYER_CUSTOM_CLASS_NAMES: string[] = CUSTOM_CLASSES.filter((c) => !c.enemyOnly).map((c) => c.name);
/** Lowercase keys of the classes reserved for NPCs / enemies. */
export const ENEMY_ONLY_CLASS_KEYS = new Set(CUSTOM_CLASSES.filter((c) => c.enemyOnly).map((c) => c.key.toLowerCase()));
export const CLASS_OPTIONS: Record<string, ClassOptions> = classesFile.options ?? {};

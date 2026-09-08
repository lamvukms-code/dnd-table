import type { SubclassFeatureDef } from '@dnd-table/shared';

/**
 * Subclass feature definitions.
 *
 * The repo ships NONE — subclass content from a published setting you own (e.g.
 * The Crooked Moon) is not SRD and does not belong in a public repo. To use your
 * own: drop a file at `client/src/data/subclasses.local.json` (git-ignored) with
 * an array of SubclassFeatureDef. See `subclasses.example.json` for the format.
 */
const mods = import.meta.glob('./data/subclasses.local.json', { eager: true });

export const SUBCLASS_DEFS: SubclassFeatureDef[] = Object.values(mods).flatMap((m) => {
  const arr = (m as { default?: unknown }).default;
  return Array.isArray(arr) ? (arr as SubclassFeatureDef[]) : [];
});

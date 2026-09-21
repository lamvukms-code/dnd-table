import type { SpeciesDef } from '@dnd-table/shared';

/**
 * Species definitions.
 *
 * The repo ships NONE — species from a published setting you own (e.g. The Crooked Moon) are
 * not SRD and do not belong in a public repo. Drop a file at
 * `client/src/data/species.local.json` (git-ignored) with an array of SpeciesDef; see
 * `species.example.json` for the shape.
 */
const mods = import.meta.glob('./data/species.local.json', { eager: true });

export const SPECIES_DEFS: SpeciesDef[] = Object.values(mods).flatMap((m) => {
  const arr = (m as { default?: unknown }).default;
  return Array.isArray(arr) ? (arr as SpeciesDef[]) : [];
});

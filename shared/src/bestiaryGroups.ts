import { crToNumber } from './rules.js';
import type { Statblock } from './types.js';

/**
 * How the DM's monster lists (the Bestiary panel and the drag-to-map palette) are grouped and
 * ordered. Groups are checked in order; a stat block lands in the first group whose `tags` it has
 * or whose `source` starts with one of `sources`. Anything unmatched goes to a final "other" group.
 * Within a group: by CR, then name.
 *
 * The repo ships only generic defaults. A table that runs third-party books lists its own groups
 * (book names, display order) in the git-ignored `client/src/data/bestiaryGroups.local.json`.
 */
export interface BestiaryGroupDef {
  key: string;
  label: string;
  tags?: string[];
  /** Lowercase prefixes of `Statblock.source`. */
  sources?: string[];
  /** Expanded by default in the drag-to-map palette. */
  open?: boolean;
}

export const DEFAULT_BESTIARY_GROUPS: BestiaryGroupDef[] = [
  { key: 'campaign', label: 'Chiến dịch', tags: ['campaign'], sources: ['campaign'], open: true },
  { key: 'npc', label: 'NPC', tags: ['npc'] },
  { key: 'srd', label: 'SRD 5.2.1', tags: ['srd'], sources: ['system reference document'] },
];

export const OTHER_BESTIARY_GROUP: BestiaryGroupDef = { key: 'other', label: 'Khác / tự tạo' };

type Entry = Pick<Statblock, 'name' | 'cr' | 'tags'> & Partial<Pick<Statblock, 'meta' | 'source'>>;

export function bestiaryGroupOf(sb: Entry, groups: BestiaryGroupDef[] = DEFAULT_BESTIARY_GROUPS): BestiaryGroupDef {
  const tags = (sb.tags ?? []).map((t) => t.toLowerCase());
  const src = (sb.source ?? '').toLowerCase();
  return (
    groups.find(
      (g) =>
        (g.tags ?? []).some((t) => tags.includes(t.toLowerCase())) ||
        (g.sources ?? []).some((s) => s && src.startsWith(s.toLowerCase())),
    ) ?? OTHER_BESTIARY_GROUP
  );
}

/** Lowercase, no Vietnamese diacritics (đ → d), so "linh" finds "Lính". */
export function foldSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Every word of the query must appear in the name, type line, CR, tags, source or group name. */
export function bestiaryMatches(
  sb: Entry,
  query: string,
  groups: BestiaryGroupDef[] = DEFAULT_BESTIARY_GROUPS,
): boolean {
  const words = foldSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldSearch(
    [sb.name, sb.meta ?? '', `cr ${sb.cr}`, ...(sb.tags ?? []), sb.source ?? '', bestiaryGroupOf(sb, groups).label].join(' '),
  );
  return words.every((w) => hay.includes(w));
}

/** Filters by `query`, then buckets into `groups` order (+ "other" last); empty groups are left out. */
export function groupBestiary<T extends Entry>(
  list: T[],
  query = '',
  groups: BestiaryGroupDef[] = DEFAULT_BESTIARY_GROUPS,
): { key: string; label: string; items: T[] }[] {
  const by = new Map<string, T[]>();
  for (const sb of list) {
    if (!bestiaryMatches(sb, query, groups)) continue;
    const k = bestiaryGroupOf(sb, groups).key;
    by.set(k, [...(by.get(k) ?? []), sb]);
  }
  return [...groups, OTHER_BESTIARY_GROUP].flatMap((g) => {
    const items = by.get(g.key);
    if (!items) return [];
    by.delete(g.key); // a key listed twice keeps only its first slot
    items.sort(
      (a, b) => crToNumber(a.cr || '0') - crToNumber(b.cr || '0') || a.name.localeCompare(b.name),
    );
    return [{ key: g.key, label: g.label, items }];
  });
}

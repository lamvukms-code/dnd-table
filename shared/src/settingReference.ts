/**
 * Setting reference for the "Tra cứu" panel: the DM's own notes on a setting they own (built by
 * scripts/build-reference.mjs into a git-ignored file, served by the server). Cards are Markdown;
 * anything marked 🔒 is DM-only and is removed from the players' copy.
 */
export interface ReferenceCard {
  title: string;
  /** Markdown: paragraphs, `- ` bullets (one nested level), tables, **bold**, *italic*. */
  body: string;
}
export interface ReferenceGroup {
  title: string;
  cards: ReferenceCard[];
}
export interface ReferenceSection {
  title: string;
  groups: ReferenceGroup[];
}
export interface SettingReference {
  title: string;
  generatedAt?: string;
  sections: ReferenceSection[];
}

const LOCK = '🔒';
const indentOf = (line: string) => line.length - line.trimStart().length;
/** "- 🔒 …", "🔒 …", "| 🔒 … |" */
const isLocked = (line: string) => {
  const t = line.trimStart().replace(/^[-*]\s+/, '').replace(/^\|\s*/, '');
  return t.startsWith(LOCK);
};

/** 🔒 inside a line: in a table the cell becomes "—", elsewhere the rest of the line goes. */
function cutLocked(line: string): string {
  if (line.trimStart().startsWith('|')) {
    return line
      .split('|')
      .map((cell) => (cell.trimStart().startsWith(LOCK) ? ' — ' : cell.includes(LOCK) ? cell.slice(0, cell.indexOf(LOCK)).trimEnd() + ' ' : cell))
      .join('|');
  }
  return line.slice(0, line.indexOf(LOCK)).trimEnd();
}

/** A card body without its DM-only lines (a locked bullet takes the bullets nested under it along). */
export function stripDmLines(body: string): string {
  const out: string[] = [];
  let skipDeeperThan: number | null = null;
  for (const line of body.split('\n')) {
    if (skipDeeperThan != null) {
      if (line.trim() && indentOf(line) > skipDeeperThan) continue;
      skipDeeperThan = null;
    }
    if (isLocked(line)) {
      skipDeeperThan = indentOf(line);
      continue;
    }
    out.push(line.includes(LOCK) ? cutLocked(line) : line);
  }
  return out.join('\n').trim();
}

/** The players' copy: locked cards dropped, locked lines removed, empty groups/sections dropped. */
export function referenceForPlayers(ref: SettingReference): SettingReference {
  return {
    ...ref,
    sections: ref.sections
      .map((s) => ({
        ...s,
        groups: s.groups
          .map((g) => ({
            ...g,
            cards: g.cards.filter((c) => !c.title.startsWith(LOCK)).map((c) => ({ ...c, body: stripDmLines(c.body) })),
          }))
          .filter((g) => g.cards.length && !g.title.startsWith(LOCK)),
      }))
      .filter((s) => s.groups.length),
  };
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomState } from '@dnd-table/shared';

/**
 * The table's proper names (characters, places, NPCs…) for the speech-to-text of a recording:
 * Whisper is steered toward them (hotwords), and the transcript starts with them as a table so
 * whoever edits the video can fix a name the machine misheard.
 *
 * Two sources, merged:
 *  - the DM's own list, a plain text file (git-ignored, campaign content stays local):
 *        # Địa danh
 *        Con Quạ Đen — quán rượu ở cảng
 *        # NPC
 *        Ông Bảy
 *    "# heading" starts a group; one name per line, "— note" optional; blank lines ignored.
 *  - what the room already knows: the players' characters, the maps (scenes), the NPC / monster
 *    tokens on them, the shops.
 * A snapshot is written into each recording's folder (`ten-rieng.json`) when it stops.
 */

export interface NameEntry {
  name: string;
  note?: string;
}
export interface NameGroup {
  title: string;
  items: NameEntry[];
}

export const GLOSSARY_TEMPLATE = `# Bảng tên riêng cho phần chép lời buổi quay (một tên mỗi dòng, "— ghi chú" tùy thích).
# Dòng bắt đầu bằng "# " là tên nhóm. Nhân vật, bản đồ, token trên map được lấy tự động từ phòng chơi.
# Địa danh
# NPC
# Phe phái / vật phẩm
`;

export function parseGlossary(text: string): NameGroup[] {
  const groups: NameGroup[] = [];
  let cur: NameGroup | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const title = line.replace(/^#+\s*/, '');
      // a comment line (long, ends a sentence) is not a group title
      if (!title || title.length > 40 || /[.:]$/.test(title)) continue;
      cur = { title, items: [] };
      groups.push(cur);
      continue;
    }
    const [name, ...rest] = line.split(/\s+[—–-]\s+/);
    const note = rest.join(' — ').trim();
    if (!cur) groups.push((cur = { title: 'Tên riêng', items: [] }));
    cur.items.push(note ? { name: name.trim(), note } : { name: name.trim() });
  }
  return groups.filter((g) => g.items.length);
}

/** "Goblin 3", "Bandit #2", "Sói (2)" → the name without the copy number. */
const baseLabel = (s: string) => s.replace(/\s*(?:#\s*\d+|\(\d+\)|\d+)$/, '').trim();

export function roomNames(state: Pick<RoomState, 'participants' | 'sheets' | 'scenes' | 'tokens' | 'shops'>): NameGroup[] {
  const byId = new Map(state.participants.map((p) => [p.id, p]));
  const pcs: NameEntry[] = [];
  const pcTokens = new Set<string>();
  for (const sh of state.sheets) {
    const owner = byId.get(sh.ownerId);
    if (!owner || owner.role !== 'player' || !sh.name?.trim()) continue;
    if (sh.tokenId) pcTokens.add(sh.tokenId);
    const what = [sh.species, sh.className].filter(Boolean).join(' ');
    const who = owner.anon ? '' : `người chơi: ${owner.name}`;
    const note = [what, who].filter(Boolean).join(', ');
    pcs.push(note ? { name: sh.name.trim(), note } : { name: sh.name.trim() });
  }
  const places = state.scenes.map((s) => s.name?.trim()).filter((n): n is string => !!n);
  const tokens = [...state.tokens, ...state.scenes.flatMap((s) => s.tokens ?? [])];
  const npcs = tokens
    .filter((t) => !pcTokens.has(t.id) && !t.controllerId)
    .map((t) => baseLabel(t.label ?? ''))
    .filter((n) => n.length > 1);
  const shops = (state.shops ?? []).map((s) => s.name?.trim()).filter((n): n is string => !!n);
  const list = (title: string, names: string[]): NameGroup => ({ title, items: names.map((name) => ({ name })) });
  return [
    { title: 'Nhân vật người chơi', items: pcs },
    list('Bản đồ / địa điểm', places),
    list('NPC / quái trên bản đồ', npcs),
    list('Cửa hàng', shops),
  ];
}

/** DM list first (their spelling wins), then the room's; one entry per name, empty groups dropped. */
export function mergeNames(...sources: NameGroup[][]): NameGroup[] {
  const seen = new Set<string>();
  const out: NameGroup[] = [];
  for (const g of sources.flat()) {
    const items = g.items.filter((e) => {
      const k = e.name.normalize('NFC').toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!items.length) continue;
    const same = out.find((o) => o.title.toLowerCase() === g.title.toLowerCase());
    if (same) same.items.push(...items);
    else out.push({ title: g.title, items });
  }
  return out;
}

export function readGlossary(file: string): NameGroup[] {
  try {
    if (!existsSync(file)) {
      writeFileSync(file, GLOSSARY_TEMPLATE);
      return [];
    }
    return parseGlossary(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

/** Snapshot the names into a recording folder (read by tools/transcribe.py). */
export function writeSessionNames(folder: string, glossaryFile: string, state: Parameters<typeof roomNames>[0]): void {
  const groups = mergeNames(readGlossary(glossaryFile), roomNames(state));
  writeFileSync(join(folder, 'ten-rieng.json'), JSON.stringify({ groups }, null, 1));
}

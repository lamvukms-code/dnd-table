/**
 * Madness (a setting's sanity system — mechanics only; the effect tables live in the DM's local data,
 * `client/public/campaign/madness.json`, read by the server). Three tiers: short-term (1d4 minutes),
 * long-term (1d4 × 7 days), indefinite (until cured). A failed save stuns the creature until the start
 * of its next turn, then a d100 picks the theme and a d10 the effect (1–2 / 3–7 / 8–10).
 */
export type MadnessTier = 'short' | 'long' | 'indefinite';

export interface MadnessRow {
  lo: number;
  hi: number;
  theme: string;
  /** [d10 1–2, d10 3–7, d10 8–10] */
  effects: [string, string, string];
}
export type MadnessTables = Record<MadnessTier, MadnessRow[]>;

export interface MadnessEntry {
  id: string;
  tier: MadnessTier;
  theme: string;
  text: string;
  /** "d100 37 · d10 8" */
  roll: string;
  /** World time (seconds) it started / runs out (unset = until cured). */
  startedAt: number;
  expiresAt?: number;
}

export const MADNESS_TIER_VI: Record<MadnessTier, string> = { short: 'ngắn hạn', long: 'dài hạn', indefinite: 'vĩnh viễn' };

const MIN = 60;
const DAY = 86400;

/** Pick the effect for a d100 + d10 roll on a tier's table. */
export function madnessEffect(rows: MadnessRow[], d100: number, d10: number): { theme: string; text: string } | null {
  const row = rows.find((r) => d100 >= r.lo && d100 <= r.hi);
  if (!row) return null;
  const i = d10 <= 2 ? 0 : d10 <= 7 ? 1 : 2;
  return { theme: row.theme, text: row.effects[i] };
}

/** Duration in seconds for a tier given a d4 (indefinite = undefined). */
export function madnessDuration(tier: MadnessTier, d4: number): number | undefined {
  if (tier === 'short') return d4 * MIN;
  if (tier === 'long') return d4 * 7 * DAY;
  return undefined;
}

/** Split entries into still-active and expired at world time `now`. */
export function expireMadness(entries: MadnessEntry[] | undefined, now: number): { kept: MadnessEntry[]; expired: MadnessEntry[] } {
  const kept: MadnessEntry[] = [];
  const expired: MadnessEntry[] = [];
  for (const e of entries ?? []) (e.expiresAt !== undefined && e.expiresAt <= now ? expired : kept).push(e);
  return { kept, expired };
}

/**
 * The book's rule of thumb: 5 short-term in under 48 hours → a long-term; 3 long-term in under 30 days →
 * an indefinite. Counts entries (active or not) started inside the window. Returns the tier to escalate to.
 */
export function madnessEscalation(history: MadnessEntry[] | undefined, now: number): MadnessTier | null {
  const n = (tier: MadnessTier, window: number) => (history ?? []).filter((e) => e.tier === tier && now - e.startedAt < window).length;
  if (n('long', 30 * DAY) >= 3) return 'indefinite';
  if (n('short', 2 * DAY) >= 5) return 'long';
  return null;
}

/** "3 phút", "2 giờ 10 phút", "5 ngày" — a short human duration. */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '0';
  if (seconds < MIN) return `${seconds} giây`;
  if (seconds < 3600) return `${Math.ceil(seconds / MIN)} phút`;
  if (seconds < DAY) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / MIN);
    return m ? `${h} giờ ${m} phút` : `${h} giờ`;
  }
  const d = Math.floor(seconds / DAY);
  const h = Math.round((seconds % DAY) / 3600);
  return h ? `${d} ngày ${h} giờ` : `${d} ngày`;
}

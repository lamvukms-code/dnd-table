// Dice notation parser + roller for D&D 5e (2024).
// Convention: "xdy" = x dice with y faces. Supports "1d20", "2d6+8", "4d6kh3",
// "2d20kl1", "1d8+1d6+2", "d%". Whitespace-insensitive, case-insensitive.

export interface DieRoll {
  sides: number;
  value: number;
  kept: boolean;
}

export interface ParsedTerm {
  raw: string;
  sign: 1 | -1;
  kind: 'dice' | 'flat';
  count?: number; // x in xdy
  sides?: number; // y in xdy
  keep?: { mode: 'kh' | 'kl'; n: number };
  flat?: number;
}

export interface TermResult {
  raw: string;
  kind: 'dice' | 'flat';
  count?: number;
  sides?: number;
  keep?: { mode: 'kh' | 'kl'; n: number };
  rolls?: DieRoll[];
  subtotal: number;
  sign: 1 | -1;
}

export interface RollResult {
  notation: string;
  terms: TermResult[];
  total: number;
  // Convenience for a single-d20 check.
  d20?: { natural: number; isCrit: boolean; isFumble: boolean };
}

export type Rng = () => number; // returns [0, 1)

const defaultRng: Rng = Math.random;

function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

const TERM_RE = /^([+-]?)(\d*)d(\d+|%)(kh|kl)?(\d+)?$/i;
const FLAT_RE = /^([+-]?)(\d+)$/;

/**
 * Clean up whatever a player typed into a canonical form the parser accepts:
 * trims, drops all whitespace, lowercases, and fills in an implied leading "1"
 * ("d20" -> "1d20", "1d8+d4" -> "1d8+1d4").
 */
export function normalizeNotation(input: string): string {
  const clean = String(input ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[×✕✖]/g, '') // stray multiplication glyphs
    .replace(/–|—/g, '-'); // en/em dash -> minus
  return clean.replace(/(^|[+-])d(\d)/g, (_m, lead: string, d: string) => `${lead}1d${d}`);
}

/** Split "2d6+3-1d4" into ["2d6", "+3", "-1d4"] keeping leading signs. */
function tokenize(notation: string): string[] {
  const clean = normalizeNotation(notation);
  if (!clean) throw new Error('Công thức xúc xắc trống');
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if ((ch === '+' || ch === '-') && current.length > 0) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Parse a dice formula into structured terms WITHOUT rolling. Throws with a
 * human-readable (Vietnamese) message on anything it cannot understand.
 */
export function parseTerms(notation: string): ParsedTerm[] {
  return tokenize(notation).map((token) => {
    const dice = token.match(TERM_RE);
    if (dice) {
      const sign: 1 | -1 = dice[1] === '-' ? -1 : 1;
      const count = dice[2] === '' ? 1 : parseInt(dice[2], 10);
      const sides = dice[3] === '%' ? 100 : parseInt(dice[3], 10);
      if (count < 1 || count > 100) throw new Error(`Số lượng xúc xắc không hợp lệ ở "${token}"`);
      if (sides < 2 || sides > 1000) throw new Error(`Số mặt xúc xắc không hợp lệ ở "${token}"`);
      const keepMode = dice[4]?.toLowerCase() as 'kh' | 'kl' | undefined;
      const keepN = dice[5] ? parseInt(dice[5], 10) : undefined;
      return {
        raw: token,
        sign,
        kind: 'dice',
        count,
        sides,
        keep: keepMode ? { mode: keepMode, n: Math.min(keepN ?? count, count) } : undefined,
      };
    }
    const flat = token.match(FLAT_RE);
    if (flat) {
      return { raw: token, sign: flat[1] === '-' ? -1 : 1, kind: 'flat', flat: parseInt(flat[2], 10) };
    }
    throw new Error(`Không hiểu phần "${token}" (dùng dạng xdy, ví dụ 2d6+8)`);
  });
}

export interface NotationInfo {
  valid: boolean;
  canonical: string;
  min?: number;
  max?: number;
  average?: number;
  error?: string;
}

function expectedExtreme(n: number, m: number, mode: 'kh' | 'kl'): number {
  let e = 0;
  for (let k = 1; k <= m; k++) {
    if (mode === 'kh') {
      e += k * (Math.pow(k / m, n) - Math.pow((k - 1) / m, n));
    } else {
      e += k * (Math.pow((m - k + 1) / m, n) - Math.pow((m - k) / m, n));
    }
  }
  return e;
}

/** Min / max / average of a formula without rolling. Throws like parseTerms. */
export function rollStats(notation: string): { min: number; max: number; average: number } {
  let min = 0;
  let max = 0;
  let average = 0;
  for (const t of parseTerms(notation)) {
    if (t.kind === 'flat') {
      const v = t.sign * t.flat!;
      min += v;
      max += v;
      average += v;
      continue;
    }
    const n = t.count!;
    const m = t.sides!;
    const kept = t.keep ? t.keep.n : n;
    min += t.sign * kept * 1;
    max += t.sign * kept * m;
    if (t.keep && t.keep.n === 1) {
      average += t.sign * expectedExtreme(n, m, t.keep.mode);
    } else {
      average += t.sign * kept * ((m + 1) / 2);
    }
  }
  return { min, max, average: Math.round(average * 100) / 100 };
}

/** Validate + summarise a formula for showing feedback while a player types. */
export function describeNotation(input: string): NotationInfo {
  const canonical = normalizeNotation(input);
  if (!canonical) return { valid: false, canonical, error: 'trống' };
  try {
    return { valid: true, canonical, ...rollStats(canonical) };
  } catch (err) {
    return { valid: false, canonical, error: (err as Error).message };
  }
}

export function rollNotation(notation: string, rng: Rng = defaultRng): RollResult {
  const parsed = parseTerms(notation);
  const terms: TermResult[] = [];

  for (const term of parsed) {
    if (term.kind === 'flat') {
      terms.push({ raw: term.raw, kind: 'flat', subtotal: term.flat!, sign: term.sign });
      continue;
    }

    const count = term.count!;
    const sides = term.sides!;
    const values = Array.from({ length: count }, () => rollDie(sides, rng));
    const rolls: DieRoll[] = values.map((v) => ({ sides, value: v, kept: true }));

    if (term.keep) {
      const n = term.keep.n;
      const order = rolls
        .map((r, idx) => ({ idx, value: r.value }))
        .sort((a, b) => (term.keep!.mode === 'kh' ? b.value - a.value : a.value - b.value));
      order.forEach((o, rank) => {
        rolls[o.idx].kept = rank < n;
      });
    }

    const subtotal = rolls.reduce((sum, r) => (r.kept ? sum + r.value : sum), 0);
    terms.push({
      raw: term.raw,
      kind: 'dice',
      count,
      sides,
      keep: term.keep,
      rolls,
      subtotal,
      sign: term.sign,
    });
  }

  const total = terms.reduce((sum, t) => sum + t.sign * t.subtotal, 0);

  const result: RollResult = { notation, terms, total };

  // Detect a lone d20 (possibly with kh/kl for adv/dis) for crit/fumble.
  const d20Terms = terms.filter((t) => t.kind === 'dice' && t.sides === 20);
  if (d20Terms.length === 1 && d20Terms[0].rolls) {
    const keptRoll = d20Terms[0].rolls.find((r) => r.kept);
    if (keptRoll) {
      result.d20 = {
        natural: keptRoll.value,
        isCrit: keptRoll.value === 20,
        isFumble: keptRoll.value === 1,
      };
    }
  }

  return result;
}

/** Build a d20 check notation with advantage/disadvantage. */
export function d20Check(
  modifier: number,
  mode: 'normal' | 'advantage' | 'disadvantage' = 'normal',
): string {
  const mod = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`;
  if (mode === 'advantage') return `2d20kh1${mod}`;
  if (mode === 'disadvantage') return `2d20kl1${mod}`;
  return `1d20${mod}`;
}

export interface AttackResolution {
  attackRoll: RollResult;
  targetAc: number;
  hit: boolean;
  crit: boolean;
  fumble: boolean;
}

/**
 * Build a RollResult from values rolled outside the engine (e.g. dddice), so it
 * can live in the shared roll log alongside server-rolled results.
 */
export function externalRollResult(
  notation: string,
  ext: { total: number; faces: number[]; d20Natural?: number },
): RollResult {
  const rolls: DieRoll[] = ext.faces.map((value) => ({ sides: 0, value, kept: true }));
  const result: RollResult = {
    notation,
    terms: [
      {
        raw: notation,
        kind: 'dice',
        rolls,
        subtotal: ext.total,
        sign: 1,
      },
    ],
    total: ext.total,
  };
  if (typeof ext.d20Natural === 'number') {
    result.d20 = {
      natural: ext.d20Natural,
      isCrit: ext.d20Natural === 20,
      isFumble: ext.d20Natural === 1,
    };
  }
  return result;
}

/** Double the dice counts in a notation (5e RAW crit): "1d8+3" -> "2d8+3". */
export function doubleDiceCounts(notation: string): string {
  return notation.replace(/(\d*)d(\d+|%)/gi, (_m, count: string, sides: string) => {
    const c = count === '' ? 1 : parseInt(count, 10);
    return `${c * 2}d${sides}`;
  });
}

/**
 * Homebrew crit damage: the character's original dice are auto-maxed and they
 * roll ONE extra die per damage source (dice term). Flat modifiers pass through.
 * e.g. "1d4+2d6+4" -> "1d4+1d6+20"  (4 + 12 maxed dice, + the +4 modifier).
 */
export function homebrewCritDamage(notation: string): string {
  let terms: ParsedTerm[];
  try {
    terms = parseTerms(notation);
  } catch {
    return notation;
  }
  const extras: string[] = [];
  let constant = 0;
  for (const t of terms) {
    if (t.kind === 'flat') {
      constant += t.sign * t.flat!;
    } else {
      const n = t.count!;
      const m = t.sides!;
      constant += t.sign * n * m; // original dice auto-max
      extras.push(`${t.sign < 0 ? '-' : '+'}1d${m}`); // + one extra die of this source
    }
  }
  let out = extras.join('').replace(/^\+/, '');
  if (constant > 0) out += `+${constant}`;
  else if (constant < 0) out += `${constant}`;
  return out || '0';
}

/** Resolve an attack roll against a target AC per 5e rules. */
export function resolveAttack(
  attackRoll: RollResult,
  targetAc: number,
): AttackResolution {
  const crit = attackRoll.d20?.isCrit ?? false;
  const fumble = attackRoll.d20?.isFumble ?? false;
  const hit = crit ? true : fumble ? false : attackRoll.total >= targetAc;
  return { attackRoll, targetAc, hit, crit, fumble };
}

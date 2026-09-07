// Dice notation parser + roller for D&D 5e (2024).
// Supports: "1d20", "2d6+3", "4d6kh3", "2d20kl1", "1d8+1d6+2", "d%".
// Whitespace-insensitive, case-insensitive.

export interface DieRoll {
  sides: number;
  value: number;
  kept: boolean;
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

/** Split "2d6+3-1d4" into ["2d6", "+3", "-1d4"] keeping leading signs. */
function tokenize(notation: string): string[] {
  const clean = notation.replace(/\s+/g, '');
  if (!clean) throw new Error('Empty dice notation');
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

export function rollNotation(notation: string, rng: Rng = defaultRng): RollResult {
  const tokens = tokenize(notation);
  const terms: TermResult[] = [];

  for (const token of tokens) {
    const diceMatch = token.match(TERM_RE);
    if (diceMatch) {
      const sign: 1 | -1 = diceMatch[1] === '-' ? -1 : 1;
      const count = diceMatch[2] === '' ? 1 : parseInt(diceMatch[2], 10);
      const sides = diceMatch[3] === '%' ? 100 : parseInt(diceMatch[3], 10);
      if (count < 1 || count > 100) throw new Error(`Invalid dice count in "${token}"`);
      if (sides < 2 || sides > 1000) throw new Error(`Invalid die size in "${token}"`);

      const keepMode = diceMatch[4]?.toLowerCase() as 'kh' | 'kl' | undefined;
      const keepN = diceMatch[5] ? parseInt(diceMatch[5], 10) : undefined;

      const values = Array.from({ length: count }, () => rollDie(sides, rng));
      const rolls: DieRoll[] = values.map((v) => ({ sides, value: v, kept: true }));

      if (keepMode) {
        const n = Math.min(keepN ?? count, count);
        const order = rolls
          .map((r, idx) => ({ idx, value: r.value }))
          .sort((a, b) => (keepMode === 'kh' ? b.value - a.value : a.value - b.value));
        order.forEach((o, rank) => {
          rolls[o.idx].kept = rank < n;
        });
      }

      const subtotal = rolls.reduce((sum, r) => (r.kept ? sum + r.value : sum), 0);
      terms.push({
        raw: token,
        kind: 'dice',
        count,
        sides,
        keep: keepMode ? { mode: keepMode, n: Math.min(keepN ?? count, count) } : undefined,
        rolls,
        subtotal,
        sign,
      });
      continue;
    }

    const flatMatch = token.match(FLAT_RE);
    if (flatMatch) {
      const sign: 1 | -1 = flatMatch[1] === '-' ? -1 : 1;
      const subtotal = parseInt(flatMatch[2], 10);
      terms.push({ raw: token, kind: 'flat', subtotal, sign });
      continue;
    }

    throw new Error(`Cannot parse dice term "${token}"`);
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

/** Double the dice counts in a notation (5e crit): "1d8+3" -> "2d8+3". */
export function doubleDiceCounts(notation: string): string {
  return notation.replace(/(\d*)d(\d+|%)/gi, (_m, count: string, sides: string) => {
    const c = count === '' ? 1 : parseInt(count, 10);
    return `${c * 2}d${sides}`;
  });
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

import type { Token } from './types.js';
import { tokenConditions } from './rules.js';

/** Cells a token covers per side. */
export const tokenSpan = (t: Pick<Token, 'size'>): number =>
  ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 })[t.size] ?? 1;

/** Feet between the nearest squares of two footprints (adjacent = 5, overlapping = 0). */
export function edgeFeet(
  a: { x: number; y: number },
  sa: number,
  b: { x: number; y: number },
  sb: number,
): number {
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);
  const dx = Math.max(0, ax - (bx + sb - 1), bx - (ax + sa - 1));
  const dy = Math.max(0, ay - (by + sb - 1), by - (ay + sa - 1));
  return Math.max(dx, dy) * 5;
}

const INCAPACITATING = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];

/** Melee reach of a token in feet: 10 when a melee attack on its stat block says "reach 10 ft". */
export function meleeReach(t: Token, reachWeapon = false): number {
  if (reachWeapon) return 10;
  const long = t.statblock?.actions.some((a) => /reach\s*1[05]\s*f/i.test(a.description ?? '') && !/reach\s*5\s*f/i.test(a.description ?? ''));
  return long ? 10 : 5;
}

/**
 * Creatures that may make an Opportunity Attack when `mover` goes from `from` to `to`: hostile
 * (other side), alive, not incapacitated, reaction unspent, the mover was within its reach before
 * and is out of it after. Teleports / forced moves are not passed in by the caller.
 */
export function opportunityReactors(
  mover: Token,
  from: { x: number; y: number },
  to: { x: number; y: number },
  tokens: Token[],
  isPlayerSide: (t: Token) => boolean,
  reachOf: (t: Token) => number = (t) => meleeReach(t),
): Token[] {
  const moverSide = isPlayerSide(mover);
  const ms = tokenSpan(mover);
  return tokens.filter((r) => {
    if (r.id === mover.id || r.godsBaneBlade || r.hidden) return false;
    if (isPlayerSide(r) === moverSide) return false;
    if (typeof r.currentHp === 'number' && r.currentHp <= 0) return false;
    if (r.turnUsed?.reaction) return false;
    if (tokenConditions(r).some((c) => INCAPACITATING.includes(c))) return false;
    const reach = reachOf(r);
    const rs = tokenSpan(r);
    return edgeFeet(from, ms, r, rs) <= reach && edgeFeet(to, ms, r, rs) > reach;
  });
}

/**
 * Death saving throws (5e 2024). Pure rules; the server applies them:
 *  - dropping to 0 HP: Unconscious, start rolling (massive damage — leftover ≥ max HP — kills outright);
 *  - start of each of your turns at 0 HP (not stable, not dead): d20, 10+ success, 1 = two failures,
 *    20 = regain 1 HP; three successes → stable, three failures → dead;
 *  - damage while at 0 HP: one failure (a critical hit: two); damage ≥ max HP kills;
 *  - any healing ends it.
 */
export interface DeathSaves {
  success: number;
  fail: number;
  /** Three successes (or stabilised by an ally): no more rolls, still Unconscious at 0 HP. */
  stable?: boolean;
  dead?: boolean;
}

export const DOWNED_EFFECT_NAME = 'Gục (0 HP)';

export const freshDeathSaves = (): DeathSaves => ({ success: 0, fail: 0 });

/** Dropping from >0 HP to 0: `overflow` is the damage left over after HP hit 0. */
export function onDrop(overflow: number, maxHp: number): DeathSaves {
  return overflow >= maxHp && maxHp > 0 ? { success: 0, fail: 3, dead: true } : freshDeathSaves();
}

/** Damage taken while already at 0 HP. */
export function onDamageWhileDown(ds: DeathSaves | undefined, amount: number, maxHp: number, crit: boolean): DeathSaves {
  const cur = ds ?? freshDeathSaves();
  if (cur.dead || amount <= 0) return cur;
  if (maxHp > 0 && amount >= maxHp) return { ...cur, fail: 3, dead: true, stable: false };
  const fail = Math.min(3, cur.fail + (crit ? 2 : 1));
  return { success: cur.success, fail, stable: false, dead: fail >= 3 || undefined };
}

export type DeathSaveOutcome = 'success' | 'fail' | 'double-fail' | 'revive';

/** One death saving throw with a natural d20 (`bonus` from effects like Bless / Aid is added). */
export function rollDeathSave(
  ds: DeathSaves | undefined,
  d20: number,
  bonus = 0,
): { ds: DeathSaves; outcome: DeathSaveOutcome; total: number } {
  const cur = ds ?? freshDeathSaves();
  const total = d20 + bonus;
  if (d20 === 20) return { ds: freshDeathSaves(), outcome: 'revive', total };
  if (d20 === 1) {
    const fail = Math.min(3, cur.fail + 2);
    return { ds: { ...cur, fail, dead: fail >= 3 || undefined }, outcome: 'double-fail', total };
  }
  if (total >= 10) {
    const success = Math.min(3, cur.success + 1);
    return { ds: { ...cur, success, stable: success >= 3 || undefined }, outcome: 'success', total };
  }
  const fail = Math.min(3, cur.fail + 1);
  return { ds: { ...cur, fail, dead: fail >= 3 || undefined }, outcome: 'fail', total };
}

/** Whether a character at 0 HP still rolls at the start of their turn. */
export const rollsDeathSaves = (hp: number, ds: DeathSaves | undefined): boolean => hp <= 0 && !ds?.stable && !ds?.dead;

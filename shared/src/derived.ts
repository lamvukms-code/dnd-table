import type { ActiveEffect, CharacterSheet } from './types.js';
import { abilityMod, computeArmorClass, sheetClasses, type AcResult } from './rules.js';
import { classDefaults } from './classDefaults.js';

/**
 * Derived combat numbers that used to be typed in by hand: effective AC (armor / unarmored
 * defense / spell effects), walking speed, hit dice, and temp-HP absorption.
 */

// ---------------------------------------------------------------------------
// Armor Class
// ---------------------------------------------------------------------------

/**
 * Effective AC: the sheet's computed AC (override > armor + shield > unarmored defense > 10 + DEX)
 * adjusted by active spell effects — `acBase` (Mage Armor: 13 + DEX when no armor is worn),
 * `acBonus` (Shield of Faith +2, Shield +5) and `acMin` (Barkskin: at least 17).
 */
export function effectiveArmorClass(sheet: CharacterSheet, effects: ActiveEffect[] | undefined): AcResult {
  const base = computeArmorClass(sheet);
  let ac = base.ac;
  const notes: string[] = [];
  const wearsArmor = sheet.inventory.some((it) => it.type === 'armor' && it.equipped);
  const dex = abilityMod(sheet.abilities.dex);
  for (const e of effects ?? []) {
    if (e.acBase != null && !wearsArmor && sheet.acOverride == null && e.acBase + dex > ac) {
      ac = e.acBase + dex;
      notes.push(e.name);
    }
  }
  for (const e of effects ?? []) {
    if (e.acBonus) {
      ac += e.acBonus;
      notes.push(`${e.name} ${e.acBonus > 0 ? '+' : ''}${e.acBonus}`);
    }
  }
  for (const e of effects ?? []) {
    if (e.acMin != null && ac < e.acMin) {
      ac = e.acMin;
      notes.push(e.name);
    }
  }
  return { ac, source: notes.length ? `${base.source} · ${notes.join(', ')}` : base.source };
}

/** AC of a token with no character sheet (NPC / monster): its printed AC + spell effects. */
export function npcArmorClass(baseAc: number, effects: ActiveEffect[] | undefined): number {
  let ac = baseAc;
  for (const e of effects ?? []) if (e.acBonus) ac += e.acBonus;
  for (const e of effects ?? []) if (e.acMin != null && ac < e.acMin) ac = e.acMin;
  return ac;
}

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------

/** Monk Unarmored Movement bonus (ft) by Monk level (2024). */
function monkSpeedBonus(level: number): number {
  if (level >= 18) return 30;
  if (level >= 14) return 25;
  if (level >= 10) return 20;
  if (level >= 6) return 15;
  if (level >= 2) return 10;
  return 0;
}

/** Walking speed: the sheet's base speed (species) + class movement features. */
export function computeSpeed(sheet: CharacterSheet): { speed: number; notes: string[] } {
  let speed = sheet.speed;
  const notes: string[] = [];
  const armor = sheet.inventory.find((it) => it.type === 'armor' && it.equipped);
  const heavy = armor?.armorCategory === 'heavy';
  const shield = sheet.inventory.some((it) => it.type === 'shield' && it.equipped);
  for (const c of sheetClasses(sheet)) {
    const name = (c.name ?? '').trim().toLowerCase();
    if (name === 'barbarian' && c.level >= 5 && !heavy) {
      speed += 10;
      notes.push('Fast Movement +10');
    }
    if (name === 'monk' && !armor && !shield) {
      const b = monkSpeedBonus(c.level);
      if (b) {
        speed += b;
        notes.push(`Unarmored Movement +${b}`);
      }
    }
  }
  return { speed, notes };
}

// ---------------------------------------------------------------------------
// Hit Dice
// ---------------------------------------------------------------------------

export interface HitDicePool {
  die: number; // 6, 8, 10, 12
  max: number;
  used: number;
  left: number;
}

const dieKey = (die: number) => `d${die}`;

/** Hit dice by size, from class levels (one die of the class's size per level). */
export function hitDicePools(sheet: CharacterSheet): HitDicePool[] {
  const max = new Map<number, number>();
  for (const c of sheetClasses(sheet)) {
    const def = classDefaults(c.name);
    if (!def || c.level <= 0) continue;
    max.set(def.hitDie, (max.get(def.hitDie) ?? 0) + c.level);
  }
  return [...max.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([die, m]) => {
      const used = Math.min(m, Math.max(0, sheet.hitDiceUsed?.[dieKey(die)] ?? 0));
      return { die, max: m, used, left: m - used };
    });
}

/** Mark one hit die of that size spent; null if none is left. */
export function spendHitDie(sheet: CharacterSheet, die: number): CharacterSheet | null {
  const pool = hitDicePools(sheet).find((p) => p.die === die);
  if (!pool || pool.left <= 0) return null;
  return { ...sheet, hitDiceUsed: { ...(sheet.hitDiceUsed ?? {}), [dieKey(die)]: pool.used + 1 } };
}

/** Long rest: regain spent hit dice up to half of the total (min 1), largest dice first. */
export function regainHitDice(sheet: CharacterSheet): CharacterSheet {
  const pools = hitDicePools(sheet);
  const total = pools.reduce((n, p) => n + p.max, 0);
  let budget = Math.max(1, Math.floor(total / 2));
  const used: Record<string, number> = { ...(sheet.hitDiceUsed ?? {}) };
  for (const p of pools) {
    const back = Math.min(budget, p.used);
    if (back > 0) used[dieKey(p.die)] = p.used - back;
    budget -= back;
  }
  return { ...sheet, hitDiceUsed: used };
}

// ---------------------------------------------------------------------------
// Temporary hit points
// ---------------------------------------------------------------------------

/** Damage goes to temp HP first, the rest to HP (which can't drop below 0). */
export function damageWithTempHp(
  hp: number,
  temp: number,
  damage: number,
): { hp: number; temp: number; absorbed: number; applied: number } {
  const dmg = Math.max(0, damage);
  const absorbed = Math.min(Math.max(0, temp), dmg);
  const rest = dmg - absorbed;
  const applied = Math.min(Math.max(0, hp), rest);
  return { hp: hp - applied, temp: temp - absorbed, absorbed, applied };
}

/** Temp HP don't stack: a new grant only replaces the old pool if it is larger. */
export function grantTempHp(current: number, amount: number): number {
  return Math.max(Math.max(0, current), Math.max(0, amount));
}

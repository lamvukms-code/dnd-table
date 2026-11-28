import type { CharacterSheet, InventoryItem } from './types.js';
import { abilityMod } from './rules.js';
import { passiveHas } from './featurePassives.js';

/**
 * Firearm rules (mechanics only — the setting's gun list lives in the DM's local equipment data).
 * A gun holds `barrel` shots; firing spends one, an empty or jammed gun can't fire until it is
 * reloaded / cleared. Fast reload = an attack, action or bonus action; slow = an attack or action;
 * artillery = an action (and fires once per load).
 */
export interface FirearmProps {
  barrel: number;
  reload: 'fast' | 'slow' | 'artillery';
  /** Shots left in the barrel (unset = fully loaded). */
  loaded?: number;
  jammed?: boolean;
  /** Fan Fire: an action that fires DEX-mod shots (min 2), −3 per extra shot, natural 1 jams. */
  fanFire?: boolean;
  /** Twinned Barrel: fire both barrels in one attack — empties the barrel, damage die one step up. */
  twinned?: boolean;
  /** Spread Fire: no attack roll — a cone this many feet long, DEX save vs the firearm DC. */
  spreadFire?: number;
  /** Steady: bonus action (before moving) — next shot +PB, no long-range disadvantage. */
  steady?: boolean;
  steadyArmed?: boolean;
  noise?: 'blaring' | 'booming';
  /** Concussive: piercing and bludgeoning — the target uses the weaker of its two defences. */
  concussive?: boolean;
}

export const firearmLoaded = (it: Pick<InventoryItem, 'firearm'>): number =>
  it.firearm ? Math.max(0, Math.min(it.firearm.barrel, it.firearm.loaded ?? it.firearm.barrel)) : 0;

/** Whether `shots` can be fired now; the reason when not. */
export function canFire(it: Pick<InventoryItem, 'firearm'>, shots = 1): { ok: true } | { ok: false; reason: string } {
  if (!it.firearm) return { ok: true };
  if (it.firearm.jammed) return { ok: false, reason: 'Súng đang kẹt: gỡ kẹt trước (action, Sleight of Hand DC 15).' };
  const left = firearmLoaded(it);
  if (left <= 0) return { ok: false, reason: 'Hết đạn trong nòng: phải nạp đạn.' };
  if (left < shots) return { ok: false, reason: `Còn ${left} viên, không đủ ${shots}.` };
  return { ok: true };
}

/** The item after firing `shots` (Steady is spent by the shot). */
export function afterShots<T extends Pick<InventoryItem, 'firearm'>>(it: T, shots = 1): T {
  if (!it.firearm) return it;
  return { ...it, firearm: { ...it.firearm, loaded: Math.max(0, firearmLoaded(it) - shots), steadyArmed: false } };
}

export function reloaded<T extends Pick<InventoryItem, 'firearm'>>(it: T): T {
  return it.firearm ? { ...it, firearm: { ...it.firearm, loaded: it.firearm.barrel } } : it;
}

/** Economy a reload costs: fast guns can use the bonus action, every gun can use the action; an
 *  artillery expert (`artilleryExpert`) reloads artillery as a bonus action too. */
export function reloadCosts(it: Pick<InventoryItem, 'firearm'>, sheet?: CharacterSheet): ('bonus' | 'action')[] {
  if (!it.firearm) return [];
  if (it.firearm.reload === 'artillery' && sheet && passiveHas(sheet, 'artilleryExpert')) return ['bonus', 'action'];
  return it.firearm.reload === 'fast' ? ['bonus', 'action'] : ['action'];
}

/** An artillery firearm in the hands of an artillery expert (proficient, half weight, ×2 vs objects). */
export function artilleryExpertWith(sheet: CharacterSheet, it: Pick<InventoryItem, 'firearm'>): boolean {
  return it.firearm?.reload === 'artillery' && passiveHas(sheet, 'artilleryExpert');
}

/** Firearm save DC = 8 + PB + DEX (STR for artillery). */
export function firearmSaveDc(sheet: CharacterSheet, it: Pick<InventoryItem, 'firearm'>): number {
  const ab = it.firearm?.reload === 'artillery' ? 'str' : 'dex';
  return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities[ab]);
}

/** Fan Fire shot count: DEX modifier, at least 2, at most what's in the barrel. */
export function fanFireShots(sheet: CharacterSheet, it: Pick<InventoryItem, 'firearm'>): number {
  return Math.max(0, Math.min(firearmLoaded(it), Math.max(2, abilityMod(sheet.abilities.dex))));
}

const DIE_STEPS = [4, 6, 8, 10, 12];
/** Twinned Barrel: one die size up (d4→d6→…→d12; d12 stays). "2d4" → "2d6". */
export function stepUpDie(dice: string): string {
  return dice.replace(/(\d*)d(\d+)/, (_, n, d) => {
    const i = DIE_STEPS.indexOf(Number(d));
    return `${n}d${i >= 0 ? DIE_STEPS[Math.min(DIE_STEPS.length - 1, i + 1)] : d}`;
  });
}

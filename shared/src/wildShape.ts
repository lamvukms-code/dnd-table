import type { CharacterSheet, SheetAction, Statblock, TokenSize } from './types.js';
import { abilityMod, druidLevel, sheetClasses } from './rules.js';

/**
 * Druid Wild Shape (SRD 5.2.1): a Bonus Action turns the Druid into a known Beast form. The beast's
 * STR / DEX / CON, AC, speed, size and actions replace the character's; HP, INT / WIS / CHA,
 * proficiencies and class features stay. Temp HP = Druid level on taking the form. It ends early
 * on 0 HP / Incapacitated, or by choice (no action).
 */

/** "1/4" → 0.25, "2" → 2. */
export function crValue(cr: string | number | undefined): number {
  if (typeof cr === 'number') return cr;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(cr ?? '');
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(cr);
  return Number.isFinite(n) ? n : 99;
}

export const isMoonDruid = (sheet: CharacterSheet): boolean =>
  sheetClasses(sheet).some((c) => /druid/i.test(c.name ?? '') && /moon/i.test(c.subclass ?? ''));

export interface WildShapeLimits {
  /** Highest beast CR allowed. */
  maxCr: number;
  /** Fly-speed forms allowed (level 8). */
  fly: boolean;
  /** How many forms the Druid knows. */
  known: number;
  tempHp: number;
}

export function wildShapeLimits(sheet: CharacterSheet): WildShapeLimits {
  const dl = druidLevel(sheet);
  let maxCr = dl >= 8 ? 1 : dl >= 4 ? 0.5 : dl >= 2 ? 0.25 : 0;
  // Circle of the Moon — Circle Forms: CR up to Druid level / 3, temp HP = 3 × Druid level
  const moon = isMoonDruid(sheet) && dl >= 3;
  if (moon) maxCr = Math.max(maxCr, Math.floor(dl / 3));
  return { maxCr, fly: dl >= 8, known: dl >= 8 ? 8 : dl >= 4 ? 6 : dl >= 2 ? 4 : 0, tempHp: moon ? 3 * dl : dl };
}

export const hasFlySpeed = (b: Pick<Statblock, 'speedNote'>): boolean => /\bfly\b|bay/i.test(b.speedNote ?? '');
export const isBeast = (b: Pick<Statblock, 'meta'>): boolean => /\bbeast\b/i.test(b.meta ?? '');

/** Why this beast can't be taken as a form right now, or null. */
export function beastFormProblem(sheet: CharacterSheet, b: Pick<Statblock, 'meta' | 'cr' | 'speedNote'>): string | null {
  const lim = wildShapeLimits(sheet);
  if (!lim.known) return 'Wild Shape từ Druid cấp 2';
  if (!isBeast(b)) return 'Không phải Beast';
  if (crValue(b.cr) > lim.maxCr) return `CR ${b.cr} vượt giới hạn (tối đa ${fmtCr(lim.maxCr)})`;
  if (!lim.fly && hasFlySpeed(b)) return 'Hình dạng bay cần Druid cấp 8';
  return null;
}

export function fmtCr(n: number): string {
  return n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n);
}

/** Beast form AC: the beast's, or 13 + WIS for a Moon Druid if that is higher. */
export function wildShapeAc(sheet: CharacterSheet, beastAc: number): number {
  return isMoonDruid(sheet) && druidLevel(sheet) >= 3 ? Math.max(beastAc, 13 + abilityMod(sheet.abilities.wis)) : beastAc;
}

/** Take the form: swap in the beast's numbers, remember the character's own. */
export function applyWildShape(sheet: CharacterSheet, beast: Statblock, tokenSize?: TokenSize): CharacterSheet {
  const base = sheet.wildShape ? endWildShape(sheet) : sheet;
  const lim = wildShapeLimits(base);
  const actions: SheetAction[] = beast.actions.map((a) => ({ ...a, id: `ws:${a.id}`, source: 'wildShape' }));
  return {
    ...base,
    wildShape: {
      beastId: beast.id,
      name: beast.name,
      cr: beast.cr,
      size: beast.size,
      traits: beast.traits.map((t) => ({ ...t })),
      speedNote: beast.speedNote,
      prev: {
        str: base.abilities.str,
        dex: base.abilities.dex,
        con: base.abilities.con,
        speed: base.speed,
        acOverride: base.acOverride ?? null,
        size: tokenSize,
      },
    },
    abilities: { ...base.abilities, str: beast.abilities.str, dex: beast.abilities.dex, con: beast.abilities.con },
    speed: beast.speed,
    acOverride: wildShapeAc(base, beast.ac),
    tempHp: Math.max(base.tempHp ?? 0, lim.tempHp),
    actions: [...base.actions.filter((a) => a.source !== 'wildShape'), ...actions],
  };
}

/** Leave the form: the character's own numbers come back. */
export function endWildShape(sheet: CharacterSheet): CharacterSheet {
  const ws = sheet.wildShape;
  if (!ws) return sheet;
  return {
    ...sheet,
    wildShape: null,
    abilities: { ...sheet.abilities, str: ws.prev.str, dex: ws.prev.dex, con: ws.prev.con },
    speed: ws.prev.speed,
    acOverride: ws.prev.acOverride,
    actions: sheet.actions.filter((a) => a.source !== 'wildShape'),
  };
}

/** Druid level 18 (Beast Spells): spells can be cast in beast form. */
export const canCastInWildShape = (sheet: CharacterSheet): boolean => !sheet.wildShape || druidLevel(sheet) >= 18;

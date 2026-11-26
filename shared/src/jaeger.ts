import type { Ability, CharacterSheet, DamagePart } from './types.js';
import { abilityMod, classLevelOf, sheetClasses } from './rules.js';

/**
 * Jaeger — a third-party martial class (Focus Points + Momentum dice + Finishers).
 *
 * Only the MECHANICS live here (numbers, DCs, what a resource does to a roll). The class's
 * feature text, Focus Art / Finisher descriptions and its chapters (subclasses) are the
 * publisher's prose and are NOT in this repo: they load from the DM's git-ignored
 * `client/src/data/classes.local.json` / `subclasses.local.json` (see campaignData.ts).
 *
 * Focus Points: 1 at level 1, +1 at 2, 5, 9, 13, 17 (+1 with the Focused Fighting style);
 * all return on a short or long rest. From level 2 every Focus Point spent grants a Momentum
 * die (d6, d8 at 11, d10 at 17); you hold at most PB of them. A Finisher expends ALL held
 * Momentum dice.
 *
 * Table house rules (balance): the Momentum cap is PB (not PB + mod), and Focus regained in
 * combat is capped at 1 per round from all sources together (entering initiative with no Focus
 * left still regains 1, outside the cap).
 */

export const JAEGER = 'jaeger';

/** Per-sheet Jaeger state (all optional; absent = fresh). */
export interface JaegerState {
  focusUsed?: number;
  /** Momentum dice currently held. */
  momentum?: number;
  /** A Finisher armed to add the held Momentum dice to the next weapon damage roll. */
  armedFinisher?: 'brutal' | 'chasing' | 'opportunistic' | null;
  fightingStyle?: string;
  /** Focus Art ids learned beyond the two every Jaeger knows. */
  focusArts?: string[];
  /** Finisher ids learned beyond Brutal Finisher. */
  finishers?: string[];
  /** Piercing Gaze used since the last long rest. */
  gazeUsed?: boolean;
  /** Initiative round in which Focus was last regained (house rule: at most 1 per round). */
  regainRound?: number;
}

/** Focus Arts every Jaeger knows from level 1. */
export const BASE_FOCUS_ARTS = ['weapon-parry', 'dodge-step'] as const;
/** The Finisher every Jaeger knows from level 2. */
export const BASE_FINISHER = 'brutal';

export const jaegerLevel = (sheet: CharacterSheet): number => classLevelOf(sheet, JAEGER);
const state = (sheet: CharacterSheet): JaegerState => sheet.jaeger ?? {};

export function jaegerFocusMax(sheet: CharacterSheet): number {
  const lvl = jaegerLevel(sheet);
  if (lvl <= 0) return 0;
  const base = lvl >= 17 ? 6 : lvl >= 13 ? 5 : lvl >= 9 ? 4 : lvl >= 5 ? 3 : lvl >= 2 ? 2 : 1;
  return base + (state(sheet).fightingStyle === 'focused' ? 1 : 0);
}

export function jaegerFocusLeft(sheet: CharacterSheet): number {
  return Math.max(0, jaegerFocusMax(sheet) - (state(sheet).focusUsed ?? 0));
}

/** Momentum die size, or null before level 2. */
export function jaegerMomentumDie(sheet: CharacterSheet): 'd6' | 'd8' | 'd10' | null {
  const lvl = jaegerLevel(sheet);
  if (lvl < 2) return null;
  return lvl >= 17 ? 'd10' : lvl >= 11 ? 'd8' : 'd6';
}

const bestPhysicalMod = (sheet: CharacterSheet) =>
  Math.max(abilityMod(sheet.abilities.str), abilityMod(sheet.abilities.dex));

/** Most Momentum dice the Jaeger can hold: PB (house rule; the book's PB + STR/DEX mod snowballs). */
export function jaegerMomentumMax(sheet: CharacterSheet): number {
  if (jaegerLevel(sheet) < 2) return 0;
  return Math.max(1, sheet.proficiencyBonus);
}

export function jaegerMomentum(sheet: CharacterSheet): number {
  return Math.min(state(sheet).momentum ?? 0, jaegerMomentumMax(sheet));
}

/** How many Focus Arts the Jaeger knows at its level (2 + one at 2/7/13/17, +1 Focused Fighting). */
export function jaegerFocusArtsKnown(sheet: CharacterSheet): number {
  const lvl = jaegerLevel(sheet);
  if (lvl <= 0) return 0;
  const extra = [2, 7, 13, 17].filter((l) => lvl >= l).length;
  return 2 + extra + (state(sheet).fightingStyle === 'focused' ? 1 : 0);
}

/** How many Finishers the Jaeger knows (Brutal at 2, +1 at 4/6/8/12). Chapter grants come on top. */
export function jaegerFinishersKnown(sheet: CharacterSheet): number {
  const lvl = jaegerLevel(sheet);
  if (lvl < 2) return 0;
  return 1 + [4, 6, 8, 12].filter((l) => lvl >= l).length;
}

/** The Jaeger's chapter (subclass) key, matched loosely from the sheet's subclass name. */
export function jaegerChapter(sheet: CharacterSheet): 'absolute' | 'heretic' | 'marauder' | 'salvation' | 'sanguine' | null {
  const entry = sheetClasses(sheet).find((c) => (c.name ?? '').toLowerCase().includes(JAEGER));
  const sub = (entry?.subclass ?? '').toLowerCase();
  for (const k of ['absolute', 'heretic', 'marauder', 'salvation', 'sanguine'] as const) if (sub.includes(k)) return k;
  return null;
}

/** Arts / Finishers a chapter teaches for free (not counted against the known limits). */
const CHAPTER_GRANTS: Record<string, { arts?: [number, string][]; finishers?: [number, string][] }> = {
  heretic: { arts: [[3, 'spell-flurry']] },
  marauder: { finishers: [[3, 'great-cleave']] },
  salvation: { arts: [[3, 'prayer-of-salvation']] },
  sanguine: { finishers: [[3, 'blood-drain']], arts: [[17, 'blood-craze']] },
};
function chapterGrants(sheet: CharacterSheet, kind: 'arts' | 'finishers'): string[] {
  const ch = jaegerChapter(sheet);
  const lvl = jaegerLevel(sheet);
  return ch ? (CHAPTER_GRANTS[ch]?.[kind] ?? []).filter(([l]) => lvl >= l).map(([, id]) => id) : [];
}

/** Known Focus Art ids (base two + chapter grants + chosen ones). */
export function jaegerKnownArts(sheet: CharacterSheet): string[] {
  const out = [...BASE_FOCUS_ARTS, ...chapterGrants(sheet, 'arts'), ...(state(sheet).focusArts ?? [])];
  return [...new Set<string>(out)];
}
/** Known Finisher ids (Brutal + chapter grants + chosen ones). Empty before level 2 (3 for grants). */
export function jaegerKnownFinishers(sheet: CharacterSheet): string[] {
  if (jaegerLevel(sheet) < 2) return [];
  return [...new Set([BASE_FINISHER, ...chapterGrants(sheet, 'finishers'), ...(state(sheet).finishers ?? [])])];
}

/** Sanguine chapter's Blood Magic save DC: 8 + PB + the higher of INT/CON mod. */
export function jaegerBloodMagicDc(sheet: CharacterSheet): number {
  return 8 + sheet.proficiencyBonus + Math.max(abilityMod(sheet.abilities.int), abilityMod(sheet.abilities.con));
}

/**
 * Spend Focus Points. Returns the new state, or null if there aren't enough. From level 2 each
 * point spent also grants Momentum dice (`momentumPerPoint`, normally 1; e.g. 2 while a feature
 * doubles it), capped at the maximum.
 */
export function spendJaegerFocus(sheet: CharacterSheet, points = 1, extraMomentum = 0, momentumPerPoint = 1): JaegerState | null {
  if (jaegerFocusLeft(sheet) < points) return null;
  const s = state(sheet);
  const gain = jaegerLevel(sheet) >= 2 ? points * momentumPerPoint + extraMomentum : 0;
  return {
    ...s,
    focusUsed: (s.focusUsed ?? 0) + points,
    momentum: Math.min(jaegerMomentumMax(sheet), jaegerMomentum(sheet) + gain),
  };
}

/**
 * Regain Focus Points (nat 20 vs a hostile creature, a Finisher's payoff…). Pass the current
 * initiative `round` in combat: it is recorded so a second regain that round is refused (see
 * `jaegerCanRegain`). Without a round (out of combat, or the initiative-with-none-left regain)
 * nothing is recorded.
 */
export function regainJaegerFocus(sheet: CharacterSheet, points = 1, round?: number): JaegerState {
  const s = state(sheet);
  return { ...s, focusUsed: Math.max(0, (s.focusUsed ?? 0) - points), ...(round != null ? { regainRound: round } : {}) };
}

/** House rule: in combat (`round` given) Focus comes back at most once per round. */
export function jaegerCanRegain(sheet: CharacterSheet, round?: number): boolean {
  if ((state(sheet).focusUsed ?? 0) <= 0) return false;
  return round == null || state(sheet).regainRound !== round;
}

/** Change held Momentum dice by `delta`, clamped to 0..max. */
export function adjustJaegerMomentum(sheet: CharacterSheet, delta: number): JaegerState {
  const s = state(sheet);
  return { ...s, momentum: Math.max(0, Math.min(jaegerMomentumMax(sheet), jaegerMomentum(sheet) + delta)) };
}

/** Expend all Momentum dice (any Finisher). */
export function expendJaegerMomentum(sheet: CharacterSheet): JaegerState {
  return { ...state(sheet), momentum: 0, armedFinisher: null };
}

/** "Nd6"-style notation for the held Momentum dice, or '' if none. */
export function jaegerMomentumDice(sheet: CharacterSheet, count = jaegerMomentum(sheet)): string {
  const die = jaegerMomentumDie(sheet);
  return die && count > 0 ? `${count}${die}` : '';
}

/** Finisher save DC: 8 + PB + STR or DEX mod (the higher one is always the player's best choice). */
export function jaegerFinisherDc(sheet: CharacterSheet): number {
  return 8 + sheet.proficiencyBonus + bestPhysicalMod(sheet);
}
/** Volley Finisher's DC uses DEX specifically. */
export function jaegerVolleyDc(sheet: CharacterSheet): number {
  return 8 + sheet.proficiencyBonus + abilityMod(sheet.abilities.dex);
}
/** Hemorrhaging Wound's end-of-turn CON save DC, which grows with the bleed dice still left. */
export function jaegerBleedDc(sheet: CharacterSheet, diceLeft: number): number {
  return jaegerFinisherDc(sheet) + Math.floor(Math.max(0, diceLeft) / 2);
}

/** Breaking Blow: save + condition by Momentum dice expended (you may pick a lower row). */
export const BREAKING_BLOW_ROWS: { dice: number; save: Ability; condition: string }[] = [
  { dice: 1, save: 'str', condition: 'prone' },
  { dice: 2, save: 'con', condition: 'blinded' },
  { dice: 3, save: 'str', condition: 'restrained' },
  { dice: 4, save: 'con', condition: 'stunned' },
  { dice: 5, save: 'con', condition: 'paralyzed' },
];
export function breakingBlowOptions(dice: number) {
  return BREAKING_BLOW_ROWS.filter((r) => r.dice <= Math.max(0, dice));
}

/** Vicious Finisher's crit range: 2 lower per die expended, best 10-20 at 5 dice. */
export function viciousCritMin(dice: number): number {
  return Math.max(10, 20 - 2 * Math.max(0, dice));
}
/** Vicious Finisher claw: attack bonus = PB + STR or DEX mod (player's choice → the higher). */
export function viciousFinisherAttackBonus(sheet: CharacterSheet): number {
  return sheet.proficiencyBonus + bestPhysicalMod(sheet);
}
/** Vicious Finisher damage: 1d12 + STR/DEX mod (same choice as the attack) + the expended dice, magical slashing. */
export function viciousFinisherDamage(sheet: CharacterSheet, dice = jaegerMomentum(sheet)): string {
  const mod = bestPhysicalMod(sheet);
  const m = jaegerMomentumDice(sheet, dice);
  return `1d12${mod >= 0 ? '+' : ''}${mod}${m ? `+${m}` : ''}`;
}

/** Piercing Gaze senses by level (always on from 18). */
export function piercingGazeSenses(sheet: CharacterSheet): string[] {
  const lvl = jaegerLevel(sheet);
  if (lvl < 3) return [];
  return ['darkvision 60 ft (+60 nếu đã có)', ...(lvl >= 7 ? ['see invisibility'] : []), ...(lvl >= 13 ? ['true seeing'] : [])];
}
export const piercingGazeAlwaysOn = (sheet: CharacterSheet) => jaegerLevel(sheet) >= 18;

/**
 * Damage the armed Finisher adds to a weapon attack (Brutal / Chasing / Opportunistic all add
 * the expended Momentum dice to the damage roll). The sheet expends the dice after the roll.
 */
export function jaegerDamageParts(sheet: CharacterSheet, primaryType: string): DamagePart[] {
  const s = state(sheet);
  if (!s.armedFinisher || jaegerLevel(sheet) < 2) return [];
  const dice = jaegerMomentumDice(sheet);
  if (!dice) return [];
  const label = s.armedFinisher === 'brutal' ? 'Brutal Finisher' : s.armedFinisher === 'chasing' ? 'Chasing Finisher' : 'Opportunistic Shot';
  return [{ dice, type: primaryType, label }];
}

/** Rest: Focus Points return on a short or long rest; a long rest also resets Piercing Gaze and Momentum. */
export function jaegerAfterRest(sheet: CharacterSheet, kind: 'short' | 'long'): JaegerState | undefined {
  if (!sheet.jaeger) return sheet.jaeger;
  return kind === 'short'
    ? { ...sheet.jaeger, focusUsed: 0 }
    : { ...sheet.jaeger, focusUsed: 0, momentum: 0, armedFinisher: null, gazeUsed: false };
}

/** Sanguine Chapter 17 — Blood Frenzy: active while bloodied (HP at or below half, above 0). */
export function jaegerBloodFrenzy(sheet: CharacterSheet): boolean {
  return (
    jaegerChapter(sheet) === 'sanguine' &&
    jaegerLevel(sheet) >= 17 &&
    sheet.currentHp > 0 &&
    sheet.currentHp * 2 <= sheet.maxHp
  );
}

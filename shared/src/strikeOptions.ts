import type { Ability, ActiveEffect, CharacterSheet } from './types.js';
import type { OnHitEffect } from './protocol.js';
import { abilityMod, barbarianLevel, rogueLevel, sneakAttackDice } from './rules.js';

/**
 * Rogue Cunning Strike / Devious Strikes and Barbarian Brutal Strike (SRD 5.2.1): options the
 * player picks before an attack, paid in Sneak Attack dice (Rogue) or by giving up Reckless
 * Attack's advantage (Barbarian). Each option becomes an on-hit effect the server applies.
 */

export interface StrikeOption {
  key: string;
  name: string;
  /** Rogue: Sneak Attack d6s it costs. */
  cost: number;
  minLevel: number;
  vi: string;
}

export const CUNNING_STRIKES: StrikeOption[] = [
  { key: 'poison', name: 'Poison', cost: 1, minLevel: 5, vi: 'CON save hoặc Poisoned 1 phút (save lại cuối mỗi lượt)' },
  { key: 'trip', name: 'Trip', cost: 1, minLevel: 5, vi: 'Mục tiêu Large trở xuống: DEX save hoặc Prone' },
  { key: 'withdraw', name: 'Withdraw', cost: 1, minLevel: 5, vi: 'Ngay sau đòn: đi tối đa nửa tốc độ không bị đòn cơ hội' },
  { key: 'daze', name: 'Daze', cost: 2, minLevel: 14, vi: 'CON save hoặc lượt kế chỉ được 1 trong: di chuyển, action, bonus action' },
  { key: 'knockout', name: 'Knock Out', cost: 6, minLevel: 14, vi: 'CON save hoặc Unconscious 1 phút (save lại cuối mỗi lượt; tỉnh khi nhận sát thương)' },
  { key: 'obscure', name: 'Obscure', cost: 3, minLevel: 14, vi: 'DEX save hoặc Blinded đến hết lượt kế của nó' },
];

export const BRUTAL_STRIKES: StrikeOption[] = [
  { key: 'forceful', name: 'Forceful Blow', cost: 0, minLevel: 9, vi: 'Đẩy mục tiêu 15 ft ra xa' },
  { key: 'hamstring', name: 'Hamstring Blow', cost: 0, minLevel: 9, vi: 'Tốc độ mục tiêu −15 ft đến đầu lượt kế của bạn' },
  { key: 'staggering', name: 'Staggering Blow', cost: 0, minLevel: 13, vi: 'Bất lợi ở lần save kế; không đòn cơ hội đến đầu lượt kế của bạn' },
  { key: 'sundering', name: 'Sundering Blow', cost: 0, minLevel: 13, vi: 'Đòn kế của sinh vật khác vào mục tiêu +5 trúng (đến đầu lượt kế của bạn)' },
];

/** How many Cunning Strike options per Sneak Attack: 1 at level 5, 2 at 11. */
export const cunningStrikeLimit = (sheet: CharacterSheet): number => {
  const l = rogueLevel(sheet);
  return l >= 11 ? 2 : l >= 5 ? 1 : 0;
};
/** Brutal Strike options per strike: 1 at level 9, 2 at 17. */
export const brutalStrikeLimit = (sheet: CharacterSheet): number => {
  const l = barbarianLevel(sheet);
  return l >= 17 ? 2 : l >= 9 ? 1 : 0;
};
/** Brutal Strike extra damage: 1d10, 2d10 at level 17. */
export const brutalStrikeDice = (sheet: CharacterSheet): string => (barbarianLevel(sheet) >= 17 ? '2d10' : '1d10');

/** Cunning Strike save DC: 8 + DEX + Proficiency Bonus. */
export const cunningStrikeDc = (sheet: CharacterSheet): number => 8 + abilityMod(sheet.abilities.dex) + sheet.proficiencyBonus;

export const cunningCost = (keys: string[]): number => keys.reduce((n, k) => n + (CUNNING_STRIKES.find((o) => o.key === k)?.cost ?? 0), 0);

/** Why this pick of options can't go on the next attack, or null. */
export function strikePickProblem(sheet: CharacterSheet, kind: 'cunning' | 'brutal', keys: string[]): string | null {
  const limit = kind === 'cunning' ? cunningStrikeLimit(sheet) : brutalStrikeLimit(sheet);
  if (keys.length > limit) return `Tối đa ${limit} lựa chọn mỗi đòn`;
  if (kind === 'cunning' && cunningCost(keys) > sneakAttackDice(sheet)) return `Không đủ xúc xắc Sneak Attack (${sneakAttackDice(sheet)}d6)`;
  return null;
}

interface Ctx {
  round: number;
  attackerTokenId?: string;
  sheetId?: string;
}

const fx = (ctx: Ctx, e: Omit<ActiveEffect, 'id'>): ActiveEffect => ({ id: '', sourceSheetId: ctx.sheetId, ...e });
const save = (ability: Ability, dc: number) => ({ ability, dc });

/** On-hit effects for the chosen Cunning Strike options. */
export function cunningOnHit(sheet: CharacterSheet, keys: string[], ctx: Ctx): OnHitEffect[] {
  const dc = cunningStrikeDc(sheet);
  const r = ctx.round;
  const out: OnHitEffect[] = [];
  for (const k of keys) {
    if (k === 'poison')
      out.push({ label: 'Cunning Strike · Poison', save: save('con', dc), effect: fx(ctx, { name: 'Poisoned (Cunning Strike)', condition: 'poisoned', expiresRound: r + 10, save: { ability: 'con', dc, repeat: 'end-of-turn' } }) });
    else if (k === 'trip') out.push({ label: 'Cunning Strike · Trip', save: save('dex', dc), effect: fx(ctx, { name: 'Prone (Cunning Strike)', condition: 'prone' }) });
    else if (k === 'withdraw') out.push({ label: 'Cunning Strike · Withdraw', note: 'đi tối đa nửa tốc độ không bị đòn cơ hội' });
    else if (k === 'daze')
      out.push({ label: 'Devious Strike · Daze', save: save('con', dc), effect: fx(ctx, { name: 'Dazed', note: 'Lượt kế chỉ được 1 trong: di chuyển, action, bonus action', expiresRound: r + 1 }) });
    else if (k === 'knockout')
      out.push({
        label: 'Devious Strike · Knock Out',
        save: save('con', dc),
        effect: fx(ctx, { name: 'Unconscious (Knock Out)', condition: 'unconscious', expiresRound: r + 10, note: 'Tỉnh khi nhận sát thương', save: { ability: 'con', dc, repeat: 'end-of-turn' } }),
      });
    else if (k === 'obscure') out.push({ label: 'Devious Strike · Obscure', save: save('dex', dc), effect: fx(ctx, { name: 'Blinded (Obscure)', condition: 'blinded', expiresRound: r + 1 }) });
  }
  return out;
}

/** On-hit effects for the chosen Brutal Strike options. */
export function brutalOnHit(keys: string[], ctx: Ctx): OnHitEffect[] {
  const until = ctx.attackerTokenId ? { sourceTokenId: ctx.attackerTokenId, untilSourceTurnStart: true } : { expiresRound: ctx.round + 1 };
  const out: OnHitEffect[] = [];
  for (const k of keys) {
    if (k === 'forceful') out.push({ label: 'Brutal Strike · Forceful Blow', pushFeet: 15 });
    else if (k === 'hamstring') out.push({ label: 'Brutal Strike · Hamstring Blow', effect: fx(ctx, { name: 'Hamstring Blow', speedPenalty: 15, ...until }) });
    else if (k === 'staggering')
      out.push({ label: 'Brutal Strike · Staggering Blow', effect: fx(ctx, { name: 'Staggering Blow', rollDisadvantage: ['save'], note: 'Bất lợi ở lần save kế; không đòn cơ hội', ...until }) });
    else if (k === 'sundering')
      out.push({ label: 'Brutal Strike · Sundering Blow', effect: fx(ctx, { name: 'Sundering Blow', note: 'Đòn kế của sinh vật khác vào nó +5 trúng', ...until }) });
  }
  return out;
}

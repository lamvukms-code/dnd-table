/**
 * God's Bane — a homebrew, table-specific party artifact. Pure rules helpers; the server (`room.ts`)
 * calls them from the attack / damage / save paths, and every one is a no-op unless the DM switched
 * the feature on for this room (`RoomState.godsBane.enabled`).
 *
 * - N ("People's Will") is a DM-edited party number.
 * - Sworn, non-rejected PCs add N force damage (once per turn, straight to HP, ignoring defences) when
 *   they attack a tagged creature — on a hit, or even on a miss against a `greatOne`.
 * - The same PCs take N less damage per instance from tagged creatures, and add N to saves against
 *   mind-altering conditions.
 * - Attacks made with the God's Bane weapon itself strip a divinity layer off a `greatOne` (hit or miss)
 *   and, on a hit, make it mortal until the DM resets it.
 * - Rejection: −N to God's Bane attack rolls and no benefits; the 4th rejection is permanent (oathbroken).
 * - Cleaving Causality: a shared pool; one point turns a sworn PC's own next d20 into a natural 20 or the
 *   next enemy d20 into a natural 1.
 */
import type { RollResult } from './dice.js';
import type { BaneTag, ConditionType, DamagePart, GodsBaneMember, GodsBaneState, Initiative } from './types.js';

export const MAX_BANE_REJECTIONS = 3;
/** Conditions whose saving throws get People's Will protection. */
export const MIND_CONDITIONS: ConditionType[] = ['charmed', 'frightened'];

export function emptyGodsBane(): GodsBaneState {
  return { enabled: false, will: 0, causality: 0, members: {} };
}

/** Defensive normalisation for whatever came out of room.json / a client. */
export function normalizeGodsBane(gb: Partial<GodsBaneState> | undefined | null): GodsBaneState | undefined {
  if (!gb) return undefined;
  const int = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  const members: Record<string, GodsBaneMember> = {};
  for (const [id, m] of Object.entries(gb.members ?? {})) {
    if (!m) continue;
    members[id] = {
      rejections: Math.min(MAX_BANE_REJECTIONS, int(m.rejections)),
      ...(m.rejected ? { rejected: true } : {}),
      ...(m.oathbroken ? { oathbroken: true } : {}),
    };
  }
  return {
    enabled: !!gb.enabled,
    will: int(gb.will),
    causality: int(gb.causality),
    members,
    holderSheetId: gb.holderSheetId || undefined,
    lastPassRound: typeof gb.lastPassRound === 'number' ? gb.lastPassRound : undefined,
    willUsed: gb.willUsed ? { ...gb.willUsed } : undefined,
    armed: gb.armed?.filter((a) => a && members[a.sheetId] && (a.mode === 'crit' || a.mode === 'fumble')),
  };
}

export type BaneMemberStatus = 'none' | 'sworn' | 'rejected' | 'oathbroken';

export function baneMemberStatus(gb: GodsBaneState | undefined, sheetId: string | undefined): BaneMemberStatus {
  const m = sheetId ? gb?.members[sheetId] : undefined;
  if (!m) return 'none';
  if (m.oathbroken) return 'oathbroken';
  if (m.rejected) return 'rejected';
  return 'sworn';
}

/** A sworn member currently enjoying the oath's benefits (feature on, not rejected / oathbroken). */
export function baneBenefitsActive(gb: GodsBaneState | undefined, sheetId: string | undefined): boolean {
  return !!gb?.enabled && baneMemberStatus(gb, sheetId) === 'sworn';
}

/** "Once per turn" key — only meaningful while initiative runs (outside combat there is no limit). */
export function baneTurnKey(initiative: Pick<Initiative, 'running' | 'round' | 'turnIndex'>): string | undefined {
  return initiative.running ? `${initiative.round}:${initiative.turnIndex}` : undefined;
}

/** Whether an attack was made with the God's Bane weapon (the trait rides on its damage parts). */
export function isGodsBaneAttack(parts: Pick<DamagePart, 'traits'>[] | undefined): boolean {
  return !!parts?.some((p) => p.traits?.includes('godsBane'));
}

/**
 * People's Will force damage for one attack: N when a benefiting member attacks a tagged creature —
 * on a hit, or hit-or-miss against a `greatOne` — at most once per turn. `null` = nothing to add.
 */
export function peoplesWillDamage(
  gb: GodsBaneState | undefined,
  o: { attackerSheetId?: string; targetTag?: BaneTag; hit: boolean; turnKey?: string },
): number | null {
  if (!gb || !o.targetTag || !baneBenefitsActive(gb, o.attackerSheetId)) return null;
  if (gb.will <= 0) return null;
  if (!o.hit && o.targetTag !== 'greatOne') return null;
  if (o.turnKey && gb.willUsed?.[o.attackerSheetId!] === o.turnKey) return null;
  return gb.will;
}

export function markPeoplesWillUsed(gb: GodsBaneState, sheetId: string, turnKey: string | undefined): GodsBaneState {
  if (!turnKey) return gb;
  return { ...gb, willUsed: { ...(gb.willUsed ?? {}), [sheetId]: turnKey } };
}

/** Damage a benefiting member takes from a tagged creature: reduced by N per instance (min 0). */
export function baneReducedDamage(
  gb: GodsBaneState | undefined,
  o: { targetSheetId?: string; sourceTag?: BaneTag },
  amount: number,
): { final: number; reduced: number } {
  if (!gb || !o.sourceTag || amount <= 0 || !baneBenefitsActive(gb, o.targetSheetId)) return { final: amount, reduced: 0 };
  const final = Math.max(0, amount - gb.will);
  return { final, reduced: amount - final };
}

/** +N on a save against a mind-altering condition for a benefiting member. */
export function baneMindSaveBonus(
  gb: GodsBaneState | undefined,
  sheetId: string | undefined,
  condition: ConditionType | undefined,
): number {
  if (!condition || !MIND_CONDITIONS.includes(condition) || !baneBenefitsActive(gb, sheetId)) return 0;
  return gb!.will;
}

/** Attack-roll penalty for swinging the God's Bane weapon while the blade rejects you (rejected or
 *  oathbroken): −N. */
export function baneAttackPenalty(gb: GodsBaneState | undefined, sheetId: string | undefined, withGodsBane: boolean): number {
  if (!gb?.enabled || !withGodsBane) return 0;
  const st = baneMemberStatus(gb, sheetId);
  return st === 'rejected' || st === 'oathbroken' ? gb.will : 0;
}

/** God's Bane weapon attack on a `greatOne`: +1 stripped layer (hit or miss); a hit also breaks its
 *  immortality. Returns the token patch, or null when nothing changes. */
export function baneStrike(
  gb: GodsBaneState | undefined,
  target: { baneTag?: BaneTag | null; baneLayers?: number; baneMortal?: boolean },
  hit: boolean,
): { baneLayers: number; baneMortal: boolean } | null {
  if (!gb?.enabled || target.baneTag !== 'greatOne') return null;
  return { baneLayers: (target.baneLayers ?? 0) + 1, baneMortal: !!target.baneMortal || hit };
}

/** Force a roll's d20 to a given natural value, shifting the total by the same amount. */
export function forceD20(result: RollResult, natural: 1 | 20): RollResult {
  if (!result.d20) return result;
  const delta = natural - result.d20.natural;
  return {
    ...result,
    total: result.total + delta,
    d20: { natural, isCrit: natural === 20, isFumble: natural === 1 },
  };
}

/** Cleaving Causality spent: drop the armed entry and take one point off the pool. */
export function consumeCausality(gb: GodsBaneState, sheetId: string, mode: 'crit' | 'fumble'): GodsBaneState {
  const armed = [...(gb.armed ?? [])];
  const i = armed.findIndex((a) => a.sheetId === sheetId && a.mode === mode);
  if (i >= 0) armed.splice(i, 1);
  return { ...gb, armed, causality: Math.max(0, gb.causality - 1) };
}

/** Client → server God's Bane operations (`{ t: 'godsBane', op }`). */
export type GodsBaneOp =
  | { op: 'config'; enabled?: boolean; will?: number; causality?: number }
  | { op: 'swear'; sheetId: string; sworn: boolean }
  | { op: 'reject'; sheetId: string }
  | { op: 'atone'; sheetId: string }
  | { op: 'override'; sheetId: string }
  | { op: 'setHolder'; sheetId?: string }
  | { op: 'pass'; toSheetId: string }
  | { op: 'arm'; sheetId: string; mode: 'crit' | 'fumble' }
  | { op: 'disarm'; sheetId: string };

export interface GodsBaneOpCtx {
  isDm: boolean;
  /** Sheet ids the acting participant owns. */
  ownSheetIds: string[];
  initiative: Pick<Initiative, 'running' | 'round'>;
}

/** Apply one operation. Returns the new state, or an error message (Vietnamese, shown to the user). */
export function applyGodsBaneOp(prev: GodsBaneState | undefined, op: GodsBaneOp, ctx: GodsBaneOpCtx): GodsBaneState | string {
  const gb: GodsBaneState = prev ? { ...prev, members: { ...prev.members } } : emptyGodsBane();
  const dmOnly = () => (ctx.isDm ? null : "Chỉ DM được chỉnh God's Bane");
  const member = (id: string) => gb.members[id];
  switch (op.op) {
    case 'config': {
      const err = dmOnly();
      if (err) return err;
      if (typeof op.enabled === 'boolean') gb.enabled = op.enabled;
      if (typeof op.will === 'number') gb.will = Math.max(0, Math.floor(op.will));
      if (typeof op.causality === 'number') gb.causality = Math.max(0, Math.floor(op.causality));
      return gb;
    }
    case 'swear': {
      const err = dmOnly();
      if (err) return err;
      if (op.sworn) gb.members[op.sheetId] ??= { rejections: 0 };
      else {
        delete gb.members[op.sheetId];
        if (gb.holderSheetId === op.sheetId) gb.holderSheetId = undefined;
        gb.armed = gb.armed?.filter((a) => a.sheetId !== op.sheetId);
      }
      return gb;
    }
    case 'reject': {
      const err = dmOnly();
      if (err) return err;
      const m = member(op.sheetId);
      if (!m) return 'Nhân vật này chưa tuyên thệ';
      if (m.oathbroken) return 'Đã phá thề vĩnh viễn';
      if (m.rejections >= MAX_BANE_REJECTIONS) gb.members[op.sheetId] = { rejections: MAX_BANE_REJECTIONS, rejected: true, oathbroken: true };
      else gb.members[op.sheetId] = { rejections: m.rejections + 1, rejected: true };
      gb.armed = gb.armed?.filter((a) => a.sheetId !== op.sheetId);
      return gb;
    }
    case 'atone': {
      const err = dmOnly();
      if (err) return err;
      const m = member(op.sheetId);
      if (!m) return 'Nhân vật này chưa tuyên thệ';
      if (m.oathbroken) return 'Đã phá thề — chỉ "Gỡ phá thề" (DM) mới xoá được';
      gb.members[op.sheetId] = { rejections: m.rejections };
      return gb;
    }
    case 'override': {
      const err = dmOnly();
      if (err) return err;
      const m = member(op.sheetId);
      if (!m) return 'Nhân vật này chưa tuyên thệ';
      gb.members[op.sheetId] = { rejections: m.rejections };
      return gb;
    }
    case 'setHolder': {
      const err = dmOnly();
      if (err) return err;
      if (op.sheetId && !member(op.sheetId)) return 'Chỉ người đã tuyên thệ mới cầm được kiếm';
      gb.holderSheetId = op.sheetId || undefined;
      return gb;
    }
    case 'pass': {
      if (!gb.enabled) return "God's Bane chưa bật";
      const from = gb.holderSheetId;
      if (!ctx.isDm && !(from && ctx.ownSheetIds.includes(from))) return 'Chỉ người đang cầm kiếm (hoặc DM) được trao kiếm';
      if (op.toSheetId === from) return 'Người này đang cầm kiếm rồi';
      if (!baneBenefitsActive(gb, op.toSheetId)) return 'Kiếm chỉ trao được cho người đã tuyên thệ và không bị kiếm chối bỏ';
      if (ctx.initiative.running && gb.lastPassRound === ctx.initiative.round) return 'Kiếm đã được trao trong vòng này rồi (1 lần/vòng)';
      gb.holderSheetId = op.toSheetId;
      gb.lastPassRound = ctx.initiative.running ? ctx.initiative.round : undefined;
      return gb;
    }
    case 'arm': {
      if (!gb.enabled) return "God's Bane chưa bật";
      if (!ctx.isDm && !ctx.ownSheetIds.includes(op.sheetId)) return 'Chỉ dùng được cho nhân vật của mình';
      if (!baneBenefitsActive(gb, op.sheetId)) return 'Chỉ người đã tuyên thệ (không bị chối bỏ) mới dùng được Cleaving Causality';
      const armed = gb.armed ?? [];
      if (armed.some((a) => a.sheetId === op.sheetId)) return 'Nhân vật này đã chuẩn bị Cleaving Causality rồi';
      if (gb.causality - armed.length <= 0) return 'Hết Cleaving Causality trong quỹ chung';
      gb.armed = [...armed, { sheetId: op.sheetId, mode: op.mode }];
      return gb;
    }
    case 'disarm': {
      if (!ctx.isDm && !ctx.ownSheetIds.includes(op.sheetId)) return 'Chỉ dùng được cho nhân vật của mình';
      gb.armed = (gb.armed ?? []).filter((a) => a.sheetId !== op.sheetId);
      return gb;
    }
  }
}

/**
 * God's Bane — a homebrew, table-specific party artifact. Pure rules helpers; the server (`room.ts`)
 * calls them from the attack / damage / save paths, and every one is a no-op unless the DM switched
 * the feature on for this room (`RoomState.godsBane.enabled`).
 *
 * - N ("People's Will") is a DM-edited party number.
 * - Once `awakened` (DM toggle), the blade is an entity on the map: its own DM-moved token (speed 30 ft,
 *   no AC / HP, never a target), its own initiative turn at 20 (loses ties) and a 5 ft aura.
 * - Sworn, non-rejected PCs inside the aura add N force damage (once per turn, straight to HP, ignoring
 *   defences) to any damage they deal to a tagged creature — even on a miss against a `greatOne` — and
 *   that strips one divinity layer off a `greatOne`.
 * - The blade's own attack: 1d8, auto-hit + People's Will vs tagged creatures, a normal +0 attack roll
 *   (no People's Will) otherwise. Attacking with the God's Bane weapon item counts as the blade's own
 *   attack (layer stripping, mortal, the permanent kill of an undying creature) with the item's numbers.
 * - Divinity stripping is capped at 3 layers per round per `greatOne` (no cap outside initiative).
 * - Protection (all sworn, non-rejected PCs, aura or not): N less damage per instance from tagged
 *   creatures, +N to saves against mind-altering conditions.
 * - Rejection: no benefits at all; God's Bane item attacks at −N. The 4th rejection is permanent.
 * - Undying creatures drop to "downed" instead of dying unless a God's Bane attack lands the killing blow.
 * - Divine weapons attack creatures within 5 ft of the blade token with disadvantage.
 * - Cleaving Causality: a shared pool; one point turns a sworn PC's own next d20 into a natural 20 or the
 *   next enemy d20 into a natural 1.
 */
import type { RollResult } from './dice.js';
import type {
  BaneTag,
  ConditionType,
  DamagePart,
  GodsBaneMember,
  GodsBaneState,
  Initiative,
  InitiativeEntry,
  Token,
  TokenSize,
} from './types.js';

export const MAX_BANE_REJECTIONS = 3;
/** The blade token's fixed initiative count (it loses ties). */
export const BLADE_INITIATIVE = 20;
export const BLADE_SPEED = 30;
/** The blade's own attack damage — nothing is added to it. */
export const BLADE_DAMAGE = '1d8';
export const BLADE_LABEL = "God's Bane";
/** Divinity layers a single `greatOne` can lose per initiative round. */
export const MAX_STRIPS_PER_ROUND = 3;
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
    // Older rooms stored a blade holder / last pass round (removed mechanic) — simply dropped here.
    ...(gb.awakened ? { awakened: true } : {}),
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

// ---- the blade token: aura, initiative ----

/** Grid cells a token of this size covers per side (tiny shares a cell: treated as 1 for reach). */
export function sizeSpan(size: TokenSize | undefined): number {
  return ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as const)[size ?? 'medium'] ?? 1;
}

/** Within 5 ft: the two footprints touch or overlap (Chebyshev gap of 0 squares, so diagonals count). */
export function withinFiveFeet(
  a: Pick<Token, 'x' | 'y' | 'size'>,
  b: Pick<Token, 'x' | 'y' | 'size'>,
): boolean {
  const sa = sizeSpan(a.size);
  const sb = sizeSpan(b.size);
  const gapX = Math.max(0, b.x - (a.x + sa), a.x - (b.x + sb));
  const gapY = Math.max(0, b.y - (a.y + sa), a.y - (b.y + sb));
  return Math.round(Math.max(gapX, gapY)) <= 0;
}

/** The awakened blade's token among `tokens` (the active scene), or undefined. */
export function findBladeToken<T extends Pick<Token, 'godsBaneBlade'>>(
  gb: GodsBaneState | undefined,
  tokens: T[],
): T | undefined {
  if (!gb?.enabled || !gb.awakened) return undefined;
  return tokens.find((t) => t.godsBaneBlade);
}

/** Whether `token` stands in the blade's 5 ft aura. No blade token on the map = nobody is. */
export function inBladeAura(
  gb: GodsBaneState | undefined,
  tokens: Pick<Token, 'id' | 'x' | 'y' | 'size' | 'godsBaneBlade'>[],
  token: Pick<Token, 'id' | 'x' | 'y' | 'size'> | undefined,
): boolean {
  const blade = findBladeToken(gb, tokens);
  if (!blade || !token || token.id === blade.id) return false;
  return withinFiveFeet(blade, token);
}

/** Initiative order: highest first; on a tie a `loseTies` entry (the blade) goes after the others. */
export function compareInitiative(
  a: Pick<InitiativeEntry, 'initiative' | 'loseTies'>,
  b: Pick<InitiativeEntry, 'initiative' | 'loseTies'>,
): number {
  return b.initiative - a.initiative || (a.loseTies ? 1 : 0) - (b.loseTies ? 1 : 0);
}

export function sortInitiative<T extends Pick<InitiativeEntry, 'initiative' | 'loseTies'>>(entries: T[]): T[] {
  return [...entries].sort(compareInitiative);
}

/**
 * Insert an entry into an initiative list. Out of combat the list is simply re-sorted. While combat runs
 * the list is in rotation order (`entries[0]` acts now; entries that already went this round sit at the
 * back, `hasGone`), so the entry is slotted into the round order at its count: if that slot is still
 * ahead it acts this round, otherwise it is marked as gone and acts at its slot next round.
 */
export function insertInitiativeEntry(
  init: Pick<Initiative, 'entries' | 'running' | 'turnIndex'>,
  entry: InitiativeEntry,
): void {
  if (!init.running || init.entries.length === 0) {
    init.entries = sortInitiative([...init.entries, { ...entry, hasGone: false }]);
    return;
  }
  const gone = init.entries.filter((e) => e.hasGone);
  const notGone = init.entries.filter((e) => !e.hasGone);
  const round = [...gone, ...notGone]; // this round's order from the top
  let p = round.findIndex((e) => compareInitiative(entry, e) < 0);
  if (p < 0) p = round.length;
  // A slot before (or at) the acting entry has already passed this round.
  const passed = p <= gone.length;
  round.splice(p, 0, { ...entry, isActive: false, hasGone: passed });
  const goneCount = gone.length + (passed ? 1 : 0);
  init.entries = [...round.slice(goneCount), ...round.slice(0, goneCount)];
  init.turnIndex = goneCount;
}

// ---- People's Will, protection, stripping ----

/**
 * People's Will force damage for one attack / damage instance: N when a benefiting member deals damage to
 * a tagged creature — or attacks a `greatOne` at all, hit or miss — at most once per turn, and only from
 * inside the blade's aura (`inAura`) or with the God's Bane weapon itself (`withGodsBane`). `null` =
 * nothing to add.
 */
export function peoplesWillDamage(
  gb: GodsBaneState | undefined,
  o: {
    attackerSheetId?: string;
    targetTag?: BaneTag;
    hit: boolean;
    turnKey?: string;
    inAura?: boolean;
    withGodsBane?: boolean;
  },
): number | null {
  if (!gb || !o.targetTag || !baneBenefitsActive(gb, o.attackerSheetId)) return null;
  if (gb.will <= 0) return null;
  if (!o.inAura && !o.withGodsBane) return null;
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

/**
 * Strip one divinity layer off a `greatOne`, honouring the per-round cap (`MAX_STRIPS_PER_ROUND` per
 * creature per initiative round; `round` undefined = outside initiative = no cap). Returns the token
 * patch, `'capped'` when this round's cap is used up, or null for a non-`greatOne`.
 */
export function baneStripLayer(
  target: Pick<Token, 'baneTag' | 'baneLayers' | 'baneStripRound' | 'baneStripCount'>,
  round: number | undefined,
): { baneLayers: number; baneStripRound?: number; baneStripCount?: number } | 'capped' | null {
  if (target.baneTag !== 'greatOne') return null;
  const layers = (target.baneLayers ?? 0) + 1;
  if (round === undefined) return { baneLayers: layers };
  const count = target.baneStripRound === round ? (target.baneStripCount ?? 0) : 0;
  if (count >= MAX_STRIPS_PER_ROUND) return 'capped';
  return { baneLayers: layers, baneStripRound: round, baneStripCount: count + 1 };
}

/** Layers stripped off this creature in the current round (for the panel's cap indicator). */
export function strippedThisRound(
  target: Pick<Token, 'baneStripRound' | 'baneStripCount'>,
  round: number | undefined,
): number {
  return round !== undefined && target.baneStripRound === round ? (target.baneStripCount ?? 0) : 0;
}

/** The blade's own attack: auto-hit against a tagged creature, otherwise a plain d20 (+0) vs AC. */
export function bladeAttackHits(
  targetTag: BaneTag | undefined,
  roll: Pick<RollResult, 'total' | 'd20'> | undefined,
  ac: number,
): { hit: boolean; auto: boolean; crit: boolean } {
  if (targetTag) return { hit: true, auto: true, crit: false };
  const crit = !!roll?.d20?.isCrit;
  const fumble = !!roll?.d20?.isFumble;
  return { hit: crit || (!fumble && (roll?.total ?? 0) >= ac), auto: false, crit };
}

/**
 * What a damage instance that took a creature's HP to 0 means: `slain` (for good) when it came from a
 * God's Bane attack, `downed` for an undying creature hit by anything else (a long rest revives it). A
 * creature that is already down is only finished by a God's Bane attack. `null` = nothing to mark.
 */
export function undyingOutcome(
  token: Pick<Token, 'undying' | 'downedUndying' | 'baneSlain'>,
  hpBefore: number,
  hpAfter: number,
  godsBaneSource: boolean,
): 'slain' | 'downed' | null {
  if (token.baneSlain || hpAfter > 0) return null;
  if (godsBaneSource && (hpBefore > 0 || token.downedUndying)) return 'slain';
  if (token.undying && hpBefore > 0 && !godsBaneSource) return 'downed';
  return null;
}

/** Whether an attack carries the `divine` weapon trait (homebrew, see `WeaponTrait`). */
export function isDivineAttack(parts: Pick<DamagePart, 'traits'>[] | undefined): boolean {
  return !!parts?.some((p) => p.traits?.includes('divine'));
}

/**
 * Give a d20 attack notation disadvantage: `1d20…` becomes `2d20kl1…`, advantage `2d20kh1…` becomes a
 * straight `1d20…` (they cancel), disadvantage stays. `null` when the notation has no leading d20.
 */
export function withDisadvantage(notation: string): { notation: string; cancelled: boolean } | null {
  const n = notation.trim().replace(/\s+/g, '').toLowerCase();
  const m = /^(2d20kh1|2d20kl1|1d20|d20)(?![0-9])(.*)$/.exec(n);
  if (!m) return null;
  if (m[1] === '2d20kl1') return { notation: n, cancelled: false };
  if (m[1] === '2d20kh1') return { notation: `1d20${m[2]}`, cancelled: true };
  return { notation: `2d20kl1${m[2]}`, cancelled: false };
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
  | { op: 'config'; enabled?: boolean; will?: number; causality?: number; awakened?: boolean }
  | { op: 'swear'; sheetId: string; sworn: boolean }
  | { op: 'reject'; sheetId: string }
  | { op: 'atone'; sheetId: string }
  | { op: 'override'; sheetId: string }
  | { op: 'arm'; sheetId: string; mode: 'crit' | 'fumble' }
  | { op: 'disarm'; sheetId: string };

/** God's Bane operations that touch the map / initiative — handled by the server room, DM only. */
export type GodsBaneRoomOp =
  | { op: 'placeBlade'; x?: number; y?: number }
  | { op: 'removeBlade' }
  | { op: 'bladeInit'; on: boolean }
  | { op: 'bladeAttack'; targetTokenId: string }
  | { op: 'reviveUndying' };

export function isGodsBaneRoomOp(op: GodsBaneOp | GodsBaneRoomOp): op is GodsBaneRoomOp {
  return ['placeBlade', 'removeBlade', 'bladeInit', 'bladeAttack', 'reviveUndying'].includes(op.op);
}

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
      if (typeof op.awakened === 'boolean') {
        if (op.awakened) gb.awakened = true;
        else delete gb.awakened;
      }
      return gb;
    }
    case 'swear': {
      const err = dmOnly();
      if (err) return err;
      if (op.sworn) gb.members[op.sheetId] ??= { rejections: 0 };
      else {
        delete gb.members[op.sheetId];
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
    default:
      return "Thao tác God's Bane không còn được hỗ trợ";
  }
}

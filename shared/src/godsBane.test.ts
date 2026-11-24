import { describe, expect, it } from 'vitest';
import { externalRollResult } from './dice.js';
import {
  applyGodsBaneOp,
  baneAttackPenalty,
  baneBenefitsActive,
  baneMindSaveBonus,
  baneReducedDamage,
  baneStrike,
  baneTurnKey,
  consumeCausality,
  emptyGodsBane,
  forceD20,
  isGodsBaneAttack,
  markPeoplesWillUsed,
  normalizeGodsBane,
  peoplesWillDamage,
  type GodsBaneOpCtx,
} from './godsBane.js';
import type { GodsBaneState } from './types.js';

const dm: GodsBaneOpCtx = { isDm: true, ownSheetIds: [], initiative: { running: true, round: 2 } };
const player = (ids: string[]): GodsBaneOpCtx => ({ isDm: false, ownSheetIds: ids, initiative: { running: true, round: 2 } });

function party(will = 3): GodsBaneState {
  return {
    ...emptyGodsBane(),
    enabled: true,
    will,
    causality: 2,
    members: { ana: { rejections: 0 }, bo: { rejections: 0 } },
    holderSheetId: 'ana',
  };
}

function ok(r: GodsBaneState | string): GodsBaneState {
  if (typeof r === 'string') throw new Error(r);
  return r;
}

describe("God's Bane — People's Will damage", () => {
  it('is a no-op while the feature is off or for non-members / untagged targets', () => {
    const off = { ...party(), enabled: false };
    expect(peoplesWillDamage(off, { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
    expect(peoplesWillDamage(undefined, { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
    expect(peoplesWillDamage(party(), { attackerSheetId: 'stranger', targetTag: 'minion', hit: true })).toBeNull();
    expect(peoplesWillDamage(party(), { attackerSheetId: 'ana', hit: true })).toBeNull();
    expect(peoplesWillDamage(party(0), { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
  });

  it('adds N on a hit vs minion / fallen, but not on a miss', () => {
    expect(peoplesWillDamage(party(), { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBe(3);
    expect(peoplesWillDamage(party(), { attackerSheetId: 'ana', targetTag: 'fallen', hit: true })).toBe(3);
    expect(peoplesWillDamage(party(), { attackerSheetId: 'ana', targetTag: 'minion', hit: false })).toBeNull();
  });

  it('applies even on a miss against a greatOne', () => {
    expect(peoplesWillDamage(party(), { attackerSheetId: 'ana', targetTag: 'greatOne', hit: false })).toBe(3);
  });

  it('only once per turn per PC', () => {
    const key = baneTurnKey({ running: true, round: 4, turnIndex: 1 });
    let gb = party();
    expect(peoplesWillDamage(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: key })).toBe(3);
    gb = markPeoplesWillUsed(gb, 'ana', key);
    expect(peoplesWillDamage(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: key })).toBeNull();
    // another PC this turn still gets it; the same PC on the next turn too
    expect(peoplesWillDamage(gb, { attackerSheetId: 'bo', targetTag: 'greatOne', hit: true, turnKey: key })).toBe(3);
    const next = baneTurnKey({ running: true, round: 4, turnIndex: 2 });
    expect(peoplesWillDamage(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: next })).toBe(3);
    // outside initiative there is no turn to limit it to
    expect(baneTurnKey({ running: false, round: 1, turnIndex: 0 })).toBeUndefined();
  });
});

describe("God's Bane — protection", () => {
  it('reduces damage from tagged creatures by N per instance, min 0', () => {
    expect(baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'greatOne' }, 10)).toEqual({ final: 7, reduced: 3 });
    expect(baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'fallen' }, 2)).toEqual({ final: 0, reduced: 2 });
    // two separate instances (e.g. two attacks / ticks) are each reduced
    const ticks = [4, 5].map((d) => baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'minion' }, d).final);
    expect(ticks).toEqual([1, 2]);
    // untagged source / non-member / feature off: untouched
    expect(baneReducedDamage(party(), { targetSheetId: 'ana' }, 10).final).toBe(10);
    expect(baneReducedDamage(party(), { targetSheetId: 'zed', sourceTag: 'minion' }, 10).final).toBe(10);
    expect(baneReducedDamage({ ...party(), enabled: false }, { targetSheetId: 'ana', sourceTag: 'minion' }, 10).final).toBe(10);
  });

  it('+N on saves vs charmed / frightened only', () => {
    expect(baneMindSaveBonus(party(), 'ana', 'charmed')).toBe(3);
    expect(baneMindSaveBonus(party(), 'ana', 'frightened')).toBe(3);
    expect(baneMindSaveBonus(party(), 'ana', 'poisoned')).toBe(0);
    expect(baneMindSaveBonus(party(), 'ana', undefined)).toBe(0);
  });
});

describe("God's Bane — rejection", () => {
  it('rejected: −N on God\'s Bane attack rolls and every benefit lost', () => {
    const gb = ok(applyGodsBaneOp(party(), { op: 'reject', sheetId: 'ana' }, dm));
    expect(gb.members.ana).toEqual({ rejections: 1, rejected: true });
    expect(baneAttackPenalty(gb, 'ana', true)).toBe(3);
    expect(baneAttackPenalty(gb, 'ana', false)).toBe(0);
    expect(baneAttackPenalty(gb, 'bo', true)).toBe(0);
    expect(baneBenefitsActive(gb, 'ana')).toBe(false);
    expect(peoplesWillDamage(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true })).toBeNull();
    expect(baneReducedDamage(gb, { targetSheetId: 'ana', sourceTag: 'greatOne' }, 10).final).toBe(10);
    expect(baneMindSaveBonus(gb, 'ana', 'charmed')).toBe(0);
    // the blade can't be passed to a rejected member
    const handed = ok(applyGodsBaneOp(gb, { op: 'setHolder', sheetId: 'bo' }, dm));
    expect(applyGodsBaneOp(handed, { op: 'pass', toSheetId: 'ana' }, dm)).toMatch(/không bị kiếm chối bỏ/);
    // atonement restores the benefits but keeps the count
    const back = ok(applyGodsBaneOp(gb, { op: 'atone', sheetId: 'ana' }, dm));
    expect(back.members.ana).toEqual({ rejections: 1 });
    expect(baneBenefitsActive(back, 'ana')).toBe(true);
  });

  it('the 4th rejection makes the member oathbroken for good (DM override only)', () => {
    let gb = party();
    for (let i = 0; i < 3; i++) {
      gb = ok(applyGodsBaneOp(gb, { op: 'reject', sheetId: 'ana' }, dm));
      expect(gb.members.ana.oathbroken).toBeUndefined();
      gb = ok(applyGodsBaneOp(gb, { op: 'atone', sheetId: 'ana' }, dm));
    }
    expect(gb.members.ana.rejections).toBe(3);
    gb = ok(applyGodsBaneOp(gb, { op: 'reject', sheetId: 'ana' }, dm));
    expect(gb.members.ana.oathbroken).toBe(true);
    expect(applyGodsBaneOp(gb, { op: 'atone', sheetId: 'ana' }, dm)).toMatch(/phá thề/);
    expect(applyGodsBaneOp(gb, { op: 'reject', sheetId: 'ana' }, dm)).toMatch(/phá thề/);
    expect(baneBenefitsActive(gb, 'ana')).toBe(false);
    expect(baneAttackPenalty(gb, 'ana', true)).toBe(3);
    const fixed = ok(applyGodsBaneOp(gb, { op: 'override', sheetId: 'ana' }, dm));
    expect(baneBenefitsActive(fixed, 'ana')).toBe(true);
  });

  it('membership / rejection are DM-only', () => {
    expect(applyGodsBaneOp(party(), { op: 'reject', sheetId: 'ana' }, player(['ana']))).toMatch(/Chỉ DM/);
    expect(applyGodsBaneOp(party(), { op: 'config', will: 9 }, player(['ana']))).toMatch(/Chỉ DM/);
  });
});

describe("God's Bane — divinity stripping & immortality", () => {
  it('+1 layer per God\'s Bane attack on a greatOne, hit or miss; mortal only on a hit', () => {
    const boss = { baneTag: 'greatOne' as const, baneLayers: 0, baneMortal: false };
    const miss = baneStrike(party(), boss, false)!;
    expect(miss).toEqual({ baneLayers: 1, baneMortal: false });
    const hit = baneStrike(party(), { ...boss, ...miss }, true)!;
    expect(hit).toEqual({ baneLayers: 2, baneMortal: true });
    // stays mortal on a later miss; N doesn't change the rate
    expect(baneStrike(party(9), { ...boss, ...hit }, false)).toEqual({ baneLayers: 3, baneMortal: true });
    expect(baneStrike(party(), { baneTag: 'minion' }, true)).toBeNull();
    expect(baneStrike({ ...party(), enabled: false }, boss, true)).toBeNull();
  });

  it('recognises the God\'s Bane weapon by its damage-part trait', () => {
    expect(isGodsBaneAttack([{ traits: ['magical', 'godsBane'] }])).toBe(true);
    expect(isGodsBaneAttack([{ traits: ['silvered'] }, {}])).toBe(false);
    expect(isGodsBaneAttack(undefined)).toBe(false);
  });

  it('a mortal flag reset is just clearing the token field (normalisation keeps the room state sane)', () => {
    const n = normalizeGodsBane({ enabled: true, will: -2, causality: 1.7, members: { a: { rejections: 9 } } })!;
    expect(n.will).toBe(0);
    expect(n.causality).toBe(1);
    expect(n.members.a.rejections).toBe(3);
    expect(normalizeGodsBane(undefined)).toBeUndefined();
  });
});

describe("God's Bane — blade passing & Cleaving Causality", () => {
  it('passes once per round to a sworn member, by the holder or the DM', () => {
    const gb = party();
    expect(applyGodsBaneOp(gb, { op: 'pass', toSheetId: 'bo' }, player(['bo']))).toMatch(/đang cầm kiếm/);
    const passed = ok(applyGodsBaneOp(gb, { op: 'pass', toSheetId: 'bo' }, player(['ana'])));
    expect(passed.holderSheetId).toBe('bo');
    expect(applyGodsBaneOp(passed, { op: 'pass', toSheetId: 'ana' }, player(['bo']))).toMatch(/1 lần\/vòng/);
    const nextRound = { ...player(['bo']), initiative: { running: true, round: 3 } };
    expect(ok(applyGodsBaneOp(passed, { op: 'pass', toSheetId: 'ana' }, nextRound)).holderSheetId).toBe('ana');
    expect(applyGodsBaneOp(gb, { op: 'pass', toSheetId: 'stranger' }, dm)).toMatch(/tuyên thệ/);
  });

  it('arms against the shared pool and consumes one point when the roll is changed', () => {
    let gb = ok(applyGodsBaneOp(party(), { op: 'arm', sheetId: 'ana', mode: 'crit' }, player(['ana'])));
    expect(applyGodsBaneOp(gb, { op: 'arm', sheetId: 'ana', mode: 'fumble' }, player(['ana']))).toMatch(/đã chuẩn bị/);
    gb = ok(applyGodsBaneOp(gb, { op: 'arm', sheetId: 'bo', mode: 'fumble' }, player(['bo'])));
    // pool of 2, both points earmarked
    const third = { ...gb, members: { ...gb.members, cy: { rejections: 0 } } };
    expect(applyGodsBaneOp(third, { op: 'arm', sheetId: 'cy', mode: 'crit' }, dm)).toMatch(/Hết/);
    expect(applyGodsBaneOp(gb, { op: 'arm', sheetId: 'bo', mode: 'crit' }, player(['ana']))).toMatch(/của mình/);
    gb = consumeCausality(gb, 'ana', 'crit');
    expect(gb.causality).toBe(1);
    expect(gb.armed).toEqual([{ sheetId: 'bo', mode: 'fumble' }]);
    const rejected = ok(applyGodsBaneOp(party(), { op: 'reject', sheetId: 'ana' }, dm));
    expect(applyGodsBaneOp(rejected, { op: 'arm', sheetId: 'ana', mode: 'crit' }, dm)).toMatch(/không bị chối bỏ/);
  });

  it('forceD20 turns a d20 roll into a natural 20 / 1 and shifts the total', () => {
    const r = externalRollResult('1d20+5', { total: 12, faces: [7], d20Natural: 7 });
    const crit = forceD20(r, 20);
    expect(crit.total).toBe(25);
    expect(crit.d20).toEqual({ natural: 20, isCrit: true, isFumble: false });
    const fum = forceD20(r, 1);
    expect(fum.total).toBe(6);
    expect(fum.d20?.isFumble).toBe(true);
    const noD20 = externalRollResult('2d6', { total: 7, faces: [3, 4] });
    expect(forceD20(noD20, 20)).toBe(noD20);
  });
});

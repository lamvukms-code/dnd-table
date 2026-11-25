import { describe, expect, it } from 'vitest';
import { externalRollResult } from './dice.js';
import {
  applyGodsBaneOp,
  baneAttackPenalty,
  baneBenefitsActive,
  baneMindSaveBonus,
  baneReducedDamage,
  baneStripLayer,
  baneTurnKey,
  BLADE_INITIATIVE,
  bladeAttackHits,
  compareInitiative,
  consumeCausality,
  emptyGodsBane,
  findBladeToken,
  forceD20,
  inBladeAura,
  insertInitiativeEntry,
  isDivineAttack,
  isGodsBaneAttack,
  isGodsBaneRoomOp,
  markPeoplesWillUsed,
  MAX_STRIPS_PER_ROUND,
  normalizeGodsBane,
  peoplesWillDamage,
  sortInitiative,
  strippedThisRound,
  undyingOutcome,
  withDisadvantage,
  withinFiveFeet,
  type GodsBaneOpCtx,
} from './godsBane.js';
import type { GodsBaneState, InitiativeEntry, Token } from './types.js';

const dm: GodsBaneOpCtx = { isDm: true, ownSheetIds: [], initiative: { running: true, round: 2 } };
const player = (ids: string[]): GodsBaneOpCtx => ({ isDm: false, ownSheetIds: ids, initiative: { running: true, round: 2 } });

function party(will = 3): GodsBaneState {
  return {
    ...emptyGodsBane(),
    enabled: true,
    awakened: true,
    will,
    causality: 2,
    members: { ana: { rejections: 0 }, bo: { rejections: 0 } },
  };
}

function ok(r: GodsBaneState | string): GodsBaneState {
  if (typeof r === 'string') throw new Error(r);
  return r;
}

type MapTok = Pick<Token, 'id' | 'x' | 'y' | 'size' | 'godsBaneBlade'>;
const tok = (id: string, x: number, y: number, extra: Partial<MapTok> = {}): MapTok => ({ id, x, y, size: 'medium', ...extra });
const blade = tok('blade', 5, 5, { godsBaneBlade: true });

/** People's Will from inside the aura — the common case below. */
const pw = (gb: GodsBaneState | undefined, o: Parameters<typeof peoplesWillDamage>[1]) => peoplesWillDamage(gb, { inAura: true, ...o });

describe("God's Bane — the blade's aura", () => {
  it('5 ft = footprints touching (Chebyshev, diagonals count), not 10 ft', () => {
    expect(withinFiveFeet(blade, tok('a', 6, 5))).toBe(true);
    expect(withinFiveFeet(blade, tok('a', 4, 4))).toBe(true); // diagonal
    expect(withinFiveFeet(blade, tok('a', 7, 5))).toBe(false);
    expect(withinFiveFeet(blade, tok('a', 5, 3))).toBe(false);
    // a large creature 2 squares right of the blade's left edge touches it
    expect(withinFiveFeet(blade, tok('big', 6, 4, { size: 'large' }))).toBe(true);
    expect(withinFiveFeet(blade, tok('big', 3, 3, { size: 'large' }))).toBe(true); // covers 3-4, adjacent to 5
    expect(withinFiveFeet(blade, tok('big', 2, 2, { size: 'large' }))).toBe(false);
  });

  it('only counts an awakened blade token that is actually on the map', () => {
    const near = tok('ana', 6, 6);
    expect(inBladeAura(party(), [blade, near], near)).toBe(true);
    expect(inBladeAura(party(), [blade, tok('ana', 8, 8)], tok('ana', 8, 8))).toBe(false);
    expect(inBladeAura(party(), [near], near)).toBe(false); // no blade token
    expect(inBladeAura({ ...party(), awakened: false }, [blade, near], near)).toBe(false); // not awakened
    expect(inBladeAura({ ...party(), enabled: false }, [blade, near], near)).toBe(false);
    expect(inBladeAura(party(), [blade], blade)).toBe(false); // the blade itself
    expect(findBladeToken(party(), [near, blade])).toBe(blade);
  });
});

describe("God's Bane — People's Will", () => {
  it('nothing while off, for non-sworn characters, untagged targets or N = 0', () => {
    expect(pw({ ...party(), enabled: false }, { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
    expect(pw(undefined, { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
    expect(pw(party(), { attackerSheetId: 'stranger', targetTag: 'minion', hit: true })).toBeNull();
    expect(pw(party(), { attackerSheetId: 'ana', hit: true })).toBeNull();
    expect(pw(party(0), { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBeNull();
  });

  it('is gated by the aura, except for attacks made with the God\'s Bane weapon itself', () => {
    const base = { attackerSheetId: 'ana', targetTag: 'minion' as const, hit: true };
    expect(peoplesWillDamage(party(), { ...base, inAura: false })).toBeNull();
    expect(peoplesWillDamage(party(), { ...base, inAura: true })).toBe(3);
    expect(peoplesWillDamage(party(), { ...base, inAura: false, withGodsBane: true })).toBe(3);
  });

  it('adds N on damage vs minion / fallen, not on a miss', () => {
    expect(pw(party(), { attackerSheetId: 'ana', targetTag: 'minion', hit: true })).toBe(3);
    expect(pw(party(), { attackerSheetId: 'ana', targetTag: 'fallen', hit: true })).toBe(3);
    expect(pw(party(), { attackerSheetId: 'ana', targetTag: 'minion', hit: false })).toBeNull();
  });

  it('applies even on a miss against a greatOne', () => {
    expect(pw(party(), { attackerSheetId: 'ana', targetTag: 'greatOne', hit: false })).toBe(3);
  });

  it('only once per turn per PC', () => {
    const key = baneTurnKey({ running: true, round: 4, turnIndex: 1 });
    let gb = party();
    expect(pw(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: key })).toBe(3);
    gb = markPeoplesWillUsed(gb, 'ana', key);
    expect(pw(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: key })).toBeNull();
    // also when the second instance would come from the God's Bane weapon
    expect(pw(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: key, withGodsBane: true })).toBeNull();
    // another PC this turn still gets it; the same PC on the next turn too
    expect(pw(gb, { attackerSheetId: 'bo', targetTag: 'greatOne', hit: true, turnKey: key })).toBe(3);
    const next = baneTurnKey({ running: true, round: 4, turnIndex: 2 });
    expect(pw(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, turnKey: next })).toBe(3);
    // outside initiative there is no turn to limit it to
    expect(baneTurnKey({ running: false, round: 1, turnIndex: 0 })).toBeUndefined();
  });
});

describe("God's Bane — protection (not aura-gated)", () => {
  it('reduces damage from tagged creatures by N per instance, min 0 — no position involved', () => {
    expect(baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'greatOne' }, 10)).toEqual({ final: 7, reduced: 3 });
    expect(baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'fallen' }, 2)).toEqual({ final: 0, reduced: 2 });
    const ticks = [4, 5].map((d) => baneReducedDamage(party(), { targetSheetId: 'ana', sourceTag: 'minion' }, d).final);
    expect(ticks).toEqual([1, 2]);
    // works without any blade token / before awakening
    expect(baneReducedDamage({ ...party(), awakened: false }, { targetSheetId: 'ana', sourceTag: 'minion' }, 10).final).toBe(7);
    expect(baneReducedDamage(party(), { targetSheetId: 'ana' }, 10).final).toBe(10);
    expect(baneReducedDamage(party(), { targetSheetId: 'zed', sourceTag: 'minion' }, 10).final).toBe(10);
    expect(baneReducedDamage({ ...party(), enabled: false }, { targetSheetId: 'ana', sourceTag: 'minion' }, 10).final).toBe(10);
  });

  it('+N on saves vs charmed / frightened only', () => {
    expect(baneMindSaveBonus(party(), 'ana', 'charmed')).toBe(3);
    expect(baneMindSaveBonus({ ...party(), awakened: false }, 'ana', 'frightened')).toBe(3);
    expect(baneMindSaveBonus(party(), 'ana', 'poisoned')).toBe(0);
    expect(baneMindSaveBonus(party(), 'ana', undefined)).toBe(0);
  });
});

describe("God's Bane — divinity stripping cap", () => {
  const boss = { baneTag: 'greatOne' as const, baneLayers: 0 };

  it(`strips at most ${MAX_STRIPS_PER_ROUND} layers per round per greatOne, resetting next round`, () => {
    let t: Parameters<typeof baneStripLayer>[0] = { ...boss };
    for (let i = 1; i <= 3; i++) {
      const p = baneStripLayer(t, 2);
      expect(p).not.toBe('capped');
      t = { ...t, ...(p as object) };
      expect(t.baneLayers).toBe(i);
    }
    expect(strippedThisRound(t, 2)).toBe(3);
    expect(baneStripLayer(t, 2)).toBe('capped');
    const r3 = baneStripLayer(t, 3);
    expect(r3).toEqual({ baneLayers: 4, baneStripRound: 3, baneStripCount: 1 });
    expect(strippedThisRound(t, 3)).toBe(0);
  });

  it('no cap outside initiative; nothing to strip off non-greatOnes', () => {
    let t: Parameters<typeof baneStripLayer>[0] = { ...boss, baneStripRound: 1, baneStripCount: 3 };
    for (let i = 0; i < 5; i++) t = { ...t, ...(baneStripLayer(t, undefined) as object) };
    expect(t.baneLayers).toBe(5);
    expect(baneStripLayer({ baneTag: 'minion' }, 1)).toBeNull();
    expect(baneStripLayer({}, undefined)).toBeNull();
  });
});

describe("God's Bane — the blade's own attack", () => {
  it('auto-hits any tagged creature (no roll needed)', () => {
    expect(bladeAttackHits('greatOne', undefined, 30)).toEqual({ hit: true, auto: true, crit: false });
    expect(bladeAttackHits('minion', undefined, 30).hit).toBe(true);
  });

  it('needs a plain d20 (+0) hit vs an untagged creature, and gets no People\'s Will there', () => {
    const roll = (n: number) => externalRollResult('1d20', { total: n, faces: [n], d20Natural: n });
    expect(bladeAttackHits(undefined, roll(12), 13)).toMatchObject({ hit: false, auto: false });
    expect(bladeAttackHits(undefined, roll(13), 13)).toMatchObject({ hit: true, auto: false });
    expect(bladeAttackHits(undefined, roll(20), 25)).toMatchObject({ hit: true, crit: true });
    expect(bladeAttackHits(undefined, roll(1), 1).hit).toBe(false);
    expect(pw(party(), { attackerSheetId: 'ana', hit: true })).toBeNull(); // untagged = no PW for anyone
  });

  it('the wielded God\'s Bane item is recognised as a God\'s Bane attack by its damage-part trait', () => {
    expect(isGodsBaneAttack([{ traits: ['magical', 'godsBane'] }])).toBe(true);
    expect(isGodsBaneAttack([{ traits: ['silvered'] }, {}])).toBe(false);
    expect(isGodsBaneAttack(undefined)).toBe(false);
  });
});

describe("God's Bane — undying creatures", () => {
  it('a non-God\'s-Bane killing blow only downs an undying creature', () => {
    expect(undyingOutcome({ undying: true }, 5, 0, false)).toBe('downed');
    expect(undyingOutcome({ undying: true }, 5, 1, false)).toBeNull();
    // already down: hitting it again with anything else changes nothing
    expect(undyingOutcome({ undying: true, downedUndying: true }, 0, 0, false)).toBeNull();
  });

  it('a God\'s Bane killing blow kills for good — even a creature that is already down', () => {
    expect(undyingOutcome({ undying: true }, 5, 0, true)).toBe('slain');
    expect(undyingOutcome({ undying: true, downedUndying: true }, 0, 0, true)).toBe('slain');
    expect(undyingOutcome({}, 5, 0, true)).toBe('slain');
    expect(undyingOutcome({}, 5, 0, false)).toBeNull(); // ordinary creature, ordinary death: nothing to mark
    expect(undyingOutcome({ undying: true, baneSlain: true }, 0, 0, true)).toBeNull();
  });
});

describe("God's Bane — rejection", () => {
  it('rejected: every blade benefit lost; God\'s Bane item attacks at −N with no help', () => {
    const gb = ok(applyGodsBaneOp(party(), { op: 'reject', sheetId: 'ana' }, dm));
    expect(gb.members.ana).toEqual({ rejections: 1, rejected: true });
    expect(baneAttackPenalty(gb, 'ana', true)).toBe(3);
    expect(baneAttackPenalty(gb, 'ana', false)).toBe(0);
    expect(baneAttackPenalty(gb, 'bo', true)).toBe(0);
    expect(baneBenefitsActive(gb, 'ana')).toBe(false);
    expect(pw(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true })).toBeNull();
    expect(peoplesWillDamage(gb, { attackerSheetId: 'ana', targetTag: 'greatOne', hit: true, withGodsBane: true })).toBeNull();
    expect(baneReducedDamage(gb, { targetSheetId: 'ana', sourceTag: 'greatOne' }, 10).final).toBe(10);
    expect(baneMindSaveBonus(gb, 'ana', 'charmed')).toBe(0);
    // stripping itself only needs the God's Bane weapon, so a rejected wielder still strips
    expect(baneStripLayer({ baneTag: 'greatOne' }, 1)).toEqual({ baneLayers: 1, baneStripRound: 1, baneStripCount: 1 });
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

  it('membership / rejection / awakening are DM-only', () => {
    expect(applyGodsBaneOp(party(), { op: 'reject', sheetId: 'ana' }, player(['ana']))).toMatch(/Chỉ DM/);
    expect(applyGodsBaneOp(party(), { op: 'config', will: 9 }, player(['ana']))).toMatch(/Chỉ DM/);
    expect(applyGodsBaneOp(party(), { op: 'config', awakened: false }, player(['ana']))).toMatch(/Chỉ DM/);
    const off = ok(applyGodsBaneOp(party(), { op: 'config', awakened: false }, dm));
    expect(off.awakened).toBeUndefined();
    expect(ok(applyGodsBaneOp(off, { op: 'config', awakened: true }, dm)).awakened).toBe(true);
  });
});

describe("God's Bane — divine weapons near the blade", () => {
  it('recognises the divine trait on any damage part', () => {
    expect(isDivineAttack([{ traits: ['divine'] }])).toBe(true);
    expect(isDivineAttack([{ traits: ['magical'] }, { traits: ['divine', 'magical'] }])).toBe(true);
    expect(isDivineAttack([{ traits: ['magical'] }])).toBe(false);
    expect(isDivineAttack(undefined)).toBe(false);
  });

  it('turns a d20 attack into disadvantage (advantage cancels out)', () => {
    expect(withDisadvantage('1d20+5')).toEqual({ notation: '2d20kl1+5', cancelled: false });
    expect(withDisadvantage('d20 + 3')).toEqual({ notation: '2d20kl1+3', cancelled: false });
    expect(withDisadvantage('2d20kh1+7')).toEqual({ notation: '1d20+7', cancelled: true });
    expect(withDisadvantage('2d20kl1-1')).toEqual({ notation: '2d20kl1-1', cancelled: false });
    expect(withDisadvantage('1d200+1')).toBeNull();
    expect(withDisadvantage('2d6+3')).toBeNull();
  });
});

describe("God's Bane — initiative", () => {
  const e = (id: string, initiative: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
    id,
    name: id,
    initiative,
    isActive: false,
    hasGone: false,
    ...extra,
  });
  const bladeEntry = () => e('blade', BLADE_INITIATIVE, { loseTies: true });

  it('acts at 20 and loses ties', () => {
    const sorted = sortInitiative([bladeEntry(), e('rogue', 20), e('ogre', 21), e('mage', 12)]);
    expect(sorted.map((x) => x.id)).toEqual(['ogre', 'rogue', 'blade', 'mage']);
    expect(compareInitiative(bladeEntry(), e('x', 20))).toBeGreaterThan(0);
    expect(compareInitiative(e('x', 20), bladeEntry())).toBeLessThan(0);
  });

  it('out of combat: inserted in sorted order', () => {
    const init = { entries: [e('ogre', 21), e('rogue', 20), e('mage', 12)], running: false, turnIndex: 0 };
    insertInitiativeEntry(init, bladeEntry());
    expect(init.entries.map((x) => x.id)).toEqual(['ogre', 'rogue', 'blade', 'mage']);
  });

  it('mid-round, slot still ahead: acts this round', () => {
    // ogre (21) is acting; rogue (20) and mage (12) still to go
    const init = { entries: [e('ogre', 21), e('rogue', 20), e('mage', 12)], running: true, turnIndex: 0 };
    insertInitiativeEntry(init, bladeEntry());
    expect(init.entries.map((x) => x.id)).toEqual(['ogre', 'rogue', 'blade', 'mage']);
    expect(init.turnIndex).toBe(0);
    expect(init.entries.find((x) => x.id === 'blade')!.hasGone).toBe(false);
  });

  it('mid-round, slot already passed: waits for its slot next round', () => {
    // ogre + rogue went; mage (12) is acting
    const init = {
      entries: [e('mage', 12), e('ogre', 21, { hasGone: true }), e('rogue', 20, { hasGone: true })],
      running: true,
      turnIndex: 2,
    };
    insertInitiativeEntry(init, bladeEntry());
    expect(init.entries.map((x) => x.id)).toEqual(['mage', 'ogre', 'rogue', 'blade']);
    expect(init.entries.find((x) => x.id === 'blade')!.hasGone).toBe(true);
    expect(init.turnIndex).toBe(3); // turns-taken count stays consistent with the gone entries
  });
});

describe("God's Bane — state, ops & Cleaving Causality", () => {
  it('normalises old room state (drops the removed blade-holder fields)', () => {
    const n = normalizeGodsBane({
      enabled: true,
      will: -2,
      causality: 1.7,
      members: { a: { rejections: 9 } },
      ...({ holderSheetId: 'a', lastPassRound: 3 } as object),
    })!;
    expect(n.will).toBe(0);
    expect(n.causality).toBe(1);
    expect(n.members.a.rejections).toBe(3);
    expect(n.awakened).toBeUndefined();
    expect('holderSheetId' in n).toBe(false);
    expect(normalizeGodsBane({ ...party() })!.awakened).toBe(true);
    expect(normalizeGodsBane(undefined)).toBeUndefined();
  });

  it('old pass / setHolder ops are refused; map ops are routed to the room', () => {
    expect(applyGodsBaneOp(party(), { op: 'pass', toSheetId: 'bo' } as never, dm)).toMatch(/không còn/);
    expect(isGodsBaneRoomOp({ op: 'bladeAttack', targetTokenId: 'x' })).toBe(true);
    expect(isGodsBaneRoomOp({ op: 'reviveUndying' })).toBe(true);
    expect(isGodsBaneRoomOp({ op: 'swear', sheetId: 'a', sworn: true })).toBe(false);
  });

  it('arms against the shared pool and consumes one point when the roll is changed', () => {
    let gb = ok(applyGodsBaneOp(party(), { op: 'arm', sheetId: 'ana', mode: 'crit' }, player(['ana'])));
    expect(applyGodsBaneOp(gb, { op: 'arm', sheetId: 'ana', mode: 'fumble' }, player(['ana']))).toMatch(/đã chuẩn bị/);
    gb = ok(applyGodsBaneOp(gb, { op: 'arm', sheetId: 'bo', mode: 'fumble' }, player(['bo'])));
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

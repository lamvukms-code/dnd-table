import { describe, expect, it } from 'vitest';
import { expireMadness, fmtDuration, madnessDuration, madnessEffect, madnessEscalation, type MadnessEntry, type MadnessRow } from './madness.js';

const rows: MadnessRow[] = [
  { lo: 1, hi: 50, theme: 'A', effects: ['good', 'neutral', 'bad'] },
  { lo: 51, hi: 100, theme: 'B', effects: ['g2', 'n2', 'b2'] },
];
const e = (tier: MadnessEntry['tier'], startedAt: number, expiresAt?: number): MadnessEntry => ({ id: String(Math.random()), tier, theme: 't', text: 'x', roll: '', startedAt, expiresAt });

describe('madness', () => {
  it('picks theme by d100 and effect by d10 band', () => {
    expect(madnessEffect(rows, 1, 1)).toEqual({ theme: 'A', text: 'good' });
    expect(madnessEffect(rows, 50, 7)).toEqual({ theme: 'A', text: 'neutral' });
    expect(madnessEffect(rows, 77, 8)).toEqual({ theme: 'B', text: 'b2' });
    expect(madnessEffect(rows, 0, 5)).toBeNull();
  });
  it('durations and expiry', () => {
    expect(madnessDuration('short', 3)).toBe(180);
    expect(madnessDuration('long', 2)).toBe(14 * 86400);
    expect(madnessDuration('indefinite', 4)).toBeUndefined();
    const r = expireMadness([e('short', 0, 60), e('indefinite', 0)], 61);
    expect(r.expired.length).toBe(1);
    expect(r.kept[0].tier).toBe('indefinite');
  });
  it('escalation rule of thumb', () => {
    const five = Array.from({ length: 5 }, (_, i) => e('short', i * 3600));
    expect(madnessEscalation(five, 6 * 3600)).toBe('long');
    expect(madnessEscalation(five, 3 * 86400)).toBeNull();
    expect(madnessEscalation([e('long', 0), e('long', 1), e('long', 2)], 10)).toBe('indefinite');
  });
  it('formats durations', () => {
    expect(fmtDuration(180)).toBe('3 phút');
    expect(fmtDuration(14 * 86400)).toBe('14 ngày');
    expect(fmtDuration(3600 + 600)).toBe('1 giờ 10 phút');
  });
});

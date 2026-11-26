import { describe, expect, it } from 'vitest';
import type { CharacterSheet, Participant, Token } from './types.js';
import { classLine, createVoiceGate, formatElapsed, speakerCards } from './speakerCards.js';
import { sheetForStreamCard } from './visibility.js';
import { blankSheetForTests } from './visibility.testutil.js';

const person = (id: string, name: string, role: 'dm' | 'player' = 'player', extra: Partial<Participant> = {}): Participant => ({
  id,
  name,
  role,
  color: '#123456',
  connected: true,
  lastSeen: 0,
  ...extra,
});

describe('speaker cards', () => {
  it('formats class lines', () => {
    expect(classLine({ className: 'Fighter', subclass: 'Champion', level: 5 })).toBe('Fighter (Champion) 5');
    expect(classLine({ className: '', level: 3 })).toBe('Cấp 3');
    expect(
      classLine({ className: 'Fighter', level: 5, classes: [{ name: 'Fighter', level: 3 }, { name: 'Wizard', level: 2 }] }),
    ).toBe('Fighter 3 / Wizard 2');
  });

  it('one card per player with their on-map character, anonymous names hidden, DM last', () => {
    const a: CharacterSheet = { ...{ ...blankSheetForTests('pa', 'x'), id: 's1' }, name: 'Aria', species: 'Elf', className: 'Wizard', level: 4, tokenId: 't1' };
    const a2: CharacterSheet = { ...{ ...blankSheetForTests('pa', 'x'), id: 's1b' }, name: 'Old Aria' };
    const b: CharacterSheet = { ...{ ...blankSheetForTests('pb', 'x'), id: 's2' }, name: 'Borin', className: 'Cleric', level: 4 };
    const tokens = [{ id: 't1', imageUrl: '/uploads/aria.png' } as Token];
    const cards = speakerCards({
      participants: [
        person('dm', 'Lam', 'dm'),
        person('pb', 'Zed', 'player', { anon: true }),
        person('pa', 'Mai'),
        person('gone', 'Nobody', 'player', { connected: false }),
      ],
      sheets: [a2, a, b],
      tokens,
    });
    expect(cards.map((c) => [c.title, c.playerName, c.info, c.imageUrl])).toEqual([
      ['Aria', 'Mai', 'Elf · Wizard 4', '/uploads/aria.png'],
      ['Borin', null, 'Cleric 4', undefined],
      ['DM', 'Lam', '', undefined],
    ]);
  });

  it('stream stubs keep the card identity but no stats', () => {
    const s: CharacterSheet = { ...{ ...blankSheetForTests('pa', 'x'), id: 's1' }, name: 'Aria', species: 'Elf', className: 'Wizard', level: 4, maxHp: 30, notes: 'secret' };
    const stub = sheetForStreamCard(s);
    expect([stub.species, stub.className, stub.level, stub.maxHp, stub.notes]).toEqual(['Elf', 'Wizard', 4, 1, '']);
  });
});

describe('voice gate', () => {
  it('needs two loud frames to start and a quiet spell to stop', () => {
    const g = createVoiceGate({ thresholdDb: -50, attackFrames: 2, releaseMs: 400 });
    expect(g.push(-30, 0)).toBeNull();
    expect(g.push(-30, 40)).toBe(true);
    expect(g.push(-70, 80)).toBeNull();
    expect(g.push(-30, 200)).toBeNull(); // a word resumes: still on
    expect(g.push(-70, 300)).toBeNull();
    expect(g.push(-70, 650)).toBeNull();
    expect(g.push(-70, 720)).toBe(false);
    expect(g.on).toBe(false);
  });
  it('formats elapsed time', () => {
    expect([formatElapsed(0), formatElapsed(65_000), formatElapsed(3_723_000)]).toEqual(['0:00', '1:05', '1:02:03']);
  });
});

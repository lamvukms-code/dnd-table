import { describe, expect, it } from 'vitest';
import { referenceForPlayers, stripDmLines } from './settingReference.js';

describe('setting reference', () => {
  it('removes DM-only lines and the bullets nested under them', () => {
    const body = [
      'A made-up blade (p. 1).',
      '- **Cut**: 1d8 slashing.',
      '- 🔒 **Secret**: it hungers.',
      '  - feeds on blood',
      '  - grows stronger',
      '- **Guard**: +1 AC.',
      '🔒 Rumour: the smith lied.',
      '| Name | Cost |',
      '|---|---|',
      '| Blade | 5 gp |',
      '| 🔒 Cursed blade | 50 gp |',
    ].join('\n');
    expect(stripDmLines(body)).toBe(
      ['A made-up blade (p. 1).', '- **Cut**: 1d8 slashing.', '- **Guard**: +1 AC.', '| Name | Cost |', '|---|---|', '| Blade | 5 gp |'].join('\n'),
    );
  });

  it('cuts a DM-only tail inside a line or a table cell', () => {
    expect(stripDmLines('- **Vision**: you see a place. 🔒 GM rolls: real or fake.')).toBe('- **Vision**: you see a place.');
    expect(stripDmLines('| 31 | Cope | Obsessed | 🔒 Secret effect |')).toBe('| 31 | Cope | Obsessed | — |');
  });

  it('players lose locked cards, groups and the sections they empty', () => {
    const ref = {
      title: 'Setting',
      sections: [
        { title: 'Items', groups: [{ title: 'Weapons', cards: [{ title: 'Sword', body: 'ok\n- 🔒 secret' }, { title: '🔒 Hidden', body: 'x' }] }] },
        { title: 'Secrets', groups: [{ title: '🔒 Plot', cards: [{ title: 'Twist', body: 'y' }] }] },
      ],
    };
    const p = referenceForPlayers(ref);
    expect(p.sections.map((s) => s.title)).toEqual(['Items']);
    expect(p.sections[0].groups[0].cards).toEqual([{ title: 'Sword', body: 'ok' }]);
  });
});

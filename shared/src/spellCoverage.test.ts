import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SRD_SPELLS } from './cantrips.js';

// The SRD 5.2.1 spell index (name / level / school / classes) shipped in client/public/srd.
const index = JSON.parse(
  readFileSync(new URL('../../client/public/srd/spells.json', import.meta.url), 'utf8'),
) as { name: string; level: number; school: string; classes: string[] }[];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('SRD spell coverage', () => {
  for (const lvl of [0, 1, 2]) {
    it(`has every SRD level ${lvl} spell in the DB at that level (by name or alias)`, () => {
      const names = index.filter((s) => s.level === lvl).map((s) => s.name);
      expect(names.length).toBeGreaterThan(20);
      const pool = SRD_SPELLS.filter((s) => (s.level ?? 0) === lvl);
      const missing = names.filter(
        (n) => !pool.some((s) => [s.name, ...(s.aliases ?? [])].some((x) => norm(x) === norm(n))),
      );
      expect(missing).toEqual([]);
    });
  }
  it('gives every spell a unique id and a class list', () => {
    const ids = SRD_SPELLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SRD_SPELLS) expect(s.classes.length).toBeGreaterThan(0);
  });
});

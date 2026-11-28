import { afterEach, describe, expect, it } from 'vitest';
import { derivedClassFeatures, replacedClassFeatureIds, type SubclassFeatureDef } from './classFeatures.js';
import { featureRiders, registerFeatureDefs } from './featurePassives.js';

const paladin = (level: number, subclass = 'Oath of Testing') =>
  ({
    id: 's', name: 'P', className: 'Paladin', subclass, level,
    classes: [{ name: 'Paladin', subclass, level }],
    abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 16 },
    proficiencyBonus: 4, features: [], feats: [],
  }) as never;

const defs: SubclassFeatureDef[] = [
  { id: 't-smite', class: 'paladin', subclass: 'Oath of Testing', level: 3, name: 'New Smite', description: '', replaces: ['paladin-smite', 'paladin-lay-on-hands'] },
  { id: 't-strikes', class: 'paladin', subclass: 'Oath of Testing', level: 11, name: 'New Strikes', description: '', replaces: ['paladin-radiant-strikes'],
    passive: { riders: [{ label: 'New Strikes', dice: '1d8', type: 'force', scope: 'melee' }] } },
];

describe('subclass features replacing base class features', () => {
  afterEach(() => registerFeatureDefs([]));

  it('drops the replaced features once the subclass feature is gained', () => {
    registerFeatureDefs(defs);
    const ids = (lvl: number) => derivedClassFeatures(paladin(lvl)).map((f) => f.id);
    expect(ids(2)).toContain('paladin-smite'); // subclass not gained yet
    expect(ids(3)).not.toContain('paladin-smite');
    expect(ids(3)).not.toContain('paladin-lay-on-hands');
    expect(ids(10)).not.toContain('paladin-radiant-strikes');
    expect(replacedClassFeatureIds(paladin(11)).has('paladin-radiant-strikes')).toBe(true);
  });

  it('swaps the level 11 rider', () => {
    registerFeatureDefs(defs);
    const labels = featureRiders(paladin(11)).map((r) => r.label);
    expect(labels).toContain('New Strikes');
    expect(labels).not.toContain('Radiant Strikes');
  });

  it('leaves other paladins alone', () => {
    registerFeatureDefs(defs);
    const ids = derivedClassFeatures(paladin(11, 'Oath of Devotion')).map((f) => f.id);
    expect(ids).toContain('paladin-smite');
    expect(ids).toContain('paladin-radiant-strikes');
  });
});

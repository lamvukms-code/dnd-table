import { describe, expect, it } from 'vitest';
import { classify, eventsFor } from './fxClassify.js';
import type { RollLogEntry } from './types.js';

describe('effect classification', () => {
  it('monster attacks sound like what they are, not metal', () => {
    expect(classify({ name: 'Bite', types: ['piercing'], range: 'melee' }).cue).toBe('bite');
    expect(classify({ name: 'Claws', types: ['slashing'], range: 'melee' }).cue).toBe('claw');
    expect(classify({ name: 'Slam', types: ['bludgeoning'] }).cue).toBe('slam');
    expect(classify({ name: 'Tail', types: ['bludgeoning'] }).cue).toBe('slam');
  });
  it('weapons by name and damage type', () => {
    expect(classify({ name: 'Longsword', types: ['slashing'], range: 'melee' }).cue).toBe('slash');
    expect(classify({ name: 'Rapier', types: ['piercing'], range: 'melee' }).cue).toBe('pierce');
    expect(classify({ name: 'Longbow', types: ['piercing'], range: 'ranged' }).cue).toBe('arrow');
    expect(classify({ name: 'Javelin', types: ['piercing'], range: 'ranged' }).cue).toBe('thrown');
    expect(classify({ name: 'Unarmed Strike', types: ['bludgeoning'] }).cue).toBe('punch');
    expect(classify({ name: 'Flame Tongue Longsword', types: ['slashing', 'fire'], range: 'melee' })).toEqual({ cue: 'slash', element: 'fire' });
  });
  it('spells by damage type, then by name', () => {
    expect(classify({ name: 'Fire Bolt', kind: 'spell', types: ['fire'] })).toEqual({ cue: 'spell', element: 'fire' });
    expect(classify({ name: 'Ray of Frost', kind: 'spell', types: ['cold'] }).element).toBe('cold');
    expect(classify({ name: 'Sacred Flame', kind: 'spell', types: [] }).element).toBe('fire');
    expect(classify({ name: 'Magic Missile', kind: 'spell', types: ['force'] }).element).toBe('force');
    expect(classify({ name: 'Cure Wounds', heal: true }).cue).toBe('heal');
  });
  it('one log entry → a launch (attack roll) or an impact (damage / heal)', () => {
    const base = { id: 'x', ts: 0, actorId: 'a', actorName: 'A', result: { notation: '', terms: [], total: 0 } } as unknown as RollLogEntry;
    const fx = { name: 'Bite', types: ['piercing'], from: 'bear', to: 'pc' };
    expect(eventsFor({ ...base, label: 'Bear · Bite', fx, attack: { targetName: 'pc', hit: true, crit: false, fumble: false } })[0]).toMatchObject({ phase: 'launch', cue: 'bite', hit: true });
    expect(eventsFor({ ...base, label: 'Bear · Bite — sát thương', fx, damage: { targetName: 'pc', amount: 9 } })[0]).toMatchObject({ phase: 'impact', amount: 9 });
    expect(eventsFor({ ...base, label: 'Roll' })).toEqual([]);
  });
});

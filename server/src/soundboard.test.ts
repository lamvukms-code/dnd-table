import { describe, expect, it } from 'vitest';
import type { Participant, RoomState } from '@dnd-table/shared';
import { addSound, applySoundboard, audioExt, looksLikeAudio, nameFromFile } from './soundboard.js';

const dm = { id: 'dm', name: 'DM', role: 'dm' } as Participant;
const player = { id: 'p1', name: 'P', role: 'player' } as Participant;

function room(): RoomState {
  const s = {} as RoomState;
  addSound(s, { id: 'boom', name: 'Boom', url: '/soundboard-files/a.mp3' });
  addSound(s, { id: 'rain', name: 'Rain', url: '/soundboard-files/b.ogg', loop: true });
  return s;
}

describe('soundboard', () => {
  it('a one-shot goes out as an event, a looping clip toggles in the state', () => {
    const s = room();
    expect(applySoundboard(s, dm, { t: 'sbPlay', id: 'boom' }, 1000).play?.id).toBe('boom');
    expect(s.soundboard!.looping ?? []).toEqual([]);
    expect(applySoundboard(s, dm, { t: 'sbPlay', id: 'rain' }, 2000)).toEqual({ changed: true });
    expect(s.soundboard!.looping).toEqual(['rain']);
    applySoundboard(s, dm, { t: 'sbPlay', id: 'rain' }, 3000);
    expect(s.soundboard!.looping).toEqual([]);
  });

  it('players press clips only when the DM allows it, and never edit', () => {
    const s = room();
    expect(applySoundboard(s, player, { t: 'sbPlay', id: 'boom' }, 1000).error).toBeTruthy();
    applySoundboard(s, dm, { t: 'sbSettings', playersCanPlay: true });
    expect(applySoundboard(s, player, { t: 'sbPlay', id: 'boom' }, 2000).play).toBeTruthy();
    // spam clicks are dropped
    expect(applySoundboard(s, player, { t: 'sbPlay', id: 'boom' }, 2100).play).toBeUndefined();
    expect(applySoundboard(s, player, { t: 'sbRemove', id: 'boom' }).error).toBeTruthy();
    expect(applySoundboard(s, player, { t: 'sbUpdate', id: 'boom', patch: { name: 'x' } }).error).toBeTruthy();
  });

  it('stop-all clears loops; remove hands back the file and stops it', () => {
    const s = room();
    applySoundboard(s, dm, { t: 'sbPlay', id: 'rain' }, 1000);
    expect(applySoundboard(s, dm, { t: 'sbStop' })).toEqual({ changed: true, stopAll: true });
    applySoundboard(s, dm, { t: 'sbPlay', id: 'rain' }, 5000);
    const r = applySoundboard(s, dm, { t: 'sbRemove', id: 'rain' });
    expect(r.removedUrl).toBe('/soundboard-files/b.ogg');
    expect(s.soundboard!.looping).toEqual([]);
    expect(s.soundboard!.sounds.map((x) => x.id)).toEqual(['boom']);
  });

  it('edit, unloop and reorder', () => {
    const s = room();
    applySoundboard(s, dm, { t: 'sbPlay', id: 'rain' }, 1000);
    applySoundboard(s, dm, { t: 'sbUpdate', id: 'rain', patch: { loop: false, volume: 2, name: '  Mưa  ', emoji: '🌧' } });
    const rain = s.soundboard!.sounds.find((x) => x.id === 'rain')!;
    expect(rain).toMatchObject({ name: 'Mưa', emoji: '🌧', loop: undefined, volume: undefined });
    expect(s.soundboard!.looping).toEqual([]);
    applySoundboard(s, dm, { t: 'sbMove', id: 'rain', to: 0 });
    expect(s.soundboard!.sounds.map((x) => x.id)).toEqual(['rain', 'boom']);
  });

  it('only real audio files are accepted', () => {
    expect(audioExt('audio/mpeg', 'x.bin')).toBe('mp3');
    expect(audioExt('', 'Tavern.OPUS')).toBe('ogg');
    expect(audioExt('text/html', 'page.html')).toBeNull();
    const pad = (h: string) => Buffer.concat([Buffer.from(h, 'latin1'), Buffer.alloc(16)]);
    expect(looksLikeAudio(pad('ID3\x04'), 'mp3')).toBe(true);
    expect(looksLikeAudio(pad('OggS'), 'ogg')).toBe(true);
    expect(looksLikeAudio(Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE', 'latin1'), Buffer.alloc(8)]), 'wav')).toBe(true);
    expect(looksLikeAudio(pad('<html><script>'), 'mp3')).toBe(false);
    expect(nameFromFile('03 - Tavern_Night.mp3')).toBe('Tavern Night');
  });
});

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RollLogEntry } from '@dnd-table/shared';
import { Recordings, TRACK_GRACE_MS, type TracksManifest } from './recordings.js';
import { CLEAN_FILTER, buildMixArgs, tempoFix } from './mix.js';

const dirs = () => {
  const root = mkdtempSync(join(tmpdir(), 'dnd-rec-'));
  return { tmp: join(root, 'tmp'), out: join(root, 'out') };
};
const entry = (id: string, ts: number, label: string): RollLogEntry =>
  ({ id, ts, actorId: 'system', actorName: 'Hệ thống', label, result: { notation: '', terms: [], total: 0 } }) as RollLogEntry;

describe('session recordings', () => {
  it('appends chunks in order, ignores resends, refuses gaps, then moves video + log into a dated folder', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    const rec = r.start('mp4', 1_000_000);
    if (typeof rec === 'string') throw new Error(rec);
    expect(r.start('mp4')).toBe('Đang ghi hình rồi');
    expect(r.append(rec.id, 0, Buffer.from('ab'))).toBeNull();
    expect(r.append(rec.id, 0, Buffer.from('ab'))).toBeNull(); // resend after a lost reply
    expect(r.append(rec.id, 2, Buffer.from('zz'))).toBe('Thiếu đoạn 1');
    expect(r.append(rec.id, 1, Buffer.from('cd'))).toBeNull();
    expect(r.append('nope', 2, Buffer.from('x'))).toBe('Không có bản ghi này');
    r.captureLog([entry('old', 999_000, 'before'), entry('e1', 1_065_000, '🎲 Goblin')]);
    r.captureLog([entry('e1', 1_065_000, '🎲 Goblin'), entry('e2', 1_125_000, 'Next')]);
    const done = r.stop();
    expect(done?.bytes).toBe(4);
    expect(readdirSync(done!.folder).sort()).toEqual(['buoi-choi.mp4', 'nhat-ky.txt']);
    expect(readFileSync(join(done!.folder, 'buoi-choi.mp4'), 'utf8')).toBe('abcd');
    const log = readFileSync(join(done!.folder, 'nhat-ky.txt'), 'utf8');
    expect(log).toContain('    1:05  🎲 Goblin');
    expect(log).toContain('    2:05  Next');
    expect(log).not.toContain('before');
    expect(r.active).toBeNull();
  });

  it('collects per-person tracks after the video stops: waits for open tracks, then writes tracks.json', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    const now = Date.now();
    expect(r.trackStart('p1', 'Mai Aria', 'webm', now)).toBe('DM không còn ghi hình');
    const rec = r.start('mp4', now);
    if (typeof rec === 'string') throw new Error(rec);
    const a = r.trackStart('p1', 'Mai: Aria?', 'webm', now + 120, now + 150);
    const b = r.trackStart('p2', 'Borin', 'webm', now + 999_999, now + 200); // absurd clock → server time
    const empty = r.trackStart('p3', 'Ghost', 'webm', now);
    if (typeof a === 'string' || typeof b === 'string' || typeof empty === 'string') throw new Error('track');
    expect(b.startMs).toBe(now + 200);
    expect(r.trackAppend(a.id, 'p2', 0, Buffer.from('x'), now)).toBe('Không có track này'); // not your track
    expect(r.trackAppend(a.id, 'p1', 0, Buffer.from('aa'), now + 5_000, now + 5_000)).toBeNull();
    expect(r.trackAppend(b.id, 'p2', 0, Buffer.from('bb'), now + 5_000, now + 5_000)).toBeNull();
    r.stop('', now + 6_000);
    // the video has stopped, track a still sends its last chunk, b is still open
    expect(r.trackAppend(a.id, 'p1', 1, Buffer.from('a2'), now + 6_500, now + 6_500)).toBeNull();
    expect(r.trackStop(a.id, 'p1', now + 6_600, now + 6_600)).toBeNull();
    expect(r.takeReady(now + 7_000)).toEqual([]); // b not closed yet, grace period running
    r.trackStop(b.id, 'p2', now + 7_000, now + 7_000);
    r.trackStop(empty.id, 'p3', now + 7_000, now + 7_000);
    const ready = r.takeReady(now + 7_100);
    expect(ready).toHaveLength(1);
    const m = ready[0].manifest;
    expect(m.tracks.map((t) => [t.file, t.startMs - now, t.endMs - now, t.bytes])).toEqual([
      ['01-Mai Aria.webm', 120, 6_600, 4],
      ['02-Borin.webm', 200, 7_000, 2],
    ]);
    const files = readdirSync(join(ready[0].folder, 'tracks')).sort();
    expect(files).toEqual(['01-Mai Aria.webm', '02-Borin.webm', 'tracks.json']);
    expect(readdirSync(d.tmp)).toEqual([]); // the empty track's file is gone too
  });

  it('gives up waiting for a track after the grace period; stalled tracks close', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    const now = Date.now();
    const rec = r.start('webm', now);
    if (typeof rec === 'string') throw new Error(rec);
    const a = r.trackStart('p1', 'A', 'webm', now, now);
    if (typeof a === 'string') throw new Error(a);
    r.trackAppend(a.id, 'p1', 0, Buffer.from('aa'), now + 1000, now + 1000);
    r.stop('', now + 2000);
    expect(r.takeReady(now + 3000)).toEqual([]);
    expect(r.takeReady(now + 2000 + TRACK_GRACE_MS + 1)).toHaveLength(1);
    // stall watchdog
    const rec2 = r.start('webm', now + 100_000);
    if (typeof rec2 === 'string') throw new Error(rec2);
    const b = r.trackStart('p1', 'A', 'webm', now + 100_000, now + 100_000);
    if (typeof b === 'string') throw new Error(b);
    r.closeStalled(now + 100_000 + 91_000);
    expect(r.trackAppend(b.id, 'p1', 0, Buffer.from('x'), now, now + 100_000 + 91_000)).toBe('Không có track này');
  });

  it('rejects unknown formats and finalises a crashed recording (video + tracks) on start-up', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    expect(r.start('avi')).toBe('Định dạng video không hỗ trợ');
    const rec = r.start('webm', 2_000_000);
    if (typeof rec === 'string') throw new Error(rec);
    r.append(rec.id, 0, Buffer.from('data'));
    const t = r.trackStart('p1', 'Mai', 'webm', Date.now());
    if (typeof t === 'string') throw new Error(t);
    writeFileSync(t.part, 'voice');
    // the server dies here; a new process finds the leftovers
    writeFileSync(join(d.tmp, '3000000-empty.webm.part'), '');
    const again = new Recordings(d.tmp, d.out);
    const found = again.recoverLeftovers();
    expect(found).toHaveLength(1);
    expect(readdirSync(found[0].folder).sort()).toEqual(['buoi-choi-dang-do.webm', 'nhat-ky.txt', 'tracks']);
    expect(found[0].manifest.tracks.map((x) => [x.file, x.participantId])).toEqual([['01-Mai.webm', 'p1']]); // name + owner kept by the side file
    expect(existsSync(join(found[0].folder, 'tracks', 'tracks.json'))).toBe(true);
    expect(readdirSync(d.tmp)).toEqual([]);
  });
});

describe('clean mix', () => {
  it('corrects clock drift only when it looks like drift', () => {
    expect(tempoFix(3600.36, 0, 3_600_000)).toBeCloseTo(1.0001, 6); // 100 ppm fast
    expect(tempoFix(3600.0001, 0, 3_600_000)).toBeNull(); // negligible
    expect(tempoFix(3000, 0, 3_600_000)).toBeNull(); // 17 % off: a gap, not drift
    expect(tempoFix(20, 0, 20_000)).toBeNull(); // too short to judge
    expect(tempoFix(100, 5000, 5000)).toBeNull(); // unknown end (recovered track)
  });

  it('places, cleans and mixes the tracks, copying the video', () => {
    const m: TracksManifest = {
      since: 10_000,
      video: 'no-such-video.mp4',
      tracks: [
        { file: '01-a.webm', participantId: 'a', label: 'a', startMs: 10_250, endMs: 10_000 + 3_600_000, bytes: 1 },
        { file: '02-b.webm', participantId: 'b', label: 'b', startMs: 9_900, endMs: 9_900 + 60_000, bytes: 1 },
      ],
    };
    const args = buildMixArgs('/x', m, [3600.36 - 0.25, 60]);
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain(`[0:a]aresample=48000,aformat=channel_layouts=mono,atempo=`); // no video file → tracks from input 0
    expect(graph).toContain(`${CLEAN_FILTER},adelay=250:all=1[t0]`);
    expect(graph).toContain('atrim=start=0.100,asetpts=PTS-STARTPTS');
    expect(graph).toContain('[t0][t1]amix=inputs=2:normalize=0');
    expect(args.some((a) => a.endsWith('tieng-sach.m4a'))).toBe(true);
    expect(args).not.toContain('-c:v');
  });
});

describe('recording without picture', () => {
  it('drops an empty video but keeps the tracks', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    const now = Date.now();
    const rec = r.start('mp4', now);
    if (typeof rec === 'string') throw new Error(rec);
    const t = r.trackStart('p1', 'Mai', 'webm', now, now);
    if (typeof t === 'string') throw new Error(t);
    r.trackAppend(t.id, 'p1', 0, Buffer.from('voice'), now + 1000, now + 1000);
    const done = r.stop('', now + 2000);
    r.trackStop(t.id, 'p1', now + 2000, now + 2000);
    const [ready] = r.takeReady(now + 2100);
    expect(ready.manifest.video).toBeUndefined();
    expect(readdirSync(done!.folder).sort()).toEqual(['nhat-ky.txt', 'tracks']);
    expect(readdirSync(d.tmp)).toEqual([]);
  });
});

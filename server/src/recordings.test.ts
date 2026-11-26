import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RollLogEntry } from '@dnd-table/shared';
import { Recordings } from './recordings.js';

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
    expect(typeof rec).toBe('object');
    if (typeof rec === 'string') return;
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
    const files = readdirSync(done!.folder).sort();
    expect(files).toEqual(['buoi-choi.mp4', 'nhat-ky.txt']);
    expect(readFileSync(join(done!.folder, 'buoi-choi.mp4'), 'utf8')).toBe('abcd');
    const log = readFileSync(join(done!.folder, 'nhat-ky.txt'), 'utf8');
    expect(log).toContain('    1:05  🎲 Goblin');
    expect(log).toContain('    2:05  Next');
    expect(log).not.toContain('before');
    expect(r.active).toBeNull();
  });

  it('rejects unknown formats and finalises a crashed recording on start-up', () => {
    const d = dirs();
    const r = new Recordings(d.tmp, d.out);
    expect(r.start('avi')).toBe('Định dạng video không hỗ trợ');
    const rec = r.start('webm', 2_000_000);
    if (typeof rec === 'string') throw new Error(rec);
    r.append(rec.id, 0, Buffer.from('data'));
    // the server dies here; a new process finds the leftovers
    writeFileSync(join(d.tmp, '3000000-empty.webm.part'), '');
    const again = new Recordings(d.tmp, d.out);
    const folders = again.recoverLeftovers();
    expect(folders).toHaveLength(1);
    expect(readdirSync(folders[0]).sort()).toEqual(['buoi-choi-dang-do.webm', 'nhat-ky.txt']);
    expect(readdirSync(d.tmp)).toEqual([]);
  });
});

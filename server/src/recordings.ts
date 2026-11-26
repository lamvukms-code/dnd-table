import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { formatElapsed, type RollLogEntry } from '@dnd-table/shared';

/**
 * Session recordings. The DM's recording window (MediaRecorder) uploads the video in small chunks
 * while it records; they are appended to a `.part` file in a LOCAL temp folder (so a cloud-synced
 * destination such as OneDrive doesn't re-upload a file that grows every few seconds), and moved
 * into `<outDir>/<date time>/` when the recording stops — together with a timestamped game log
 * (`nhat-ky.txt`) that is handy for YouTube chapters. A browser crash or server restart leaves the
 * `.part` behind; it is finalised as-is on the next start (or by the stall watchdog).
 */
export interface ActiveRecording {
  id: string;
  since: number;
  ext: string;
  part: string;
  log: string;
  nextSeq: number;
  bytes: number;
  lastChunk: number;
  seenLog: Set<string>;
}

const EXT_OK = new Set(['mp4', 'webm']);

function stamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    // another drive (EXDEV): copy, then drop the temp file
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

function logLine(since: number, e: RollLogEntry): string {
  const roll = e.result?.notation ? ` → ${e.result.total}` : '';
  const who = e.actorId === 'system' ? '' : `${e.actorName}: `;
  return `${formatElapsed(e.ts - since).padStart(8)}  ${who}${e.label}${roll}${e.private ? '  (DM, ẩn)' : ''}\n`;
}

export class Recordings {
  active: ActiveRecording | null = null;

  constructor(
    private readonly tmpDir: string,
    readonly outDir: string,
  ) {}

  start(ext: string, now = Date.now()): ActiveRecording | string {
    if (this.active) return 'Đang ghi hình rồi';
    if (!EXT_OK.has(ext)) return 'Định dạng video không hỗ trợ';
    mkdirSync(this.tmpDir, { recursive: true });
    const id = nanoid(10);
    const base = join(this.tmpDir, `${now}-${id}`);
    const rec: ActiveRecording = {
      id,
      since: now,
      ext,
      part: `${base}.${ext}.part`,
      log: `${base}.log.part`,
      nextSeq: 0,
      bytes: 0,
      lastChunk: now,
      seenLog: new Set(),
    };
    writeFileSync(rec.part, '');
    writeFileSync(rec.log, `Nhật ký buổi chơi — bắt đầu ghi ${stamp(now)}\n(mốc thời gian tính từ đầu video)\n\n`);
    this.active = rec;
    return rec;
  }

  /** Append chunk `seq` (chunks must arrive in order; a resent chunk already written is accepted). */
  append(id: string, seq: number, data: Buffer, now = Date.now()): string | null {
    const rec = this.active;
    if (!rec || rec.id !== id) return 'Không có bản ghi này';
    if (seq < rec.nextSeq) return null;
    if (seq !== rec.nextSeq) return `Thiếu đoạn ${rec.nextSeq}`;
    appendFileSync(rec.part, data);
    rec.nextSeq++;
    rec.bytes += data.length;
    rec.lastChunk = now;
    return null;
  }

  /** Copy roll-log entries that appeared since the last call into the session log. */
  captureLog(entries: RollLogEntry[]): void {
    const rec = this.active;
    if (!rec) return;
    const fresh = entries.filter((e) => e.ts >= rec.since && !rec.seenLog.has(e.id));
    if (!fresh.length) return;
    for (const e of fresh) rec.seenLog.add(e.id);
    appendFileSync(rec.log, fresh.map((e) => logLine(rec.since, e)).join(''));
  }

  /** Finish the active recording: move video + log into their own folder. Returns that folder. */
  stop(note = ''): { folder: string; bytes: number; ms: number } | null {
    const rec = this.active;
    if (!rec) return null;
    this.active = null;
    const ms = Math.max(0, rec.lastChunk - rec.since);
    const folder = this.finalise(rec.part, rec.log, rec.since, rec.ext, note);
    return { folder, bytes: rec.bytes, ms };
  }

  private finalise(part: string, log: string, since: number, ext: string, note: string): string {
    let folder = join(this.outDir, stamp(since));
    for (let n = 2; existsSync(folder); n++) folder = join(this.outDir, `${stamp(since)} (${n})`);
    mkdirSync(folder, { recursive: true });
    if (existsSync(part)) moveFile(part, join(folder, `buoi-choi${note}.${ext}`));
    if (existsSync(log)) moveFile(log, join(folder, 'nhat-ky.txt'));
    return folder;
  }

  /** Server start: finalise whatever a crash left in the temp folder (marked "-dang-do"). */
  recoverLeftovers(): string[] {
    if (!existsSync(this.tmpDir)) return [];
    const out: string[] = [];
    for (const f of readdirSync(this.tmpDir)) {
      const m = /^(\d+)-([\w-]+)\.(mp4|webm)\.part$/.exec(f);
      if (!m) continue;
      const part = join(this.tmpDir, f);
      const log = join(this.tmpDir, `${m[1]}-${m[2]}.log.part`);
      if (statSync(part).size === 0) {
        unlinkSync(part);
        if (existsSync(log)) unlinkSync(log);
        continue;
      }
      out.push(this.finalise(part, log, Number(m[1]), m[3], '-dang-do'));
    }
    return out;
  }
}

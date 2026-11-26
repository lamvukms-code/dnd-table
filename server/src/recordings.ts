import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
 *
 * Clean per-person audio ("double-ender"): while the DM records, every participant's own tab also
 * records their mic and uploads it as a separate track, stamped in SERVER time (the client measures
 * its clock offset). Tracks land in `<folder>/tracks/` with `tracks.json` (start / end times), from
 * which `mix.ts` builds a denoised, levelled mix and muxes it with the video.
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

export interface Track {
  id: string;
  recordingId: string;
  /** Recording start (server ms) — groups the track with its video. */
  since: number;
  participantId: string;
  /** Label for the file name and the manifest (character / player name). */
  label: string;
  ext: string;
  part: string;
  /** Server time of the track's first sample (client-measured offset applied). */
  startMs: number;
  /** Server time covered by the last chunk (updated per chunk; the final value at stop). */
  endMs: number;
  nextSeq: number;
  bytes: number;
  lastChunk: number;
  closed: boolean;
}

/** One entry of `tracks.json`. */
export interface TrackInfo {
  file: string;
  participantId: string;
  label: string;
  /** Server ms. */
  startMs: number;
  endMs: number;
  bytes: number;
}

export interface TracksManifest {
  /** Server ms when the video started. */
  since: number;
  video?: string;
  tracks: TrackInfo[];
}

/** A finished video whose tracks may still be uploading their last chunks. */
interface Closing {
  recordingId: string;
  since: number;
  folder: string;
  video?: string;
  deadline: number;
}

const EXT_OK = new Set(['mp4', 'webm']);
const TRACK_EXT_OK = new Set(['webm', 'ogg', 'mp4', 'm4a']);
/** How long a stopped recording waits for its tracks' last chunks before it is assembled anyway. */
export const TRACK_GRACE_MS = 60_000;

export function stamp(ts: number): string {
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

const safeName = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || 'nguoi-choi';

function logLine(since: number, e: RollLogEntry): string {
  const roll = e.result?.notation ? ` → ${e.result.total}` : '';
  const who = e.actorId === 'system' ? '' : `${e.actorName}: `;
  return `${formatElapsed(e.ts - since).padStart(8)}  ${who}${e.label}${roll}${e.private ? '  (DM, ẩn)' : ''}\n`;
}

export class Recordings {
  active: ActiveRecording | null = null;
  private tracks = new Map<string, Track>();
  private closing: Closing[] = [];

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

  /**
   * Finish the active recording: move video + log into their own folder now. Its per-person tracks
   * follow once they are all closed (or after the grace period) — see `takeReady`.
   */
  stop(note = '', now = Date.now()): { folder: string; bytes: number; ms: number } | null {
    const rec = this.active;
    if (!rec) return null;
    this.active = null;
    const ms = Math.max(0, rec.lastChunk - rec.since);
    const folder = this.newFolder(rec.since);
    let video: string | undefined = `buoi-choi${note}.${rec.ext}`;
    if (rec.bytes === 0) {
      // no picture ever arrived (capture failed): keep the tracks, drop the empty file
      if (existsSync(rec.part)) unlinkSync(rec.part);
      video = undefined;
    } else if (existsSync(rec.part)) moveFile(rec.part, join(folder, video));
    if (existsSync(rec.log)) moveFile(rec.log, join(folder, 'nhat-ky.txt'));
    this.closing.push({ recordingId: rec.id, since: rec.since, folder, video, deadline: now + TRACK_GRACE_MS });
    return { folder, bytes: rec.bytes, ms };
  }

  private newFolder(since: number): string {
    let folder = join(this.outDir, stamp(since));
    for (let n = 2; existsSync(folder); n++) folder = join(this.outDir, `${stamp(since)} (${n})`);
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  // --- per-person tracks ------------------------------------------------------------------------

  /** A participant's tab starts recording its mic (only while the DM is recording). */
  trackStart(participantId: string, label: string, ext: string, startMs: number, now = Date.now()): Track | string {
    const rec = this.active;
    if (!rec) return 'DM không còn ghi hình';
    if (!TRACK_EXT_OK.has(ext)) return 'Định dạng tiếng không hỗ trợ';
    // a clock that is way off would put the track minutes away from the video: trust the server then
    const start = Number.isFinite(startMs) && Math.abs(startMs - now) < 30_000 ? startMs : now;
    const id = nanoid(10);
    const t: Track = {
      id,
      recordingId: rec.id,
      since: rec.since,
      participantId,
      label: safeName(label),
      ext,
      part: join(this.tmpDir, `${rec.since}-${rec.id}.track-${id}.${ext}.part`),
      startMs: start,
      endMs: start,
      nextSeq: 0,
      bytes: 0,
      lastChunk: now,
      closed: false,
    };
    writeFileSync(t.part, '');
    this.saveMeta(t);
    this.tracks.set(id, t);
    return t;
  }

  /** Is this track still accepting data (its recording is live or waiting for the last chunks)? */
  private trackOpen(t: Track): boolean {
    return !t.closed && (this.active?.id === t.recordingId || this.closing.some((c) => c.recordingId === t.recordingId));
  }

  trackAppend(id: string, participantId: string, seq: number, data: Buffer, endMs: number, now = Date.now()): string | null {
    const t = this.tracks.get(id);
    if (!t || t.participantId !== participantId || !this.trackOpen(t)) return 'Không có track này';
    if (seq < t.nextSeq) return null;
    if (seq !== t.nextSeq) return `Thiếu đoạn ${t.nextSeq}`;
    appendFileSync(t.part, data);
    t.nextSeq++;
    t.bytes += data.length;
    t.lastChunk = now;
    if (Number.isFinite(endMs) && endMs > t.endMs && Math.abs(endMs - now) < 30_000) t.endMs = endMs;
    this.saveMeta(t);
    return null;
  }

  trackStop(id: string, participantId: string, endMs: number, now = Date.now()): string | null {
    const t = this.tracks.get(id);
    if (!t || t.participantId !== participantId) return 'Không có track này';
    if (Number.isFinite(endMs) && endMs > t.endMs && Math.abs(endMs - now) < 30_000) t.endMs = endMs;
    t.closed = true;
    return null;
  }

  /** Who / when of a track, next to its `.part`, so a crash keeps the name and the timing. */
  private saveMeta(t: Track): void {
    const meta = { participantId: t.participantId, label: t.label, startMs: t.startMs, endMs: t.endMs };
    writeFileSync(`${t.part}.json`, JSON.stringify(meta));
  }

  /** Tracks of the live recording that went quiet (tab closed / crashed): close them. */
  closeStalled(now = Date.now(), quietMs = 90_000): void {
    for (const t of this.tracks.values()) if (!t.closed && now - t.lastChunk > quietMs) t.closed = true;
  }

  /**
   * Stopped recordings whose tracks are all closed (or whose grace period ran out): their tracks
   * are moved into `<folder>/tracks/` with `tracks.json`. Returns the folders ready to be mixed.
   */
  takeReady(now = Date.now()): { folder: string; manifest: TracksManifest }[] {
    const ready: { folder: string; manifest: TracksManifest }[] = [];
    this.closing = this.closing.filter((c) => {
      const mine = [...this.tracks.values()].filter((t) => t.recordingId === c.recordingId);
      if (now < c.deadline && mine.some((t) => !t.closed)) return true;
      ready.push({ folder: c.folder, manifest: this.collect(c.folder, c.since, c.video, mine) });
      return false;
    });
    return ready;
  }

  private collect(folder: string, since: number, video: string | undefined, mine: Track[]): TracksManifest {
    const manifest: TracksManifest = { since, video, tracks: [] };
    const used = mine.filter((t) => t.bytes > 0 && existsSync(t.part)).sort((a, b) => a.startMs - b.startMs);
    if (used.length) mkdirSync(join(folder, 'tracks'), { recursive: true });
    used.forEach((t, i) => {
      const file = `${String(i + 1).padStart(2, '0')}-${t.label}.${t.ext}`;
      moveFile(t.part, join(folder, 'tracks', file));
      manifest.tracks.push({ file, participantId: t.participantId, label: t.label, startMs: t.startMs, endMs: t.endMs, bytes: t.bytes });
    });
    for (const t of mine) {
      if (existsSync(t.part)) unlinkSync(t.part); // empty tracks
      if (existsSync(`${t.part}.json`)) unlinkSync(`${t.part}.json`);
      this.tracks.delete(t.id);
    }
    if (manifest.tracks.length) writeFileSync(join(folder, 'tracks', 'tracks.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  }

  /** Server start: finalise whatever a crash left in the temp folder (marked "-dang-do"). */
  recoverLeftovers(): { folder: string; manifest: TracksManifest }[] {
    if (!existsSync(this.tmpDir)) return [];
    const out: { folder: string; manifest: TracksManifest }[] = [];
    const files = readdirSync(this.tmpDir);
    const groups = new Map<string, { since: number; video?: string; log?: string; tracks: string[] }>();
    const group = (since: string, id: string) => {
      const k = `${since}-${id}`;
      if (!groups.has(k)) groups.set(k, { since: Number(since), tracks: [] });
      return groups.get(k)!;
    };
    for (const f of files) {
      let m = /^(\d+)-([\w-]+)\.(mp4|webm)\.part$/.exec(f);
      if (m) group(m[1], m[2]).video = f;
      m = /^(\d+)-([\w-]+)\.log\.part$/.exec(f);
      if (m) group(m[1], m[2]).log = f;
      m = /^(\d+)-([\w-]+)\.track-[\w-]+\.\w+\.part$/.exec(f);
      if (m) group(m[1], m[2]).tracks.push(f);
    }
    for (const g of groups.values()) {
      const parts = [g.video, ...g.tracks].filter((f): f is string => !!f && statSync(join(this.tmpDir, f)).size > 0);
      if (!parts.length) {
        for (const f of [g.video, g.log, ...g.tracks, ...g.tracks.map((t) => `${t}.json`)]) if (f && existsSync(join(this.tmpDir, f))) unlinkSync(join(this.tmpDir, f));
        continue;
      }
      const folder = this.newFolder(g.since);
      let video: string | undefined;
      if (g.video && statSync(join(this.tmpDir, g.video)).size > 0) {
        video = `buoi-choi-dang-do.${/\.(mp4|webm)\.part$/.exec(g.video)![1]}`;
        moveFile(join(this.tmpDir, g.video), join(folder, video));
      } else if (g.video) unlinkSync(join(this.tmpDir, g.video));
      if (g.log) moveFile(join(this.tmpDir, g.log), join(folder, 'nhat-ky.txt'));
      // who / when from the track's side file; without it: recording start, unknown end (no tempo fix)
      const tracks: Track[] = g.tracks.map((f, i) => {
        const ext = /\.(\w+)\.part$/.exec(f)![1];
        let meta: { participantId?: string; label?: string; startMs?: number; endMs?: number } = {};
        try {
          meta = JSON.parse(readFileSync(join(this.tmpDir, `${f}.json`), 'utf8'));
        } catch {
          /* no side file */
        }
        return {
          id: `lost${i}`,
          recordingId: '',
          since: g.since,
          participantId: meta.participantId ?? '',
          label: meta.label ?? `track-${i + 1}`,
          ext,
          part: join(this.tmpDir, f),
          startMs: meta.startMs ?? g.since,
          endMs: meta.endMs ?? g.since,
          nextSeq: 0,
          bytes: statSync(join(this.tmpDir, f)).size,
          lastChunk: 0,
          closed: true,
        };
      });
      out.push({ folder, manifest: this.collect(folder, g.since, video, tracks) });
    }
    return out;
  }
}

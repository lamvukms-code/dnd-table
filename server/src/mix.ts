import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TracksManifest } from './recordings.js';

/**
 * Build the "clean" version of a recorded session from its per-person tracks (see recordings.ts):
 *  - each track is put at its place on the video's timeline (start time in server ms),
 *  - stretched by a hair if that browser's audio clock ran fast / slow against the server clock
 *    (sound cards drift tens of ppm: ~1 s over a 4-hour session),
 *  - cleaned (high-pass for rumble, FFT denoiser for fans / hiss, then levelled so quiet and loud
 *    speakers sit together),
 *  - mixed, limited, and muxed with the original video (copied, not re-encoded):
 *    `buoi-choi-ban-dung.mp4` + an audio-only `tieng-sach.m4a` for editing.
 * The raw tracks stay untouched, so the mix can be redone with other settings (`npm run mix`).
 */

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/** Per-track filter chain (exported for tests and for tuning). */
export const CLEAN_FILTER = 'highpass=f=80,afftdn=nr=12:nf=-45:tn=1,dynaudnorm=f=300:g=15:p=0.9:m=8';

/** Tempo factor that maps a track's real length onto the wall-clock time it covered, or null. */
export function tempoFix(fileSec: number, startMs: number, endMs: number): number | null {
  const wall = (endMs - startMs) / 1000;
  if (!(fileSec > 30) || !(wall > 30)) return null; // too short to judge, or unknown end
  const r = fileSec / wall;
  if (r < 0.98 || r > 1.02) return null; // not clock drift: a gap or bad data, leave it alone
  return Math.abs(r - 1) < 0.00002 ? null : r; // under 20 ppm (~0.3 s in 4 h): not worth a resample
}

export function buildMixArgs(folder: string, m: TracksManifest, durations: number[], videoSec = 0): string[] {
  const args = ['-y', '-hide_banner', '-nostats'];
  const hasVideo = !!m.video && existsSync(join(folder, m.video));
  if (hasVideo) args.push('-i', join(folder, m.video!));
  const first = hasVideo ? 1 : 0;
  m.tracks.forEach((t) => args.push('-i', join(folder, 'tracks', t.file)));
  const chains = m.tracks.map((t, i) => {
    const f: string[] = ['aresample=48000', 'aformat=channel_layouts=mono'];
    const tempo = tempoFix(durations[i] ?? 0, t.startMs, t.endMs);
    if (tempo) f.push(`atempo=${tempo.toFixed(6)}`);
    const offset = t.startMs - m.since;
    if (offset < 0) f.push(`atrim=start=${(-offset / 1000).toFixed(3)}`, 'asetpts=PTS-STARTPTS');
    f.push(CLEAN_FILTER);
    if (offset > 0) f.push(`adelay=${Math.round(offset)}:all=1`);
    return `[${first + i}:a]${f.join(',')}[t${i}]`;
  });
  const inputs = m.tracks.map((_, i) => `[t${i}]`).join('');
  const mix = `${inputs}amix=inputs=${m.tracks.length}:normalize=0:dropout_transition=0,alimiter=limit=0.9,pan=stereo|c0=c0|c1=c0,asplit=2[mv][ma]`;
  const graph = [...chains, mix].join(';');
  args.push('-filter_complex', graph);
  if (hasVideo) {
    args.push('-map', '0:v', '-map', '[mv]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
    // keep the video's own length (a track that ran on after the video stopped is cut there)
    if (videoSec > 0) args.push('-t', videoSec.toFixed(3));
    args.push(join(folder, 'buoi-choi-ban-dung.mp4'));
  } else {
    args.push('-map', '[mv]', '-f', 'null', '-');
  }
  args.push('-map', '[ma]', '-c:a', 'aac', '-b:a', '192k', join(folder, 'tieng-sach.m4a'));
  return args;
}

function run(cmd: string, args: string[]): Promise<{ code: number; err: string }> {
  return new Promise((res) => {
    let err = '';
    let p;
    try {
      p = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      res({ code: -1, err: String(e) });
      return;
    }
    p.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on('error', (e) => res({ code: -1, err: String(e) }));
    p.on('close', (code) => res({ code: code ?? -1, err }));
  });
}

/** Real length of a media file in seconds (MediaRecorder files carry no duration header: remux to null). */
export async function mediaSeconds(file: string): Promise<number> {
  const { err } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-c', 'copy', '-f', 'null', '-']);
  const times = [...err.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = times[times.length - 1];
  if (last) return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
}

/** Mix a session folder's tracks; writes `tracks/mix.log`. Null when there is nothing to mix. */
export async function mixSession(folder: string): Promise<{ ok: boolean; out?: string; note: string } | null> {
  const mf = join(folder, 'tracks', 'tracks.json');
  if (!existsSync(mf)) return null;
  const m = JSON.parse(readFileSync(mf, 'utf8')) as TracksManifest;
  if (!m.tracks.length) return null;
  const durations = await Promise.all(m.tracks.map((t) => mediaSeconds(join(folder, 'tracks', t.file))));
  const videoSec = m.video && existsSync(join(folder, m.video)) ? await mediaSeconds(join(folder, m.video)) : 0;
  const args = buildMixArgs(folder, m, durations, videoSec);
  const t0 = Date.now();
  const { code, err } = await run(FFMPEG, args);
  const lines = [
    `Dựng tiếng sạch — ${new Date().toISOString()}`,
    `ffmpeg ${args.map((a) => (/\s|;|\|/.test(a) ? `"${a}"` : a)).join(' ')}`,
    `Độ dài track (giây): ${m.tracks.map((t, i) => `${t.file}=${durations[i].toFixed(1)}`).join(', ')}`,
    `Kết quả: ${code === 0 ? 'OK' : `lỗi (mã ${code})`} sau ${((Date.now() - t0) / 1000).toFixed(0)} giây`,
    '',
    err.slice(-6000),
  ];
  writeFileSync(join(folder, 'tracks', 'mix.log'), lines.join('\n'));
  if (code !== 0) {
    const missing = code === -1 && /ENOENT/.test(err);
    return { ok: false, note: missing ? 'Không tìm thấy ffmpeg (cài ffmpeg hoặc đặt FFMPEG_PATH)' : 'ffmpeg báo lỗi, xem tracks/mix.log' };
  }
  const out = m.video ? join(folder, 'buoi-choi-ban-dung.mp4') : join(folder, 'tieng-sach.m4a');
  return { ok: true, out, note: `${m.tracks.length} track` };
}

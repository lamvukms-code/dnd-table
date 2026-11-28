import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Speech-to-text of a recorded session (after its clean mix): runs `tools/transcribe.py`
 * (faster-whisper, on this machine — nothing is sent anywhere) and leaves `loi-thoai.md / .srt /
 * .json` in the session folder, on the same clock as `nhat-ky.txt`. Meant as the script for
 * whoever (or whatever agent) edits the video afterwards.
 *
 * Python: WHISPER_PYTHON, else the repo's `.whisper` venv if present, else `python`.
 * TRANSCRIBE=off turns the automatic run off (`npm run transcribe` still works).
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'tools', 'transcribe.py');
const VENV_PY = join(here, '..', '..', '.whisper', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

export const transcribeEnabled = () => (process.env.TRANSCRIBE ?? 'on').toLowerCase() !== 'off';

export function whisperPython(): string {
  return process.env.WHISPER_PYTHON || (existsSync(VENV_PY) ? VENV_PY : 'python');
}

export interface TranscribeResult {
  ok: boolean;
  note: string;
}

/** Transcribe one session folder; writes `loi-thoai.log` with the tool's output. */
export function transcribeSession(folder: string): Promise<TranscribeResult> {
  return new Promise((resolve) => {
    let out = '';
    const keep = (d: Buffer) => {
      out += d.toString('utf8');
      if (out.length > 200_000) out = out.slice(-100_000);
    };
    const done = (code: number) => {
      try {
        writeFileSync(join(folder, 'loi-thoai.log'), `Chép lời — ${new Date().toISOString()} — mã ${code}\n\n${out}`);
      } catch {
        /* folder gone */
      }
      if (code === 0) {
        const n = /XONG (\d+) câu/.exec(out)?.[1];
        resolve({ ok: true, note: n ? `${n} câu` : 'xong' });
      } else if (code === 3) resolve({ ok: false, note: 'máy chủ chưa cài faster-whisper' });
      else if (code === -1) resolve({ ok: false, note: 'không chạy được Python (đặt WHISPER_PYTHON)' });
      else resolve({ ok: false, note: 'lỗi, xem loi-thoai.log trong thư mục buổi quay' });
    };
    let p;
    try {
      p = spawn(whisperPython(), [SCRIPT, folder], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
      });
    } catch (e) {
      out = String(e);
      done(-1);
      return;
    }
    let failed = false;
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('error', (e) => {
      failed = true;
      out += String(e);
    });
    p.on('close', (code) => done(failed ? -1 : (code ?? -1)));
  });
}

/** One transcription at a time (they share the GPU), in arrival order. */
let queue: Promise<unknown> = Promise.resolve();
export function queueTranscribe(folder: string): Promise<TranscribeResult> {
  const job = queue.then(() => transcribeSession(folder));
  queue = job.catch(() => undefined);
  return job;
}

import { storedCredentials } from './store.js';
import { levelMeter, mediaBlockedReason } from './voice.js';

/**
 * Session recorder, run in the DM's recording window (`?stream=1`):
 *  - video: this window's own tab (Chrome "share this tab"), cropped to the stage element when the
 *    browser supports Region Capture, so the control bar is not in the video;
 *  - audio: the DM's mic + the computer's sound (Discord, the table's sound effects) — either from a
 *    loopback input (Stereo Mix / VB-Cable…) or from a screen share with "share system audio";
 *  - mixed in WebAudio, encoded by MediaRecorder (MP4 when the browser can, else WebM) and uploaded in
 *    4-second chunks to the server, which writes them to the recordings folder.
 */

export type SystemAudio = { kind: 'device'; deviceId: string } | { kind: 'screen' } | { kind: 'none' };

export interface RecorderSources {
  micDeviceId?: string;
  /** null = no mic */
  mic: boolean;
  system: SystemAudio;
}

/** A loopback input that carries the computer's own output (Discord), recognised by its name. */
export const LOOPBACK_RE = /stereo mix|what u hear|wave out|loopback|cable output|voicemeeter out|blackhole|monitor of/i;

// MP4 with Opus first: Chrome on Windows claims MP4 + AAC but then fails with an EncodingError as soon
// as there is sound (no AAC encoder), while H.264 + Opus in MP4 works and YouTube takes it.
const MIMES = [
  'video/mp4;codecs=avc1.640028,opus',
  'video/mp4;codecs=avc1,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/webm',
];

type Fmt = { mime: string; ext: 'mp4' | 'webm' };
const fmtOf = (mime: string): Fmt => ({ mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' });

export function pickMime(): Fmt | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  return mime ? fmtOf(mime) : null;
}

/** The first format that really encodes this stream (a short trial run: "supported" isn't always true). */
export async function workingFormat(stream: MediaStream): Promise<Fmt | null> {
  for (const mime of MIMES) {
    if (!MediaRecorder.isTypeSupported(mime)) continue;
    const ok = await new Promise<boolean>((res) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          if (mr.state !== 'inactive') mr.stop();
        } catch {
          /* already stopped */
        }
        res(v);
      };
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mr.ondataavailable = (e) => finish(e.data.size > 0);
      mr.onerror = () => finish(false);
      const timer = setTimeout(() => finish(false), 2500);
      try {
        mr.start(300);
      } catch {
        finish(false);
      }
    });
    if (ok) return fmtOf(mime);
  }
  return null;
}

function authHeaders(): Record<string, string> {
  const c = storedCredentials();
  return { 'x-participant-id': c.participantId ?? '', 'x-participant-secret': c.secret ?? '' };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}

export interface RecorderEvents {
  onLevel?: (src: 'mic' | 'system', db: number) => void;
  onStatus?: (s: { uploadedMb: number; pending: number; error?: string }) => void;
  /** The capture ended on its own (the DM pressed "stop sharing", the window was closed…). */
  onEnded?: () => void;
}

type DisplayMediaOpts = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
};

/** Step 1 when the computer's sound comes from a screen share: must be its own click (a browser rule). */
export async function captureSystemAudioFromScreen(): Promise<MediaStream> {
  const blocked = mediaBlockedReason();
  if (blocked) throw new Error(blocked);
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  } as DisplayMediaOpts);
  s.getVideoTracks().forEach((t) => t.stop()); // only the sound is wanted
  if (!s.getAudioTracks().length) {
    throw new Error('Chưa có âm thanh: khi chọn màn hình nhớ tick "Chia sẻ âm thanh hệ thống"');
  }
  return s;
}

export class SessionRecorder {
  private streams: MediaStream[] = [];
  private ctx: AudioContext | null = null;
  private meters: (() => void)[] = [];
  private rec: MediaRecorder | null = null;
  private id = '';
  private seq = 0;
  private queue: Blob[] = [];
  private uploading = false;
  private uploadedBytes = 0;
  private lastError: string | undefined;
  private drained: (() => void) | null = null;
  since = 0;
  folder = '';

  constructor(private readonly events: RecorderEvents = {}) {}

  /** Start: capture this tab (cropped to `stage`), mix the audio, begin uploading. */
  async start(stage: HTMLElement, sources: RecorderSources, systemStream?: MediaStream): Promise<void> {
    const blocked = mediaBlockedReason();
    if (blocked) throw new Error(blocked);
    if (!pickMime()) throw new Error('Trình duyệt này không ghi được video (dùng Chrome hoặc Edge bản mới)');
    try {
      const view = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
      } as DisplayMediaOpts);
      this.streams.push(view);
      const video = view.getVideoTracks()[0];
      const Crop = (window as unknown as { CropTarget?: { fromElement(el: Element): Promise<unknown> } }).CropTarget;
      const cropTo = (video as unknown as { cropTo?: (t: unknown) => Promise<void> }).cropTo;
      if (Crop && cropTo) {
        try {
          await cropTo.call(video, await Crop.fromElement(stage));
        } catch {
          /* another tab was picked: keep the whole picture */
        }
      }
      video.addEventListener('ended', () => this.events.onEnded?.());

      const ctx = new AudioContext({ sampleRate: 48000 });
      this.ctx = ctx;
      const dest = ctx.createMediaStreamDestination();
      const addAudio = async (s: MediaStream, src: 'mic' | 'system') => {
        this.streams.push(s);
        ctx.createMediaStreamSource(s).connect(dest);
        this.meters.push(await levelMeter(ctx, s, (db) => this.events.onLevel?.(src, db)));
      };
      if (sources.mic) {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: sources.micDeviceId ? { ideal: sources.micDeviceId } : undefined, echoCancellation: true, noiseSuppression: true },
        });
        await addAudio(mic, 'mic');
      }
      if (sources.system.kind === 'device') {
        const sys = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: sources.system.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        await addAudio(sys, 'system');
      } else if (sources.system.kind === 'screen' && systemStream) {
        await addAudio(systemStream, 'system');
      }
      if (ctx.state === 'suspended') await ctx.resume();

      const mixed = new MediaStream([video, ...dest.stream.getAudioTracks()]);
      const fmt = await workingFormat(mixed);
      if (!fmt) throw new Error('Trình duyệt không mã hoá được video này (thử Chrome / Edge bản mới)');
      const started = await postJson<{ id: string; since: number }>('/recordings/start', { ext: fmt.ext });
      this.id = started.id;
      this.since = started.since;
      const rec = new MediaRecorder(mixed, { mimeType: fmt.mime, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 160_000 });
      this.rec = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          this.queue.push(e.data);
          void this.pump();
        }
      };
      rec.start(4000);
    } catch (err) {
      this.release();
      throw err;
    }
  }

  get recording(): boolean {
    return this.rec?.state === 'recording';
  }

  private report() {
    this.events.onStatus?.({ uploadedMb: this.uploadedBytes / 1e6, pending: this.queue.length, error: this.lastError });
  }

  /** Upload queued chunks one at a time, in order, retrying a failed one. */
  private async pump(): Promise<void> {
    if (this.uploading) return;
    this.uploading = true;
    while (this.queue.length) {
      const blob = this.queue[0];
      let ok = false;
      for (let attempt = 0; attempt < 8 && !ok; attempt++) {
        try {
          const r = await fetch(`/recordings/${this.id}/chunk?seq=${this.seq}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', ...authHeaders() },
            body: blob,
          });
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
          ok = true;
          this.lastError = undefined;
        } catch (err) {
          this.lastError = `Lỗi tải lên: ${(err as Error).message} — đang thử lại`;
          this.report();
          await new Promise((res) => setTimeout(res, Math.min(8000, 500 * 2 ** attempt)));
        }
      }
      if (!ok) {
        this.lastError = 'Không tải được video lên server. Kiểm tra server 8787 rồi quay lại.';
        this.report();
        break;
      }
      this.queue.shift();
      this.seq++;
      this.uploadedBytes += blob.size;
      this.report();
    }
    this.uploading = false;
    this.drained?.(); // also after giving up: stop() must not hang
  }

  /** Stop: flush the last chunk, wait for the uploads, close the file on the server. */
  async stop(): Promise<string> {
    const rec = this.rec;
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((res) => {
        rec.addEventListener('stop', () => res(), { once: true });
        rec.stop();
      });
    }
    if (this.queue.length || this.uploading) await new Promise<void>((res) => (this.drained = res));
    this.drained = null;
    this.release();
    if (!this.id) return '';
    const r = await postJson<{ folder?: string }>(`/recordings/${this.id}/stop`, {});
    this.folder = r.folder ?? '';
    this.id = '';
    return this.folder;
  }

  private release() {
    this.meters.forEach((m) => m());
    this.meters = [];
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

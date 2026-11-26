import { storedCredentials } from './store.js';
import { mediaBlockedReason } from './voice.js';

/**
 * Clean per-person audio: while the DM records, this tab records its own mic (no network in the way,
 * unlike the Discord audio the DM's recorder picks up) and uploads it as this person's track. Every
 * timestamp is in SERVER time — the clock offset is measured first — so the server can line the
 * tracks up with the video and with each other, and correct the sound card's clock drift.
 *
 * Captured lightly processed on purpose (echo cancellation on, so speakers don't bleed back in; noise
 * suppression and auto gain off): the noise is removed afterwards, per track, where it can be tuned.
 */

type Status = 'idle' | 'starting' | 'recording' | 'error';

const MIMES: { mime: string; ext: string }[] = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/mp4', ext: 'm4a' },
];

function headers(json = false): Record<string, string> {
  const c = storedCredentials();
  return {
    ...(json ? { 'content-type': 'application/json' } : { 'content-type': 'application/octet-stream' }),
    'x-participant-id': c.participantId ?? '',
    'x-participant-secret': c.secret ?? '',
  };
}

/** Offset (ms) to add to this browser's clock to get the server's: best of a few round trips. */
export async function measureServerOffset(samples = 5): Promise<number> {
  let best = { rtt: Infinity, offset: 0 };
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const r = await fetch('/recordings/time', { cache: 'no-store' });
    const t1 = performance.now();
    const { now } = (await r.json()) as { now: number };
    const rtt = t1 - t0;
    if (rtt < best.rtt) best = { rtt, offset: now - (performance.timeOrigin + (t0 + t1) / 2) };
  }
  return best.offset;
}

class MicTrack {
  status: Status = 'idle';
  error = '';
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private offset = 0;
  private id: string | null = null;
  private since = 0;
  private seq = 0;
  private queue: { blob: Blob; t: number }[] = [];
  private pumping = false;
  private lastT = 0;
  private listeners = new Set<() => void>();

  subscribe = (f: () => void): (() => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  private notify() {
    this.listeners.forEach((f) => f());
  }
  private serverNow(): number {
    return performance.timeOrigin + performance.now() + this.offset;
  }

  /** Start recording for the DM's recording that began at `since` (server ms). */
  async start(since: number, deviceId?: string): Promise<void> {
    if (this.status === 'starting' || (this.status === 'recording' && this.since === since)) return;
    await this.stop();
    this.since = since;
    this.status = 'starting';
    this.error = '';
    this.notify();
    try {
      const fmt = MIMES.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m.mime));
      if (!fmt) throw new Error('Trình duyệt không ghi được tiếng');
      const blocked = mediaBlockedReason();
      if (blocked) throw new Error(blocked);
      this.offset = await measureServerOffset();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { ideal: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      const rec = new MediaRecorder(this.stream, { mimeType: fmt.mime, audioBitsPerSecond: 96_000 });
      this.rec = rec;
      this.seq = 0;
      this.queue = [];
      const started = new Promise<number>((res) => rec.addEventListener('start', () => res(this.serverNow()), { once: true }));
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        this.lastT = this.serverNow();
        this.queue.push({ blob: e.data, t: this.lastT });
        void this.pump();
      };
      rec.start(5000);
      const startMs = await started;
      const r = await fetch('/recordings/track/start', { method: 'POST', headers: headers(true), body: JSON.stringify({ ext: fmt.ext, startMs }) });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error ?? `HTTP ${r.status}`);
      this.id = j.id;
      this.status = 'recording';
      void this.pump();
    } catch (err) {
      const e = err as Error;
      this.error = e.name === 'NotAllowedError' ? 'Trình duyệt chưa cho dùng mic' : e.message;
      this.release();
      this.status = 'error';
    }
    this.notify();
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.id) return;
    this.pumping = true;
    while (this.queue.length && this.id) {
      const { blob, t } = this.queue[0];
      let ok = false;
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        try {
          const r = await fetch(`/recordings/track/${this.id}/chunk?seq=${this.seq}&t=${Math.round(t)}`, { method: 'POST', headers: headers(), body: blob });
          if (r.status === 409) {
            // the recording is over on the server: nothing more to send
            this.queue = [];
            break;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          ok = true;
        } catch {
          await new Promise((res) => setTimeout(res, Math.min(8000, 500 * 2 ** attempt)));
        }
      }
      if (!ok) break;
      this.queue.shift();
      this.seq++;
    }
    this.pumping = false;
  }

  /** Stop: last chunk, uploads, close the track. */
  async stop(): Promise<void> {
    const rec = this.rec;
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((res) => {
        rec.addEventListener('stop', () => res(), { once: true });
        rec.stop();
      });
    }
    // let the queue drain (bounded: a dead server must not hold the tab)
    for (let i = 0; i < 40 && (this.queue.length || this.pumping); i++) {
      void this.pump();
      await new Promise((res) => setTimeout(res, 250));
    }
    const id = this.id;
    this.id = null;
    this.release();
    if (id) {
      await fetch(`/recordings/track/${id}/stop`, { method: 'POST', headers: headers(true), body: JSON.stringify({ endMs: Math.round(this.lastT) }) }).catch(
        () => undefined,
      );
    }
    if (this.status !== 'error') this.status = 'idle';
    this.notify();
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}

export const micTrack = new MicTrack();

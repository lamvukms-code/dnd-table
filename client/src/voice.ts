import { createVoiceGate } from '@dnd-table/shared';
import { useStore } from './store.js';

/**
 * "Who is talking" for the speaker cards. Voice itself goes through Discord; this only measures how
 * loud this person's own mic is (in an AudioWorklet, so it keeps working while the tab sits in the
 * background) and tells the table "talking / quiet". No audio leaves the browser.
 */

export interface VoiceSettings {
  enabled: boolean;
  /** Loudness (dBFS) above which you count as talking. */
  thresholdDb: number;
  deviceId?: string;
  /** While the DM records, also record my mic here for the clean per-person audio. */
  recordMic: boolean;
}

const KEY = 'dnd.voice';
const DEFAULTS: VoiceSettings = { enabled: false, thresholdDb: -48, recordMic: true };

export function loadVoiceSettings(): VoiceSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveVoiceSettings(v: VoiceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

// RMS of each ~21 ms block (1024 samples) in dBFS, posted to the main thread.
const WORKLET = `
class Level extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) this.sum += ch[i] * ch[i];
      this.n += ch.length;
      if (this.n >= 1024) {
        const rms = Math.sqrt(this.sum / this.n);
        this.port.postMessage(rms > 0 ? 20 * Math.log10(rms) : -100);
        this.sum = 0; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('dnd-level', Level);
`;

/** A live loudness meter on a media stream (used by the voice detector and the recording window). */
export async function levelMeter(ctx: AudioContext, stream: MediaStream, onDb: (db: number) => void): Promise<() => void> {
  if (!(ctx as AudioContext & { __dndLevel?: boolean }).__dndLevel) {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    (ctx as AudioContext & { __dndLevel?: boolean }).__dndLevel = true;
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'dnd-level');
  node.port.onmessage = (e) => onDb(e.data as number);
  src.connect(node);
  return () => {
    node.port.onmessage = null;
    src.disconnect();
    node.disconnect();
  };
}

let settings = loadVoiceSettings();
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let stopMeter: (() => void) | null = null;
const gate = createVoiceGate({ thresholdDb: settings.thresholdDb });
let lastDb = -100;
let status: 'off' | 'starting' | 'on' | 'error' = 'off';
let lastError = '';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export const voice = {
  get settings() {
    return settings;
  },
  get status() {
    return status;
  },
  get error() {
    return lastError;
  },
  /** Latest loudness reading (for the meter). */
  get db() {
    return lastDb;
  },
  get talking() {
    return gate.on;
  },
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  update(patch: Partial<VoiceSettings>) {
    const deviceChanged = patch.deviceId !== undefined && patch.deviceId !== settings.deviceId;
    settings = { ...settings, ...patch };
    saveVoiceSettings(settings);
    gate.setThreshold(settings.thresholdDb);
    if (patch.enabled === false) void stopVoice();
    else if (patch.enabled === true || (deviceChanged && status === 'on')) void startVoice();
    notify();
  },
};

function setTalking(on: boolean) {
  useStore.getState().send({ t: 'speaking', on });
  notify();
}

export async function startVoice(): Promise<void> {
  await stopVoice(false);
  status = 'starting';
  lastError = '';
  notify();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.deviceId ? { ideal: settings.deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
    ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      // autoplay policy: wait for the first click / key anywhere on the page
      const resume = () => void ctx?.resume();
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    }
    stopMeter = await levelMeter(ctx, stream, (db) => {
      lastDb = db;
      const change = gate.push(db, performance.now());
      if (change != null) setTalking(change);
    });
    status = 'on';
  } catch (err) {
    status = 'error';
    lastError = (err as Error).name === 'NotAllowedError' ? 'Trình duyệt chưa cho dùng mic' : (err as Error).message;
    await stopVoice(false);
    status = 'error';
  }
  notify();
}

export async function stopVoice(report = true): Promise<void> {
  stopMeter?.();
  stopMeter = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ctx) await ctx.close().catch(() => undefined);
  ctx = null;
  if (gate.on) {
    gate.reset();
    setTalking(false);
  }
  lastDb = -100;
  if (report) {
    status = 'off';
    notify();
  }
}

/** Mic inputs for the picker (labels only appear once mic permission was granted). */
export async function audioInputs(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

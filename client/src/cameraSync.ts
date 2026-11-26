/**
 * The recording window follows the DM's map camera: both windows run in the DM's browser, so the
 * DM screen posts where it is looking (centre point on the board, zoom, viewport size) on a
 * same-origin BroadcastChannel and the recording window frames the same area.
 */
export interface CameraView {
  /** Board-space point (unscaled px) at the viewport centre. */
  cx: number;
  cy: number;
  zoom: number;
  /** Viewport size of the sender, so a differently sized window can frame the same area. */
  w: number;
  h: number;
  sceneId: string;
}

const NAME = 'dnd-table-camera';
let channel: BroadcastChannel | null = null;
function ch(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(NAME);
  return channel;
}

let last = '';
export function postCamera(v: CameraView): void {
  const key = `${Math.round(v.cx)}|${Math.round(v.cy)}|${v.zoom.toFixed(3)}|${v.w}|${v.h}|${v.sceneId}`;
  if (key === last) return;
  last = key;
  ch()?.postMessage({ t: 'camera', v });
}

/** Ask the DM screen to send its camera now (the recording window just opened). */
export function requestCamera(): void {
  ch()?.postMessage({ t: 'ask' });
}

export function onCameraMessage(cb: (msg: { t: 'camera'; v: CameraView } | { t: 'ask' }) => void): () => void {
  const c = ch();
  if (!c) return () => undefined;
  const f = (e: MessageEvent) => cb(e.data);
  c.addEventListener('message', f);
  return () => c.removeEventListener('message', f);
}

export function forgetLastCamera(): void {
  last = '';
}

/** Recording window: whether it follows the DM screen's camera (the DM can pan it by hand instead). */
export const cameraFollow = { on: true };

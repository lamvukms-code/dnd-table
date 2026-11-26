import { useEffect, useState, useSyncExternalStore } from 'react';
import { formatElapsed } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { micTrack } from '../micTrack.js';
import { voice } from '../voice.js';

/** Open (or bring forward) the DM's recording window. */
export function openStreamWindow(): void {
  const w = window.open('/?stream=1', 'dnd-table-stream', 'popup,width=1600,height=960');
  w?.focus();
}

const NOTICE_KEY = 'dnd.recNoticeSeen';

/**
 * "● REC 12:34" for everyone at the table while the DM records (so nobody is recorded unknowingly),
 * and the switch for this tab's own clean mic track (see micTrack.ts): it records while the DM
 * records, unless this person turned "record my mic" off.
 */
export function RecBadge() {
  const rec = useStore((s) => s.room?.recording);
  const isDm = useStore((s) => s.isDm());
  const [now, setNow] = useState(Date.now());
  useSyncExternalStore(micTrack.subscribe, () => `${micTrack.status}|${micTrack.error}`);
  useSyncExternalStore(voice.subscribe, () => `${voice.settings.recordMic}|${voice.settings.deviceId}`);
  const recordMic = voice.settings.recordMic;
  const [seen, setSeen] = useState(() => {
    try {
      return Number(sessionStorage.getItem(NOTICE_KEY) ?? 0);
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (!rec) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [rec]);

  // record my mic exactly while the DM records (and I allow it)
  const since = rec?.since;
  useEffect(() => {
    if (since && recordMic) void micTrack.start(since, voice.settings.deviceId);
    else void micTrack.stop();
  }, [since, recordMic]);

  if (!rec) return null;
  const mic = micTrack.status;
  const micText = !recordMic ? 'mic: không ghi' : mic === 'recording' ? '🎙 đang ghi' : mic === 'starting' ? '🎙 …' : mic === 'error' ? '🎙 lỗi' : '';
  const dismiss = () => {
    setSeen(rec.since);
    try {
      sessionStorage.setItem(NOTICE_KEY, String(rec.since));
    } catch {
      /* storage blocked */
    }
  };
  return (
    <>
      <button
        className="rec-badge"
        title={
          (isDm ? 'Đang ghi hình — bấm để mở khung quay' : 'DM đang ghi hình buổi chơi') +
          (mic === 'error' ? `\nKhông ghi được mic của bạn: ${micTrack.error}` : '')
        }
        onClick={isDm ? openStreamWindow : dismiss}
      >
        ● REC {formatElapsed(now - rec.since)}
        {micText && <span className="rec-mic"> · {micText}</span>}
      </button>
      {!isDm && seen !== rec.since && (
        <div className="rec-notice hud-pill" role="status">
          <b>🔴 DM đang ghi hình buổi chơi.</b>
          {recordMic ? (
            <span>
              Mic của bạn được ghi riêng ngay tại máy này (không qua Discord) để video có tiếng rõ hơn. Chỉ ghi khi DM đang quay. Nên đeo tai nghe.
            </span>
          ) : (
            <span>Mic của bạn không được ghi riêng (chỉ có tiếng qua Discord trên máy DM).</span>
          )}
          {micTrack.status === 'error' && <span className="voice-err">⚠ {micTrack.error}</span>}
          <span className="rec-notice-btns">
            <button onClick={dismiss}>OK</button>
            {recordMic ? (
              <button onClick={() => voice.update({ recordMic: false })}>Không ghi mic của tôi</button>
            ) : (
              <button onClick={() => voice.update({ recordMic: true })}>Ghi mic của tôi</button>
            )}
          </span>
        </div>
      )}
    </>
  );
}

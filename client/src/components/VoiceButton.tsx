import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store.js';
import { audioInputs, startVoice, voice } from '../voice.js';

/** HUD 🎙 button: turn on "light my card when I talk", tune the sensitivity, stay anonymous on video. */
export function VoiceButton() {
  const [open, setOpen] = useState(false);
  useSyncExternalStore(voice.subscribe, () => `${voice.status}|${voice.talking}|${voice.settings.thresholdDb}|${voice.settings.deviceId}`);
  const me = useStore((s) => s.me());
  const send = useStore((s) => s.send);
  const ref = useRef<HTMLDivElement>(null);

  // remembered "on": start again after a reload (the mic permission is kept by the browser)
  useEffect(() => {
    if (voice.settings.enabled && voice.status === 'off') void startVoice();
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);

  const on = voice.status === 'on';
  return (
    <div className="voice-wrap" ref={ref}>
      <button
        className={`voice-btn ${on ? 'on' : ''} ${on && voice.talking ? 'talking' : ''} ${voice.status === 'error' ? 'err' : ''}`}
        title={on ? 'Đang báo khi bạn nói (khung của bạn sáng lên trên màn hình DM / video)' : 'Bật báo "đang nói" cho khung nhân vật'}
        onClick={() => setOpen((v) => !v)}
      >
        🎙
      </button>
      {open && <VoicePanel anon={!!me?.anon} setAnon={(anon) => send({ t: 'setAnon', anon })} />}
    </div>
  );
}

function VoicePanel({ anon, setAnon }: { anon: boolean; setAnon: (v: boolean) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [db, setDb] = useState(-100);
  useEffect(() => {
    void audioInputs().then(setDevices);
  }, [voice.status]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setDb(voice.db);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = voice.settings;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v + 80) / 70) * 100))}%`;
  return (
    <div className="voice-panel hud-pill">
      <label className="voice-row">
        <input type="checkbox" checked={s.enabled} onChange={(e) => voice.update({ enabled: e.target.checked })} />
        <b>Báo khi tôi đang nói</b>
      </label>
      <p className="voice-note">
        Tiếng vẫn đi qua Discord. Tab này chỉ đo mic to hay nhỏ để làm sáng khung nhân vật của bạn, không gửi tiếng đi đâu. Để tab
        bàn chơi mở (ở nền cũng được).
      </p>
      {voice.status === 'error' && <p className="voice-err">⚠ {voice.error}</p>}
      {s.enabled && (
        <>
          <div className="voice-meter" title="Mức mic hiện tại; vạch trắng = ngưỡng">
            <span className={`voice-level ${voice.talking ? 'talking' : ''}`} style={{ width: pct(db) }} />
            <span className="voice-thresh" style={{ left: pct(s.thresholdDb) }} />
          </div>
          <label className="voice-row">
            Độ nhạy
            <input
              type="range"
              min={-75}
              max={-20}
              step={1}
              value={s.thresholdDb}
              onChange={(e) => voice.update({ thresholdDb: Number(e.target.value) })}
              title="Kéo sang trái nếu khung không sáng khi bạn nói; sang phải nếu tiếng ồn nền làm nó sáng"
            />
          </label>
          {devices.length > 1 && (
            <label className="voice-row">
              Mic
              <select value={s.deviceId ?? ''} onChange={(e) => voice.update({ deviceId: e.target.value || undefined })}>
                <option value="">Mặc định</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Mic'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      <label className="voice-row">
        <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
        Ẩn tên thật của tôi trên khung (chỉ hiện tên nhân vật)
      </label>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { formatElapsed } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { cameraFollow } from '../cameraSync.js';
import { LOOPBACK_RE, SessionRecorder, captureSystemAudioFromScreen, pickMime, type SystemAudio } from '../recorder.js';
import { BattleMap } from './BattleMap.js';
import { InitiativeBar } from './InitiativeBar.js';
import { SpeakerStrip } from './SpeakerStrip.js';

const PREFS = 'dnd.recorderPrefs';
interface Prefs {
  mic: boolean;
  micDeviceId?: string;
  /** device id, 'screen' or 'none'; unset = pick a loopback device automatically */
  system?: string;
}
function loadPrefs(): Prefs {
  try {
    return { mic: true, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
  } catch {
    return { mic: true };
  }
}

/**
 * The DM's recording window (`?stream=1`): the map as PLAYERS see it (no hidden tokens, no DM
 * notes), framed like the DM screen, with the speaker cards along the bottom. The thin bar on top
 * holds the recording controls and is left out of the video.
 */
export function StreamView() {
  const room = useStore((s) => !!s.room);
  const error = useStore((s) => s.error);
  const status = useStore((s) => s.status);
  const stageRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem(PREFS, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [follow, setFollow] = useState(cameraFollow.on);
  const [screenAudio, setScreenAudio] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [recState, setRecState] = useState<{ since: number } | null>(null);
  const [upload, setUpload] = useState<{ uploadedMb: number; pending: number; error?: string }>({ uploadedMb: 0, pending: 0 });
  const [msg, setMsg] = useState<string>('');
  const [levels, setLevels] = useState({ mic: -100, system: -100 });
  const [now, setNow] = useState(Date.now());
  const recRef = useRef<SessionRecorder | null>(null);
  const levelRef = useRef({ mic: -100, system: -100 });

  useEffect(() => {
    document.title = '🎬 Khung quay — bàn D&D';
    // ask for the mic once so the device names show up in the pickers
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => undefined)
      .finally(() => void navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'audioinput'))));
  }, []);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setNow(Date.now());
      setLevels({ ...levelRef.current });
    }, 250);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!recState) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recState]);

  const loopback = devices.find((d) => LOOPBACK_RE.test(d.label));
  const systemChoice = prefs.system ?? (loopback ? loopback.deviceId : 'screen');
  const system: SystemAudio =
    systemChoice === 'none' ? { kind: 'none' } : systemChoice === 'screen' ? { kind: 'screen' } : { kind: 'device', deviceId: systemChoice };
  const needScreenStep = system.kind === 'screen' && !screenAudio?.active;

  async function grabScreenAudio() {
    setMsg('');
    try {
      const s = await captureSystemAudioFromScreen();
      s.getAudioTracks()[0]?.addEventListener('ended', () => setScreenAudio(null));
      setScreenAudio(s);
    } catch (err) {
      setMsg(`⚠ ${(err as Error).message}`);
    }
  }

  async function start() {
    if (!stageRef.current) return;
    setBusy(true);
    setMsg('');
    const rec = new SessionRecorder({
      onLevel: (src, db) => (levelRef.current[src] = db),
      onStatus: setUpload,
      onEnded: () => void stop(),
    });
    try {
      await rec.start(stageRef.current, { mic: prefs.mic, micDeviceId: prefs.micDeviceId, system }, screenAudio ?? undefined);
      recRef.current = rec;
      setRecState({ since: rec.since });
      setUpload({ uploadedMb: 0, pending: 0 });
    } catch (err) {
      const e = err as Error;
      setMsg(`⚠ ${e.name === 'NotAllowedError' ? 'Chưa cho phép chia sẻ tab / mic' : e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setBusy(true);
    setMsg('Đang lưu phần cuối…');
    try {
      const folder = await rec.stop();
      setMsg(folder ? `✔ Đã lưu vào: ${folder}` : '✔ Đã dừng');
    } catch (err) {
      setMsg(`⚠ ${(err as Error).message}`);
    } finally {
      setRecState(null);
      setBusy(false);
      screenAudio?.getTracks().forEach((t) => t.stop());
      setScreenAudio(null);
      levelRef.current = { mic: -100, system: -100 };
    }
  }

  const meter = (db: number) => (
    <span className="rec-meter">
      <span style={{ width: `${Math.max(0, Math.min(100, ((db + 70) / 60) * 100))}%` }} />
    </span>
  );
  const fmt = pickMime();
  const note = upload.error || msg || (status !== 'open' ? 'Đang nối lại…' : error || '');

  return (
    <div className="stream-root">
      <div className="stream-bar">
        {recState ? (
          <>
            <span className="rec-live">● REC {formatElapsed(now - recState.since)}</span>
            <span className="rec-dim">
              {upload.uploadedMb.toFixed(0)} MB đã lưu{upload.pending > 1 ? ` · chờ tải ${upload.pending}` : ''}
            </span>
            {prefs.mic && <span title="Mic của DM">🎙{meter(levels.mic)}</span>}
            {system.kind !== 'none' && <span title="Tiếng máy tính (Discord)">🔊{meter(levels.system)}</span>}
            <button className="rec-stop" disabled={busy} onClick={() => void stop()}>
              ⏹ Dừng quay
            </button>
          </>
        ) : (
          <>
            <label title="Mic của DM (tiếng của DM không có trong tiếng Discord trên máy này)">
              <input type="checkbox" checked={prefs.mic} onChange={(e) => setPrefs({ mic: e.target.checked })} /> 🎙
              <select value={prefs.micDeviceId ?? ''} disabled={!prefs.mic} onChange={(e) => setPrefs({ micDeviceId: e.target.value || undefined })}>
                <option value="">Mic mặc định</option>
                {devices
                  .filter((d) => !LOOPBACK_RE.test(d.label))
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Mic'}
                    </option>
                  ))}
              </select>
            </label>
            <label title="Tiếng người chơi từ Discord và âm thanh của bàn">
              🔊
              <select value={systemChoice} onChange={(e) => setPrefs({ system: e.target.value })}>
                {devices
                  .filter((d) => LOOPBACK_RE.test(d.label))
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                <option value="screen">Chia sẻ âm thanh màn hình</option>
                <option value="none">Không thu tiếng máy</option>
              </select>
            </label>
            {system.kind === 'screen' &&
              (screenAudio?.active ? (
                <span className="rec-ok">✔ Đã có tiếng máy</span>
              ) : (
                <button onClick={() => void grabScreenAudio()} title='Chọn "Toàn bộ màn hình" và tick "Chia sẻ âm thanh hệ thống"'>
                  ① Lấy tiếng máy
                </button>
              ))}
            <button className="rec-start" disabled={busy || !room || needScreenStep || !fmt} onClick={() => void start()}>
              {system.kind === 'screen' ? '② ' : ''}⏺ Bắt đầu quay
            </button>
          </>
        )}
        <label title="Khung quay đi theo góc nhìn bản đồ trên màn hình DM">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => {
              cameraFollow.on = e.target.checked;
              setFollow(e.target.checked);
            }}
          />{' '}
          Bám camera DM
        </label>
        {note && <span className="rec-msg">{note}</span>}
        {!recState && system.kind === 'screen' && !loopback && (
          <span className="rec-dim" title="Windows: Cài đặt → Âm thanh → Thiết bị ghi → bật Stereo Mix; hoặc cài VB-Cable">
            Mẹo: bật “Stereo Mix” trong Windows để chỉ cần bấm một nút
          </span>
        )}
      </div>
      <div className="stream-stage" ref={stageRef}>
        {room ? (
          <>
            <BattleMap />
            <div className="stream-top">
              <InitiativeBar />
            </div>
            <SpeakerStrip variant="stream" />
          </>
        ) : (
          <div className="stream-wait">{error ?? 'Đang kết nối bàn chơi…'}</div>
        )}
      </div>
    </div>
  );
}

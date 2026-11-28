import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { getSfxVolume, setSfxVolume } from '../sound.js';
import { getDiceVolume, setDiceVolume, setVfxEnabled, vfxEnabled } from '../sfx.js';
import { nativeDiceEnabled, setNativeDiceEnabled } from '../dice3d/hold.js';
import { diceSkinPref, loadSkins, setDiceSkinPref, skinSets, type LoadedSkin, type SkinSet } from '../dice3d/skins.js';
import { createRoom, listRooms, type DddiceRoom } from '../dddice.js';
import { DddiceAccount } from './DddiceAccount.js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const dddice = useStore((s) => s.room!.dddice);
  const participants = useStore((s) => s.room!.participants);
  const meId = useStore((s) => s.participantId);
  const setRole = useStore((s) => s.setRole);
  const removeParticipant = useStore((s) => s.removeParticipant);
  const dddiceKey = useStore((s) => s.dddiceKey);
  const setDddiceKey = useStore((s) => s.setDddiceKey);
  const connected = useStore((s) => s.dddiceConnected);
  const active = useStore((s) => s.dddiceActive());

  const [keyInput, setKeyInput] = useState(dddiceKey ?? '');
  const [slugInput, setSlugInput] = useState(dddice.roomSlug ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rooms, setRooms] = useState<DddiceRoom[] | null>(null);

  // DM: rooms this key can already use, to pick the table's shared room from.
  useEffect(() => {
    const key = dddiceKey?.trim();
    if (!key || !isDm) {
      setRooms(null);
      return;
    }
    let cancelled = false;
    listRooms(key)
      .then((r) => !cancelled && setRooms(r))
      .catch(() => !cancelled && setRooms([]));
    return () => {
      cancelled = true;
    };
  }, [dddiceKey, isDm]);

  function patchDddice(patch: Record<string, unknown>) {
    send({ t: 'updateDddice', patch });
  }

  async function makeRoom() {
    if (!keyInput.trim()) {
      setNote('Cần API key trước khi tạo room.');
      return;
    }
    setBusy('room');
    setNote(null);
    try {
      const slug = await createRoom(keyInput.trim());
      setSlugInput(slug);
      patchDddice({ roomSlug: slug });
      setNote(`Đã tạo room dddice: ${slug}`);
    } catch (e) {
      setNote(`Lỗi tạo room: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Cài đặt</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        <SoundSection />

        <section className="settings-section">
          <h3>Người trong phòng</h3>
          <p className="hint">
            DM được nhận ra qua email đăng nhập hoặc khi mở trên máy chủ, và có thể phân quyền lại. Người
            chơi chỉ xem và chỉnh character sheet của mình. Người đã thoát có thể xóa khỏi danh sách (sheet
            của họ vẫn giữ; đăng nhập lại là vào đúng chỗ cũ).
          </p>
          <ul className="participant-list">
            {participants.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span className="p-dot" style={{ background: p.color }} />
                <span className="p-name">
                  {p.name}
                  {p.id === meId ? ' (bạn)' : ''}
                </span>
                <span className={`badge ${p.role === 'dm' ? 'ok' : 'off'}`}>
                  {p.role === 'dm' ? 'DM' : 'Người chơi'}
                </span>
                {isDm && p.id !== meId && (
                  <button
                    className="link"
                    onClick={() => setRole(p.id, p.role === 'dm' ? 'player' : 'dm')}
                  >
                    {p.role === 'dm' ? '→ người chơi' : '→ DM'}
                  </button>
                )}
                {isDm && p.id !== meId && !p.connected && (
                  <button
                    className="link danger"
                    title="Xóa khỏi danh sách (người đã thoát)"
                    onClick={() => {
                      if (confirm(`Xóa "${p.name}" khỏi danh sách người trong phòng?`)) removeParticipant(p.id);
                    }}
                  >
                    Xóa
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-section">
          <h3>
            Xúc xắc 3D (dddice){' '}
            <span className={`badge ${active && connected ? 'ok' : 'off'}`}>
              {active && connected ? 'đang chạy' : active ? 'đang kết nối…' : 'tắt'}
            </span>
          </h3>
          <p className="hint">
            Khi DM bật và chọn phòng chung, mỗi người tự kết nối tài khoản dddice của mình (hoặc vào
            dạng khách) và tung bằng skin trong dice box của chính họ; ai chưa kết nối thì tung bằng
            server. Xúc xắc 3D hiện trên battle map cho cả bàn. Kết quả dddice là kết quả chính thức;
            server vẫn tự so AC và tính chí mạng.
          </p>

          <label className="row">
            <span>Bật dddice {isDm ? '' : '(chỉ DM)'}</span>
            <input
              type="checkbox"
              disabled={!isDm}
              checked={dddice.enabled}
              onChange={(e) => patchDddice({ enabled: e.target.checked })}
            />
          </label>

          <h4>Tài khoản dddice của bạn</h4>
          <DddiceAccount />
          <details className="dda-manual">
            <summary>Dán API key thủ công</summary>
            <input
              type="password"
              value={keyInput}
              placeholder="dddice API key"
              onChange={(e) => setKeyInput(e.target.value)}
              onBlur={() => setDddiceKey(keyInput.trim() || null)}
            />
          </details>

          <label>
            Room slug chung {isDm ? '' : '(chỉ DM sửa)'}
            <input
              value={slugInput}
              disabled={!isDm}
              placeholder="ví dụ: A7KBxHz"
              onChange={(e) => setSlugInput(e.target.value)}
              onBlur={() => isDm && patchDddice({ roomSlug: slugInput.trim() || undefined })}
            />
          </label>
          {isDm && rooms && rooms.length > 0 && (
            <label>
              Room có sẵn của key này
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setSlugInput(e.target.value);
                  patchDddice({ roomSlug: e.target.value });
                }}
              >
                <option value="">— chọn —</option>
                {rooms.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name} ({r.slug})
                  </option>
                ))}
              </select>
            </label>
          )}
          {isDm && (
            <button disabled={busy === 'room'} onClick={makeRoom}>
              {busy === 'room' ? 'Đang tạo…' : 'Tạo room dddice mới'}
            </button>
          )}

          {note && <p className="note">{note}</p>}
        </section>
      </div>
    </div>
  );
}

/** Sound-effect volume (this browser only). The topbar keeps just the 🔊/🔇 toggle. */
function SoundSection() {
  const [v, setV] = useState(getSfxVolume);
  const [dv, setDv] = useState(getDiceVolume);
  const [fx, setFx] = useState(vfxEnabled);
  const [nd, setNd] = useState(nativeDiceEnabled);
  const [skinPref, setSkinPref] = useState(diceSkinPref);
  const [skinList, setSkinList] = useState<LoadedSkin[]>([]);
  const [setList, setSetList] = useState<SkinSet[]>([]);
  useEffect(() => {
    void loadSkins().then((m) => {
      setSkinList([...m.values()]);
      setSetList(skinSets());
    });
  }, []);
  return (
    <section className="settings-section">
      <h3>Âm thanh</h3>
      <label className="sfx-vol-row">
        Âm lượng hiệu ứng tấn công / sát thương: {Math.round(v * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={v}
          onChange={(e) => {
            const n = Number(e.target.value);
            setSfxVolume(n);
            setV(n);
          }}
        />
      </label>
      <label className="sfx-vol-row">
        Tiếng xúc xắc 3D: {dv ? `${Math.round(dv * 100)}%` : 'tắt'}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={dv}
          onChange={(e) => {
            const n = Number(e.target.value);
            setDiceVolume(n);
            setDv(n);
          }}
        />
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={fx}
          onChange={(e) => {
            setVfxEnabled(e.target.checked);
            setFx(e.target.checked);
          }}
        />
        Hiệu ứng hình trên bản đồ (vết chém, phép bay, số sát thương)
      </label>
      <label className="chk" title="Xúc xắc 3D vẽ ngay trong app (server tung số, xúc xắc lăn tới đúng số đó). Tắt đi thì dùng dddice nếu bàn đã bật dddice.">
        <input
          type="checkbox"
          checked={nd}
          onChange={(e) => {
            setNativeDiceEnabled(e.target.checked);
            setNd(e.target.checked);
            window.dispatchEvent(new Event('native-dice'));
          }}
        />
        Xúc xắc 3D của bàn (không cần dddice) — chỉ máy này
      </label>
      {nd && skinList.length > 0 && (
        <label className="sfx-vol-row" title="Skin chỉ đổi cách máy này vẽ xúc xắc; kết quả tung không đổi">
          Skin xúc xắc 3D
          <select
            value={skinPref}
            onChange={(e) => {
              setDiceSkinPref(e.target.value);
              setSkinPref(e.target.value);
            }}
          >
            {setList.length <= 1 ? (
              <option value="moon">Theo trăng đang mọc (không có trăng: màu người tung)</option>
            ) : (
              setList.map((st) => (
                <option key={st.id} value={`moon@${st.id}`}>
                  Theo trăng đang mọc — bộ {st.name}
                </option>
              ))
            )}
            <option value="player">Màu của người tung</option>
            {setList.map((st) => (
              <optgroup key={st.id} label={`Bộ ${st.name}`}>
                {skinList
                  .filter((sk) => sk.set === st.id)
                  .map((sk) => (
                    <option key={sk.key} value={sk.key}>
                      {sk.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

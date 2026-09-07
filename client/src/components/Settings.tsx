import { useState } from 'react';
import { useStore } from '../store.js';
import {
  createGuestKey,
  createRoom,
  getLocalThemeOverride,
  setLocalThemeOverride,
} from '../dddice.js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const dddice = useStore((s) => s.room!.dddice);
  const dddiceKey = useStore((s) => s.dddiceKey);
  const setDddiceKey = useStore((s) => s.setDddiceKey);
  const connected = useStore((s) => s.dddiceConnected);
  const active = useStore((s) => s.dddiceActive());

  const [keyInput, setKeyInput] = useState(dddiceKey ?? '');
  const [slugInput, setSlugInput] = useState(dddice.roomSlug ?? '');
  const [themeInput, setThemeInput] = useState(getLocalThemeOverride() ?? dddice.theme ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function patchDddice(patch: Record<string, unknown>) {
    send({ t: 'updateDddice', patch });
  }

  async function makeGuestKey() {
    setBusy('guest');
    setNote(null);
    try {
      const key = await createGuestKey();
      setKeyInput(key);
      setDddiceKey(key);
      setNote('Đã tạo guest key và lưu vào trình duyệt này.');
    } catch (e) {
      setNote(`Lỗi tạo guest key: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
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

        <section className="settings-section">
          <h3>
            Xúc xắc 3D (dddice){' '}
            <span className={`badge ${active && connected ? 'ok' : 'off'}`}>
              {active && connected ? 'đang chạy' : active ? 'đang kết nối…' : 'tắt'}
            </span>
          </h3>
          <p className="hint">
            Khi bật, mọi nút tung xúc xắc (bảng xúc xắc, character sheet, đòn tấn công) sẽ
            chạy qua dddice và hiện xúc xắc 3D ngay trên battle map cho tất cả mọi người.
            Kết quả dddice là kết quả chính thức; server vẫn tự so AC và tính chí mạng.
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

          <label>
            API key của bạn (lưu riêng trên máy này)
            <input
              type="password"
              value={keyInput}
              placeholder="dddice API key"
              onChange={(e) => setKeyInput(e.target.value)}
              onBlur={() => setDddiceKey(keyInput.trim() || null)}
            />
          </label>
          <button disabled={busy === 'guest'} onClick={makeGuestKey}>
            {busy === 'guest' ? 'Đang tạo…' : 'Tạo guest key (không cần tài khoản)'}
          </button>

          <label>
            Room slug chung {isDm ? '' : '(chỉ DM sửa)'}
            <input
              value={slugInput}
              disabled={!isDm}
              placeholder="ví dụ: happy-blue-dragon"
              onChange={(e) => setSlugInput(e.target.value)}
              onBlur={() => isDm && patchDddice({ roomSlug: slugInput.trim() || undefined })}
            />
          </label>
          {isDm && (
            <button disabled={busy === 'room'} onClick={makeRoom}>
              {busy === 'room' ? 'Đang tạo…' : 'Tạo room dddice mới'}
            </button>
          )}

          <label>
            Theme xúc xắc
            <input
              value={themeInput}
              placeholder="dddice-standard"
              onChange={(e) => setThemeInput(e.target.value)}
              onBlur={() => {
                const v = themeInput.trim();
                setLocalThemeOverride(v || null);
                if (isDm && v) patchDddice({ theme: v });
              }}
            />
          </label>
          <p className="hint">
            Nhập theme mặc định của phòng (DM) hoặc ghi đè riêng cho bạn. Lấy slug theme
            trong tài khoản dddice của bạn.
          </p>

          {note && <p className="note">{note}</p>}
        </section>
      </div>
    </div>
  );
}

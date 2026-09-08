import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import {
  createGuestKey,
  createRoom,
  getLocalThemeOverride,
  listRooms,
  listThemes,
  setLocalThemeOverride,
  type DddiceRoom,
  type DddiceTheme,
} from '../dddice.js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const dddice = useStore((s) => s.room!.dddice);
  const participants = useStore((s) => s.room!.participants);
  const meId = useStore((s) => s.participantId);
  const setRole = useStore((s) => s.setRole);
  const dddiceKey = useStore((s) => s.dddiceKey);
  const setDddiceKey = useStore((s) => s.setDddiceKey);
  const connected = useStore((s) => s.dddiceConnected);
  const active = useStore((s) => s.dddiceActive());

  const [keyInput, setKeyInput] = useState(dddiceKey ?? '');
  const [slugInput, setSlugInput] = useState(dddice.roomSlug ?? '');
  const [themeInput, setThemeInput] = useState(getLocalThemeOverride() ?? dddice.theme ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [themes, setThemes] = useState<DddiceTheme[] | null>(null);
  const [rooms, setRooms] = useState<DddiceRoom[] | null>(null);

  // When a key is present, load which themes/rooms it can actually use.
  useEffect(() => {
    const key = dddiceKey?.trim();
    if (!key) {
      setThemes(null);
      setRooms(null);
      return;
    }
    let cancelled = false;
    listThemes(key)
      .then((t) => !cancelled && setThemes(t))
      .catch(() => !cancelled && setThemes([]));
    listRooms(key)
      .then((r) => !cancelled && setRooms(r))
      .catch(() => !cancelled && setRooms([]));
    return () => {
      cancelled = true;
    };
  }, [dddiceKey]);

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
          <h3>Người trong phòng</h3>
          <p className="hint">
            Người vào đầu tiên là DM. DM có thể phân quyền lại. Người chơi chỉ xem và
            chỉnh character sheet của mình.
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

          <label>
            Theme xúc xắc
            {themes && themes.length > 0 ? (
              <select
                value={themeInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setThemeInput(v);
                  setLocalThemeOverride(v || null);
                  if (isDm && v) patchDddice({ theme: v });
                }}
              >
                <option value="">— mặc định —</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={themeInput}
                placeholder="theme slug"
                onChange={(e) => setThemeInput(e.target.value)}
                onBlur={() => {
                  const v = themeInput.trim();
                  setLocalThemeOverride(v || null);
                  if (isDm && v) patchDddice({ theme: v });
                }}
              />
            )}
          </label>
          <p className="hint">
            {themes && themes.length === 0
              ? 'Không lấy được danh sách theme — nhập slug thủ công. Tài khoản free không dùng được theme “dddice-standard”.'
              : 'Chọn theme mà API key của bạn được phép dùng.'}
          </p>

          {note && <p className="note">{note}</p>}
        </section>
      </div>
    </div>
  );
}

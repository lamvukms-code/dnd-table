import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import {
  createGuestKey,
  getLocalThemeOverride,
  listThemes,
  setLocalThemeOverride,
  startActivation,
  whoAmI,
  type DddiceTheme,
} from '../dddice.js';

/** This player's own dddice connection, like the dddice extension in Owlbear Rodeo: log in with
 *  your dddice account (code entered on dddice.com/activate) or play as a guest, then roll with a
 *  theme from YOUR dice box. Nothing here touches the room: the key and theme stay in this browser. */
export function DddiceAccount({ compact = false }: { compact?: boolean }) {
  const key = useStore((s) => s.dddiceKey);
  const setKey = useStore((s) => s.setDddiceKey);
  const connected = useStore((s) => s.dddiceConnected);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState<{ name: string; guest: boolean } | null>(null);
  const [themes, setThemes] = useState<DddiceTheme[] | null>(null);
  const [theme, setTheme] = useState(getLocalThemeOverride() ?? '');
  const attempt = useRef(0); // bumps on cancel so a late approval of an old code is ignored

  useEffect(() => {
    setWho(null);
    setThemes(null);
    if (!key) return;
    let off = false;
    whoAmI(key).then((w) => !off && setWho(w)).catch(() => {});
    listThemes(key)
      .then((t) => {
        if (off) return;
        setThemes(t);
        // A saved pick from another account isn't in this dice box: fall back to the box's first.
        if (theme && !t.some((x) => x.id === theme)) {
          setTheme('');
          setLocalThemeOverride(null);
        }
      })
      .catch(() => !off && setThemes([]));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function login() {
    setErr(null);
    setBusy(true);
    const my = ++attempt.current;
    try {
      const a = await startActivation();
      if (my !== attempt.current) return;
      setCode(a.code);
      const k = await a.apiKey;
      if (my !== attempt.current) return;
      setCode(null);
      if (k) setKey(k);
      else setErr('Mã đã hết hạn — bấm đăng nhập lại.');
    } catch (e) {
      if (my === attempt.current) {
        setCode(null);
        setErr(`Không đăng nhập được: ${(e as Error).message}`);
      }
    } finally {
      if (my === attempt.current) setBusy(false);
    }
  }

  async function guest() {
    setErr(null);
    setBusy(true);
    try {
      setKey(await createGuestKey());
    } catch (e) {
      setErr(`Không tạo được tài khoản khách: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    attempt.current++;
    setCode(null);
    setBusy(false);
  }

  function logout() {
    if (!window.confirm('Ngắt kết nối dddice trên máy này? (xúc xắc sẽ tung bằng server cho tới khi kết nối lại)')) return;
    setLocalThemeOverride(null);
    setTheme('');
    setKey(null);
  }

  if (!key) {
    return (
      <div className={`dddice-account ${compact ? 'compact' : ''}`}>
        {code ? (
          <>
            <div className="dda-step">
              Mở{' '}
              <a href="https://dddice.com/activate" target="_blank" rel="noreferrer">
                dddice.com/activate
              </a>{' '}
              (đăng nhập tài khoản của bạn) rồi nhập mã:
            </div>
            <div className="dda-code">{code}</div>
            <div className="dda-row">
              <span className="hint">Đang chờ xác nhận…</span>
              <button className="link" onClick={cancel}>
                Hủy
              </button>
            </div>
          </>
        ) : (
          <>
            {!compact && <div className="hint">Kết nối dddice để tung xúc xắc 3D bằng skin của chính bạn.</div>}
            <div className="dda-row">
              <button className="primary" disabled={busy} onClick={login} title="Dùng tài khoản dddice của bạn (skin trong dice box của bạn)">
                🔑 Đăng nhập dddice
              </button>
              <button disabled={busy} onClick={guest} title="Không cần tài khoản: chỉ có skin mặc định, mất khi xóa dữ liệu trình duyệt">
                Khách
              </button>
            </div>
          </>
        )}
        {err && <div className="dda-err">{err}</div>}
      </div>
    );
  }

  return (
    <div className={`dddice-account ${compact ? 'compact' : ''}`}>
      <div className="dda-row">
        <span className={`dda-dot ${connected ? 'on' : ''}`} title={connected ? 'Đã vào phòng xúc xắc của bàn' : 'Chưa vào phòng (DM chưa bật dddice / chưa chọn phòng?)'} />
        <span className="dda-who">
          {who ? who.name : 'dddice'}
          {who?.guest ? ' (khách)' : ''}
        </span>
        <button className="link" onClick={logout} title="Ngắt kết nối / đổi tài khoản">
          Đăng xuất
        </button>
      </div>
      <label className="dda-theme">
        <span>Skin</span>
        {themes && themes.length > 0 ? (
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              setLocalThemeOverride(e.target.value || null);
            }}
          >
            <option value="">{themes[0].name} (đầu dice box)</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="hint">{themes ? 'Dice box trống — thêm skin trên dddice.com' : 'Đang tải…'}</span>
        )}
      </label>
      {who?.guest && !compact && <div className="hint">Khách chỉ có skin mặc định. Đăng nhập tài khoản để dùng skin của bạn.</div>}
    </div>
  );
}

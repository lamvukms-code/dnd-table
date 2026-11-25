import { useState } from 'react';
import { uploadImage } from '../upload.js';
import { TokenMaker } from './TokenMaker.js';

/** Image picker: upload a file to the server, or paste a URL. */
export function ImageField({
  value,
  onChange,
  label = 'Ảnh',
  token,
}: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  label?: string;
  /** Set → a picked file opens the token maker (round frame, this frame preset) instead of
   *  uploading the raw picture. */
  token?: string;
}) {
  const [makerFile, setMakerFile] = useState<File | null>(null);
  const [url, setUrl] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(file: File | undefined) {
    if (!file) return;
    if (token) {
      setMakerFile(file);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const u = await uploadImage(file);
      setUrl(u);
      onChange(u);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-field">
      {makerFile && (
        <TokenMaker
          file={makerFile}
          defaultFrame={token}
          onClose={() => setMakerFile(null)}
          onSave={(u) => {
            setMakerFile(null);
            setUrl(u);
            onChange(u);
          }}
        />
      )}
      <span className="if-label">{label}</span>
      <div className="if-row">
        {value && <span className="if-thumb" style={{ backgroundImage: `url(${value})` }} />}
        <label className="if-upload">
          {busy ? '…' : token ? '🖼 Tạo token' : '⬆ Tải lên'}
          <input
            type="file"
            accept={token ? 'image/*' : 'image/png,image/jpeg,image/webp,image/gif'}
            hidden
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        <input
          className="if-url"
          value={url}
          placeholder="hoặc dán URL"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => onChange(url || undefined)}
        />
        {value && (
          <button
            className="link"
            onClick={() => {
              setUrl('');
              onChange(undefined);
            }}
          >
            ✕
          </button>
        )}
      </div>
      {err && <span className="if-err">{err}</span>}
    </div>
  );
}

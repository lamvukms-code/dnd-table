import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadDataUrl } from '../upload.js';

/** Frame presets: ring colours (outer → inner gradient). `null` = no ring, just a round crop. */
const FRAMES: { id: string; label: string; ring: [string, string] | null }[] = [
  { id: 'gold', label: 'Vàng', ring: ['#f3d27a', '#8a6420'] },
  { id: 'crimson', label: 'Đỏ (quái)', ring: ['#e0605a', '#5e1210'] },
  { id: 'teal', label: 'Xanh (NPC)', ring: ['#7fd6c8', '#1d5a54'] },
  { id: 'silver', label: 'Bạc', ring: ['#eef0f3', '#6b7078'] },
  { id: 'iron', label: 'Sắt đen', ring: ['#6d6a66', '#1b1a19'] },
  { id: 'none', label: 'Không viền', ring: null },
];
const PREVIEW = 300; // on-screen canvas size (CSS px)
const OUT = 512; // saved token size (px)
const RING = 0.075; // ring thickness, as a share of the token size

function draw(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  view: { zoom: number; x: number; y: number },
  ring: [string, string] | null,
  bg: string,
) {
  const r = size / 2;
  const ringW = ring ? size * RING : 0;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - ringW / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // `view` is in preview units: scale so the crop is identical at any output size.
  const k = size / PREVIEW;
  const w = img.naturalWidth * view.zoom * k;
  const h = img.naturalHeight * view.zoom * k;
  ctx.drawImage(img, r - w / 2 + view.x * k, r - h / 2 + view.y * k, w, h);
  ctx.restore();
  if (ring) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, ring[0]);
    g.addColorStop(0.5, ring[1]);
    g.addColorStop(1, ring[0]);
    ctx.beginPath();
    ctx.arc(r, r, r - ringW / 2, 0, Math.PI * 2);
    ctx.lineWidth = ringW;
    ctx.strokeStyle = g;
    ctx.stroke();
    // thin dark inner edge so the ring reads against any picture
    ctx.beginPath();
    ctx.arc(r, r, r - ringW, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, size * 0.006);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
  }
}

/** Export as WebP; Safari versions that can't encode WebP give PNG instead (server takes both). */
function exportImage(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.88);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** Token maker: drop/pick a picture, drag + zoom it inside a round frame, pick a frame colour,
 *  save → the app renders a 512px round token, converts it to WebP and uploads it. */
export function TokenMaker({
  file,
  defaultFrame = 'gold',
  onSave,
  onClose,
}: {
  file?: File;
  defaultFrame?: string;
  onSave: (url: string, name: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState('');
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(0.05);
  const [frame, setFrame] = useState(defaultFrame);
  const [bg, setBg] = useState('#1b1a19');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  function load(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErr('Không phải ảnh');
      return;
    }
    setErr('');
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      // Start "cover": the picture fills the circle.
      const cover = PREVIEW / Math.min(im.naturalWidth, im.naturalHeight);
      setMinZoom(cover / 4);
      setView({ zoom: cover, x: 0, y: 0 });
      setImg(im);
      setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    };
    im.onerror = () => setErr('Không đọc được ảnh này');
    im.src = url;
  }

  useEffect(() => load(file), [file]);

  // Paste an image straight from the clipboard while the dialog is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) load(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const ring = FRAMES.find((f) => f.id === frame)?.ring ?? null;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = PREVIEW * dpr;
    c.height = PREVIEW * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (img) draw(ctx, PREVIEW, img, view, ring, bg);
    else ctx.clearRect(0, 0, PREVIEW, PREVIEW);
  }, [img, view, ring, bg]);

  const zoomTo = (z: number) => setView((v) => ({ ...v, zoom: Math.min(minZoom * 40, Math.max(minZoom, z)) }));

  async function save() {
    if (!img) return;
    setBusy(true);
    setErr('');
    try {
      const out = document.createElement('canvas');
      out.width = OUT;
      out.height = OUT;
      draw(out.getContext('2d')!, OUT, img, view, ring, bg);
      const url = await uploadDataUrl(exportImage(out), `${name || 'token'}.webp`);
      onSave(url, name.trim());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  // Portal: it's opened from inside floating panels (tool column, inspector) whose stacking
  // context would otherwise put it under the sheet. The backdrop doesn't close it, so a drag
  // that ends outside the dialog never throws the crop away.
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal token-maker">
        <div className="modal-head">
          <h2>🖼 Tạo token</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tm-body">
          <div
            className={`tm-stage ${img ? '' : 'empty'}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              load(e.dataTransfer.files?.[0]);
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: PREVIEW, height: PREVIEW }}
              onPointerDown={(e) => {
                if (!img) return;
                (e.target as Element).setPointerCapture(e.pointerId);
                drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onWheel={(e) => img && zoomTo(view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
            />
            {!img && (
              <label className="tm-pick">
                Chọn / kéo thả / dán ảnh vào đây
                <input type="file" accept="image/*" hidden onChange={(e) => load(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div className="tm-side">
            {img && (
              <>
                <label>
                  Phóng to
                  <input
                    type="range"
                    min={Math.log(minZoom)}
                    max={Math.log(minZoom * 40)}
                    step={0.01}
                    value={Math.log(view.zoom)}
                    onChange={(e) => zoomTo(Math.exp(Number(e.target.value)))}
                  />
                </label>
                <p className="hint">Kéo ảnh để căn mặt vào giữa khung; cuộn chuột để phóng to.</p>
              </>
            )}
            <div className="tm-frames">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  className={frame === f.id ? 'on' : ''}
                  onClick={() => setFrame(f.id)}
                  title={f.label}
                >
                  <span
                    className="tm-swatch"
                    style={{ background: f.ring ? `linear-gradient(135deg, ${f.ring[0]}, ${f.ring[1]})` : 'transparent' }}
                  />
                  {f.label}
                </button>
              ))}
            </div>
            <label className="tm-bg">
              Nền (chỗ ảnh trong suốt)
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
            </label>
            <label>
              Tên
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="tên token" />
            </label>
            {img && (
              <label className="link tm-change">
                Đổi ảnh khác
                <input type="file" accept="image/*" hidden onChange={(e) => load(e.target.files?.[0])} />
              </label>
            )}
            {err && <p className="dda-err">{err}</p>}
            <div className="tm-actions">
              <button onClick={onClose}>Hủy</button>
              <button className="primary" disabled={!img || busy} onClick={save}>
                {busy ? 'Đang lưu…' : '💾 Lưu token'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

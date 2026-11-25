import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { MOONS, moonByKey, rollMoon, type MoonDef } from '../moons.js';

/** `**bold**` → <b>; nothing else is interpreted (the text is plain, from local data). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p.replace(/\*(.+?)\*/g, '$1')}</Fragment>))}
    </>
  );
}

function MoonCard({ moon, isDm }: { moon: MoonDef; isDm: boolean }) {
  return (
    <div className="moon-card" style={{ ['--moon' as string]: moon.tint ?? '#c9b27a' }}>
      {moon.image && <img className="moon-art" src={moon.image} alt="" />}
      <div className="moon-text">
        <h3>
          {moon.name}
          {moon.d100 && moon.d100[0] > 0 && (
            <small>
              {' '}
              d100 {moon.d100[0]}–{moon.d100[1]}
            </small>
          )}
        </h3>
        {moon.tagline && <p className="moon-tag">{moon.tagline}</p>}
        <ul>
          {moon.effects
            .filter((e) => isDm || !e.dm)
            .map((e, i) => (
              <li key={i} className={e.dm ? 'dm' : undefined}>
                {e.dm && '🔒 '}
                <Rich text={e.text} />
                {!!e.sub?.length && (
                  <ul>
                    {e.sub.map((s, j) => (
                      <li key={j}>
                        <Rich text={s} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
        </ul>
        {moon.pages && <p className="hint">Sách tr. {moon.pages}</p>}
      </div>
    </div>
  );
}

/** Top-bar chip for the moon in the sky; opens the moon card. The DM picks / rolls / sets it. */
function MoonChipImpl() {
  const sky = useStore((s) => s.room?.moon ?? null);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const moon = moonByKey(sky?.key);

  // Tint the map with the moon's colour while it is up.
  useEffect(() => {
    const root = document.documentElement;
    if (moon?.tint) {
      root.style.setProperty('--moon-tint', moon.tint);
      root.classList.add('moon-up');
    } else {
      root.style.removeProperty('--moon-tint');
      root.classList.remove('moon-up');
    }
  }, [moon?.tint]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  if (!MOONS.length || (!isDm && !sky)) return null;
  const shown = moonByKey(preview) ?? moon;
  const raise = (m: MoonDef | null) => {
    send({ t: 'setMoon', moon: m ? { key: m.key, name: m.name } : null });
    setPreview(null);
  };

  return (
    <div className="moon-wrap" ref={ref}>
      <button
        className={`moon-chip ${moon ? 'up' : ''}`}
        style={moon?.tint ? { ['--moon' as string]: moon.tint } : undefined}
        title={moon ? `${moon.name} — bấm xem hiệu ứng` : 'Chưa có Eldritch Moon — bấm để chọn'}
        onClick={() => setOpen((v) => !v)}
      >
        {moon?.image ? <img src={moon.image} alt="" /> : <span className="moon-empty">☾</span>}
        <span className="moon-name">{moon ? moon.name : 'Không trăng'}</span>
      </button>
      {open && (
        <div className="moon-pop">
          {shown ? <MoonCard moon={shown} isDm={isDm} /> : <p className="hint">Đêm nay không có Eldritch Moon.</p>}
          {isDm && (
            <div className="moon-dm">
              <div className="moon-grid">
                {MOONS.map((m) => (
                  <button
                    key={m.key}
                    className={`${m.key === sky?.key ? 'on' : ''} ${m.key === preview ? 'peek' : ''}`}
                    title={`${m.name}${m.short ? ` — ${m.short}` : ''}`}
                    style={{ ['--moon' as string]: m.tint ?? '#c9b27a' }}
                    onClick={() => setPreview(m.key)}
                  >
                    {m.image ? <img src={m.image} alt={m.name} /> : m.name}
                  </button>
                ))}
              </div>
              <div className="moon-actions">
                {preview && preview !== sky?.key && (
                  <button className="primary" onClick={() => raise(moonByKey(preview) ?? null)}>
                    🌕 Cho {moonByKey(preview)?.name} mọc
                  </button>
                )}
                <button
                  title="Tung d100 theo bảng moon của sách"
                  onClick={() => {
                    const r = rollMoon();
                    if (r && window.confirm(`d100 = ${r.roll} → ${r.moon.name}. Cho trăng này mọc?`)) raise(r.moon);
                  }}
                >
                  🎲 Tung d100
                </button>
                {sky && <button onClick={() => raise(null)}>🌑 Cho trăng lặn</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const MoonChip = memo(MoonChipImpl);

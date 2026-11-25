import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface TopMenuItem {
  label: ReactNode;
  title?: string;
  on?: boolean;
  onClick: () => void;
}

/** HUD drop-down: click to open (works on touch — no hover), closes on pick, outside tap, Esc. */
export function TopMenu({
  label,
  items,
  title,
  header,
  caret = true,
}: {
  label: ReactNode;
  items: TopMenuItem[];
  title?: string;
  /** Non-clickable lines shown above the items (e.g. room name + who you are). */
  header?: ReactNode;
  caret?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="top-menu" ref={ref}>
      <button className={open ? 'on' : ''} title={title} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label}
        {caret && ' ▾'}
      </button>
      {open && (
        <div className="top-menu-list" role="menu">
          {header && <div className="top-menu-header">{header}</div>}
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              className={it.on ? 'on' : ''}
              title={it.title}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

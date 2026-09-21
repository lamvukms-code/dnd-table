import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.js';

interface LorePage {
  page: number;
  text: string;
}
interface Touchpoint {
  page: number;
  label: string;
  text: string;
}
interface Thread {
  name: string;
  character?: string;
  summary?: string;
  touchpoints?: Touchpoint[];
}
interface Book {
  source: string;
  pages: LorePage[];
  threads?: Thread[];
}

/** Layout extraction leaves runs of spaces (two columns) — flatten for reading. */
const clean = (s: string) => s.replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
const flat = (s: string) => s.replace(/\s+/g, ' ');

const FATE_QUERIES = ['Thread of Fate', 'Fated Tarot Reading', 'Narrative Touchpoint', 'Fate Weaving'];

export function LoreBook() {
  const meId = useStore((s) => s.participantId);
  const [book, setBook] = useState<Book | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<'search' | 'threads'>('search');

  useEffect(() => {
    let dead = false;
    fetch('/lorebook', { headers: { 'x-participant-id': meId ?? '' } })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        if (!dead) setBook(j as Book);
      })
      .catch((e: Error) => !dead && setErr(e.message));
    return () => {
      dead = true;
    };
  }, [meId]);

  const results = useMemo(() => {
    if (!book) return [];
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) return [];
    const phrase = q.trim().toLowerCase();
    const out: { page: LorePage; score: number; at: number }[] = [];
    for (const p of book.pages) {
      const low = flat(p.text).toLowerCase();
      if (!terms.every((t) => low.includes(t))) continue;
      let score = terms.reduce((n, t) => n + low.split(t).length - 1, 0);
      const ph = low.indexOf(phrase);
      if (ph >= 0) score += 20;
      out.push({ page: p, score, at: ph >= 0 ? ph : low.indexOf(terms[0]) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [book, q]);

  if (err) return <div className="rp-empty"><p>{err}</p></div>;
  if (!book) return <div className="rp-empty"><p>Đang tải…</p></div>;

  return (
    <div className="lore">
      <div className="lore-bar">
        <input
          value={q}
          autoFocus
          placeholder={`Tìm trong ${book.source} (${book.pages.length} trang)…`}
          onChange={(e) => {
            setQ(e.target.value);
            setTab('search');
            setOpen(null);
          }}
        />
      </div>
      <div className="lore-tabs">
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
          Tìm kiếm
        </button>
        <button className={tab === 'threads' ? 'on' : ''} onClick={() => setTab('threads')}>
          🧵 Fate Weaving
        </button>
      </div>

      {tab === 'threads' && (
        <div className="lore-list">
          <div className="lore-chips">
            {FATE_QUERIES.map((f) => (
              <button key={f} onClick={() => { setQ(f); setTab('search'); setOpen(null); }}>
                {f}
              </button>
            ))}
          </div>
          {book.threads?.length ? (
            book.threads.map((t) => (
              <details key={t.name} className="lore-thread">
                <summary>
                  <b>{t.name}</b>
                  {t.character && <span className="hint"> — {t.character}</span>}
                </summary>
                {t.summary && <p>{t.summary}</p>}
                {t.touchpoints?.map((tp) => (
                  <p key={tp.label} className="lore-tp">
                    <button className="link" onClick={() => { setQ(tp.label); setTab('search'); }}>
                      tr.{tp.page}
                    </button>{' '}
                    <b>{tp.label}</b> {tp.text}
                  </p>
                ))}
              </details>
            ))
          ) : (
            <p className="hint">
              Chưa có danh sách Thread thủ công (<code>threads</code> trong lorebook.local.json).
              Bấm các nút trên để tìm nhanh mọi đoạn nhắc đến Fate Weaving trong sách.
            </p>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="lore-list">
          {!q.trim() && <p className="hint">Gõ tên NPC, địa danh, từ khoá… (mọi từ phải xuất hiện trong trang).</p>}
          {q.trim() && !results.length && <p className="hint">Không thấy kết quả.</p>}
          {results.map(({ page, at }) => {
            const text = flat(page.text);
            const start = Math.max(0, at - 80);
            const snip = (start > 0 ? '… ' : '') + text.slice(start, start + 240) + ' …';
            const isOpen = open === page.page;
            return (
              <div key={page.page} className="lore-hit" onClick={() => setOpen(isOpen ? null : page.page)}>
                <b>tr. {page.page}</b>
                {isOpen ? <pre>{clean(page.text)}</pre> : <span> {snip}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

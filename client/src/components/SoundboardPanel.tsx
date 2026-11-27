import { useEffect, useRef, useState } from 'react';
import type { SoundboardSound } from '@dnd-table/shared';
import { useStore } from '../store.js';
import { getBoardVolume, setBoardVolume, uploadSound } from '../soundboard.js';

/**
 * 🔊 Soundboard in the top-left action bar, like Discord's but with no cap on clips: press a clip and
 * the whole table hears it. The DM adds clips (button or drag & drop, many at once, up to 25MB each),
 * renames them, gives them an emoji / level, marks background tracks as looping, reorders and removes
 * them, and decides whether players may press them. Everyone sets their own soundboard volume.
 */
export function SoundboardButton() {
  const [open, setOpen] = useState(false);
  const looping = useStore((s) => s.room?.soundboard?.looping?.length ?? 0);
  // another toolbar control closes it, like the dice tray
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest('.hud-sbd')) return;
      if (t.closest('.map-tools, .hud-actions')) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div className="hud-sbd">
      <button className={open ? 'on' : ''} title="Soundboard: bấm một âm thanh là cả bàn cùng nghe" onClick={() => setOpen(!open)}>
        🔊<span className="hud-label"> Soundboard</span>
        {looping > 0 && <span className="sbd-live" title={`${looping} nhạc nền đang phát`}>♪{looping}</span>}
      </button>
      {open && <SoundboardWindow onClose={() => setOpen(false)} />}
    </div>
  );
}

function SoundboardWindow({ onClose }: { onClose: () => void }) {
  const sb = useStore((s) => s.room?.soundboard);
  const isDm = useStore((s) => s.isDm());
  const send = useStore((s) => s.send);
  const [volume, setVolume] = useState(getBoardVolume);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sounds = sb?.sounds ?? [];
  const looping = new Set(sb?.looping ?? []);
  const canPlay = isDm || !!sb?.playersCanPlay;
  const shown = filter ? sounds.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())) : sounds;

  async function addFiles(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setBusy(`Đang tải lên ${i + 1}/${list.length}: ${list[i].name}`);
      try {
        await uploadSound(list[i]);
      } catch (err) {
        failed.push(`${list[i].name}: ${(err as Error).message}`);
      }
    }
    setBusy(null);
    if (failed.length) useStore.setState({ error: `Không thêm được ${failed.length} file — ${failed.join(' · ')}` });
  }

  const drop = isDm
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        },
      }
    : {};

  return (
    <div className={`sbd-window ${dragOver ? 'drag' : ''}`} {...drop}>
      <div className="dw-head">
        <strong>🔊 Soundboard</strong>
        <label className="sbd-vol" title="Âm lượng soundboard trên máy bạn (không ảnh hưởng người khác)">
          🔉
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              setBoardVolume(v);
            }}
          />
        </label>
        <button className="link" onClick={onClose} title="Đóng">
          ✕
        </button>
      </div>

      <div className="sbd-bar">
        {sounds.length > 8 && <input className="sbd-search" placeholder="Tìm…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        {canPlay && (
          <button onClick={() => send({ t: 'sbStop' })} title="Dừng mọi âm thanh và nhạc nền đang phát cho cả bàn">
            ⏹ Dừng hết
          </button>
        )}
        {isDm && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} title="Thêm file âm thanh (chọn được nhiều file, mỗi file tối đa 25MB)">
              ➕ Thêm
            </button>
            <button className={editing ? 'on' : ''} onClick={() => setEditing(!editing)} disabled={!sounds.length} title="Đổi tên, emoji, âm lượng, lặp, thứ tự, xóa">
              ✎ Sửa
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.ogg,.opus,.wav,.m4a,.aac,.flac,.webm"
              multiple
              hidden
              onChange={(e) => {
                const f = e.target.files;
                if (f) void addFiles(f);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      {isDm && (
        <label className="chk sbd-perm">
          <input type="checkbox" checked={!!sb?.playersCanPlay} onChange={(e) => send({ t: 'sbSettings', playersCanPlay: e.target.checked })} />
          Người chơi được bấm soundboard
        </label>
      )}
      {busy && <div className="sbd-busy">{busy}</div>}

      <div className="sbd-body">
        {!sounds.length && (
          <p className="muted sbd-empty">
            {isDm ? 'Chưa có âm thanh nào. Bấm ➕ Thêm hoặc kéo thả file âm thanh vào đây (MP3, OGG, WAV, M4A…, không giới hạn số lượng).' : 'DM chưa thêm âm thanh nào.'}
          </p>
        )}
        {!!sounds.length && !canPlay && <p className="muted sbd-empty">Chỉ DM bấm được. Bạn vẫn nghe và chỉnh được âm lượng.</p>}
        {editing && isDm ? (
          <div className="sbd-edit-list">
            {shown.map((s) => (
              <SoundEditor key={s.id} sound={s} index={sounds.indexOf(s)} count={sounds.length} />
            ))}
          </div>
        ) : (
          <div className="sbd-grid">
            {shown.map((s) => (
              <button
                key={s.id}
                className={`sbd-tile ${looping.has(s.id) ? 'on' : ''}`}
                disabled={!canPlay}
                title={s.loop ? (looping.has(s.id) ? 'Nhạc nền đang phát: bấm để dừng' : 'Nhạc nền (lặp lại): bấm để phát cho cả bàn') : 'Phát cho cả bàn'}
                onClick={() => send({ t: 'sbPlay', id: s.id })}
              >
                <span className="sbd-emoji">{s.emoji || (s.loop ? '🎵' : '🔈')}</span>
                <span className="sbd-name">{s.name}</span>
                {s.loop && <span className="sbd-loop">🔁</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SoundEditor({ sound, index, count }: { sound: SoundboardSound; index: number; count: number }) {
  const send = useStore((s) => s.send);
  const [name, setName] = useState(sound.name);
  const [emoji, setEmoji] = useState(sound.emoji ?? '');
  useEffect(() => setName(sound.name), [sound.name]);
  useEffect(() => setEmoji(sound.emoji ?? ''), [sound.emoji]);
  const [vol, setVol] = useState(sound.volume ?? 1);
  useEffect(() => setVol(sound.volume ?? 1), [sound.volume]);
  const patch = (p: { name?: string; emoji?: string; volume?: number; loop?: boolean }) => send({ t: 'sbUpdate', id: sound.id, patch: p });
  return (
    <div className="sbd-edit">
      <input className="sbd-e-emoji" value={emoji} placeholder="🔈" title="Emoji" onChange={(e) => setEmoji(e.target.value)} onBlur={() => emoji !== (sound.emoji ?? '') && patch({ emoji })} />
      <input
        className="sbd-e-name"
        value={name}
        title="Tên"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== sound.name && patch({ name })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <input
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={vol}
        title={`Mức âm của riêng clip này: ${Math.round(vol * 100)}%`}
        onChange={(e) => setVol(Number(e.target.value))}
        onPointerUp={() => vol !== (sound.volume ?? 1) && patch({ volume: vol })}
        onKeyUp={() => vol !== (sound.volume ?? 1) && patch({ volume: vol })}
      />
      <label className="chk" title="Nhạc nền: phát lặp lại cho tới khi bấm lại / Dừng hết">
        <input type="checkbox" checked={!!sound.loop} onChange={(e) => patch({ loop: e.target.checked })} />
        🔁
      </label>
      <button className="link" disabled={index <= 0} title="Lên trước" onClick={() => send({ t: 'sbMove', id: sound.id, to: index - 1 })}>
        ◀
      </button>
      <button className="link" disabled={index >= count - 1} title="Xuống sau" onClick={() => send({ t: 'sbMove', id: sound.id, to: index + 1 })}>
        ▶
      </button>
      <button
        className="link danger"
        title="Xóa âm thanh này (xóa luôn file)"
        onClick={() => window.confirm(`Xóa "${sound.name}" khỏi soundboard? File sẽ bị xóa luôn.`) && send({ t: 'sbRemove', id: sound.id })}
      >
        🗑
      </button>
    </div>
  );
}

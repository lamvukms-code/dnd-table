import { useState, type ReactNode } from 'react';

/**
 * A sheet entry (feat, feature…) shown as a readable card: name, badge, extra controls (uses pips)
 * and the description — not a wall of always-open inputs. ✎ switches that one card to edit mode.
 */
export function EntryCard({
  name,
  badge,
  description,
  extra,
  editor,
  onDelete,
  startEditing = false,
}: {
  name: string;
  badge?: string;
  description: string;
  /** Controls that stay visible in view mode (uses pips…). */
  extra?: ReactNode;
  /** The edit form (shown instead of the description while editing). */
  editor: ReactNode;
  onDelete: () => void;
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [open, setOpen] = useState(false);
  const long = description.length > 160;
  return (
    <div className={`entry-card ${editing ? 'editing' : ''}`}>
      <div className="ec-head">
        <strong className="ec-name">{name || 'chưa đặt tên'}</strong>
        {badge && <span className="ec-badge">{badge}</span>}
        {extra}
        <span className="ec-tools">
          <button className="link" title={editing ? 'Xong' : 'Sửa'} onClick={() => setEditing((v) => !v)}>
            {editing ? '✓' : '✎'}
          </button>
          <button
            className="link"
            title="Xóa"
            onClick={() => window.confirm(`Xóa "${name || 'chưa đặt tên'}"? Không hoàn tác được.`) && onDelete()}
          >
            ✕
          </button>
        </span>
      </div>
      {editing ? (
        <div className="ec-editor">{editor}</div>
      ) : (
        description && (
          <p className={`ec-desc ${long && !open ? 'clamp' : ''}`} onClick={() => long && setOpen((v) => !v)} title={long ? (open ? 'Thu gọn' : 'Xem hết') : undefined}>
            {description}
          </p>
        )
      )}
    </div>
  );
}

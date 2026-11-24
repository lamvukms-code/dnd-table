import { useState } from 'react';
import {
  BANE_TAGS,
  BANE_TAG_VI,
  baneMemberStatus,
  emptyGodsBane,
  type BaneTag,
  type GodsBaneOp,
  type Token,
} from '@dnd-table/shared';
import { useStore } from '../store.js';

const STATUS_VI = { none: 'Chưa thề', sworn: 'Đã thề', rejected: 'Bị kiếm chối bỏ', oathbroken: 'PHÁ THỀ' } as const;

/**
 * God's Bane (homebrew party artifact): DM config — on/off, People's Will (N), the shared Cleaving
 * Causality pool, sworn members / rejection — plus the player actions (pass the blade, spend Causality).
 * The rules themselves run on the server (`shared/src/godsBane.ts`).
 */
export function GodsBanePanel({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const gb = useStore((s) => s.room?.godsBane) ?? emptyGodsBane();
  const sheets = useStore((s) => s.room?.sheets ?? []);
  const initiative = useStore((s) => s.room?.initiative);
  const op = (o: GodsBaneOp) => send({ t: 'godsBane', op: o });
  const [passTo, setPassTo] = useState('');

  const holder = sheets.find((s) => s.id === gb.holderSheetId);
  const iHold = !!holder && holder.ownerId === meId;
  const passable = sheets.filter((s) => baneMemberStatus(gb, s.id) === 'sworn' && s.id !== gb.holderSheetId);
  const passedThisRound = !!initiative?.running && gb.lastPassRound === initiative.round;
  const armedCount = gb.armed?.length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal homebrew gods-bane" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🗡 God's Bane</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </div>

        {isDm && (
          <div className="gb-row">
            <label className="chk">
              <input type="checkbox" checked={gb.enabled} onChange={(e) => op({ op: 'config', enabled: e.target.checked })} />
              Bật cho phòng này
            </label>
            <label title="Ý chí nhân dân = số cộng đồng đã cứu + đồng minh đã kết giao">
              N (Ý chí nhân dân)
              <input type="number" min={0} value={gb.will} onChange={(e) => op({ op: 'config', will: Number(e.target.value) || 0 })} style={{ width: 56 }} />
            </label>
            <label title="Quỹ chung của nhóm — DM cấp">
              Cleaving Causality
              <input
                type="number"
                min={0}
                value={gb.causality}
                onChange={(e) => op({ op: 'config', causality: Number(e.target.value) || 0 })}
                style={{ width: 56 }}
              />
            </label>
          </div>
        )}

        {!gb.enabled ? (
          <p className="hint">{isDm ? 'Đang tắt — mọi luật God\'s Bane không chạy.' : "God's Bane chưa được DM bật."}</p>
        ) : (
          <>
            <p className="gb-summary">
              <strong>N = {gb.will}</strong> · Cleaving Causality: <strong>{gb.causality}</strong>
              {armedCount ? ` (${armedCount} đang chuẩn bị)` : ''} · Người cầm kiếm: <strong>{holder?.name ?? '—'}</strong>
              {passedThisRound ? ' · đã trao vòng này' : ''}
            </p>
            <ul className="hint gb-rules">
              <li>Người đã thề (không bị chối bỏ) đánh Great One / tay sai / thợ săn sa ngã: +N sát thương Lực, 1 lần/lượt, bỏ qua kháng/miễn. Với Great One: cả khi trượt.</li>
              <li>Chịu ít hơn N sát thương mỗi lần từ các sinh vật đó; +N cứu chống Mê hoặc / Khiếp sợ (tự cộng khi server tung cứu; tự tung tay thì nhớ cộng).</li>
              <li>Đòn bằng chính God's Bane vào Great One: +1 tầng thần tính bị bóc (trúng hay trượt); trúng thì phá bất tử.</li>
              <li>Bị kiếm chối bỏ: −N khi đánh bằng God's Bane, mất mọi lợi ích. Lần chối bỏ thứ 4 → phá thề vĩnh viễn.</li>
            </ul>

            <table className="gb-table">
              <thead>
                <tr>
                  <th>Nhân vật</th>
                  <th>Trạng thái</th>
                  <th>Chối bỏ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => {
                  const st = baneMemberStatus(gb, s.id);
                  const m = gb.members[s.id];
                  const mine = s.ownerId === meId;
                  const armed = gb.armed?.find((a) => a.sheetId === s.id);
                  if (!isDm && st === 'none') return null;
                  return (
                    <tr key={s.id} className={`gb-${st}`}>
                      <td>
                        {s.id === gb.holderSheetId ? '🗡 ' : ''}
                        {s.name}
                      </td>
                      <td>{STATUS_VI[st]}</td>
                      <td>{m ? `${m.rejections}/3` : ''}</td>
                      <td className="gb-actions">
                        {isDm && (
                          <>
                            {st === 'none' ? (
                              <button onClick={() => op({ op: 'swear', sheetId: s.id, sworn: true })}>Tuyên thệ</button>
                            ) : (
                              <button
                                onClick={() => window.confirm(`Bỏ ${s.name} khỏi lời thề (xoá cả số lần bị chối bỏ)?`) && op({ op: 'swear', sheetId: s.id, sworn: false })}
                              >
                                Bỏ thề
                              </button>
                            )}
                            {st === 'sworn' && (
                              <button
                                onClick={() =>
                                  window.confirm(
                                    m && m.rejections >= 3
                                      ? `Chối bỏ ${s.name} lần thứ 4 → PHÁ THỀ VĨNH VIỄN?`
                                      : `Kiếm chối bỏ ${s.name}?`,
                                  ) && op({ op: 'reject', sheetId: s.id })
                                }
                              >
                                Chối bỏ
                              </button>
                            )}
                            {st === 'rejected' && <button onClick={() => op({ op: 'atone', sheetId: s.id })}>Chuộc lỗi</button>}
                            {st === 'oathbroken' && (
                              <button onClick={() => window.confirm('Gỡ trạng thái phá thề (DM override)?') && op({ op: 'override', sheetId: s.id })}>
                                Gỡ phá thề
                              </button>
                            )}
                            {st !== 'none' && s.id !== gb.holderSheetId && (
                              <button title="DM đặt người cầm kiếm (không tính lượt trao)" onClick={() => op({ op: 'setHolder', sheetId: s.id })}>
                                Cầm kiếm
                              </button>
                            )}
                          </>
                        )}
                        {(mine || isDm) && st === 'sworn' && !armed && gb.causality - armedCount > 0 && (
                          <>
                            <button title="d20 kế tiếp của nhân vật này (đánh / kiểm tra / cứu) thành 20 tự nhiên" onClick={() => op({ op: 'arm', sheetId: s.id, mode: 'crit' })}>
                              ⚡ d20 mình → 20
                            </button>
                            <button title="d20 kế tiếp của kẻ địch (đòn đánh hoặc cứu do server tung) thành 1 tự nhiên" onClick={() => op({ op: 'arm', sheetId: s.id, mode: 'fumble' })}>
                              ⚡ d20 địch → 1
                            </button>
                          </>
                        )}
                        {(mine || isDm) && armed && (
                          <button onClick={() => op({ op: 'disarm', sheetId: s.id })}>
                            Huỷ ⚡ ({armed.mode === 'crit' ? '→20' : 'địch →1'})
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(iHold || isDm) && holder && (
              <div className="gb-row">
                <label>
                  Trao kiếm cho
                  <select value={passTo} onChange={(e) => setPassTo(e.target.value)}>
                    <option value="">—</option>
                    {passable.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!passTo || passedThisRound}
                  title="1 lần mỗi vòng khi đang có initiative"
                  onClick={() => {
                    op({ op: 'pass', toSheetId: passTo });
                    setPassTo('');
                  }}
                >
                  🗡 Trao
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** DM-only God's Bane box in the token inspector: target tag, stripped layers, mortal flag. */
export function GodsBaneTokenBox({ token }: { token: Token }) {
  const send = useStore((s) => s.send);
  const enabled = useStore((s) => !!s.room?.godsBane?.enabled);
  const linked = useStore((s) => s.room?.sheets.some((x) => x.tokenId === token.id));
  if (!enabled || linked) return null;
  const patch = (p: Partial<Token>) => send({ t: 'updateToken', id: token.id, patch: p });
  const layers = token.baneLayers ?? 0;
  return (
    <details className="def-details" open={!!token.baneTag}>
      <summary>
        🗡 God's Bane{token.baneTag ? ` · ${BANE_TAG_VI[token.baneTag]}` : ''}
        {layers ? ` · ${layers} tầng` : ''}
        {token.baneMortal ? ' · ☠ phàm' : ''}
      </summary>
      <div className="gb-row">
        <label>
          Loại mục tiêu
          <select
            value={token.baneTag ?? ''}
            onChange={(e) => patch({ baneTag: (e.target.value || null) as BaneTag | null })}
          >
            <option value="">— không —</option>
            {BANE_TAGS.map((t) => (
              <option key={t} value={t}>
                {BANE_TAG_VI[t]}
              </option>
            ))}
          </select>
        </label>
        {token.baneTag === 'greatOne' && (
          <>
            <span title="Tầng thần tính đã bị bóc — DM tự quyết bỏ đặc tính nào (sửa ở mục Phòng thủ / statblock)">
              Tầng bị bóc: <strong>{layers}</strong>{' '}
              <button onClick={() => patch({ baneLayers: Math.max(0, layers - 1) })}>−</button>
              <button onClick={() => patch({ baneLayers: layers + 1 })}>+</button>
            </span>
            <label className="chk" title="Bất tử bị phá: có thể chết vĩnh viễn. Bỏ chọn khi sinh vật nghỉ dài.">
              <input type="checkbox" checked={!!token.baneMortal} onChange={(e) => patch({ baneMortal: e.target.checked })} />
              ☠ Bất tử bị phá
            </label>
            {token.baneMortal && <button onClick={() => patch({ baneMortal: false })}>Nghỉ dài → hồi bất tử</button>}
          </>
        )}
      </div>
    </details>
  );
}

/** Bestiary editor field: the God's Bane tag copied onto spawned tokens. */
export function BaneTagSelect({ value, onChange }: { value?: BaneTag; onChange: (t: BaneTag | undefined) => void }) {
  return (
    <label title="God's Bane: loại mục tiêu (token spawn ra sẽ mang tag này)">
      God's Bane
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as BaneTag | undefined)}>
        <option value="">— không —</option>
        {BANE_TAGS.map((t) => (
          <option key={t} value={t}>
            {BANE_TAG_VI[t]}
          </option>
        ))}
      </select>
    </label>
  );
}

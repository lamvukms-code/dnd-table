import { useState } from 'react';
import {
  BANE_TAGS,
  BANE_TAG_VI,
  baneMemberStatus,
  emptyGodsBane,
  findBladeToken,
  inBladeAura,
  MAX_STRIPS_PER_ROUND,
  strippedThisRound,
  type BaneTag,
  type GodsBaneOp,
  type GodsBaneRoomOp,
  type Token,
} from '@dnd-table/shared';
import { useStore } from '../store.js';

const STATUS_VI = { none: 'Chưa thề', sworn: 'Đã thề', rejected: 'Bị kiếm chối bỏ', oathbroken: 'PHÁ THỀ' } as const;

/**
 * God's Bane (homebrew party artifact): DM config — on/off, awakening, People's Will (N), the shared
 * Cleaving Causality pool, sworn members / rejection — the blade's token / turn / attack, and the player
 * view (who stands in the aura, Cleaving Causality). The rules themselves run on the server
 * (`shared/src/godsBane.ts`).
 */
export function GodsBanePanel({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const isDm = useStore((s) => s.isDm());
  const meId = useStore((s) => s.participantId);
  const gb = useStore((s) => s.room?.godsBane) ?? emptyGodsBane();
  const sheets = useStore((s) => s.room?.sheets ?? []);
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const initiative = useStore((s) => s.room?.initiative);
  const op = (o: GodsBaneOp | GodsBaneRoomOp) => send({ t: 'godsBane', op: o });
  const [targetId, setTargetId] = useState('');

  const armedCount = gb.armed?.length ?? 0;
  const blade = findBladeToken(gb, tokens);
  const bladeInInit = !!blade && !!initiative?.entries.some((e) => e.tokenId === blade.id);
  const round = initiative?.running ? initiative.round : undefined;
  const sheetToken = (tokenId?: string) => (tokenId ? tokens.find((t) => t.id === tokenId) : undefined);
  const greatOnes = tokens.filter((t) => t.baneTag === 'greatOne' && !t.godsBaneBlade);
  const targets = tokens.filter((t) => !t.godsBaneBlade && !t.hidden);
  const downed = tokens.filter((t) => t.downedUndying && !t.baneSlain);

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
            <label className="chk" title="Trước khi thức tỉnh (chương 1) God's Bane chỉ là vũ khí: không token, không lượt, không hào quang">
              <input
                type="checkbox"
                checked={!!gb.awakened}
                disabled={!gb.enabled}
                onChange={(e) =>
                  (e.target.checked || window.confirm("Cho God's Bane ngủ lại? Token của kiếm sẽ bị gỡ khỏi bản đồ và initiative.")) &&
                  op({ op: 'config', awakened: e.target.checked })
                }
              />
              Đã thức tỉnh
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
          <p className="hint">{isDm ? "Đang tắt — mọi luật God's Bane không chạy." : "God's Bane chưa được DM bật."}</p>
        ) : (
          <>
            <p className="gb-summary">
              <strong>N = {gb.will}</strong> · Cleaving Causality: <strong>{gb.causality}</strong>
              {armedCount ? ` (${armedCount} đang chuẩn bị)` : ''} ·{' '}
              {gb.awakened ? (blade ? 'Kiếm đang ở trên bản đồ' : 'Đã thức tỉnh — chưa đặt token') : 'Chưa thức tỉnh (chỉ là vũ khí)'}
            </p>
            <ul className="hint gb-rules">
              <li>
                Người đã thề (không bị chối bỏ) đứng trong <strong>hào quang 5 ft</strong> của kiếm: mọi sát thương gây lên Great One / tay sai / thợ
                săn sa ngã được +N Lực, 1 lần/lượt, bỏ qua kháng/miễn/DR. Với Great One: cả khi trượt, và bóc 1 tầng thần tính.
              </li>
              <li>Chịu ít hơn N sát thương mỗi lần từ các sinh vật đó; +N cứu chống Mê hoặc / Khiếp sợ — không cần đứng gần kiếm.</li>
              <li>
                Đòn của chính kiếm (lượt riêng, initiative 20, thua khi hoà): 1d8, tự trúng + N vào sinh vật mang dấu; sinh vật khác phải đánh
                trúng (+0) và không có N. Cầm vũ khí God's Bane đánh = đòn của kiếm (bóc tầng, phá bất tử, giết vĩnh viễn sinh vật bất diệt).
              </li>
              <li>Tối đa {MAX_STRIPS_PER_ROUND} tầng thần tính / vòng / Great One (ngoài initiative không giới hạn).</li>
              <li>Vũ khí thần thánh đánh sinh vật đứng trong 5 ft của kiếm: bất lợi.</li>
              <li>Bị kiếm chối bỏ: mất mọi lợi ích; vẫn đánh được bằng vũ khí God's Bane nhưng −N, không tự trúng. Lần thứ 4 → phá thề vĩnh viễn.</li>
            </ul>

            {isDm && gb.awakened && (
              <div className="gb-blade">
                <div className="gb-row">
                  {blade ? (
                    <>
                      <button onClick={() => window.confirm("Gỡ token God's Bane khỏi bản đồ?") && op({ op: 'removeBlade' })}>Gỡ kiếm khỏi bản đồ</button>
                      <button onClick={() => op({ op: 'bladeInit', on: !bladeInInit })}>
                        {bladeInInit ? 'Bỏ khỏi initiative' : 'Thêm vào initiative (20)'}
                      </button>
                    </>
                  ) : (
                    <button title="Đặt cạnh người đã thề đầu tiên trên bản đồ (hoặc giữa bản đồ) — kéo thả để di chuyển (tốc độ 30 ft)" onClick={() => op({ op: 'placeBlade' })}>
                      🗡 Đặt kiếm lên bản đồ
                    </button>
                  )}
                </div>
                {blade && (
                  <div className="gb-row">
                    <label>
                      Kiếm tấn công
                      <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">— mục tiêu —</option>
                        {targets.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                            {t.baneTag ? ` (${BANE_TAG_VI[t.baneTag]})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={!targetId} onClick={() => op({ op: 'bladeAttack', targetTokenId: targetId })}>
                      ⚔ Đánh (1d8)
                    </button>
                  </div>
                )}
              </div>
            )}

            {isDm && (greatOnes.length > 0 || downed.length > 0) && (
              <div className="gb-row">
                {greatOnes.map((t) => (
                  <span key={t.id} className="gb-chip" title="Tầng thần tính đã bóc · bóc trong vòng này / giới hạn">
                    {t.label}: {t.baneLayers ?? 0} tầng
                    {round !== undefined ? ` · vòng này ${strippedThisRound(t, round)}/${MAX_STRIPS_PER_ROUND}` : ''}
                    {t.baneMortal ? ' · ☠ phàm' : ''}
                  </span>
                ))}
                <button
                  title="Hồi đầy HP mọi sinh vật bất diệt đang gục (không áp dụng cho kẻ đã bị God's Bane giết)"
                  onClick={() => op({ op: 'reviveUndying' })}
                >
                  🌙 Nghỉ dài: hồi sinh bất diệt{downed.length ? ` (${downed.length})` : ''}
                </button>
              </div>
            )}

            <table className="gb-table">
              <thead>
                <tr>
                  <th>Nhân vật</th>
                  <th>Trạng thái</th>
                  <th>Hào quang</th>
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
                  const inAura = inBladeAura(gb, tokens, sheetToken(s.tokenId));
                  if (!isDm && st === 'none') return null;
                  return (
                    <tr key={s.id} className={`gb-${st}`}>
                      <td>{s.name}</td>
                      <td>{STATUS_VI[st]}</td>
                      <td title={inAura && st !== 'sworn' ? 'Trong 5 ft nhưng không được hưởng (chưa thề / bị chối bỏ)' : undefined}>
                        {inAura ? (st === 'sworn' ? '✨ trong 5 ft' : '(trong 5 ft)') : blade ? '—' : ''}
                      </td>
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
          </>
        )}
      </div>
    </div>
  );
}

/** DM-only God's Bane box in the token inspector: target tag, undying, stripped layers, mortal flag — or,
 *  on the blade's own token, its attack. */
export function GodsBaneTokenBox({ token }: { token: Token }) {
  const send = useStore((s) => s.send);
  const enabled = useStore((s) => !!s.room?.godsBane?.enabled);
  const linked = useStore((s) => s.room?.sheets.some((x) => x.tokenId === token.id));
  const tokens = useStore((s) => s.room?.tokens ?? []);
  const [targetId, setTargetId] = useState('');
  if (!enabled || linked) return null;
  const patch = (p: Partial<Token>) => send({ t: 'updateToken', id: token.id, patch: p });
  if (token.godsBaneBlade) {
    return (
      <details className="def-details" open>
        <summary>🗡 God's Bane (kiếm) · tốc độ 30 ft · hào quang 5 ft · không AC/HP</summary>
        <div className="gb-row">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— mục tiêu —</option>
            {tokens
              .filter((t) => !t.godsBaneBlade)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.baneTag ? ` (${BANE_TAG_VI[t.baneTag]})` : ''}
                </option>
              ))}
          </select>
          <button disabled={!targetId} onClick={() => send({ t: 'godsBane', op: { op: 'bladeAttack', targetTokenId: targetId } })}>
            ⚔ Đánh (1d8)
          </button>
        </div>
      </details>
    );
  }
  const layers = token.baneLayers ?? 0;
  return (
    <details className="def-details" open={!!token.baneTag || !!token.undying}>
      <summary>
        🗡 God's Bane{token.baneTag ? ` · ${BANE_TAG_VI[token.baneTag]}` : ''}
        {token.undying ? ' · bất diệt' : ''}
        {layers ? ` · ${layers} tầng` : ''}
        {token.baneMortal ? ' · ☠ phàm' : ''}
        {token.downedUndying ? ' · 💀 đang gục' : ''}
        {token.baneSlain ? ' · ☠ chết vĩnh viễn' : ''}
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
        <label className="chk" title="Bất diệt: về 0 HP chỉ gục, nghỉ dài hồi lại — chỉ đòn God's Bane mới giết vĩnh viễn">
          <input type="checkbox" checked={!!token.undying} onChange={(e) => patch({ undying: e.target.checked || undefined })} />
          Bất diệt
        </label>
        {token.downedUndying && <button onClick={() => patch({ downedUndying: undefined })}>Bỏ trạng thái gục</button>}
        {token.baneSlain && <button onClick={() => window.confirm('Gỡ dấu "chết vĩnh viễn"?') && patch({ baneSlain: undefined })}>Gỡ "chết vĩnh viễn"</button>}
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

/** Bestiary editor fields: the God's Bane tag and the undying trait, both copied onto spawned tokens. */
export function BaneTagSelect({
  value,
  onChange,
  undying,
  onUndying,
}: {
  value?: BaneTag;
  onChange: (t: BaneTag | undefined) => void;
  undying?: boolean;
  onUndying?: (v: boolean | undefined) => void;
}) {
  return (
    <>
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
      {onUndying && (
        <label className="chk" title="Bất diệt (God's Bane): về 0 HP chỉ gục, nghỉ dài hồi lại — chỉ đòn God's Bane mới giết vĩnh viễn">
          <input type="checkbox" checked={!!undying} onChange={(e) => onUndying(e.target.checked || undefined)} />
          Bất diệt
        </label>
      )}
    </>
  );
}

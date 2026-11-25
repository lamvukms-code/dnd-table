import { memo, useEffect } from 'react';
import { useStore } from '../store.js';

/**
 * "Pick where X lands" requests (a creature teleported by a spell it failed to save against). Shown to
 * the caster's player (and the DM). "📍 Chọn trên bản đồ" arms the map: the next click on an empty
 * square answers it; the server checks the distance. Esc disarms.
 */
function PickPromptBannerImpl() {
  const prompts = useStore((s) => s.room?.pickPrompts);
  const tokens = useStore((s) => s.room?.tokens);
  const isDm = useStore((s) => s.isDm());
  const me = useStore((s) => s.participantId);
  const send = useStore((s) => s.send);
  const pickPoint = useStore((s) => s.pickPoint);
  const setPickPoint = useStore((s) => s.setPickPoint);
  useEffect(() => {
    if (!pickPoint) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPickPoint(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pickPoint, setPickPoint]);
  // a request that disappeared (answered elsewhere) disarms the map
  useEffect(() => {
    if (pickPoint && !prompts?.some((p) => p.id === pickPoint.promptId)) setPickPoint(null);
  }, [prompts, pickPoint, setPickPoint]);
  const mine = (prompts ?? []).filter((p) => p.ownerId === me || isDm);
  if (!mine.length) return null;
  return (
    <div className="oa-prompts pick-prompts">
      {mine.map((p) => {
        const anchor = tokens?.find((t) => t.id === p.anchorTokenId);
        const armed = pickPoint?.promptId === p.id;
        return (
          <div key={p.id} className={`oa-prompt ${armed ? 'armed' : ''}`}>
            <span>
              📍 {p.label}: chọn chỗ thả <b>{p.tokenName}</b> (trong {p.maxFeet}ft quanh {anchor?.label ?? 'người ra phép'})
            </span>
            {armed ? (
              <span className="pick-hint">Bấm một ô trống trên bản đồ… (Esc để hủy)</span>
            ) : (
              <button
                className="primary"
                onClick={() => setPickPoint({ promptId: p.id, label: p.label, anchorTokenId: p.anchorTokenId, maxFeet: p.maxFeet })}
              >
                📍 Chọn trên bản đồ
              </button>
            )}
            <button className="link" onClick={() => send({ t: 'resolvePick', id: p.id, skip: true })}>
              Bỏ qua
            </button>
          </div>
        );
      })}
    </div>
  );
}

export const PickPromptBanner = memo(PickPromptBannerImpl);

import { useEffect, useRef } from 'react';
import { connect, resizeCurrent, teardown } from '../dddice.js';
import { useStore } from '../store.js';

/** Transparent 3D-dice overlay for the battle map. Renders nothing unless the
 *  room has dddice enabled and this browser has an API key. */
export function DddiceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const enabled = useStore((s) => s.room?.dddice.enabled ?? false);
  const slug = useStore((s) => s.room?.dddice.roomSlug);
  const theme = useStore((s) => s.room?.dddice.theme ?? 'dddice-standard');
  const key = useStore((s) => s.dddiceKey);
  const setConnected = useStore((s) => s.setDddiceConnected);

  useEffect(() => {
    const canvas = ref.current;
    if (!enabled || !key || !slug || !canvas) {
      teardown();
      setConnected(false);
      return;
    }
    let cancelled = false;
    connect(canvas, key, slug, theme).then((ok) => {
      if (!cancelled) setConnected(ok);
    });
    const onResize = () => resizeCurrent();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, [enabled, key, slug, theme, setConnected]);

  useEffect(() => () => teardown(), []);

  if (!enabled) return null;
  return <canvas ref={ref} className="dddice-canvas" aria-hidden />;
}

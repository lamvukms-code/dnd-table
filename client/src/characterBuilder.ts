import { useEffect, useState } from 'react';

/**
 * Optional local character-builder page (campaign content the DM keeps outside the repo, served
 * from client/public/campaign/). The repo never ships it, so the app only shows its buttons when
 * the page is actually there. The SPA fallback answers every unknown path with index.html, so a
 * plain 200 proves nothing: the page must carry <meta name="dndtable-page" content="character-builder">.
 */
export const CHARACTER_BUILDER_URL = '/campaign/tao-nhan-vat.html';

let probe: Promise<boolean> | null = null;
function builderExists(): Promise<boolean> {
  probe ??= fetch(CHARACTER_BUILDER_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((t) => /name=["']dndtable-page["'][^>]*content=["']character-builder["']/.test(t))
    .catch(() => false);
  return probe;
}

/** true once the builder page is confirmed to exist on this server. */
export function useCharacterBuilder(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    void builderExists().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

export function openCharacterBuilder(): void {
  window.open(CHARACTER_BUILDER_URL, '_blank', 'noopener');
}

import { useEffect, useState } from 'react';

/** Live `matchMedia` result; re-renders when the query flips (window resize, iPad rotation). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** ≥1000px (desktop, iPad landscape): map on the left, character sheet as a right-hand column (Owlbear/Roll20 style).
 *  Narrower (iPad portrait): the sheet docks under the map. Keep in sync with styles.css. */
export const WIDE_LAYOUT_QUERY = '(min-width: 1000px)';
export const useWideLayout = () => useMediaQuery(WIDE_LAYOUT_QUERY);

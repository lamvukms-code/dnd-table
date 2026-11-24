/** The grid cell at the centre of the map view, set by BattleMap while it is mounted (used by
 *  "Đặt lên bản đồ" on the sheet). Kept in its own module so the sheet doesn't import BattleMap. */
let getter: (() => { x: number; y: number }) | null = null;
export function setMapViewCenterGetter(fn: (() => { x: number; y: number }) | null): void {
  getter = fn;
}
export function mapViewCenterCell(): { x: number; y: number } | null {
  return getter?.() ?? null;
}

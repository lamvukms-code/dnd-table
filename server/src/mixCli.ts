/**
 * Re-build the clean mix of a recorded session folder (e.g. after tuning CLEAN_FILTER in mix.ts):
 *   npm run mix -w @dnd-table/server -- "<recordings folder>\<date time>"
 */
import { mixSession } from './mix.js';

const folder = process.argv[2];
if (!folder) {
  console.error('Cách dùng: npm run mix -w @dnd-table/server -- "<thư mục buổi quay>"');
  process.exit(1);
}
const r = await mixSession(folder);
if (!r) {
  console.error('Thư mục này không có tracks/tracks.json');
  process.exit(1);
}
console.log(r.ok ? `Xong: ${r.out}` : `Lỗi: ${r.note}`);
process.exit(r.ok ? 0 : 1);

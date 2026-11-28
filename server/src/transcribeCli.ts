/**
 * Transcribe (or re-transcribe) a recorded session folder:
 *   npm run transcribe -w @dnd-table/server -- "<recordings folder>\<date time>"
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSessionNames } from './glossary.js';
import { transcribeSession } from './transcribe.js';

const data = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const folder = process.argv[2];
if (!folder) {
  console.error('Cách dùng: npm run transcribe -w @dnd-table/server -- "<thư mục buổi quay>"');
  process.exit(1);
}
// an older folder (or --ten-moi): take today's names from the DM's list + the saved room
if (!existsSync(join(folder, 'ten-rieng.json')) || process.argv.includes('--ten-moi')) {
  const roomFile = process.env.ROOM_FILE ?? join(data, 'room.json');
  const state = existsSync(roomFile) ? JSON.parse(readFileSync(roomFile, 'utf8')) : { participants: [], sheets: [], scenes: [], tokens: [] };
  writeSessionNames(folder, process.env.GLOSSARY_FILE ?? join(data, 'ten-rieng.txt'), state);
  console.log('Đã lấy bảng tên hiện tại → ten-rieng.json');
}
console.log('Đang chép lời (có thể mất vài chục phút với buổi dài)…');
const r = await transcribeSession(folder);
console.log(r.ok ? `Xong: ${r.note} → loi-thoai.md` : `Lỗi: ${r.note}`);
process.exit(r.ok ? 0 : 1);

# dnd-table

Bàn chơi **Dungeons & Dragons 5e (2024)** online, chạy trong mạng LAN, dùng cá
nhân. Một máy chạy server, mọi người mở trình duyệt trên máy của mình và cùng
chơi trên một phòng: tung xúc xắc, theo dõi initiative, dựng battle map + token,
và quản lý character sheet — tất cả trên một trang.

> ⚠️ Không có đăng nhập. Chỉ chạy trong mạng nội bộ tin cậy.

## Tính năng (0.1.0)

- **Xúc xắc dùng chung:** cú pháp `2d6+3`, `4d6kh3`, `d%`…, nút nhanh d20–d100,
  kiểm tra d20 có lợi thế / bất lợi, tự nhận biết chí mạng (nat 20) và hỏng
  (nat 1). Nhật ký roll đồng bộ real-time; DM roll riêng được.
- **Battle map:** lưới tùy chỉnh, ảnh nền theo URL, token kéo-thả có HP/AC/cỡ,
  token ẩn cho DM, thanh máu trên token.
- **Xúc xắc ảo trên map:** mỗi lần roll hiện dice ngay trên battle map (dice tray
  2D luôn có sẵn).
- **Xúc xắc 3D dddice (tùy chọn):** bật trong Cài đặt để mọi nút roll — bảng xúc
  xắc, character sheet, đòn tấn công — chạy qua [dddice](https://dddice.com) và
  hiện xúc xắc 3D trên battle map cho tất cả mọi người. Kết quả dddice là kết quả
  chính thức; server vẫn tự so AC, tính chí mạng, trừ HP.
- **Giải đòn tấn công tự động:** tung d20 + chỉ số, so AC token mục tiêu, báo
  trúng / trượt / chí mạng, tự nhân đôi xúc xắc sát thương khi chí mạng, trừ máu
  token.
- **Initiative tracker:** tung cho toàn bộ token, đếm vòng, chuyển lượt.
- **Character sheet 5e 2024 (kiểu D&D Beyond):** chia section Chỉ số / Chiến đấu
  / Túi đồ. 6 chỉ số, thành thạo, kỹ năng/tinh thông, save, HP, initiative — mỗi
  mục có nút roll gửi thẳng vào nhật ký chung. **Túi đồ**: vật phẩm (vũ khí/giáp/
  khiên/đồ dùng) có trọng lượng, đánh dấu trang bị, tiền pp/gp/ep/sp/cp. **AC tự
  tính** từ giáp + khiên trang bị (có ô ghi đè). **Đòn tấn công tự sinh** từ vũ
  khí trang bị (STR/DEX/linh hoạt + thành thạo + phụ trội). Liên kết token.

Xem `docs/SRS.md` cho đặc tả đầy đủ.

## Chạy thử

Yêu cầu Node.js ≥ 20.

```bash
npm install
npm run dev
```

- Client: `http://localhost:5173`
- Server + WebSocket: `http://localhost:8787`

Máy khác trong LAN mở `http://<IP-máy-chủ>:5173`.

### Chạy bản production (một cổng duy nhất)

```bash
npm run build      # build client vào client/dist
npm start          # server phục vụ luôn client tại http://<IP>:8787
```

## Bật xúc xắc 3D dddice

1. Mở **Cài đặt** (nút ⚙ góc phải).
2. Mỗi người dán **API key dddice** của mình (lấy trong tài khoản dddice), hoặc
   bấm **Tạo guest key** nếu không có tài khoản. Key chỉ lưu trên máy đó.
3. DM bấm **Tạo room dddice mới** (hoặc dán sẵn một room slug) rồi bật **dddice**.
4. Xong — mọi nút tung xúc xắc giờ ra dice 3D trên battle map. Tắt dddice thì
   quay lại xúc xắc của server.

API key không bao giờ được gửi lên server của app hay lưu trong phòng; chỉ room
slug được chia sẻ.

## Kiểm thử

```bash
npm test           # unit test cho dice + rules (shared/)
npm run typecheck  # kiểm tra kiểu server + client
```

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `shared/` | TypeScript thuần: parser xúc xắc, luật 5e, kiểu dữ liệu, protocol. |
| `server/` | Node + `ws`. Giữ `RoomState` chuẩn, áp dụng action, lưu `data/room.json`. |
| `client/` | React + Vite + Zustand. UI tiếng Việt. |
| `docs/` | `SRS.md` — đặc tả yêu cầu phần mềm. |
| `.claude/agents/` | `dndcoder.md` — agent hỗ trợ code & quản trị version. |

## Biến môi trường (server)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8787` | Cổng HTTP/WebSocket. |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe. |
| `ROOM_FILE` | `server/data/room.json` | Nơi lưu trạng thái phòng. |

## Giấy phép & nội dung

Chỉ chứa cơ chế trò chơi. Không kèm nội dung có bản quyền của Wizards of the
Coast; người dùng tự cung cấp ảnh map, tên quái, chỉ số… khi chơi.

# Chơi từ xa bằng Tailscale (không cần thuê server, không mở cổng)

App chạy **trên máy DM**. Tailscale tạo một mạng riêng mã hoá (WireGuard) giữa máy DM và máy người chơi, nên **không có địa chỉ công khai nào để bot quét** và không mở cổng nào trên router.

## DM làm một lần

1. Vào https://tailscale.com → đăng ký (dùng Google) → tải và cài **Tailscale for Windows** → đăng nhập.
2. Trong thư mục app, build client rồi chạy server:
   ```
   npm ci
   npm run build
   npm run start
   ```
   Server chạy ở cổng `8787` và tự phục vụ luôn giao diện web.
3. Lần đầu Windows hỏi Firewall → **cho phép Private networks** cho Node.js.
4. Lấy địa chỉ máy bạn: bấm biểu tượng Tailscale ở khay hệ thống → tên máy, hoặc chạy `tailscale ip -4` (dạng `100.x.y.z`).
   Link cho người chơi: `http://100.x.y.z:8787` (hoặc `http://TÊN-MÁY:8787` nếu bật MagicDNS).

## Mời từng người chơi

Cách đơn giản nhất là **chia sẻ máy (Share node)**, không cần cho họ vào toàn bộ mạng của bạn:

1. Trang https://login.tailscale.com/admin/machines → dòng máy của bạn → `⋯` → **Share…**
2. Gửi link mời cho người chơi.
3. Người chơi: tự đăng ký Tailscale (miễn phí), cài app, bấm link mời, rồi mở `http://100.x.y.z:8787` trong trình duyệt.

(Không dùng "Invite users" cho cả 5 người: gói miễn phí giới hạn số user trong mạng của bạn. Chia sẻ máy thì họ chỉ thấy đúng máy DM. Giới hạn có thể đổi, kiểm tra lại trên trang giá của Tailscale.)

## An toàn

- Chỉ máy được chia sẻ mới vào được cổng 8787; ngoài internet không ai thấy.
- Nếu muốn LAN nhà bạn không truy cập được, đặt `HOST` = IP Tailscale của bạn trước khi chạy: PowerShell `$env:HOST="100.x.y.z"; npm run start`.
- Muốn cắt một người: Machines → máy của bạn → Share → xoá người đó.
- Không cần mật khẩu Basic-Auth (không dùng Caddy ở cách này). Kết nối là `http://` nhưng đã được Tailscale mã hoá.

## Hạn chế

- Máy DM phải **bật và đang chạy server** lúc chơi.
- Mỗi người chơi phải cài thêm Tailscale (một lần, ~2 phút).
- Nếu tính năng nào cần HTTPS (vài API trình duyệt), báo mình; Tailscale có `tailscale serve` cấp HTTPS miễn phí.

# Dựng phòng D&D trên máy chủ (VPS) — hướng dẫn

Mục tiêu: app chạy 24/7 trên một máy chủ nhỏ, cả nhóm vào bằng **1 link cố định**
+ **1 mật khẩu chung**. Không ai phải cài hay chạy gì (kể cả DM).

Ví dụ dùng **DigitalOcean**, nhưng Hetzner / Vultr … y hệt.

---

## 0. Chuẩn bị 1 lần trên GitHub

Repo `lamvukms-code/dnd-table` cần để **Public** (máy chủ `git clone` về để build):

1. Vào https://github.com/lamvukms-code/dnd-table/settings
2. Kéo xuống **Danger Zone → Change repository visibility → Public**.

Trong repo không có gì nhạy cảm (chính sách chỉ dùng nội dung SRD; dữ liệu
Crooked Moon và key dddice đều nằm ngoài repo).

---

## 1. Tạo máy chủ (DigitalOcean)

1. https://cloud.digitalocean.com → **Create → Droplets**.
2. **Region**: `Frankfurt` (FRA1).
3. **Image**: Ubuntu 24.04 (LTS) x64.
4. **Droplet type**: Basic → Regular → **$12/mo** (2 GB RAM) cho lần build đầu
   êm ái. *(Muốn tiết kiệm: chọn $6/mo (1 GB) — script tự thêm swap, build chậm
   hơn nhưng vẫn được. DigitalOcean cho hạ RAM lại sau nếu muốn.)*
5. **Authentication**: chọn **Password**, đặt mật khẩu root và ghi lại.
6. **Create Droplet**. Chờ ~1 phút, copy lại **IP** (dạng `164.92.x.x`).

---

## 2. Cài đặt (1 lệnh)

1. Trong DigitalOcean: droplet → nút **Console** (góc trên phải) → cửa sổ dòng lệnh.
2. Đăng nhập `root` + mật khẩu ở bước 1.5.
3. Dán đúng dòng này rồi Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/lamvukms-code/dnd-table/main/deploy/setup.sh | sudo bash
   ```

4. Nó hỏi **"Đặt mật khẩu cho phòng"** → gõ một mật khẩu (người chơi nhập 1 lần). Enter.
5. Chờ **~3–5 phút** (lần đầu build). Cuối cùng in ra:

   ```
   Link cho người chơi :  https://164-92-x-x.sslip.io
   Tên đăng nhập        :  player
   Mật khẩu             :  (mật khẩu bạn vừa đặt)
   ```

---

## 3. Chơi

- Gửi **link + mật khẩu** vào nhóm chat.
- Mỗi người mở link trên trình duyệt → hỏi user/pass → nhập `player` + mật khẩu
  (1 lần, trình duyệt nhớ) → gõ tên nhân vật → chơi.
- Người vào đầu tiên (phòng chưa có DM) sẽ thành **DM** — nên bạn vào trước, hoặc
  đổi vai trong ⚙ Cài đặt.

> Ổ khoá xanh (HTTPS) tự cấp trong ~30–60 giây đầu. Nếu báo lỗi chứng chỉ thì đợi
> chút rồi F5.

---

## 4. Việc thường ngày (trong Console của droplet)

| Việc | Lệnh |
|---|---|
| **Cập nhật bản mới** | chạy lại đúng lệnh `curl … \| sudo bash` ở mục 2 |
| Xem log | `cd /opt/dndtable/src/deploy && docker compose logs -f` |
| Khởi động lại | `cd /opt/dndtable/src/deploy && docker compose restart` |
| Tắt / bật phòng | `… docker compose down` / `… docker compose up -d` |
| Đổi mật khẩu phòng | `rm /opt/dndtable/.dnd-setup.env` rồi chạy lại lệnh cài đặt |

Dữ liệu (phòng, bestiary, ảnh) nằm trong Docker volume `dndtable_data`, **không mất**
khi cập nhật / khởi động lại. Sao lưu nhanh về `/root`:

```bash
docker run --rm -v dndtable_data:/d -v /root:/out alpine tar czf /out/dnd-backup.tgz -C /d .
```

---

## 5. Tuỳ chọn: link đẹp bằng tên miền riêng

Mua tên miền (vd `dnd.tenban.com`, ~250k/năm):

1. Ở trang quản lý tên miền, tạo bản ghi **A** trỏ `dnd` về IP của droplet.
2. Chạy lại setup với biến `SITE_ADDRESS`:

   ```bash
   rm /opt/dndtable/.dnd-setup.env
   curl -fsSL https://raw.githubusercontent.com/lamvukms-code/dnd-table/main/deploy/setup.sh -o /tmp/dnd.sh
   sudo SITE_ADDRESS=dnd.tenban.com bash /tmp/dnd.sh
   ```

Link mới: `https://dnd.tenban.com`.

---

## 6. Tuỳ chọn: cập nhật nhanh hơn (ảnh build sẵn)

Mặc định máy chủ tự build từ mã nguồn (đơn giản, không cần gì thêm). Nếu muốn cập
nhật chỉ trong vài giây thay vì vài phút, xem hướng dẫn trong
`deploy/optional-ghcr-workflow.yml` để bật GitHub Actions build ảnh và đổi
`deploy/docker-compose.yml` sang dùng ảnh đó.

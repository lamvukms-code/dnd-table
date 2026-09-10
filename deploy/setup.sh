#!/usr/bin/env bash
# One-command install / update for the DndTable game server on a fresh Ubuntu VPS.
#
#   curl -fsSL https://raw.githubusercontent.com/lamvukms-code/dnd-table/main/deploy/setup.sh | sudo bash
#
# Re-run the same command any time to update to the latest version.
set -euo pipefail

REPO="https://github.com/lamvukms-code/dnd-table"
DIR="/opt/dndtable"
SRC="$DIR/src"
ENVFILE="$DIR/.dnd-setup.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "Cần quyền root. Chạy:  sudo bash setup.sh" >&2
  exit 1
fi

echo "==> [1/5] Docker + git"
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "Thiếu 'docker compose'."; exit 1; }

echo "==> [2/5] Swap (nếu RAM thấp)"
if ! swapon --show | grep -q . && \
   [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 2000000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    + đã tạo 2G swap"
fi

echo "==> [3/5] Lấy mã nguồn"
mkdir -p "$DIR"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin main -q
  git -C "$SRC" reset --hard origin/main -q
else
  git clone --depth 1 "$REPO" "$SRC" -q
fi

echo "==> [4/5] Cấu hình phòng"
[ -f "$ENVFILE" ] && { set -a; . "$ENVFILE"; set +a; }

IP="$(curl -fsS4 https://api.ipify.org || curl -fsS4 https://ifconfig.me)"
SITE="${SITE_ADDRESS:-${IP}.sslip.io}"
BASIC_USER="${BASIC_USER:-player}"

if [ -z "${BASIC_HASH:-}" ]; then
  # read from the real terminal so this works even via `curl … | sudo bash`
  while :; do
    read -rsp "Đặt mật khẩu cho phòng (người chơi nhập 1 lần): " PW </dev/tty; echo
    [ -n "$PW" ] && break
    echo "  không được để trống."
  done
  BASIC_HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$PW")"
  PLAIN_NOTE="$PW"
fi

umask 077
cat > "$ENVFILE" <<EOF
SITE_ADDRESS=$SITE
BASIC_USER=$BASIC_USER
BASIC_HASH=$BASIC_HASH
EOF

sed -e "s|__SITE__|$SITE|" \
    -e "s|__USER__|$BASIC_USER|" \
    -e "s|__HASH__|$BASIC_HASH|" \
    "$SRC/deploy/Caddyfile.template" > "$SRC/deploy/Caddyfile"

echo "==> [5/5] Build & khởi động (lần đầu ~3–5 phút)"
cd "$SRC/deploy"
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true

cat <<EOF

============================================================
  PHÒNG D&D ĐÃ CHẠY

  Link cho người chơi :  https://$SITE
  Tên đăng nhập        :  $BASIC_USER
  Mật khẩu             :  ${PLAIN_NOTE:-<mật khẩu đã đặt trước đó>}

  * Lần đầu mở link, trình duyệt hỏi user/pass — nhập 1 lần, nó nhớ.
  * HTTPS (khoá xanh) tự cấp trong ~30–60 giây đầu. F5 lại nếu chưa lên.
  * Cập nhật về sau: chạy lại đúng lệnh curl … | sudo bash.
  * Xem log     :  cd $SRC/deploy && docker compose logs -f
  * Dừng phòng  :  cd $SRC/deploy && docker compose down
============================================================
EOF

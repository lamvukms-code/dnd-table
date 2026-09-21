#!/usr/bin/env bash
# Baseline host hardening for the DndTable VPS (Ubuntu/Debian). Idempotent.
#   - ufw: deny all inbound except SSH / HTTP / HTTPS
#   - fail2ban: bans IPs brute-forcing SSH
#   - unattended-upgrades: automatic security patches
#   - sshd: password login OFF and root key-only — but ONLY if a key is already installed,
#     so you can never lock yourself out.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Cần root" >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades >/dev/null

# --- firewall (Docker only publishes 80/443; the app port 8787 is never published) ---
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "    + ufw: chỉ mở 22, 80, 443"

# --- fail2ban for sshd ---
cat > /etc/fail2ban/jail.d/dnd-sshd.local <<'J'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
J
systemctl enable --now fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban >/dev/null 2>&1 || true
echo "    + fail2ban: khoá IP dò SSH sau 4 lần sai"

# --- automatic security updates ---
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'A'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
A
echo "    + tự cập nhật bản vá bảo mật"

# --- SSH: key-only, but never lock out ---
if [ -s /root/.ssh/authorized_keys ]; then
  cat > /etc/ssh/sshd_config.d/99-dnd-hardening.conf <<'S'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
S
  systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1 || true
  echo "    + SSH: tắt đăng nhập bằng mật khẩu (chỉ SSH key)"
else
  echo "    ! Chưa có SSH key trong /root/.ssh/authorized_keys → GIỮ đăng nhập mật khẩu."
  echo "      Hãy thêm SSH key rồi chạy lại setup để tắt mật khẩu."
fi

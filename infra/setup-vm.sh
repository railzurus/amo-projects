#!/bin/sh
# Первичная настройка ВМ для infra/ (Ubuntu 24.04). Безопасно запускать повторно.
#   ssh <сервер> 'sudo sh -s' < infra/setup-vm.sh
#
# Docker ставится из репозитория Ubuntu — не зависит от доступности download.docker.com.
# Не через cloud-init: у Cloud.ru свой скрипт в поле cloud_init заменяет создание пользователя.
set -eu

ADMIN_USER="${ADMIN_USER:-${SUDO_USER:-vm-user}}"

echo "== Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq docker.io docker-compose-v2 git jq ufw fail2ban unattended-upgrades

echo "== Docker"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
systemctl enable docker
systemctl restart docker
usermod -aG docker "$ADMIN_USER"

echo "== Файрвол"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443
ufw --force enable

echo "== SSH: только по ключу"
# Проверяем, что у пользователя есть ключ — иначе после отключения паролей не войти
if [ ! -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]; then
    echo "ОШИБКА: нет /home/$ADMIN_USER/.ssh/authorized_keys — вход по паролю НЕ отключён" >&2
    exit 1
fi
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

echo "== fail2ban, автообновления"
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades

echo "== Каталог для репозитория"
mkdir -p /opt/zurus
chown "$ADMIN_USER:$ADMIN_USER" /opt/zurus

echo "== Готово"
docker --version
docker compose version
ufw status | head -8

#!/bin/sh
# Интерактивное заполнение секретов на сервере — чтобы не пересылать их через чат и почту.
#   ssh -t <сервер> /opt/zurus/infra/configure.sh
# Пустой ввод — оставить текущее значение.
set -eu
cd "$(dirname "$0")"

[ -t 0 ] || { echo "Нужен терминал: запускайте через ssh -t" >&2; exit 1; }
trap 'stty echo 2>/dev/null' EXIT INT TERM

for f in .env env/ati-proxy.env env/atp-webhook.env; do
    [ -f "$f" ] || cp "$f.example" "$f"
    chmod 600 "$f"
done

# Значение пишется в одинарных кавычках: compose читает его буквально (в хэше пароля есть $)
set_var() {
    file=$1; key=$2; value=$3
    case "$value" in *"'"*) echo "  ✗ одинарная кавычка в значении не поддерживается" >&2; return 1 ;; esac
    tmp=$(mktemp)
    grep -v "^$key=" "$file" > "$tmp" || true
    printf "%s='%s'\n" "$key" "$value" >> "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
}

ask_secret() {
    printf '%s: ' "$1" >&2
    stty -echo
    read -r value
    stty echo
    printf '\n' >&2
    printf '%s' "$value"
}

echo "== api.zurus.tech — настройка секретов (ввод скрыт, Enter — пропустить)"

ati_key=$(ask_secret "API-ключ ATI.SU")
[ -n "$ati_key" ] && set_var env/ati-proxy.env ATI_API_KEY "$ati_key" && echo "  ✓ ATI_API_KEY"

amo_token=$(ask_secret "Долгосрочный токен amoCRM")
[ -n "$amo_token" ] && set_var env/ati-proxy.env AMOCRM_ACCESS_TOKEN "$amo_token" && echo "  ✓ AMOCRM_ACCESS_TOKEN"

atp_token=$(ask_secret "Токен amoCRM для пересчёта АТП (Enter — тот же, что для ATI)")
if [ -z "$atp_token" ]; then
    atp_token=$(grep '^AMOCRM_ACCESS_TOKEN=' env/ati-proxy.env | cut -d= -f2- | tr -d "'")
    current=$(grep '^AMOCRM_ACCESS_TOKEN=' env/atp-webhook.env | cut -d= -f2- | tr -d "'")
    # Не затираем уже заданный отдельный токен АТП
    [ -n "$current" ] && atp_token=""
fi
[ -n "$atp_token" ] && set_var env/atp-webhook.env AMOCRM_ACCESS_TOKEN "$atp_token" && echo "  ✓ AMOCRM_ACCESS_TOKEN (АТП)"

logs_pass=$(ask_secret "Пароль для https://api.zurus.tech/logs/")
if [ -n "$logs_pass" ]; then
    logs_pass2=$(ask_secret "Повторите пароль")
    if [ "$logs_pass" != "$logs_pass2" ]; then
        echo "  ✗ пароли не совпадают — не изменён" >&2
    else
        hash=$(printf '%s\n' "$logs_pass" | docker run --rm -i caddy:2.11-alpine caddy hash-password)
        set_var .env LOGS_PASSWORD_HASH "$hash"
        echo "  ✓ LOGS_PASSWORD_HASH (логин: $(grep '^LOGS_USER=' .env | cut -d= -f2))"
    fi
fi

echo
echo "== Что заполнено (значения скрыты)"
for pair in "env/ati-proxy.env ATI_API_KEY" "env/ati-proxy.env AMOCRM_ACCESS_TOKEN" "env/atp-webhook.env AMOCRM_ACCESS_TOKEN" ".env LOGS_PASSWORD_HASH"; do
    set -- $pair
    value=$(grep "^$2=" "$1" | cut -d= -f2- | tr -d "'")
    case "$value" in ''|*заменить*) echo "  ✗ $1: $2 — пусто" ;; *) echo "  ✓ $1: $2" ;; esac
done

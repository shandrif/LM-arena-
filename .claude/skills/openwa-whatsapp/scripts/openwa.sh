#!/usr/bin/env bash
# Thin CLI over the OpenWA REST API. Needs: curl, python3 (for JSON encoding).
# Env: OPENWA_URL (default http://localhost:2785), OPENWA_API_KEY, OPENWA_SESSION.
set -euo pipefail

URL="${OPENWA_URL:-http://localhost:2785}"; URL="${URL%/}"
KEY="${OPENWA_API_KEY:-}"
SID="${OPENWA_SESSION:-}"

die() { echo "openwa: $*" >&2; exit 1; }
need_key() { [[ -n "$KEY" ]] || die "OPENWA_API_KEY is not set"; }
need_sid() { [[ -n "$SID" ]] || die "OPENWA_SESSION is not set (run: $0 sessions)"; }

# Build JSON safely from key=value pairs (values starting with json: are raw JSON).
json() {
  python3 -I -c '
import json, sys
out = {}
for arg in sys.argv[1:]:
    k, _, v = arg.partition("=")
    if v.startswith("json:"):
        out[k] = json.loads(v[5:])
    elif v != "":
        out[k] = v
print(json.dumps(out, ensure_ascii=False))' "$@"
}

# 966512345678 / +966 51 234 5678 -> 966512345678@c.us ; ids with @ are left as-is.
chat() {
  local c="$1"
  if [[ "$c" == *@* ]]; then echo "$c"; else c="${c//[^0-9]/}"; [[ -n "$c" ]] || die "bad chat id"; echo "${c}@c.us"; fi
}

call() { # METHOD PATH [JSON]
  need_key
  local args=(-sS -X "$1" "$URL$2" -H "X-API-Key: $KEY" -w '\n[HTTP %{http_code}]\n')
  [[ $# -ge 3 ]] && args+=(-H "Content-Type: application/json" --data-binary "$3")
  curl "${args[@]}"
}

S() { need_sid; echo "/api/sessions/$SID"; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  health)          curl -sS -w '\n[HTTP %{http_code}]\n' "$URL/api/health" ;;
  sessions)        call GET /api/sessions ;;
  create-session)  call POST /api/sessions "$(json name="${1:?name}")" ;;
  status)          call GET "$(S)" ;;
  start|stop|logout) call POST "$(S)/$cmd" ;;
  qr)              call GET "$(S)/qr" ;;
  pair)            call POST "$(S)/pairing-code" "$(json phoneNumber="${1:?phone digits}")" ;;
  chats)           call GET "$(S)/chats" ;;
  groups)          call GET "$(S)/groups" ;;
  history)         call GET "$(S)/messages/$(chat "${1:?chat}")/history?limit=${2:-20}" ;;
  send-text)
    call POST "$(S)/messages/send-text" "$(json chatId="$(chat "${1:?chat}")" text="${2:?text}")" ;;
  send-image)
    call POST "$(S)/messages/send-image" "$(json chatId="$(chat "${1:?chat}")" url="${2:?url}" caption="${3:-}")" ;;
  send-doc)
    call POST "$(S)/messages/send-document" \
      "$(json chatId="$(chat "${1:?chat}")" url="${2:?url}" filename="${3:?filename}" caption="${4:-}")" ;;
  reply)
    call POST "$(S)/messages/reply" \
      "$(json chatId="$(chat "${1:?chat}")" quotedMessageId="${2:?quotedMessageId}" text="${3:?text}")" ;;
  send-bulk) # FILE(one number per line) TEXT [delayMs]
    file="${1:?file}"; text="${2:?text}"; delay="${3:-8000}"
    body=$(python3 -I -c '
import json, re, sys
nums = [re.sub(r"\D", "", l) for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
nums = [n for n in nums if n]
if len(nums) > 100: sys.exit("max 100 recipients per batch")
print(json.dumps({"messages": [{"chatId": n + "@c.us", "type": "text", "content": {"text": sys.argv[2]}} for n in nums],
                  "options": {"delayBetweenMessages": int(sys.argv[3]), "randomizeDelay": True, "stopOnError": False}}, ensure_ascii=False))
' "$file" "$text" "$delay")
    call POST "$(S)/messages/send-bulk" "$body" ;;
  batch)           call GET "$(S)/messages/batch/${1:?batchId}" ;;
  add-webhook) # URL SECRET [events...]
    hook="${1:?url}"; secret="${2:?secret}"; shift 2
    events=$(python3 -I -c 'import json,sys; print(json.dumps(sys.argv[1:] or ["message.received"]))' "$@")
    call POST "$(S)/webhooks" "$(json url="$hook" secret="$secret" events="json:$events")" ;;
  webhooks)        call GET "$(S)/webhooks" ;;
  test-webhook)    call POST "$(S)/webhooks/${1:?webhookId}/test" ;;
  raw)             if [[ $# -ge 3 ]]; then call "$1" "$2" "$3"; else call "${1:?METHOD}" "${2:?path}"; fi ;;
  help|*)
    cat <<USAGE
usage: openwa.sh <command> [args]
  health | sessions | create-session NAME | status | start | stop | logout | qr | pair PHONE
  chats | groups | history CHAT [N]
  send-text CHAT TEXT | send-image CHAT URL [CAPTION] | send-doc CHAT URL FILENAME [CAPTION]
  reply CHAT QUOTED_ID TEXT | send-bulk FILE TEXT [DELAY_MS] | batch BATCH_ID
  add-webhook URL SECRET [EVENT...] | webhooks | test-webhook ID
  raw METHOD PATH [JSON]
CHAT = phone digits (966512345678), or a full id (…@c.us / …@g.us)
USAGE
    ;;
esac

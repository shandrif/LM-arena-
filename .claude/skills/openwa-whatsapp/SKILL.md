---
name: openwa-whatsapp
description: Send and receive WhatsApp messages from the user's apps through a self-hosted OpenWA gateway (github.com/rmyndharis/OpenWA). Use when the user wants to send a WhatsApp text, image, document or bulk message, reply to a chat, set up a WhatsApp webhook/auto-reply, connect a WhatsApp number (QR or pairing code), check a session's status, or wire WhatsApp notifications into an app (for example sending a weekly dashboard summary).
---

# OpenWA WhatsApp automation

OpenWA is a self-hosted WhatsApp API gateway (NestJS, Docker). It links a WhatsApp
number the way WhatsApp Web does, then exposes it as a REST API on port `2785`,
pushes incoming events to webhooks, and can optionally expose itself as an MCP
server. This skill drives it with `scripts/openwa.sh` (curl wrapper) and receives
events with `scripts/webhook-receiver.mjs` (Node, no dependencies).

## 0. Prerequisites (check first)

The scripts read three environment variables:

| Variable           | Example                     | Notes                                                            |
| ------------------ | --------------------------- | ---------------------------------------------------------------- |
| `OPENWA_URL`       | `http://localhost:2785`     | Base URL of the gateway, no trailing `/api`                      |
| `OPENWA_API_KEY`   | `owa_k1_…`                  | Never print, log or commit it. Prefer a scoped `operator` key    |
| `OPENWA_SESSION`   | session id (uuid)           | The linked WhatsApp number to send from                          |

Run `scripts/openwa.sh health` first. If it fails, the gateway is not running: tell
the user how to start it (section 1) instead of guessing. If `OPENWA_API_KEY` is
unset, ask the user for it; do not search the disk for it.

## 1. Running the gateway (one-time, on the user's server or PC)

```bash
git clone https://github.com/rmyndharis/OpenWA.git && cd OpenWA
docker compose -f docker-compose.dev.yml up -d      # production: docker compose up -d
docker exec openwa-api cat /app/data/.api-key        # admin key, printed once
```

Dashboard and API share the port: `http://localhost:2785` (dashboard),
`/api` (REST), `/api/docs` (Swagger). It must run somewhere that stays on; a
Claude cloud session is ephemeral and cannot host it.

## 2. Linking a WhatsApp number

```bash
scripts/openwa.sh create-session my-bot      # prints the new session id -> OPENWA_SESSION
scripts/openwa.sh start                      # boots the engine
scripts/openwa.sh qr > qr.json               # .qrCode / data URL: scan from WhatsApp > Linked devices
# or, without a camera:
scripts/openwa.sh pair 9665XXXXXXXX          # digits only, country code first; enter the code on the phone
scripts/openwa.sh status                     # wait for "ready"
```

## 3. Sending

Chat ids: a person is `<countrycode+number>@c.us` (e.g. `966512345678@c.us`, no `+`),
a group is `<id>@g.us` (find it with `scripts/openwa.sh groups`). The script turns a
bare number into `@c.us` for you.

```bash
scripts/openwa.sh send-text  966512345678 "Your order #123 has shipped"
scripts/openwa.sh send-image 966512345678 https://example.com/chart.png "Weekly sales"
scripts/openwa.sh send-doc   966512345678 https://example.com/report.pdf report.pdf "Week 44 report"
scripts/openwa.sh reply      966512345678@c.us <quotedMessageId> "Thanks, received"
scripts/openwa.sh send-bulk  recipients.txt "Reminder: meeting at 10:00"   # one number per line, max 100, paced
scripts/openwa.sh history    966512345678@c.us 20
```

Media can also be sent as base64 instead of a URL (see `reference.md`).
For anything not wrapped, call `scripts/openwa.sh raw <METHOD> <path> [json]`,
e.g. `raw GET /api/sessions/$OPENWA_SESSION/chats`.

## 4. Receiving (webhooks / auto-reply)

1. Start the receiver where OpenWA can reach it:
   `OPENWA_WEBHOOK_SECRET=<random> node scripts/webhook-receiver.mjs` (port 3000,
   path `/openwa/webhook`). It checks `X-OpenWA-Signature` (HMAC-SHA256 of the raw
   body), dedupes on `X-OpenWA-Idempotency-Key`, and calls `handleEvent()`. Put the
   app's logic there (auto-reply, save to DB, forward to another system).
2. Register it: `scripts/openwa.sh add-webhook https://my-server/openwa/webhook "$OPENWA_WEBHOOK_SECRET" message.received`
   Add filters (sender / chatId / body contains …) with `raw`, see `reference.md`.

Webhook body: `{ event, timestamp, sessionId, idempotencyKey, deliveryId, data }`;
for `message.received`, `data` holds `id, from, to, body, type, timestamp, isGroup, fromMe, …`.

## 5. Optional: let Claude drive WhatsApp directly (MCP)

Start OpenWA with `MCP_ENABLED=true` (read-only tools) or also `MCP_READONLY=false`
(adds send/reply), then copy `mcp.json.example` to the project's `.mcp.json` and
set the key. Claude then gets `openwa` tools without this script.

## Rules when using this skill

- **Confirm before sending.** A WhatsApp message to a real person cannot be unsent
  cleanly. Show the recipient(s) and text and get a yes before the first send in a
  conversation, and always before bulk sends.
- **Ban risk.** OpenWA is unofficial (reverse-engineered WhatsApp Web). Use a
  dedicated number, never the user's main business number; only message people who
  expect it; keep bulk sends small and paced (`delayBetweenMessages`); consider
  `SEND_PACING_ENABLED=true`. For OTP / critical flows, keep an SMS/email fallback
  or use the official WhatsApp Cloud API.
- **Secrets.** Keep keys in env vars or a git-ignored `.env`; never write them into
  committed files, URLs or logs.
- Errors: `401` bad key · `403` key not allowed for that session/chat · `404` wrong
  session id · `409`/`503` session not `ready` (run `status`, then `start`) · `501`
  feature not supported by the engine (whatsapp-web.js vs baileys).

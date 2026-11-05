# OpenWA REST quick reference

All routes are under `$OPENWA_URL/api`, header `X-API-Key: <key>` (or `Authorization: Bearer <key>`).
Full spec: `http://<gateway>:2785/api/docs` (Swagger) or `docs/06-api-specification.md` in the OpenWA repo.

## Sessions
| Method | Path | Body |
|---|---|---|
| POST | `/sessions` | `{ "name": "my-bot" }` |
| GET | `/sessions` / `/sessions/{id}` | – |
| POST | `/sessions/{id}/start` · `/stop` · `/logout` | – |
| GET | `/sessions/{id}/qr` | – (returns PNG data URL) |
| POST | `/sessions/{id}/pairing-code` | `{ "phoneNumber": "9665XXXXXXXX" }` |

Status values: `created`, `initializing`, `qr_ready`, `authenticating`, `ready`, `disconnected`, `failed`.

## Messages (`/sessions/{id}/messages/...`)
| Path | Required | Optional |
|---|---|---|
| `send-text` | `chatId`, `text` | `mentions[]`, `linkPreview`, `quotedMessageId` |
| `send-image` / `send-video` / `send-audio` / `send-document` / `send-sticker` | `chatId` + (`url` or `base64`+`mimetype`) | `filename`, `caption`, `mentions[]` |
| `send-location` | `chatId`, `latitude`, `longitude` | `description`, `address` |
| `send-template` | `chatId` + (`templateId` or `templateName`) | `vars` |
| `send-poll` | `chatId`, `name`, `options[]` | `allowMultipleAnswers` |
| `reply` | `chatId`, `quotedMessageId`, `text` | `mentions[]` |
| `react` | `chatId`, `messageId`, `emoji` | – |
| `send-bulk` | `messages[]` (≤100: `{chatId, type, content:{text|image|…, caption}, variables}`) | `batchId`, `options:{delayBetweenMessages, randomizeDelay, stopOnError}` |
| GET `batch/{batchId}` | – | progress of a bulk send; POST `batch/{batchId}/cancel` stops it |
| GET `{chatId}/history?limit=N` | – | whatsapp-web.js engine only |

## Webhooks
POST `/sessions/{id}/webhooks`:
```json
{
  "url": "https://my-server/openwa/webhook",
  "events": ["message.received", "message.ack", "session.status"],
  "secret": "random-signing-secret",
  "filters": { "conditions": [
    { "field": "body", "operator": "contains", "value": "invoice" },
    { "field": "isGroup", "operator": "is", "value": false }
  ]},
  "retryCount": 3
}
```
Filter fields: `sender`, `recipient`, `chatId`, `body`, `type`, `mentions`, `fromMe`, `hasMedia`, `isGroup`, `kind` (conditions are ANDed, max 20).
Operators: id/enum fields `is`/`isNot` (value = array); text (`body`) `contains`/`equals` (+ `caseSensitive`); booleans `is` (value = true/false).

Events: `message.received`, `message.sent`, `message.ack`, `message.failed`, `message.revoked`,
`message.reaction`, `message.edited`, `session.status`, `session.qr`, `session.authenticated`,
`session.disconnected`, `group.join`, `group.leave`, `group.update`, `call.received`, `poll.vote`,
`status.received`, … or `"*"`.

Delivery headers: `X-OpenWA-Signature: sha256=<hex HMAC of raw body>`, `X-OpenWA-Event`,
`X-OpenWA-Idempotency-Key` (dedupe on it; retries repeat it), `X-OpenWA-Delivery-Id`, `X-OpenWA-Retry-Count`.
Return 2xx only after the event is safely handled; non-2xx is retried.

## Other useful routes
`GET /sessions/{id}/chats`, `/groups`, `/contacts`, `GET /sessions/{id}/contacts/{contactId}`,
`POST /sessions/{id}/templates` (reusable texts with `{{variables}}`, sent with `messages/send-template` using `vars`),
`POST /sessions/{id}/automation-rules` (server-side keyword auto-replies, no code needed),
`GET /api/health`.

## API keys
Mint a dedicated key for each app in the dashboard (API Keys): role `operator`, limited to the one
session (and optionally to specific chats with `allowedChats`). Viewer keys can only read.

#!/usr/bin/env node
// Minimal OpenWA webhook receiver (Node 18+, no dependencies).
//   OPENWA_WEBHOOK_SECRET=... [PORT=3000] [AUTO_REPLY=1] node webhook-receiver.mjs
// Verifies X-OpenWA-Signature over the raw body, dedupes retries, then calls handleEvent().
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const PATH = process.env.WEBHOOK_PATH || '/openwa/webhook';
const SECRET = process.env.OPENWA_WEBHOOK_SECRET;
const OPENWA_URL = (process.env.OPENWA_URL || 'http://localhost:2785').replace(/\/$/, '');
const API_KEY = process.env.OPENWA_API_KEY;
if (!SECRET) { console.error('Set OPENWA_WEBHOOK_SECRET'); process.exit(1); }

const seen = new Map(); // idempotencyKey -> time (in-memory; use your DB in production)
function alreadySeen(key) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 24 * 3600e3) seen.delete(k);
  if (!key) return false;
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

function validSignature(raw, header) {
  if (!header) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex'));
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

async function sendText(sessionId, chatId, text) {
  const r = await fetch(`${OPENWA_URL}/api/sessions/${sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ chatId, text }),
  });
  if (!r.ok) throw new Error(`send-text ${r.status}: ${await r.text()}`);
}

// ---- Put your app logic here -------------------------------------------------
async function handleEvent(evt) {
  const { event, sessionId, data } = evt;
  if (event === 'message.received' && !data.fromMe) {
    console.log(`[${sessionId}] ${data.from}: ${data.body}`);
    // Example: tiny keyword bot (only when AUTO_REPLY=1 and an API key is set).
    if (process.env.AUTO_REPLY === '1' && API_KEY && !data.isGroup) {
      const body = String(data.body || '').trim().toLowerCase();
      if (body === 'hi' || body === 'hello') await sendText(sessionId, data.from, 'Hello! How can we help?');
    }
  } else if (event === 'message.ack') {
    console.log(`ack ${data.messageId}: ${data.status}`);
  } else if (event === 'session.status') {
    console.log(`session ${sessionId} -> ${data.status}`);
  } else {
    console.log('event', event);
  }
}
// ------------------------------------------------------------------------------

http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url.split('?')[0] !== PATH) { res.writeHead(404).end(); return; }
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 8 * 1024 * 1024) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    const raw = Buffer.concat(chunks);
    if (!validSignature(raw, req.headers['x-openwa-signature'])) { res.writeHead(401).end('bad signature'); return; }
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch { res.writeHead(400).end('bad json'); return; }
    const key = req.headers['x-openwa-idempotency-key'] || evt.idempotencyKey;
    if (alreadySeen(key)) { res.writeHead(200).end('duplicate'); return; }
    try {
      await handleEvent(evt);
      res.writeHead(200).end('ok');
    } catch (e) {
      seen.delete(key); // let OpenWA retry
      console.error(e);
      res.writeHead(500).end('error');
    }
  });
}).listen(PORT, () => console.log(`OpenWA webhook receiver on :${PORT}${PATH}`));

#!/usr/bin/env bash
# One-shot deploy to the Cloudflare account you are logged in to.
# Use the magictales64@gmail.com account:  npx wrangler logout && npx wrangler login
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund

echo "Signed in as:"; npx wrangler whoami

# 1. D1 database (created once; id written into wrangler.toml)
if grep -q REPLACE_WITH_D1_ID wrangler.toml; then
  out=$(npx wrangler d1 create hm-training-audit)
  id=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)
  sed -i "s/REPLACE_WITH_D1_ID/$id/" wrangler.toml
fi
npx wrangler d1 execute hm-training-audit --remote --file=schema.sql

# 2. Secrets (only set if missing)
existing=$(npx wrangler secret list 2>/dev/null || echo "[]")
if ! echo "$existing" | grep -q SESSION_SECRET; then
  openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
fi
if ! echo "$existing" | grep -q ADMIN_PASSWORD; then
  read -rsp "Choose the HQ admin password (username: admin): " pw; echo
  printf '%s' "$pw" | npx wrangler secret put ADMIN_PASSWORD
fi

# 3. Deploy
npx wrangler deploy

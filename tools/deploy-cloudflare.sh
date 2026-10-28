#!/usr/bin/env bash
# Publishes the dashboard website to Cloudflare (Worker + page + D1 database) and sets its sign-in secrets.
# Needs two environment variables:  CLOUDFLARE_API_TOKEN (permission: Account > Workers Scripts > Edit)  and  CLOUDFLARE_ACCOUNT_ID.
# Accounts come from a private file (never committed):  users.private   one per line:  email|password|admin   or   email|password|view
# Usage:  tools/deploy-cloudflare.sh
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"; : "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
cd "$(dirname "$0")/.."
node tools/build.js
npx --yes wrangler@4 deploy
# without users.private (for example in a fresh session) only the code is published; the password and keys already stored in Cloudflare stay as they are
if [ ! -s users.private ]; then echo "Code deployed. users.private not found, so the stored password and secrets were left untouched."; exit 0; fi
# secrets: the accounts and a key that signs the session cookies (kept in .session-secret so that deploys do not sign everybody out)
[ -s .session-secret ] || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > .session-secret
node -e "const fs=require('fs');fs.writeFileSync('.secrets.tmp.json',JSON.stringify({USERS:fs.readFileSync('users.private','utf8').trim(),SESSION_SECRET:fs.readFileSync('.session-secret','utf8').trim()}))"
npx --yes wrangler@4 secret bulk .secrets.tmp.json
rm -f .secrets.tmp.json
echo "Done. Open the https://wtracker.<your-subdomain>.workers.dev address printed above."

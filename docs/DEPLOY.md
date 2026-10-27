# Putting the dashboard on its own website (Cloudflare)

The dashboard can run as its own website, for example `wtracker.com`, using a **Cloudflare Worker + a D1 database**, with its own
sign-in (email + password accounts). Everything is in this repository. The database `wtracker-db` already exists in the Cloudflare
account and its tables are created.

## What is where

| Part | File | Job |
|---|---|---|
| Website page | `dist/site/index.html` (built by `node tools/build.js`) | the whole dashboard in one file |
| Server | `cloud/worker.js` | sign-in, saving / loading records in the database |
| Settings | `wrangler.jsonc` | links the Worker, the page and the database `wtracker-db` |
| Database layout | `cloud/schema.sql` | tables `records` and `login_attempts` (already created) |
| Browser code | `js/cloud-db.js`, `js/weeks.js` | talks to the server, sign-in screen, week box, "New week" |
| Publishing | `tools/deploy-cloudflare.sh` | build + deploy + set the secrets in one command |

## Publish it (needs only the permission *Account → Workers Scripts → Edit*)

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom → permission **Account · Workers Scripts · Edit** → create. Copy your **Account ID** (Workers & Pages overview page).
2. Put them where the deploy can read them: as environment variables `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (in a Claude Code cloud environment: environment settings → add under *Network secrets* / environment variables, and allow the hosts `api.cloudflare.com` and `*.workers.dev`).
3. Create the private file `users.private` (it is git-ignored) with the password everyone will use, for example:
   ```
   team|AB12-CD34-EF56|admin
   ```
   The sign-in screen asks for the password only (one shared password, everybody who knows it has full access). Extra lines with other passwords also work, and `email|password|view` gives read-only access.
4. Run `tools/deploy-cloudflare.sh`. It prints the website address (`https://wtracker.<your-subdomain>.workers.dev`).
5. Move the current data: on the claude.ai dashboard click **Backup**; on the new website sign in as an admin and click **Restore**, pick the file and the week.
6. Your own address: buy the domain (for example at Cloudflare Registrar), then Workers & Pages → `wtracker` → Settings → Domains & routes → *Add custom domain*.

To change the password later: edit `users.private` (or ask Claude to generate a new one) and run the script again (everybody is signed out only if `.session-secret` is deleted).

Alternative without a token: Workers & Pages → Create → *Import a repository* → `shandrif/lm-arena-` (branch `claude/confident-wozniak-2lnao2`, build command `node tools/build.js`, deploy command `npx wrangler deploy`), then add the secrets `USERS` and `SESSION_SECRET` under Settings → Variables and secrets.

## Everyday use

* Sunday: click **＋ New week**, upload the week's files in each tab. Earlier weeks stay saved; pick any week in the **Week** box.
* Tabs that have no new file for the chosen week show a yellow note and the latest earlier upload.
* **Clear this week** removes only the chosen week's reports; other weeks, saved formats and notes are never touched.
* **Backup** saves all weeks in one file; **Restore** adds to what is there (it never wipes other weeks).

## Security notes

* Nothing under `/api` works without a valid sign-in; the page itself contains no data. The session cookie is signed, HttpOnly, Secure and SameSite=Strict; changes need a custom request header (blocks cross-site posts).
* Eight wrong passwords from one address lock sign-in for that address for 15 minutes.
* A user's role always comes from the current `USERS` secret, so removing a line cuts access immediately.
* Never set `DEV_OPEN` on the real Worker (it switches the check off; local testing only).
* Cloudflare Access can be used instead or as well: set `ACCESS_TEAM`, `ACCESS_AUD` (and `ADMINS`) and the Worker accepts the Access sign-in too.

## Free-plan limits (checked against Cloudflare's docs, October 2026)

D1: 5 GB storage, 5 million rows read and 100,000 rows written per day. Workers: 100,000 requests per day.
One week of reports is about 1 MB (about 25 rows), so a year is about 50 MB. The dashboard loads only the chosen week plus the previous six and each report type's newest file.

## For whoever continues this project (a new Claude session or a developer)

* Plain JavaScript, no framework: `js/*.js` are classic scripts sharing one global `LM`; `tools/build.js` inlines everything into one HTML file.
* Storage back-ends share one small interface (`LM.db.all/get/put/del/clear`): `core.js` (this browser), `shared-db.js` (claude.ai artifact database), `cloud-db.js` (this website). `weeks.js` wraps whichever is active and adds the week logic.
* Week rule: Sunday-Saturday, named by the Saturday; a Sunday-dated file counts for the week that just ended. Long reference files (> 100 days, e.g. the year calendar) use week `2000-01-01` = available in every week. Reports saved before weeks existed have no week and show in every week until the owner assigns one (one-time prompt).
* Test locally: `npm i wrangler`; put `USERS` and `SESSION_SECRET` in a git-ignored `.dev.vars`; `wrangler d1 execute wtracker-db --local --file cloud/schema.sql`; `wrangler dev --local`.

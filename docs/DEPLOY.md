# Putting the dashboard on its own website (Cloudflare)

The dashboard can run as its own website, for example `wtracker.com`, using **Cloudflare Workers + a D1 database**.
Everything is already in this repository. The database `wtracker-db` already exists in the Cloudflare account and its table is created.

## What is where

| Part | File | Job |
|---|---|---|
| Website page | `dist/site/index.html` (built by `node tools/build.js`) | the whole dashboard in one file |
| Server | `cloud/worker.js` | sign-in check + saving / loading records in the database |
| Settings | `wrangler.jsonc` | links the Worker, the page and the database `wtracker-db` |
| Database layout | `cloud/schema.sql` | one table, `records` (already created) |
| Browser storage code | `js/cloud-db.js`, `js/weeks.js` | talks to the server, week selector, "New week" |

## One-time setup (about 20 minutes, in the Cloudflare dashboard)

1. **Connect the code.** Workers & Pages → Create → *Import a repository* → choose `shandrif/lm-arena-`.
   * Production branch: `claude/confident-wozniak-2lnao2` (or merge it to `main` and use `main`).
   * Build command: `node tools/build.js`
   * Deploy command: `npx wrangler deploy`
   Every push to that branch then publishes the website automatically.
2. **Turn on sign-in (Cloudflare Access).** Zero Trust → Access → Applications → Add → *Self-hosted*.
   * Application domain: the website address (first the `wtracker.<account>.workers.dev` address, later your own domain).
   * Policy: *Allow* → Emails → the people who may open the dashboard (they sign in with a one-time code sent to their email).
   * After saving, note the application's **AUD tag** (Overview tab) and your Zero Trust **team name** (the part before `.cloudflareaccess.com`).
3. **Give the Worker its settings.** Workers & Pages → `wtracker` → Settings → Variables and secrets → add:
   * `ACCESS_TEAM` = your team name
   * `ACCESS_AUD`  = the AUD tag
   * `ADMINS`      = emails allowed to upload, delete and restore, separated by commas (everyone else who can sign in is view-only)
   Until these three exist the website refuses every request (it is closed by default; this is intentional).
4. **Your own address.** Buy the domain (for example at Cloudflare Registrar), then Workers & Pages → `wtracker` → Settings → Domains & routes → *Add custom domain*. Add the same domain to the Access application from step 2.
5. **Move the current data.** Open the claude.ai dashboard → **Backup** (saves a file). Open the new website → **Restore** → choose the file → pick the week the reports belong to.

## Everyday use

* Sunday: click **＋ New week**, upload the week's files in each tab. Earlier weeks stay saved; pick any week in the **Week** box.
* Tabs that have no new file for the chosen week show a yellow note and the latest earlier upload.
* **Clear this week** removes only the chosen week's reports; other weeks, saved formats and notes are never touched.
* **Backup** saves all weeks in one file; **Restore** adds to what is there (it never wipes other weeks).

## Free-plan limits (checked against Cloudflare's docs, October 2026)

D1: 5 GB storage, 5 million rows read and 100,000 rows written per day. Workers: 100,000 requests per day.
One week of reports is about 1 MB (about 25 rows), so a year is about 50 MB. The dashboard loads only the chosen week plus the previous six and each report type's newest file.

## For whoever continues this project (a new Claude session or a developer)

* All code is plain JavaScript with no build framework: `js/*.js` are classic scripts sharing one global `LM`; `tools/build.js` inlines everything into one HTML file.
* Storage back-ends all expose the same small interface (`LM.db.all/get/put/del/clear`): `core.js` (this browser), `shared-db.js` (claude.ai artifact database), `cloud-db.js` (this website). `weeks.js` wraps whichever one is active and adds the week logic.
* Week rule: Sunday-Saturday, named by the Saturday; a Sunday-dated file counts for the week that just ended. Long reference files (> 100 days, e.g. the year calendar) use week `2000-01-01` = available in every week.
* Test locally: `npm i wrangler`, then `wrangler d1 execute wtracker-db --local --file cloud/schema.sql` and `wrangler dev --local --var DEV_OPEN:1` (DEV_OPEN switches the sign-in check off, for local testing only).
* Never set `DEV_OPEN` on the real Worker.

# Weekly Department Dashboard

One tab per department, placed side by side by topic: Sales · Manual punch · Wastage · International · Training | Procurement · Warehouse · Shipment | Bakery factory · Roasting | NEP · Real estate | Quality | Discussion points.
There is no Overview sub-tab; each tab opens on its first working sub-tab. Every block (card, chart, KPI row, table) has a Hide / Show tag; hidden blocks are remembered per browser, and a "Show all" bar appears when something is hidden. Discussion points use a Word-style rich-text editor (fonts, sizes, colours, highlight, lists, alignment, links); notes are stored as sanitised HTML.
Sales has a **Mugs** sub-tab (next to Heat map): mug sales by family, by mug and by store, taken from the item sales of the Sales report (free refills are not counted).
Under it, **Mugs stock in branches** has its own upload for the weekly *SOH Daily Tracker – Mugs & Coffee* workbook (one sheet per ROM, stores across the top): stock per mug and ROM, and per store (by mug or by family), with the change against the previous stock file. Only mug rows are read; mugs are matched by name (the workbook's own “Total” sheet adds rows by position and is not used), and every row is checked against its sheet's Total column before saving.
**Management briefs** (before Discussion points): upload the week's HTML meeting briefs; each gets a sub-tab with a summary (KPI tiles, executive summary, findings by level, decisions, questions, recommended actions, timeline) read from the brief itself, an Overview across all briefs, and an **Original** switch that shows the brief exactly as sent (in a sandboxed frame).
**＋ Add tab** (end of the tab bar, admins only): add a tab of your own, name it and choose where it goes; ⚙ Tab settings renames, moves or deletes it. Its **Page** is written in the dashboard: KPI tiles, text (rich-text editor) and tables (typed or pasted from Excel, optionally shown as a bar or line chart). Each week has its own page; a new week can start from a copy of the last one. Its **Files** sub-tab takes any Excel/CSV like the flexible tabs. View-only users see the pages but cannot change them.
Each tab has its own **Upload**; every file is **checked before anything is saved** (new/renamed columns, bad values,
duplicates, re-sent files, overlapping periods…) and nothing is stored until you approve the review.

Three ways to run it, all with the same screens: **its own website** (Cloudflare Worker + D1 database, see `docs/DEPLOY.md`), **a claude.ai artifact** (shared artifact database), or **a plain file / local server** (data stays in that browser's IndexedDB). Without a back-end nothing is sent anywhere.

## Weeks
Every upload belongs to a week (Sunday–Saturday, named by its Saturday). The **Week** box in the header chooses the week you look at and upload into; **＋ New week** starts the next one. Earlier weeks stay saved. A tab with no file for the chosen week shows the latest earlier upload with a yellow note saying so.

## Weekly routine
1. On Sunday click **＋ New week** (last week stays saved; pick it any time in the Week box).
2. Upload the new week's files in each tab (the Roasting and International tabs accept several files at once).
3. Optional: **⬇ Download as HTML** keeps a read-only copy of the chosen week (one `.html` file with the data; opens by double-click, works offline).

| Button | What it does |
|---|---|
| ＋ New week | Starts the next Sunday–Saturday week. Nothing is deleted. |
| ⬇ Download as HTML | Saves the app + the chosen week's data (and earlier ones) as one read-only HTML file. |
| Clear this week | Removes only the chosen week's reports. Other weeks, learned file formats, notes and meetings are kept. |
| Backup / Restore | Backup saves every week in one JSON file. Restore adds to what is there (it never wipes other weeks). |

## Publishing it as a website
**With sign-in and a shared database (recommended): see `docs/DEPLOY.md`.** (Cloudflare Worker `cloud/worker.js`, D1 database, Cloudflare Access for login, your own domain.)

Static-only options (data stays in each visitor's browser): the repo is plain static files, so any static host works.

* **GitHub Pages:** Settings → Pages → *Deploy from a branch* → pick the branch (e.g. `main`) and `/ (root)`.
* **Netlify / Cloudflare Pages / any web server:** publish the repo root; no build command.
* **Single file:** `node tools/build.js` writes `dist/dashboard.html` (everything inlined, ~3 MB). It runs from a double-click, offline.

> **Privacy:** the published site contains **no company data** (data only lives in each visitor's browser).
> Saved HTML copies and Backup files **do** contain data: keep them private, never commit them (they are git-ignored here).
> A public website can be opened by anyone with the link, so put it behind login (e.g. Cloudflare Access / Netlify password) if the *layout* itself is not meant to be public.

## Code map
`js/engine.js` generic file-check engine · `js/core.js` helpers, storage, review dialog · `js/snapshot.js` HTML copy / clear ·
`js/<dept>-model.js` parsing + checks (no DOM) · `js/<dept>-ui.js` screens · `js/generic-ui.js` flexible tab (used for Real estate) · `js/richtext.js` note editor · `js/blocks.js` hide/show blocks ·
`js/mugstock.js` mug stock file (Sales → Mugs) · `js/briefs-ui.js` management briefs · `js/customtabs.js` admin-made tabs · `js/codec.js` + `js/shared-db.js` (claude.ai) + `js/cloud-db.js` (website) storage back-ends · `js/weeks.js` week logic · `cloud/` Worker + database schema ·
`js/app.js` tabs + header. Libraries are vendored in `vendor/`.

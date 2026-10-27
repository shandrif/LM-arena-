# Weekly Department Dashboard

One tab per department, placed side by side by topic: Sales · Manual punch · Wastage · International · Training | Procurement · Warehouse · Shipment | Bakery factory · Roasting | NEP · Real estate | Quality | Discussion points.
There is no Overview sub-tab; each tab opens on its first working sub-tab. Every block (card, chart, KPI row, table) has a Hide / Show tag; hidden blocks are remembered per browser, and a "Show all" bar appears when something is hidden. Discussion points use a Word-style rich-text editor (fonts, sizes, colours, highlight, lists, alignment, links); notes are stored as sanitised HTML.
Each tab has its own **Upload**; every file is **checked before anything is saved** (new/renamed columns, bad values,
duplicates, re-sent files, overlapping periods…) and nothing is stored until you approve the review.

No server, no build step, no accounts: the data you upload stays **in your browser** (IndexedDB) and is never sent anywhere.

## Weekly routine
1. Open the dashboard. Click **⬇ Download as HTML** to keep a copy of last week (a single read-only `.html` file
   with all the data; it opens by double-click, works offline and never touches the live data).
2. Click **Clear dashboard** (offers to save the copy first) so the new week starts empty.
3. Upload the new week's files in each tab (the Roasting and International tabs accept several files at once).

Not clearing is fine too: reports of different periods are kept side by side with a period selector; the same period replaces the older upload (the old one is kept in history).

| Button | What it does |
|---|---|
| ⬇ Download as HTML | Saves the app + all current data as one read-only HTML file (a weekly archive you can email or open anywhere). |
| Clear dashboard | Removes all uploaded data and history from this browser. Learned file formats are kept so the same files upload without questions. |
| Backup / Restore | JSON file with the data, to move it to another computer or put it back into the live dashboard. (HTML copies are for viewing; Backup is for restoring.) |

## Publishing it as a website
The repo is plain static files, so any static host works.

* **GitHub Pages:** Settings → Pages → *Deploy from a branch* → pick the branch (e.g. `main`) and `/ (root)`.
* **Netlify / Cloudflare Pages / any web server:** publish the repo root; no build command.
* **Single file:** `node tools/build.js` writes `dist/dashboard.html` (everything inlined, ~3 MB). It runs from a double-click, offline.

> **Privacy:** the published site contains **no company data** (data only lives in each visitor's browser).
> Saved HTML copies and Backup files **do** contain data: keep them private, never commit them (they are git-ignored here).
> A public website can be opened by anyone with the link, so put it behind login (e.g. Cloudflare Access / Netlify password) if the *layout* itself is not meant to be public.

## Code map
`js/engine.js` generic file-check engine · `js/core.js` helpers, storage, review dialog · `js/snapshot.js` HTML copy / clear ·
`js/<dept>-model.js` parsing + checks (no DOM) · `js/<dept>-ui.js` screens · `js/generic-ui.js` flexible tab (used for Real estate) · `js/richtext.js` note editor · `js/blocks.js` hide/show blocks ·
`js/app.js` tabs + header. Libraries are vendored in `vendor/`.

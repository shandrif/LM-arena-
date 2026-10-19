# Weekly Department Dashboard

Open `index.html` (or host the folder on GitHub Pages / Netlify). No build step.

- One tab per department; each tab has its own **Upload** button (or drag a file onto the tab).
- Every upload is **checked first** and nothing is saved until you approve the review dialog
  (missing/renamed/new columns, bad values, duplicates, re-uploaded weeks, overlapping periods, ...).
- Data is stored in the browser (IndexedDB). Use **Backup / Restore** in the header to move it between computers.
- **Sales** has a dedicated template (`js/sales-model.js`) and dashboards (`js/sales-ui.js`).
- Other departments and **Others** use the flexible engine (`js/generic-ui.js`) until their dedicated template is added.

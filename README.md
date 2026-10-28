# HM Store Training Audit

Store-level training & compliance audit for Half Million stores. Runs on Cloudflare Workers + D1 (no build step).

## How it works
| Who | Logs in with | Sees |
|---|---|---|
| Store manager | store credentials (`store.<code>`) | Their store only: staff list, assess each staff member against their role's task outline (Cleaner, Cashier, Barista, Beverage, Manager), own outcomes + actions |
| Area manager / ROM | `am.<name>` / `rom.<name>` | Every store mapped to them; can run coaching visits |
| HQ admin | `admin` | All stores: dashboard, visits, actions, store/area-manager mapping |

Each task is answered **Trained (Y/N)** and **Performed (Y/N)**, as in the source workbook (`HM_SBS_FEB_2026`).
- **Compliance %** = tasks performed / tasks (same formula as the workbook). **Trained %** = tasks trained / tasks.
- **Pass** = compliance >= `PASS_MARK` (default 80, set in `wrangler.toml`). **Pass %** = share of assessments that passed.
- Reported per staff, store, area manager and ROM (dashboard filters: dates, ROM, AM, store, role, self vs coaching).

### Accountability
Every task that is not (trained **and** performed) becomes an action with an auto-categorised gap and an owner:

| Trained | Performed | Category | Owner | Due |
|---|---|---|---|---|
| No | No | Training gap | Training | +14 days |
| Yes | No | Execution gap | Operations | +7 days |
| No | Yes | Untrained practice | Training | +14 days |

Status flow: Open > In progress > Done > Verified (verified by HQ / AM / ROM). Stores can progress Operations actions; Training actions are updated by HQ. Overdue items are flagged on the dashboard.

## Deploy (magictales64@gmail.com Cloudflare account)
```bash
npx wrangler logout && npx wrangler login   # sign in as magictales64@gmail.com
./deploy.sh                                  # creates D1, applies schema, sets secrets, deploys
```
Then sign in as `admin`, open **Stores & Mapping**, paste the area-manager mapping
(`store_code,store_name,city,area_manager,rom`) and download the generated logins.

## Local dev
```bash
npm install
printf 'SESSION_SECRET=dev-secret-change-me\nADMIN_PASSWORD=ChangeMe123\n' > .dev.vars
npm run db:local && npm run dev
```

## Files
- `src/worker.js` - API, auth (PBKDF2 + signed cookie), scoring, scope rules
- `src/checklists.json` - task outlines extracted from the workbook (`python3 tools/extract.py <xlsx>` regenerates it)
- `public/` - single-page app; brand colours are CSS variables at the top of `styles.css`
- `schema.sql` - D1 schema

# ERP Day-One Go-Live Reset (Production)

## Purpose and scope
Start Taky Apartment as a genuinely new, empty 15-room property. Keep **all 15 room identities (101–305, three floors), dimensions, configured rent packages, utility tariffs, billing schedule, bank details, PromptPay and property settings**.

Clear operational transactions and demo records: reservations, tenants, leases, meter readings, invoices and line items, payments, deposit settlements and expenses. Set all rooms to `AVAILABLE` and their water/electricity baselines to `0`. All occupancy, billed, collected, arrears, expense and deposit-held indicators must become zero.

**This is deliberately destructive and must run ONCE, offline, after backup.** Never automate it as part of deploy, startup, CI, migrations or regular seed.

## Important implementation findings
- The web dashboard `src/app/api/erp/route.ts` GET currently reads `src/server/store-singleton.ts` (in-memory state and persisted JSON file `data/taky_erp_local_db.json`), **even when `USE_PRISMA_DB=true`**.
- With `USE_PRISMA_DB=true`, several POST actions write PostgreSQL while GET still reads JSON. This is a data-consistency limitation: resetting one store alone can leave the other store with old records. Prefer `both` if PostgreSQL has ever been used, and independently reconcile the architecture before relying on PostgreSQL production operations.
- `prisma/seed.ts` formerly created non-zero room meter values; this branch changes NEW room seeds to zero. A re-run of seed does **not** erase existing PostgreSQL room meters or existing transactions.
- Existing demo fixtures are in `createInitialTakyErpContext`. This branch defaults fresh runtime state to `createCleanGoLiveErpContext`; demo mode needs `ERP_LOAD_DEMO=true` and is disabled for `NODE_ENV=production`.
- `CLEAR_FOR_GOLIVE` and `RESET_DEMO` HTTP POST actions are disabled in production in this branch. Do not use a browser console to reset live state.
- The repository's supplied `docker-compose.yml` only declares PostgreSQL; it does not configure a persistent volume for the Next.js app's JSON state. **Confirm your actual deployed web runtime has persistent `/app/data` storage and no other running app instances** before treating this as a production-safe configuration.

## Operator preflight
1. Confirm this is the correct production host and that users/tenants have not started real transactions. If any real records exist, preserve them or get explicit owner approval for deletion.
2. Take the ERP application **offline** (stop ALL app processes and workers, not just the browser). The app caches JSON in memory and can save old data over the reset file if left running. Keep PostgreSQL running if using `postgres` or `both`.
3. Locate the persistent JSON state file from the actual web container/host. Default is `<repo>/data/taky_erp_local_db.json`; if different, export `ERP_JSON_PATH=/actual/path`. If the file is inside a container, run against its mounted persistent path; do not accidentally reset a different copy.
4. Ensure `node`, `docker` (for PostgreSQL mode), sufficient backup disk space, and write permission on the JSON state directory are available.
5. Confirm you can restore from a recent backup. Backups contain personal tenant details and must be restricted and encrypted/off-device where appropriate.

## Preview and apply

Preview without modifying anything:

```bash
bash operations/reset-day-one.sh both
```

If ONLY the JSON backend has ever been used, choose `json`. If ONLY PostgreSQL holds operational records, choose `postgres`. If unsure, inspect both and use `both` if each holds relevant records. `both` is recommended for this repository while dual storage remains present.

After stopping the web application:

```bash
ERP_APP_STOPPED=YES bash operations/reset-day-one.sh both --apply --confirm=RESET-TO-DAY-ONE
```

The command validates the room set, backs up the JSON file (if present) and creates a PostgreSQL custom-format dump (when selected) **before** clearing data. Backups go into `backups/day-one-reset-YYYYMMDD_HHMMSS/` by default. The SQL transaction preserves room records and `PropertySetting`.

If either backend reset fails, **do not restart** until investigating whether one store has changed while the other did not; the backups allow recovery.

## Verification (before reopening to users)
- JSON: `rooms.length=15`, all status `AVAILABLE`, water/electricity meters `0`, all reservations/leases/invoices/settlements/expenses empty.
- PostgreSQL: 15 rooms, 15 available; no reservations, tenants, leases, meter readings, invoices, line items, payments, deposit settlements or expenses. All meters 0. Existing property settings retained.
- Restart web app and authenticate; check `GET /api/erp` and dashboard. Occupied 0, available 15, reservations 0, invoiced/collected/expenses/outstanding 0.
- Reload the page and restart the web app once more; confirm empty state persists and NO demo records reappear.
- Verify bank account, utility rates, billing date and rent tiers remain correct.

## Recovery
- JSON: stop the app; copy `backups/day-one-reset-.../taky_erp_local_db.json.before` back to the exact persistent JSON file, then restart.
- PostgreSQL: stop the app, and restore the `postgres.before.dump` file through a DBA-approved `pg_restore` procedure, preferably to an isolated database first. Do not restore blindly over a changed production database.
- Files uploaded as payment slips are **not** deleted by this reset; audit and purge/retain them separately under the relevant data-retention policy.

## Operational follow-up
The application has a dual-store inconsistency (Prisma writes vs JSON reads), and the example Docker setup does not show persistent JSON storage. Resolve these independently before registering actual tenants or accepting payments in production.

## GitHub Pages: static index.html day-one migration (deployed separately from Next.js)

The repository has a GitHub Pages site that serves the top-level `index.html`. Its data is **not** stored in the Prisma/PostgreSQL backend: it lives in the **current browser's localStorage** key `TAKY_ERP_PROTOTYPE_STATE_V1`. Consequently, the offline server reset described above does not reset browsers.

This branch updates both `index.html` and `prototype/index.html`:
- Every NEW browser begins with exactly 15 available rooms, zero meter readings and zero income, invoices, deposits, expenses and settlement records.
- On the first load after the new version deploys, an EXISTING browser copies its old localStorage JSON into `TAKY_ERP_BEFORE_DAY_ONE_20261031`, preserves configured room tiers, rent rates and property settings, then resets its operating state to zero.
- A version marker `TAKY_ERP_DAY_ONE_RESET_20261031` prevents repeat resets; new tenants added after the migration remain on reload.
- The Settings section has a **ข้อมูลก่อนรีเซ็ต** control to download the pre-migration JSON if present. A manual reset requires confirmation and writes a separate timestamped backup key.
- Data is **not shared between devices or browsers**; each browser carries its own copy. Browsers that never open the updated URL will not migrate. Data clearing or private browsing can erase browser records.

The static GitHub Pages client is **not a full-stack production database**. Do not use it for durable multi-device tenant/accounting operations without a secured backend, centralized storage, controlled backups and authentication.

For the GitHub Pages interface, publishing the updated `index.html` is sufficient to initialize fresh client data; no direct production database operation is possible from GitHub.

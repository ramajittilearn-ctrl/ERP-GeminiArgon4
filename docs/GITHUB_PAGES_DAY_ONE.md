# GitHub Pages — Initial Day-One State

## Scope
Static dashboard in `index.html` (and `prototype/index.html`). This is browser-local storage, not the Next.js/PostgreSQL backend.

When the page is opened on a new browser, rooms 101–305 start `AVAILABLE`, previous/current water and power readings start `0`, and there are **no invoices, payments, operating income, expenses or settlements**. The room package tiers and rental tariffs, utility rates, billing terms, bank/contact details, and property settings remain configured.

## First visit from an old browser
The updated app performs a **one-time** migration when the browser first loads the updated page:
1. Copy the previous `TAKY_ERP_PROTOTYPE_STATE_V1` JSON into the backup key `TAKY_ERP_BEFORE_DAY_ONE_20261031`.
2. Preserve current configured property settings, room tiers and room rent.
3. Clear all operating/demo data and reset 15 room meter baselines to zero.
4. Record the version flag `TAKY_ERP_DAY_ONE_RESET_20261031`, so reloads or later changes to tenants/invoices aren't erased.
5. If a backup cannot be written, preserve the existing state rather than deleting without recovery.

Settings includes a **ข้อมูลก่อนรีเซ็ต** button for downloading the previous JSON from the current browser. The manual reset button also requires confirmation and saves a timestamped local backup.

**Important**: This only resets each browser after that browser opens the new site. Data is not synchronized across devices. GitHub Pages itself has no production database, user authentication or reliable server backup. Use a secured full-stack backend before managing real tenant accounting across devices.

## Regression check
Run `node tests/day-one-pages-check.mjs`: asserts initial 15 rooms all vacant, zero balances, business rates retained, prior state archived, and one-time migration not repeated.

Server-side production JSON/PostgreSQL reset remains a separate, offline operation and is **not** performed by this GitHub Pages change.

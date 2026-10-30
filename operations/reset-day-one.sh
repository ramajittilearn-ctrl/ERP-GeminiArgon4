#!/usr/bin/env bash
# Offline, backup-first day-one reset. Never runs during application startup/deploy.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"
APPLY="${2:-}"
CONFIRM="${3:-}"
DATA_FILE="${ERP_JSON_PATH:-${REPO_ROOT}/data/taky_erp_local_db.json}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-taky_erp_postgres}"
POSTGRES_USER="${POSTGRES_USER:-taky_admin}"
POSTGRES_DB="${POSTGRES_DB:-taky_apartment_erp}"
BACKUP_BASE="${ERP_BACKUP_PATH:-${REPO_ROOT}/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="${BACKUP_BASE}/day-one-reset-${STAMP}"

usage() {
  echo "Usage: bash operations/reset-day-one.sh {json|postgres|both} [--apply --confirm=RESET-TO-DAY-ONE]"
  echo "By default, preview only. Stop the ERP web application before --apply."
}

if [[ "${MODE}" != "json" && "${MODE}" != "postgres" && "${MODE}" != "both" ]]; then
  usage
  exit 2
fi

echo "MODE: ${MODE}"
echo "JSON file: ${DATA_FILE}"
echo "Postgres container: ${POSTGRES_CONTAINER}"
echo "Property settings and 15 room records will be preserved."
echo "Tenant, reservation, lease, invoice, payment, deposit and expense data will be erased."

if [[ "${APPLY}" != "--apply" || "${CONFIRM}" != "--confirm=RESET-TO-DAY-ONE" ]]; then
  echo "PREVIEW ONLY — no changes made."
  usage
  exit 0
fi

if [[ "${ERP_APP_STOPPED:-}" != "YES" ]]; then
  echo "REFUSED: stop ALL application instances first and run with ERP_APP_STOPPED=YES."
  echo "The application caches JSON in memory and can overwrite an offline reset."
  exit 3
fi

# Validate JSON BEFORE taking backups or changing either data store.
if [[ "${MODE}" == "json" || "${MODE}" == "both" ]]; then
  if [[ -f "${DATA_FILE}" ]]; then
    JSON_FILE="${DATA_FILE}" node <<'NODE'
const fs = require('node:fs');
const file = process.env.JSON_FILE;
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const expected = new Set(Array.from({length: 15}, (_, i) => `${Math.floor(i / 5) + 1}0${i % 5 + 1}`));
if (!raw.settings || !Array.isArray(raw.rooms) || raw.rooms.length !== 15) {
  throw new Error('JSON reset refused: missing settings or exactly 15 rooms');
}
const actual = new Set(raw.rooms.map(([key, room]) => {
  if (key !== room?.roomNumber) throw new Error('JSON reset refused: room key mismatch');
  return key;
}));
if (actual.size !== 15 || [...expected].some(key => !actual.has(key))) {
  throw new Error('JSON reset refused: room numbers do not match 101-305');
}
console.log('JSON preflight: 15 rooms, property settings present');
NODE
  else
    echo "No existing JSON state found; after updated application starts, it initializes clean."
  fi
fi

if [[ "${MODE}" == "postgres" || "${MODE}" == "both" ]]; then
  docker exec "${POSTGRES_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc \
    'SELECT CASE WHEN COUNT(*) = 15 THEN 1 ELSE 0 END FROM "Room";' | grep -qx 1 || {
      echo "Postgres preflight failed: require 15 existing rooms"
      exit 4
    }
fi

mkdir -p "${BACKUP_PATH}"
if [[ "${MODE}" == "json" || "${MODE}" == "both" ]]; then
  if [[ -f "${DATA_FILE}" ]]; then
    cp -p "${DATA_FILE}" "${BACKUP_PATH}/taky_erp_local_db.json.before"
  fi
fi
if [[ "${MODE}" == "postgres" || "${MODE}" == "both" ]]; then
  docker exec "${POSTGRES_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${BACKUP_PATH}/postgres.before.dump"
  test -s "${BACKUP_PATH}/postgres.before.dump" || { echo "Empty PostgreSQL backup"; exit 5; }
fi

echo "Backups saved to: ${BACKUP_PATH}"

if [[ "${MODE}" == "postgres" || "${MODE}" == "both" ]]; then
  docker exec -i "${POSTGRES_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${REPO_ROOT}/operations/day-one-reset.sql"
fi

if [[ "${MODE}" == "json" || "${MODE}" == "both" ]]; then
  if [[ -f "${DATA_FILE}" ]]; then
    JSON_FILE="${DATA_FILE}" node <<'NODE'
const fs = require('node:fs');
const file = process.env.JSON_FILE;
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const reset = {
  ...raw,
  updatedAt: new Date().toISOString(),
  rooms: raw.rooms.map(([key, room]) => [
    key,
    {...room, status: 'AVAILABLE', lastWaterMeter: 0, lastElectricMeter: 0}
  ]),
  reservations: [],
  leases: [],
  invoices: [],
  settlements: [],
  expenses: []
};
for (const key of ['tenants', 'meterReadings', 'payments', 'depositSettlements']) {
  if (key in reset) reset[key] = [];
}
const tmp = `${file}.day-one-${process.pid}.tmp`;
try {
  fs.writeFileSync(tmp, JSON.stringify(reset, null, 2), {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  fs.renameSync(tmp, file);
} finally {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
}
console.log('JSON reset complete. 15 available rooms; no operational records.');
NODE
  fi
fi

echo "RESET FINISHED. Verify backup and results, then restart the ERP application."
echo "Do not re-run any demo seed or restore old data."

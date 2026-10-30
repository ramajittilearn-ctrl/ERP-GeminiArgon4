#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Taky Apartment ERP — Automated Daily PostgreSQL & Slip Backup Script
# =============================================================================
BACKUP_DIR="./backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DB_DUMP_FILE="${BACKUP_DIR}/taky_erp_db_${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"
docker exec taky_erp_postgres pg_dump -U taky_admin -d taky_apartment_erp > "${DB_DUMP_FILE}"
gzip -f "${DB_DUMP_FILE}"

echo "✅ Database backup saved to ${DB_DUMP_FILE}.gz"

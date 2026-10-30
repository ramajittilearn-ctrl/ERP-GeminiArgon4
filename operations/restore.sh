#!/usr/bin/env bash
# =============================================================================
# Taky Apartment ERP — Disaster Recovery & Database Restore Script (Audit Gate 3)
# Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
# Usage: ./operations/restore.sh ./backups/taky_db_YYYYMMDD_HHMMSS.sql.gz [./backups/taky_slips_YYYYMMDD_HHMMSS.tar.gz]
# =============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-sql-backup.sql.gz> [path-to-slips-archive.tar.gz]"
  exit 1
fi

SQL_BACKUP_FILE="$1"
SLIPS_ARCHIVE_FILE="${2:-}"

if [ ! -f "$SQL_BACKUP_FILE" ]; then
  echo "[ERROR] SQL backup file not found: $SQL_BACKUP_FILE"
  exit 1
fi

echo "[1/3] Restoring PostgreSQL database from: $SQL_BACKUP_FILE ..."
gunzip -c "$SQL_BACKUP_FILE" | docker exec -i taky_erp_postgres psql -U takyadmin -d taky_erp

if [ -n "$SLIPS_ARCHIVE_FILE" ] && [ -f "$SLIPS_ARCHIVE_FILE" ]; then
  echo "[2/3] Restoring uploaded payment slips archive from: $SLIPS_ARCHIVE_FILE ..."
  mkdir -p ./uploads
  tar -xzf "$SLIPS_ARCHIVE_FILE" -C ./
else
  echo "[2/3] No slips archive specified or file not present; skipping slip restore."
fi

echo "[3/3] Restore complete. Run 'npx tsx operations/audit-ledger.ts' to verify 100% ledger integrity."

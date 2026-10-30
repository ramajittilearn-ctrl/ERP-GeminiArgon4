-- ONE-TIME OFFLINE RESET: run only after verified pg_dump backup.
-- Preserve PropertySetting and the 15 Room records.
BEGIN;

DO $$
DECLARE room_count integer;
BEGIN
  SELECT COUNT(*) INTO room_count FROM "Room";
  IF room_count <> 15 THEN
    RAISE EXCEPTION 'Day-one reset aborted: expected 15 Room records, got %', room_count;
  END IF;
END $$;

TRUNCATE TABLE
  "Payment",
  "InvoiceLineItem",
  "Invoice",
  "MeterReading",
  "DepositSettlement",
  "Reservation",
  "Lease",
  "Tenant",
  "Expense"
RESTART IDENTITY CASCADE;

UPDATE "Room"
SET "status" = 'AVAILABLE',
    "lastWaterMeter" = 0,
    "lastElectricMeter" = 0,
    "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;

SELECT 'rooms' AS metric, COUNT(*) AS amount FROM "Room"
UNION ALL SELECT 'available', COUNT(*) FROM "Room" WHERE "status" = 'AVAILABLE'
UNION ALL SELECT 'leases', COUNT(*) FROM "Lease"
UNION ALL SELECT 'tenants', COUNT(*) FROM "Tenant"
UNION ALL SELECT 'reservations', COUNT(*) FROM "Reservation"
UNION ALL SELECT 'invoices', COUNT(*) FROM "Invoice"
UNION ALL SELECT 'payments', COUNT(*) FROM "Payment"
UNION ALL SELECT 'expenses', COUNT(*) FROM "Expense";

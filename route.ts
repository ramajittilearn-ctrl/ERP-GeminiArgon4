// =============================================================================
// Taky Apartment ERP — Unified Next.js App Router API Route Handler
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Route: /api/erp (GET & POST)
// Auto-saves every change to ./data/taky_erp_local_db.json for Single-Owner Go-Live
// or executes Prisma ACID transactions when USE_PRISMA_DB="true"
// =============================================================================

import { NextResponse } from 'next/server';
import {
  getErpContext,
  resetErpContext,
  clearDemoForRealGoLive,
  saveContextToDisk
} from '../../../server/store-singleton';
import {
  reserveRoom,
  createMoveInLease,
  settleMoveOut
} from '../../../server/services/room-lease.service';
import {
  run25thBulkMeterBilling,
  recordInvoicePayment,
  getInvoiceLineAndPrintPayload
} from '../../../server/services/billing-payment.service';
import {
  recordPropertyExpense,
  calculateMonthlyPnL,
  updatePropertySettings
} from '../../../server/services/expense-report.service';
import {
  reserveRoomPrismaTx,
  createMoveInLeasePrismaTx,
  run25thBulkMeterBillingPrismaTx,
  recordInvoicePaymentPrismaTx,
  settleMoveOutPrismaTx
} from '../../../server/repositories/prisma-erp.repository';
import {
  auditLedgerReconciliation,
  auditRoomAndLeaseIntegrity
} from '../../../../operations/audit-ledger';

const isPrismaProductionMode = () => process.env.USE_PRISMA_DB === 'true';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const billingPeriod = searchParams.get('period') || '2026-10';
  const asOfDate = searchParams.get('asOfDate') || '2026-10-25';

  const ctx = getErpContext();
  const { store, expenses } = ctx;

  const rooms = Array.from(store.rooms.values()).sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber)
  );
  const leases = Array.from(store.leases.values());
  const reservations = Array.from(store.reservations.values());
  const invoices = Array.from(store.invoices.values()).map(inv =>
    getInvoiceLineAndPrintPayload(store, inv.id, asOfDate)
  );
  const settlements = Array.from(store.settlements.values());
  const expenseList = Array.from(expenses.values());

  const pnl = calculateMonthlyPnL(store, expenses, billingPeriod);
  const ledgerAudit = auditLedgerReconciliation(Array.from(store.invoices.values()));
  const roomAudit = auditRoomAndLeaseIntegrity(
    rooms.map(r => ({ roomNumber: r.roomNumber, status: r.status })),
    leases.map(l => ({ id: l.id, roomNumber: l.roomNumber, status: l.status }))
  );

  return NextResponse.json({
    ok: true,
    storageMode: isPrismaProductionMode()
      ? 'POSTGRES_PRISMA_ACID'
      : 'LOCAL_DISK_JSON_PERSISTENCE',
    asOfDate,
    billingPeriod,
    settings: store.settings,
    rooms,
    leases,
    reservations,
    invoices,
    settlements,
    expenses: expenseList,
    pnl,
    audit: {
      passed: ledgerAudit.passed && roomAudit.passed,
      ledgerErrors: ledgerAudit.errors,
      roomErrors: roomAudit.errors
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, payload } = body;
    const ctx = getErpContext();
    const { store, expenses } = ctx;
    const usePrisma = isPrismaProductionMode();

    switch (action) {
      case 'RESERVE_ROOM': {
        const data = usePrisma
          ? await reserveRoomPrismaTx(payload)
          : reserveRoom(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'MOVE_IN': {
        const data = usePrisma
          ? await createMoveInLeasePrismaTx(payload)
          : createMoveInLease(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'BULK_METER_BILLING': {
        const data = usePrisma
          ? await run25thBulkMeterBillingPrismaTx(payload)
          : run25thBulkMeterBilling(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'RECORD_PAYMENT': {
        const data = usePrisma
          ? await recordInvoicePaymentPrismaTx(payload)
          : recordInvoicePayment(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'MOVE_OUT': {
        const data = usePrisma
          ? await settleMoveOutPrismaTx(payload)
          : settleMoveOut(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'ADD_EXPENSE': {
        const data = recordPropertyExpense(expenses, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'UPDATE_SETTINGS': {
        const data = updatePropertySettings(store, payload);
        saveContextToDisk(ctx);
        return NextResponse.json({ ok: true, data });
      }
      case 'CLEAR_FOR_GOLIVE': {
        clearDemoForRealGoLive(payload?.promptPayId);
        return NextResponse.json({ ok: true });
      }
      case 'RESET_DEMO': {
        resetErpContext();
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json(
          { ok: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal ERP Error' },
      { status: 400 }
    );
  }
}
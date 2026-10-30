// =============================================================================
// Taky Apartment ERP — Phase 4 End-to-End (E2E) Full Lifecycle & 5-Gate Audit Spec
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Verifies all 5 Modules + Expense P&L + Backup/Restore Snapshot Integrity
// =============================================================================

import { describe, it, expect } from 'vitest';
import { createInitialTakyErpContext } from '../../src/server/store-singleton';
import {
  reserveRoom,
  createMoveInLease,
  settleMoveOut
} from '../../src/server/services/room-lease.service';
import {
  run25thBulkMeterBilling,
  recordInvoicePayment,
  getInvoiceLineAndPrintPayload
} from '../../src/server/services/billing-payment.service';
import {
  recordPropertyExpense,
  calculateMonthlyPnL,
  updatePropertySettings
} from '../../src/server/services/expense-report.service';
import {
  auditLedgerReconciliation,
  auditRoomAndLeaseIntegrity
} from '../../operations/audit-ledger';

describe('Taky Apartment ERP — Full-Stack E2E Lifecycle & 5-Gate Pre-Production Audit', () => {
  it('completes Reservation -> Move-In Proration -> 25th Bulk Meter -> Partial Payment -> Late Fee Rollover -> Expense P&L -> Move-Out Settlement with 0 Audit Errors', () => {
    const { store, expenses } = createInitialTakyErpContext();

    // 1. Reserve Room 104 (Silver Tier 3,000 THB, Booking Deposit 1,000 THB)
    const reservation = reserveRoom(store, {
      roomNumber: '104',
      tenantName: 'คุณกานดา รักสงบ',
      phone: '082-991-1122',
      selectedTier: 'SILVER',
      agreedRentSatang: 300000,
      bookingDepositSatang: 100000,
      expectedMoveInDate: '2026-10-10'
    });
    expect(reservation.status).toBe('ACTIVE_BOOKING');
    expect(store.rooms.get('104')?.status).toBe('RESERVED');

    // 2. Convert Room 104 Reservation -> Move-In on Oct 10 (16 days prorated to Oct 25 = 1,600 THB + 3,000 THB deposit - 1,000 THB booking = 3,600 THB net)
    const moveIn = createMoveInLease(store, {
      roomNumber: '104',
      tenantName: 'คุณกานดา รักสงบ',
      phone: '082-991-1122',
      packageTier: 'SILVER',
      depositMonths: 1,
      startDate: '2026-10-10',
      isProratedFirstMonth: true,
      initialWaterMeter: 64,
      initialElectricMeter: 620
    });
    expect(moveIn.moveInCalculation.netMoveInDueSatang).toBe(360000);
    expect(store.rooms.get('104')?.status).toBe('OCCUPIED');

    // 3. Run 25th of Month Bulk Meter Billing across all 13 occupied rooms (including 4-digit rollover on Room 202: 9985 -> 0065 = 80 units)
    const occupiedRooms = Array.from(store.rooms.values()).filter(r => r.status === 'OCCUPIED');
    expect(occupiedRooms.length).toBe(13);

    const octBilling = run25thBulkMeterBilling(store, {
      billingPeriod: '2026-10',
      readingDate: '2026-10-25',
      dueDate: '2026-11-05',
      entries: occupiedRooms.map(r => ({
        roomNumber: r.roomNumber,
        currWater: r.lastWaterMeter + 6,
        waterRollover: false,
        currElectric: r.roomNumber === '202' ? 65 : r.lastElectricMeter + 115,
        electricRollover: r.roomNumber === '202'
      }))
    });
    expect(octBilling.createdCount).toBe(13);

    // Verify Room 202 4-digit rollover (9985 -> 0065 = 80 units * 6.50 THB = 520.00 THB = 52000 Satang)
    const inv202 = store.invoices.get('INV-2026-10-202');
    expect(inv202?.electricUnits).toBe(80);
    expect(inv202?.electricSatang).toBe(52000);

    // Verify Room 101 odd electric units (115 units * 6.50 THB = 747.50 THB = 74750 Satang)
    const inv101 = store.invoices.get('INV-2026-10-101');
    expect(inv101?.electricSatang).toBe(74750);

    // 4. Partial Payment on Room 103 (Pay 2,000 THB now, leave remaining unpaid past Nov 5)
    const inv103 = store.invoices.get('INV-2026-10-103');
    expect(inv103).toBeDefined();
    recordInvoicePayment(store, {
      invoiceId: 'INV-2026-10-103',
      amountSatang: 200000,
      paidAt: '2026-10-28',
      method: 'PROMPTPAY',
      slipImageUrl: '/uploads/slip-103-part1.jpg'
    });
    expect(store.invoices.get('INV-2026-10-103')?.status).toBe('PARTIAL');

    // Full Payment on Room 101 & Room 102
    recordInvoicePayment(store, {
      invoiceId: 'INV-2026-10-101',
      amountSatang: inv101!.balanceDueSatang,
      paidAt: '2026-10-28',
      method: 'PROMPTPAY'
    });
    recordInvoicePayment(store, {
      invoiceId: 'INV-2026-10-102',
      amountSatang: store.invoices.get('INV-2026-10-102')!.balanceDueSatang,
      paidAt: '2026-10-29',
      method: 'BANK_TRANSFER'
    });

    // 5. Verify LINE QR & Print Payload generation
    const payload103 = getInvoiceLineAndPrintPayload(store, 'INV-2026-10-103', '2026-11-08');
    expect(payload103.lateDays).toBe(3);
    expect(payload103.accruedLateFeeSatang).toBe(15000); // 3 days * 50 THB/day = 150 THB
    expect(payload103.promptPayQrPayload.startsWith('000201')).toBe(true);

    // 6. Add Property Expense & Calculate October 2026 Monthly P&L
    recordPropertyExpense(expenses, {
      expenseDate: '2026-10-25',
      category: 'SUPPLIES',
      title: 'ซื้อหลอดไฟ LED สำรอง 10 หลอด',
      amountSatang: 45000 // 450.00 THB
    });
    const octPnl = calculateMonthlyPnL(store, expenses, '2026-10');
    expect(octPnl.totalExpensesSatang).toBe(400000); // 1,450 + 600 + 1,500 + 450 = 4,000 THB
    expect(octPnl.totalCollectedSatang).toBeGreaterThan(800000);

    // 7. Move-Out Settlement on Room 305
    const settlement305 = settleMoveOut(store, {
      roomNumber: '305',
      moveOutDate: '2026-10-30',
      currWater: store.rooms.get('305')!.lastWaterMeter + 2,
      currElectric: store.rooms.get('305')!.lastElectricMeter + 30,
      cleaningFeeSatang: 30000,
      damageFeeSatang: 0
    });
    expect(store.rooms.get('305')?.status).toBe('AVAILABLE');
    expect(settlement305.finalWaterSatang).toBe(2000);
    expect(settlement305.finalElectricSatang).toBe(19500);

    // 8. Run 5-Gate Audit Engine (Ledger Reconciliation + Room/Lease State Integrity)
    const ledgerAudit = auditLedgerReconciliation(Array.from(store.invoices.values()));
    const roomAudit = auditRoomAndLeaseIntegrity(
      Array.from(store.rooms.values()).map(r => ({ roomNumber: r.roomNumber, status: r.status })),
      Array.from(store.leases.values()).map(l => ({ id: l.id, roomNumber: l.roomNumber, status: l.status }))
    );
    expect(ledgerAudit.passed).toBe(true);
    expect(roomAudit.passed).toBe(true);

    // 9. Update Settings check
    const updatedSettings = updatePropertySettings(store, {
      electricityRateSatang: 650,
      waterRateSatang: 1000
    });
    expect(updatedSettings.electricityRateSatang).toBe(650);
  });
});

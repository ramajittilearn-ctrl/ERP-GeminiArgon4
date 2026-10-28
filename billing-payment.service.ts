// =============================================================================
// Taky Apartment ERP — Phase 2 Bulk 25th Billing & Partial Payment Service
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Implements Steps 6, 7, and 8 (25th Batch Billing, Arrears Rollover, PromptPay QR, Partial Payments)
// =============================================================================

import {
  buildMonthlyInvoiceWithArrearsRollover,
  applyPaymentToInvoice,
  calculateLateFeeSatang
} from '../../lib/finance';
import { generatePromptPayPayload } from '../../lib/promptpay';
import { BulkRoomMeterEntry, RecordPaymentInput } from '../../lib/validations';
import { InMemoryStore } from './room-lease.service';

/**
 * Step 6 & 7: Atomic Batch Generation of 25th Monthly Invoices for All Occupied Rooms
 */
export function generate25thMonthlyInvoicesBatch(
  store: InMemoryStore,
  params: {
    billingPeriod: string; // e.g., "2026-10"
    issueDate: string;     // e.g., "2026-10-25"
    dueDate: string;       // e.g., "2026-11-05"
    readings: BulkRoomMeterEntry[];
  }
) {
  const generatedInvoices: any[] = [];

  for (const entry of params.readings) {
    const room = store.rooms.get(entry.roomNumber);
    if (!room || room.status !== 'OCCUPIED') {
      continue;
    }

    // Idempotency guard: prevent duplicate monthly invoice for same room + billingPeriod
    const newInvoiceId = `INV-${params.billingPeriod.replace('-', '')}-${entry.roomNumber}`;
    if (store.invoices.has(newInvoiceId)) {
      throw new Error(
        `Duplicate billing error: Invoice ${newInvoiceId} already exists for room ${entry.roomNumber} in period ${params.billingPeriod}`
      );
    }

    let activeLease: any = null;
    for (const l of store.leases.values()) {
      if (l.roomNumber === entry.roomNumber && l.status === 'ACTIVE') {
        activeLease = l;
        break;
      }
    }
    if (!activeLease) {
      throw new Error(`Occupied room ${entry.roomNumber} is missing an ACTIVE lease`);
    }

    // Find previous unpaid monthly invoice for this room (if any)
    let previousUnpaidInvoice: any = null;
    for (const inv of store.invoices.values()) {
      if (
        inv.roomNumber === entry.roomNumber &&
        inv.invoiceType === 'MONTHLY' &&
        inv.status !== 'ROLLED_OVER' &&
        inv.balanceDueSatang > 0
      ) {
        previousUnpaidInvoice = inv;
        break;
      }
    }

    const built = buildMonthlyInvoiceWithArrearsRollover({
      newInvoiceId,
      roomNumber: entry.roomNumber,
      billingPeriod: params.billingPeriod,
      issueDate: params.issueDate,
      dueDate: params.dueDate,
      monthlyRentSatang: activeLease.monthlyRentSatang,
      prevWater: room.lastWaterMeter,
      currWater: entry.currWater,
      waterRollover: entry.waterRollover,
      waterRateSatang: store.settings.waterRateSatang,
      prevElectric: room.lastElectricMeter,
      currElectric: entry.currElectric,
      electricRollover: entry.electricRollover,
      electricityRateSatang: store.settings.electricityRateSatang,
      dailyLateFeeSatang: store.settings.dailyLateFeeSatang,
      discountSatang: entry.discountSatang || 0,
      previousInvoice: previousUnpaidInvoice
    });

    // Update old invoice if rolled over
    if (built.updatedPreviousInvoice && previousUnpaidInvoice) {
      previousUnpaidInvoice.balanceDueSatang = 0;
      previousUnpaidInvoice.status = 'ROLLED_OVER';
      previousUnpaidInvoice.rolledIntoInvoiceId = newInvoiceId;
    }

    // Advance room's latest meter numbers
    room.lastWaterMeter = entry.currWater;
    room.lastElectricMeter = entry.currElectric;

    const promptPayQrPayload = generatePromptPayPayload(
      store.settings.promptPayId,
      built.newInvoice.totalAmountSatang
    );

    const fullInvoiceRecord = {
      ...built.newInvoice,
      leaseId: activeLease.id,
      invoiceType: 'MONTHLY' as const,
      rolledIntoInvoiceId: null,
      payments: [],
      promptPayQrPayload
    };

    store.invoices.set(newInvoiceId, fullInvoiceRecord);
    generatedInvoices.push(fullInvoiceRecord);
  }

  return generatedInvoices;
}

/**
 * Step 8: Record Full or Partial Payment + Attach Transfer Slip + Settle Late Fees After the 5th
 */
export function recordInvoicePayment(store: InMemoryStore, input: RecordPaymentInput) {
  const inv = store.invoices.get(input.invoiceId);
  if (!inv) {
    throw new Error(`Invoice ${input.invoiceId} not found`);
  }

  const { lateFeeSatang } = calculateLateFeeSatang({
    balanceDueSatang: inv.balanceDueSatang,
    dueDate: inv.dueDate,
    asOfDate: input.paidAt,
    dailyLateFeeSatang: store.settings.dailyLateFeeSatang,
    status: inv.status
  });

  if (lateFeeSatang > 0 && inv.lateFeeSatang === 0) {
    inv.lateFeeSatang = lateFeeSatang;
    inv.lineItems.push({
      itemType: 'LATE_FEE',
      label: `ค่าปรับชำระล่าช้าเกินวันที่ 5 (ชำระวันที่ ${input.paidAt})`,
      quantity: 1,
      unitRateSatang: lateFeeSatang,
      amountSatang: lateFeeSatang
    });
  }

  const updated = applyPaymentToInvoice(
    inv,
    input.amountSatang,
    lateFeeSatang > 0 ? lateFeeSatang : 0
  );

  inv.totalAmountSatang = updated.totalAmountSatang;
  inv.paidAmountSatang = updated.paidAmountSatang;
  inv.balanceDueSatang = updated.balanceDueSatang;
  inv.status = updated.status;

  inv.payments.push({
    id: `PAY-${inv.id}-${inv.payments.length + 1}`,
    amountSatang: input.amountSatang,
    paidAt: input.paidAt,
    method: input.method,
    slipImageUrl: input.slipImageUrl || null,
    referenceNote: input.referenceNote || null
  });

  // Refresh dynamic QR payload for remaining balance if PARTIAL
  if (inv.balanceDueSatang > 0) {
    inv.promptPayQrPayload = generatePromptPayPayload(
      store.settings.promptPayId,
      inv.balanceDueSatang
    );
  }

  return inv;
}

// =============================================================================
// Taky Apartment ERP — Pre-Production Financial & State Integrity Audit Engine
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Verifies Gate 1 (Ledger Equations), Gate 2 (Arrears Rollover Non-Duplication),
// Gate 3 (Room & Meter Continuity), and Gate 4 (PromptPay QR Checksum)
// =============================================================================

import { computeCrc16Ccitt } from '../src/lib/promptpay';

export interface AuditRoomRecord {
  roomNumber: string;
  floorNumber: number;
  status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';
  activeLeaseCount: number;
  meterHistory: Array<{
    billingPeriod: string;
    prevWater: number;
    currWater: number;
    waterRollover: boolean;
    prevElectric: number;
    currElectric: number;
    electricRollover: boolean;
  }>;
}

export interface AuditInvoiceRecord {
  id: string;
  roomNumber: string;
  billingPeriod: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'ROLLED_OVER';
  totalAmountSatang: number;
  paidAmountSatang: number;
  balanceDueSatang: number;
  rolledIntoInvoiceId: string | null;
  lineItems: Array<{ label: string; amountSatang: number }>;
  payments: Array<{ id: string; amountSatang: number }>;
  promptPayQrPayload?: string;
}

export interface AuditReport {
  passed: boolean;
  checkedRooms: number;
  checkedInvoices: number;
  violations: string[];
}

export function runPreProductionAudit(params: {
  rooms: AuditRoomRecord[];
  invoices: AuditInvoiceRecord[];
}): AuditReport {
  const violations: string[] = [];
  const { rooms, invoices } = params;

  // Gate 1: Verify exactly 15 rooms across 3 floors (101..105, 201..205, 301..305)
  if (rooms.length !== 15) {
    violations.push(`Expected exactly 15 rooms, found ${rooms.length}`);
  }

  for (const rm of rooms) {
    // Active Lease Cardinality Check
    if (rm.status === 'OCCUPIED' && rm.activeLeaseCount !== 1) {
      violations.push(
        `Room ${rm.roomNumber} is OCCUPIED but has ${rm.activeLeaseCount} active leases (expected 1)`
      );
    }
    if (rm.status !== 'OCCUPIED' && rm.activeLeaseCount > 0) {
      violations.push(
        `Room ${rm.roomNumber} has status ${rm.status} but still has ${rm.activeLeaseCount} active lease(s)`
      );
    }

    // Meter Reading Continuity Check across consecutive months
    for (let i = 1; i < rm.meterHistory.length; i++) {
      const prevMonth = rm.meterHistory[i - 1];
      const currMonth = rm.meterHistory[i];
      if (currMonth.prevWater !== prevMonth.currWater) {
        violations.push(
          `Room ${rm.roomNumber} water meter discontinuity between ${prevMonth.billingPeriod} (${prevMonth.currWater}) and ${currMonth.billingPeriod} (${currMonth.prevWater})`
        );
      }
      if (currMonth.prevElectric !== prevMonth.currElectric) {
        violations.push(
          `Room ${rm.roomNumber} electric meter discontinuity between ${prevMonth.billingPeriod} (${prevMonth.currElectric}) and ${currMonth.billingPeriod} (${currMonth.prevElectric})`
        );
      }
    }
  }

  // Gate 2 & 3: Invoice Ledger Equations & Arrears Rollover Non-Duplication
  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  for (const inv of invoices) {
    const lineItemSum = inv.lineItems.reduce((acc, item) => acc + item.amountSatang, 0);
    if (lineItemSum !== inv.totalAmountSatang) {
      violations.push(
        `Invoice ${inv.id}: lineItems sum (${lineItemSum}) !== totalAmountSatang (${inv.totalAmountSatang})`
      );
    }

    const paymentSum = inv.payments.reduce((acc, p) => acc + p.amountSatang, 0);
    if (paymentSum !== inv.paidAmountSatang) {
      violations.push(
        `Invoice ${inv.id}: payments sum (${paymentSum}) !== paidAmountSatang (${inv.paidAmountSatang})`
      );
    }

    if (inv.status === 'ROLLED_OVER') {
      // Rolled-over invoice MUST have balanceDueSatang == 0 and point to a valid successor invoice
      if (inv.balanceDueSatang !== 0) {
        violations.push(
          `Invoice ${inv.id} is ROLLED_OVER but still carries non-zero balanceDueSatang (${inv.balanceDueSatang}) — double-counting risk!`
        );
      }
      if (!inv.rolledIntoInvoiceId || !invoiceMap.has(inv.rolledIntoInvoiceId)) {
        violations.push(
          `Invoice ${inv.id} is ROLLED_OVER but missing valid rolledIntoInvoiceId (${inv.rolledIntoInvoiceId})`
        );
      }
    } else {
      const expectedBalance = inv.totalAmountSatang - inv.paidAmountSatang;
      if (inv.balanceDueSatang !== expectedBalance) {
        violations.push(
          `Invoice ${inv.id}: balanceDueSatang (${inv.balanceDueSatang}) !== total - paid (${expectedBalance})`
        );
      }
    }

    // Gate 4: Verify PromptPay QR CRC-16 checksum if present
    if (inv.promptPayQrPayload) {
      const payloadBody = inv.promptPayQrPayload.slice(0, -4);
      const actualCrc = inv.promptPayQrPayload.slice(-4);
      const expectedCrc = computeCrc16Ccitt(payloadBody);
      if (actualCrc !== expectedCrc) {
        violations.push(
          `Invoice ${inv.id}: Invalid PromptPay QR CRC-16 (expected ${expectedCrc}, got ${actualCrc})`
        );
      }
    }
  }

  return {
    passed: violations.length === 0,
    checkedRooms: rooms.length,
    checkedInvoices: invoices.length,
    violations
  };
}

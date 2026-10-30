// =============================================================================
// Taky Apartment ERP — Phase 2 End-to-End Integration & Audit Test Suite
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Simulates full 15-room lifecycle across 2 billing cycles + 5-Gate Audit check
// =============================================================================

import { INITIAL_15_ROOMS, INITIAL_PROPERTY_SETTINGS } from '../../prisma/seed';
import {
  InMemoryStore,
  reserveRoom,
  createMoveInLease,
  settleMoveOut
} from '../../src/server/services/room-lease.service';
import {
  generate25thMonthlyInvoicesBatch,
  recordInvoicePayment
} from '../../src/server/services/billing-payment.service';
import { runPreProductionAudit } from '../../operations/audit-ledger';

export function createTestStore(): InMemoryStore {
  return {
    settings: { ...INITIAL_PROPERTY_SETTINGS },
    rooms: new Map(
      INITIAL_15_ROOMS.map((r) => [
        r.roomNumber,
        {
          roomNumber: r.roomNumber,
          floorNumber: r.floorNumber,
          sizeSqm: r.sizeSqm,
          status: 'AVAILABLE',
          lastWaterMeter: r.lastWaterMeter,
          lastElectricMeter: r.lastElectricMeter
        }
      ])
    ),
    reservations: new Map(),
    leases: new Map(),
    invoices: new Map(),
    settlements: new Map()
  };
}

export function runPhase2IntegrationTests() {
  const store = createTestStore();

  // 1. Reserve Room 104 (1,000 THB booking deposit)
  const booking = reserveRoom(store, {
    roomNumber: '104',
    tenantName: 'คุณกานดา รักสงบ',
    phone: '082-991-1122',
    selectedTier: 'SILVER',
    agreedRentSatang: 300000,
    bookingDepositSatang: 100000,
    expectedMoveInDate: '2026-09-10'
  });

  // 2. Convert Room 104 Reservation -> Active Lease on Sept 10 (Prorated 16 days to Sept 25 + 1x Deposit - 1,000 THB booking credit)
  const moveIn104 = createMoveInLease(store, {
    roomNumber: '104',
    tenantName: 'คุณกานดา รักสงบ',
    phone: '082-991-1122',
    packageTier: 'SILVER',
    depositMonths: 1,
    startDate: '2026-09-10',
    isProratedFirstMonth: true,
    initialWaterMeter: 64,
    initialElectricMeter: 620
  });

  // 3. Move-in Room 202 (Gold Tier, 2x Deposit, Electric meter at 9985 near rollover)
  createMoveInLease(store, {
    roomNumber: '202',
    tenantName: 'คุณมณีรัตน์ ทองดี',
    phone: '081-990-4512',
    packageTier: 'GOLD',
    depositMonths: 2,
    startDate: '2026-09-01',
    isProratedFirstMonth: false,
    initialWaterMeter: 310,
    initialElectricMeter: 9985
  });

  // 4. Generate Sept 25 Monthly Invoices (Room 202 rolls over electric meter 9985 -> 0065 = 80 units)
  const septInvoices = generate25thMonthlyInvoicesBatch(store, {
    billingPeriod: '2026-09',
    issueDate: '2026-09-25',
    dueDate: '2026-10-05',
    readings: [
      { roomNumber: '104', currWater: 70, currElectric: 720 }, // 6 water (60 THB) + 100 elec (650 THB)
      { roomNumber: '202', currWater: 318, currElectric: 65, electricRollover: true } // 8 water (80 THB) + 80 elec (520 THB)
    ]
  });

  // 5. Room 104 makes a Partial Payment (2,000 THB out of 3,710 THB) on Oct 3
  recordInvoicePayment(store, {
    invoiceId: 'INV-202609-104',
    amountSatang: 200000,
    paidAt: '2026-10-03',
    method: 'PROMPTPAY',
    slipImageUrl: '/uploads/slips/2026-10/slip-104-part1.jpg'
  });

  // 6. Room 202 pays in full on Oct 4
  const inv202Sept = store.invoices.get('INV-202609-202');
  recordInvoicePayment(store, {
    invoiceId: 'INV-202609-202',
    amountSatang: inv202Sept.balanceDueSatang,
    paidAt: '2026-10-04',
    method: 'PROMPTPAY'
  });

  // 7. Generate Oct 25 Monthly Invoices — Room 104's unpaid 1,710 THB + 20 days late fee (1,000 THB) rolls over automatically!
  const octInvoices = generate25thMonthlyInvoicesBatch(store, {
    billingPeriod: '2026-10',
    issueDate: '2026-10-25',
    dueDate: '2026-11-05',
    readings: [
      { roomNumber: '104', currWater: 78, currElectric: 835 },
      { roomNumber: '202', currWater: 325, currElectric: 190 }
    ]
  });

  // 8. Room 202 moves out on Oct 28 — Settle final meters &cleaning fee against 7,000 THB security deposit
  const settlement202 = settleMoveOut(store, {
    roomNumber: '202',
    moveOutDate: '2026-10-28',
    currWater: 326,
    currElectric: 200,
    cleaningFeeSatang: 30000,
    damageFeeSatang: 0
  });

  // 9. Run 5-Gate Pre-Production Audit on the resulting state
  const audit = runPreProductionAudit({
    rooms: Array.from(store.rooms.values()).map((r) => ({
      roomNumber: r.roomNumber,
      floorNumber: r.floorNumber,
      status: r.status,
      activeLeaseCount: Array.from(store.leases.values()).filter(
        (l) => l.roomNumber === r.roomNumber && l.status === 'ACTIVE'
      ).length,
      meterHistory: []
    })),
    invoices: Array.from(store.invoices.values())
  });

  return {
    booking,
    moveIn104,
    septInvoicesCount: septInvoices.length,
    octInvoicesCount: octInvoices.length,
    settlement202,
    audit
  };
}

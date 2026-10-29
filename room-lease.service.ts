// =============================================================================
// Taky Apartment ERP — Phase 2 Room, Reservation, Move-In & Move-Out Service
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Implements Steps 3, 4, 5, and 9 with strict transactional state transitions
// =============================================================================

import {
  resolvePackageRentSatang,
  calculateMoveInSummary,
  calculateMoveOutSettlement
} from '../../lib/finance';
import {
  CreateReservationInput,
  CreateMoveInLeaseInput,
  validateCreateReservationInput,
  validateCreateMoveInLeaseInput,
  validateRoomNumber
} from '../../lib/validations';

export interface InMemoryStore {
  settings: {
    apartmentName: string;
    electricityRateSatang: number;
    waterRateSatang: number;
    commonFeeSatang: number;
    billingDay: number;
    dueDayNextMonth: number;
    dailyLateFeeSatang: number;
    defaultDepositMonths: number;
    promptPayId: string;
    tierStandardSatang: number;
    tierSilverSatang: number;
    tierGoldSatang: number;
  };
  rooms: Map<
    string,
    {
      roomNumber: string;
      floorNumber: number;
      sizeSqm: number;
      status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';
      lastWaterMeter: number;
      lastElectricMeter: number;
    }
  >;
  reservations: Map<
    string,
    {
      id: string;
      roomNumber: string;
      tenantName: string;
      phone: string;
      selectedTier: 'STANDARD' | 'SILVER' | 'GOLD' | 'CUSTOM';
      agreedRentSatang: number;
      bookingDepositSatang: number;
      expectedMoveInDate: string;
      status: 'ACTIVE_BOOKING' | 'CONVERTED_TO_LEASE' | 'FORFEITED';
      convertedLeaseId: string | null;
    }
  >;
  leases: Map<
    string,
    {
      id: string;
      roomNumber: string;
      tenantName: string;
      phone: string;
      packageTier: 'STANDARD' | 'SILVER' | 'GOLD' | 'CUSTOM';
      monthlyRentSatang: number;
      depositMonths: number;
      securityDepositSatang: number;
      bookingCreditSatang: number;
      startDate: string;
      endDate: string | null;
      initialWaterMeter: number;
      initialElectricMeter: number;
      status: 'ACTIVE' | 'MOVED_OUT';
    }
  >;
  invoices: Map<string, any>;
  settlements: Map<string, any>;
}

/**
 * Step 4: Create a Room Reservation (AVAILABLE -> RESERVED)
 */
export function reserveRoom(store: InMemoryStore, input: CreateReservationInput) {
  validateCreateReservationInput(input);
  const room = store.rooms.get(input.roomNumber);
  if (!room) {
    throw new Error(`Room ${input.roomNumber} not found`);
  }
  if (room.status !== 'AVAILABLE') {
    throw new Error(`Room ${input.roomNumber} is currently ${room.status} and cannot be reserved`);
  }

  const reservationId = `RES-${input.roomNumber}-${Date.now()}`;
  const record = {
    id: reservationId,
    roomNumber: input.roomNumber,
    tenantName: input.tenantName.trim(),
    phone: input.phone.trim(),
    selectedTier: input.selectedTier,
    agreedRentSatang: input.agreedRentSatang,
    bookingDepositSatang: input.bookingDepositSatang,
    expectedMoveInDate: input.expectedMoveInDate,
    status: 'ACTIVE_BOOKING' as const,
    convertedLeaseId: null
  };

  store.reservations.set(reservationId, record);
  room.status = 'RESERVED';

  return record;
}

/**
 * Step 5: Onboarding & Move-In Lease Creation (AVAILABLE/RESERVED -> OCCUPIED)
 * Automatically converts active reservation and deducts bookingDepositSatang
 */
export function createMoveInLease(store: InMemoryStore, input: CreateMoveInLeaseInput) {
  validateCreateMoveInLeaseInput(input);
  const room = store.rooms.get(input.roomNumber);
  if (!room) {
    throw new Error(`Room ${input.roomNumber} not found`);
  }
  if (room.status !== 'AVAILABLE' && room.status !== 'RESERVED') {
    throw new Error(`Room ${input.roomNumber} is ${room.status}; cannot create new lease`);
  }

  // Ensure no other ACTIVE lease exists on this room
  for (const existingLease of store.leases.values()) {
    if (existingLease.roomNumber === input.roomNumber && existingLease.status === 'ACTIVE') {
      throw new Error(`Room ${input.roomNumber} already has an ACTIVE lease (${existingLease.id})`);
    }
  }

  // Find active reservation if room was RESERVED
  let activeReservation: any = null;
  for (const res of store.reservations.values()) {
    if (res.roomNumber === input.roomNumber && res.status === 'ACTIVE_BOOKING') {
      activeReservation = res;
      break;
    }
  }

  const monthlyRentSatang = resolvePackageRentSatang(input.packageTier, input.customRentSatang, {
    STANDARD: store.settings.tierStandardSatang,
    SILVER: store.settings.tierSilverSatang,
    GOLD: store.settings.tierGoldSatang
  });

  const bookingCreditSatang = activeReservation ? activeReservation.bookingDepositSatang : 0;

  const moveInCalc = calculateMoveInSummary({
    monthlyRentSatang,
    moveInDate: input.startDate,
    billingDay: store.settings.billingDay,
    depositMonths: input.depositMonths,
    bookingCreditSatang,
    isProrated: input.isProratedFirstMonth
  });

  const leaseId = `LEASE-${input.roomNumber}-${ input.startDate.replace(/-/g, '') }`;
  const leaseRecord = {
    id: leaseId,
    roomNumber: input.roomNumber,
    tenantName: input.tenantName.trim(),
    phone: input.phone.trim(),
    packageTier: input.packageTier,
    monthlyRentSatang,
    depositMonths: input.depositMonths,
    securityDepositSatang: moveInCalc.securityDepositSatang,
    bookingCreditSatang,
    startDate: input.startDate,
    endDate: null,
    initialWaterMeter: input.initialWaterMeter,
    initialElectricMeter: input.initialElectricMeter,
    status: 'ACTIVE' as const
  };

  store.leases.set(leaseId, leaseRecord);

  if (activeReservation) {
    activeReservation.status = 'CONVERTED_TO_LEASE';
    activeReservation.convertedLeaseId = leaseId;
  }

  room.status = 'OCCUPIED';
  room.lastWaterMeter = input.initialWaterMeter;
  room.lastElectricMeter = input.initialElectricMeter;

  // Create MOVE_IN invoice
  const moveInInvoiceId = `INV-MOVEIN-${input.roomNumber}-${input.startDate.replace(/-/g, '')}`;
  const lineItems = [
    {
      itemType: input.isProratedFirstMonth ? 'PRORATED_RENT' : 'RENT',
      label: input.isProratedFirstMonth
        ? `ค่าเช่าเฉลี่ยรายวันถึงวันที่ ${store.settings.billingDay} (${moveInCalc.proratedDays} วัน)`
        : 'ค่าเช่าเดือนแรก',
      quantity: moveInCalc.proratedDays,
      unitRateSatang: moveInCalc.dailyRateSatang,
      amountSatang: moveInCalc.firstMonthRentSatang
    },
    {
      itemType: 'DEPOSIT',
      label: `เงินประกันห้อง (${input.depositMonths} เดือน)`,
      quantity: input.depositMonths,
      unitRateSatang: monthlyRentSatang,
      amountSatang: moveInCalc.securityDepositSatang
    }
  ];

  if (bookingCreditSatang > 0) {
    lineItems.push({
      itemType: 'BOOKING_CREDIT',
      label: 'หักเงินมัดจำจองห้องพักล่วงหน้า',
      quantity: 1,
      unitRateSatang: -bookingCreditSatang,
      amountSatang: -bookingCreditSatang
    });
  }

  const moveInInvoice = {
    id: moveInInvoiceId,
    leaseId,
    roomNumber: input.roomNumber,
    billingPeriod: input.startDate.slice(0, 7),
    invoiceType: 'MOVE_IN' as const,
    issueDate: input.startDate,
    dueDate: input.startDate,
    totalAmountSatang: moveInCalc.netMoveInDueSatang,
    paidAmountSatang: moveInCalc.netMoveInDueSatang, // Paid upon contract signing
    balanceDueSatang: 0,
    status: 'PAID' as const,
    rolledIntoInvoiceId: null,
    lineItems,
    payments: [
      {
        id: `PAY-MOVEIN-${input.roomNumber}`,
        amountSatang: moveInCalc.netMoveInDueSatang,
        paidAt: input.startDate,
        method: 'PROMPTPAY'
      }
    ]
  };

  store.invoices.set(moveInInvoiceId, moveInInvoice);

  return {
    lease: leaseRecord,
    moveInInvoice,
    moveInCalculation: moveInCalc
  };
}

/**
 * Step 9: Move-Out & Deposit Settlement (OCCUPIED -> AVAILABLE)
 */
export function settleMoveOut(
  store: InMemoryStore,
  params: {
    roomNumber: string;
    moveOutDate: string;
    currWater: number;
    waterRollover?: boolean;
    currElectric: number;
    electricRollover?: boolean;
    cleaningFeeSatang: number;
    damageFeeSatang: number;
  }
) {
  validateRoomNumber(params.roomNumber);
  const room = store.rooms.get(params.roomNumber);
  if (!room || room.status !== 'OCCUPIED') {
    throw new Error(`Room ${params.roomNumber} is not currently OCCUPIED`);
  }

  let activeLease: any = null;
  for (const l of store.leases.values()) {
    if (l.roomNumber === params.roomNumber && l.status === 'ACTIVE') {
      activeLease = l;
      break;
    }
  }
  if (!activeLease) {
    throw new Error(`No active lease found for room ${params.roomNumber}`);
  }

  // Sum any unpaid balance on active invoices for this room
  let unpaidArrearsSatang = 0;
  for (const inv of store.invoices.values()) {
    if (inv.roomNumber === params.roomNumber && inv.status !== 'ROLLED_OVER' && inv.balanceDueSatang > 0) {
      unpaidArrearsSatang += inv.balanceDueSatang;
      inv.paidAmountSatang = inv.totalAmountSatang;
      inv.balanceDueSatang = 0;
      inv.status = 'PAID';
      inv.payments.push({
        id: `PAY-DEP-DEDUCT-${inv.id}`,
        amountSatang: unpaidArrearsSatang,
        paidAt: params.moveOutDate,
        method: 'DEPOSIT_DEDUCTION'
      });
    }
  }

  const settlement = calculateMoveOutSettlement({
    depositHeldSatang: activeLease.securityDepositSatang,
    unpaidArrearsSatang,
    prevWater: room.lastWaterMeter,
    currWater: params.currWater,
    waterRollover: params.waterRollover,
    waterRateSatang: store.settings.waterRateSatang,
    prevElectric: room.lastElectricMeter,
    currElectric: params.currElectric,
    electricRollover: params.electricRollover,
    electricityRateSatang: store.settings.electricityRateSatang,
    cleaningFeeSatang: params.cleaningFeeSatang,
    damageFeeSatang: params.damageFeeSatang
  });

  activeLease.status = 'MOVED_OUT';
  activeLease.endDate = params.moveOutDate;

  room.status = 'AVAILABLE';
  room.lastWaterMeter = params.currWater;
  room.lastElectricMeter = params.currElectric;

  const settlementRecord = {
    id: `SETTLE-${activeLease.id}`,
    leaseId: activeLease.id,
    roomNumber: params.roomNumber,
    moveOutDate: params.moveOutDate,
    ...settlement
  };
  store.settlements.set(settlementRecord.id, settlementRecord);

  return settlementRecord;
}
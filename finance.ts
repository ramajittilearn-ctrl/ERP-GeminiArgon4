// =============================================================================
// Taky Apartment ERP — Pure Satang Financial Engine (Step 1 Core)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// All monetary values are integer Satang (1 THB = 100 Satang).
// Zero floating-point drift on 6.50 THB/unit electricity or 30-day proration.
// =============================================================================

export const MAX_METER_MODULO = 10000; // 4-digit meter (0000..9999 -> rolls over at 10000)

export function assertIntegerSatang(value: number, label = 'satang'): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer in Satang, received: ${value}`);
  }
}

export function toSatang(baht: number | string): number {
  const num = typeof baht === 'string' ? Number(baht.trim()) : baht;
  if (!Number.isFinite(num)) {
    throw new TypeError(`Invalid Baht amount: ${baht}`);
  }
  return Math.round(num * 100);
}

export function fromSatang(satang: number): number {
  assertIntegerSatang(satang, 'satang');
  return satang / 100;
}

export function formatBaht(satang: number): string {
  assertIntegerSatang(satang, 'satang');
  return (satang / 100).toFixed(2);
}

/**
 * Rule #1: Dynamic Lease Package Tier Lookup
 */
export function resolvePackageRentSatang(
  tier: 'STANDARD' | 'SILVER' | 'GOLD' | 'CUSTOM',
  customRentSatang?: number,
  tierRates = {
    STANDARD: 250000, // 2,500.00 THB
    SILVER: 300000,   // 3,000.00 THB
    GOLD: 350000      // 3,500.00 THB
  }
): number {
  if (tier === 'CUSTOM') {
    if (customRentSatang === undefined || customRentSatang <= 0) {
      throw new RangeError('Custom tier requires a positive customRentSatang');
    }
    assertIntegerSatang(customRentSatang, 'customRentSatang');
    return customRentSatang;
  }
  return tierRates[tier];
}

/**
 * Rule #2: Utility Meter Units with 4-digit Rollover Support (9999 -> 0000)
 */
export function calculateMeterUnits(
  prevReading: number,
  currReading: number,
  isRollover = false,
  meterModulo = MAX_METER_MODULO
): number {
  if (!Number.isInteger(prevReading) || !Number.isInteger(currReading)) {
    throw new TypeError('Meter readings must be integers');
  }
  if (prevReading < 0 || currReading < 0) {
    throw new RangeError('Meter readings cannot be negative');
  }
  if (prevReading >= meterModulo || currReading >= meterModulo) {
    throw new RangeError(`Meter reading exceeds modulo ${meterModulo - 1}`);
  }

  if (currReading < prevReading) {
    if (!isRollover) {
      throw new RangeError(
        `Current reading (${currReading}) is less than previous reading (${prevReading}) without isRollover enabled`
      );
    }
    return (meterModulo - prevReading) + currReading;
  }

  if (isRollover) {
    return (meterModulo - prevReading) + currReading;
  }

  return currReading - prevReading;
}

/**
 * Rule #2 & #3: Utility Charge in Satang (No minimum charge, supports 6.50 THB = 650 Satang)
 */
export function calculateUtilityChargeSatang(units: number, rateSatang: number): number {
  if (!Number.isInteger(units) || units < 0) {
    throw new RangeError(`Utility units must be a non-negative integer, received: ${units}`);
  }
  assertIntegerSatang(rateSatang, 'rateSatang');
  if (rateSatang < 0) {
    throw new RangeError('Utility rateSatang cannot be negative');
  }
  return units * rateSatang;
}

/**
 * Rule #5, #9A, #12B: Move-In Proration (Fixed 30-day divisor up to the 25th) + Deposit Multiplier - Booking Credit
 */
export interface MoveInCalculationInput {
  monthlyRentSatang: number;
  moveInDate: string; // "YYYY-MM-DD"
  billingDay?: number; // default 25
  depositMonths: number; // e.g., 1 or 2
  bookingCreditSatang?: number; // Reservation deposit already paid
  isProrated?: boolean; // default true
  includeMoveInDay?: boolean; // default true (e.g., move in 10th to 25th = 16 days inclusive)
}

export interface MoveInCalculationResult {
  dailyRateSatang: number;
  proratedDays: number;
  firstMonthRentSatang: number;
  securityDepositSatang: number;
  bookingCreditSatang: number;
  netMoveInDueSatang: number;
}

export function calculateMoveInSummary(input: MoveInCalculationInput): MoveInCalculationResult {
  const {
    monthlyRentSatang,
    moveInDate,
    billingDay = 25,
    depositMonths,
    bookingCreditSatang = 0,
    isProrated = true,
    includeMoveInDay = true
  } = input;

  assertIntegerSatang(monthlyRentSatang, 'monthlyRentSatang');
  assertIntegerSatang(bookingCreditSatang, 'bookingCreditSatang');
  if (!Number.isInteger(depositMonths) || depositMonths < 0) {
    throw new RangeError('depositMonths must be a non-negative integer');
  }

  const parts = moveInDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new RangeError(`Invalid moveInDate format (expected YYYY-MM-DD): ${moveInDate}`);
  }
  const dayOfMonth = parts[2];
  if (dayOfMonth < 1 || dayOfMonth > 31) {
    throw new RangeError(`Invalid day of month in moveInDate: ${moveInDate}`);
  }

  const dailyRateSatang = Math.round(monthlyRentSatang / 30);
  let proratedDays = 30;

  if (isProrated) {
    const inclusiveOffset = includeMoveInDay ? 1 : 0;
    if (dayOfMonth <= billingDay) {
      proratedDays = (billingDay - dayOfMonth) + inclusiveOffset;
    } else {
      // Moved in after the 25th (e.g., 28th): count remaining days in 30-day basis + 25 days of next cycle
      proratedDays = Math.max(0, 30 - dayOfMonth + inclusiveOffset) + billingDay;
    }
  }

  const firstMonthRentSatang = isProrated ? dailyRateSatang * proratedDays : monthlyRentSatang;
  const securityDepositSatang = monthlyRentSatang * depositMonths;
  const netMoveInDueSatang = Math.max(
    0,
    firstMonthRentSatang + securityDepositSatang - bookingCreditSatang
  );

  return {
    dailyRateSatang,
    proratedDays,
    firstMonthRentSatang,
    securityDepositSatang,
    bookingCreditSatang,
    netMoveInDueSatang
  };
}

/**
 * Rule #10B: Automatic Daily Late Fee after the 5th of Following Month
 */
export function calculateLateFeeSatang(params: {
  balanceDueSatang: number;
  dueDate: string; // "YYYY-MM-DD" (e.g., "2026-11-05")
  asOfDate: string; // "YYYY-MM-DD"
  dailyLateFeeSatang: number;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'ROLLED_OVER';
}): { lateDays: number; lateFeeSatang: number } {
  const { balanceDueSatang, dueDate, asOfDate, dailyLateFeeSatang, status } = params;
  assertIntegerSatang(balanceDueSatang, 'balanceDueSatang');
  assertIntegerSatang(dailyLateFeeSatang, 'dailyLateFeeSatang');

  if (status === 'PAID' || status === 'ROLLED_OVER' || balanceDueSatang <= 0) {
    return { lateDays: 0, lateFeeSatang: 0 };
  }

  const dueUtc = Date.UTC(
    Number(dueDate.slice(0, 4)),
    Number(dueDate.slice(5, 7)) - 1,
    Number(dueDate.slice(8, 10))
  );
  const asOfUtc = Date.UTC(
    Number(asOfDate.slice(0, 4)),
    Number(asOfDate.slice(5, 7)) - 1,
    Number(asOfDate.slice(8, 10))
  );

  if (asOfUtc <= dueUtc) {
    return { lateDays: 0, lateFeeSatang: 0 };
  }

  const lateDays = Math.floor((asOfUtc - dueUtc) / (1000 * 60 * 60 * 24));
  return {
    lateDays,
    lateFeeSatang: lateDays * dailyLateFeeSatang
  };
}

/**
 * Rule #4, #10B, #11B: Monthly Invoice Generation on the 25th + Arrears Rollover Transaction Logic
 */
export interface PreviousInvoiceSnapshot {
  id: string;
  balanceDueSatang: number;
  dueDate: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'ROLLED_OVER';
}

export interface MonthlyInvoiceBuildInput {
  newInvoiceId: string;
  roomNumber: string;
  billingPeriod: string; // "YYYY-MM"
  issueDate: string;     // "YYYY-MM-25"
  dueDate: string;       // "YYYY-(MM+1)-05"
  monthlyRentSatang: number;
  prevWater: number;
  currWater: number;
  waterRollover?: boolean;
  waterRateSatang: number;
  prevElectric: number;
  currElectric: number;
  electricRollover?: boolean;
  electricityRateSatang: number;
  dailyLateFeeSatang: number;
  discountSatang?: number;
  previousInvoice?: PreviousInvoiceSnapshot | null;
}

export function buildMonthlyInvoiceWithArrearsRollover(input: MonthlyInvoiceBuildInput) {
  const waterUnits = calculateMeterUnits(input.prevWater, input.currWater, Boolean(input.waterRollover));
  const electricUnits = calculateMeterUnits(input.prevElectric, input.currElectric, Boolean(input.electricRollover));

  const waterSatang = calculateUtilityChargeSatang(waterUnits, input.waterRateSatang);
  const electricSatang = calculateUtilityChargeSatang(electricUnits, input.electricityRateSatang);
  const discountSatang = input.discountSatang || 0;

  let arrearsForwardSatang = 0;
  let rolledOverLateFeeSatang = 0;
  let updatedPreviousInvoice: (PreviousInvoiceSnapshot & { rolledIntoInvoiceId: string | null }) | null = null;

  if (input.previousInvoice && input.previousInvoice.balanceDueSatang > 0 && input.previousInvoice.status !== 'ROLLED_OVER') {
    const { lateFeeSatang } = calculateLateFeeSatang({
      balanceDueSatang: input.previousInvoice.balanceDueSatang,
      dueDate: input.previousInvoice.dueDate,
      asOfDate: input.issueDate,
      dailyLateFeeSatang: input.dailyLateFeeSatang,
      status: input.previousInvoice.status
    });
    rolledOverLateFeeSatang = lateFeeSatang;
    arrearsForwardSatang = input.previousInvoice.balanceDueSatang + rolledOverLateFeeSatang;

    // Crucial Audit Invariant: Zero out balanceDueSatang on old invoice & mark ROLLED_OVER to prevent double counting
    updatedPreviousInvoice = {
      ...input.previousInvoice,
      balanceDueSatang: 0,
      status: 'ROLLED_OVER',
      rolledIntoInvoiceId: input.newInvoiceId
    };
  }

  const lineItems = [
    {
      itemType: 'RENT' as const,
      label: 'ค่าเช่าห้องพักรายเดือน',
      quantity: 1,
      unitRateSatang: input.monthlyRentSatang,
      amountSatang: input.monthlyRentSatang
    },
    {
      itemType: 'WATER' as const,
      label: `ค่าน้ำประปา (${input.prevWater} -> ${input.currWater})`,
      quantity: waterUnits,
      unitRateSatang: input.waterRateSatang,
      amountSatang: waterSatang
    },
    {
      itemType: 'ELECTRICITY' as const,
      label: `ค่าไฟฟ้า (${input.prevElectric} -> ${input.currElectric})`,
      quantity: electricUnits,
      unitRateSatang: input.electricityRateSatang,
      amountSatang: electricSatang
    }
  ];

  if (arrearsForwardSatang > 0) {
    lineItems.push({
      itemType: 'ARREARS_FORWARD' as const,
      label: 'ยอดค้างชำระยกมาจากเดือนก่อน (รวมค่าปรับสะสม)',
      quantity: 1,
      unitRateSatang: arrearsForwardSatang,
      amountSatang: arrearsForwardSatang
    });
  }

  if (discountSatang > 0) {
    lineItems.push({
      itemType: 'DISCOUNT' as const,
      label: 'ส่วนลดพิเศษ',
      quantity: 1,
      unitRateSatang: -discountSatang,
      amountSatang: -discountSatang
    });
  }

  const totalAmountSatang = lineItems.reduce((sum, item) => sum + item.amountSatang, 0);

  return {
    newInvoice: {
      id: input.newInvoiceId,
      roomNumber: input.roomNumber,
      billingPeriod: input.billingPeriod,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      baseRentSatang: input.monthlyRentSatang,
      waterUnits,
      waterSatang,
      electricUnits,
      electricSatang,
      arrearsForwardSatang,
      lateFeeSatang: 0,
      discountSatang,
      totalAmountSatang,
      paidAmountSatang: 0,
      balanceDueSatang: totalAmountSatang,
      status: 'ISSUED' as const,
      lineItems
    },
    updatedPreviousInvoice
  };
}

/**
 * Rule #11B: Partial or Full Payment Application
 */
export function applyPaymentToInvoice(
  invoice: {
    totalAmountSatang: number;
    paidAmountSatang: number;
    balanceDueSatang: number;
    status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'ROLLED_OVER';
  },
  paymentAmountSatang: number,
  accruedLateFeeSatang = 0
) {
  assertIntegerSatang(paymentAmountSatang, 'paymentAmountSatang');
  assertIntegerSatang(accruedLateFeeSatang, 'accruedLateFeeSatang');
  if (paymentAmountSatang <= 0) {
    throw new RangeError('Payment amount must be greater than 0 Satang');
  }
  if (invoice.status === 'ROLLED_OVER') {
    throw new Error('Cannot apply payment to an invoice that has already been rolled over');
  }

  const newTotalSatang = invoice.totalAmountSatang + accruedLateFeeSatang;
  const maxPayableSatang = newTotalSatang - invoice.paidAmountSatang;

  if (paymentAmountSatang > maxPayableSatang) {
    throw new RangeError(
      `Payment (${paymentAmountSatang}) exceeds remaining balance due (${maxPayableSatang})`
    );
  }

  const newPaidSatang = invoice.paidAmountSatang + paymentAmountSatang;
  const newBalanceDueSatang = newTotalSatang - newPaidSatang;
  const newStatus = newBalanceDueSatang === 0 ? ('PAID' as const) : ('PARTIAL' as const);

  return {
    totalAmountSatang: newTotalSatang,
    paidAmountSatang: newPaidSatang,
    balanceDueSatang: newBalanceDueSatang,
    status: newStatus
  };
}

/**
 * Rule #5B: Move-Out Security Deposit Settlement Calculation
 */
export interface MoveOutSettlementInput {
  depositHeldSatang: number;
  unpaidArrearsSatang: number;
  prevWater: number;
  currWater: number;
  waterRollover?: boolean;
  waterRateSatang: number;
  prevElectric: number;
  currElectric: number;
  electricRollover?: boolean;
  electricityRateSatang: number;
  cleaningFeeSatang: number;
  damageFeeSatang: number;
  otherDeductionSatang?: number;
}

export function calculateMoveOutSettlement(input: MoveOutSettlementInput) {
  const finalWaterUnits = calculateMeterUnits(input.prevWater, input.currWater, Boolean(input.waterRollover));
  const finalElectricUnits = calculateMeterUnits(input.prevElectric, input.currElectric, Boolean(input.electricRollover));

  const finalWaterSatang = calculateUtilityChargeSatang(finalWaterUnits, input.waterRateSatang);
  const finalElectricSatang = calculateUtilityChargeSatang(finalElectricUnits, input.electricityRateSatang);
  const otherDeductionSatang = input.otherDeductionSatang || 0;

  const totalDeductionsSatang =
    input.unpaidArrearsSatang +
    finalWaterSatang +
    finalElectricSatang +
    input.cleaningFeeSatang +
    input.damageFeeSatang +
    otherDeductionSatang;

  const netRefundSatang = input.depositHeldSatang - totalDeductionsSatang;

  return {
    depositHeldSatang: input.depositHeldSatang,
    finalWaterUnits,
    finalWaterSatang,
    finalElectricUnits,
    finalElectricSatang,
    cleaningFeeSatang: input.cleaningFeeSatang,
    damageFeeSatang: input.damageFeeSatang,
    unpaidArrearsSatang: input.unpaidArrearsSatang,
    otherDeductionSatang,
    totalDeductionsSatang,
    netRefundSatang
  };
}

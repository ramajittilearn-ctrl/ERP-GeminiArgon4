// =============================================================================
// Taky Apartment ERP — Step 1 Unit Test Suite (Vitest / Node Test Compatible)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// =============================================================================

import {
  toSatang,
  fromSatang,
  formatBaht,
  resolvePackageRentSatang,
  calculateMeterUnits,
  calculateUtilityChargeSatang,
  calculateMoveInSummary,
  calculateLateFeeSatang,
  buildMonthlyInvoiceWithArrearsRollover,
  applyPaymentToInvoice,
  calculateMoveOutSettlement
} from '../../src/lib/finance';
import { generatePromptPayPayload, computeCrc16Ccitt } from '../../src/lib/promptpay';
import { runPreProductionAudit } from '../../operations/audit-ledger';
import { INITIAL_15_ROOMS, INITIAL_PROPERTY_SETTINGS } from '../../prisma/seed';

export function runAllStep1Tests(): { total: number; passed: number; results: string[] } {
  const results: string[] = [];
  let total = 0;
  let passed = 0;

  function assertEqual(actual: unknown, expected: unknown, testName: string) {
    total++;
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`FAIL [${testName}]: expected ${e}, got ${a}`);
    }
    passed++;
    results.push(`PASS: ${testName}`);
  }

  function assertThrows(fn: () => unknown, testName: string) {
    total++;
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(`FAIL [${testName}]: expected function to throw`);
    }
    passed++;
    results.push(`PASS: ${testName}`);
  }

  // 1. Satang Integer Conversion & Odd Electricity Multiplication (6.50 THB/unit)
  assertEqual(toSatang(6.5), 650, '1.1 Convert 6.50 THB/unit electricity rate to 650 Satang');
  assertEqual(toSatang('3500.00'), 350000, '1.2 Convert 3,500 THB Gold rent to 350,000 Satang');
  const oddElecSatang = calculateUtilityChargeSatang(115, 650); // 115 units * 6.50 THB = 747.50 THB
  assertEqual(oddElecSatang, 74750, '1.3 Odd electricity units (115 * 6.50 THB) = exact 74,750 Satang');
  assertEqual(formatBaht(oddElecSatang), '747.50', '1.4 Format 74,750 Satang as "747.50" THB with zero float drift');
  assertEqual(calculateUtilityChargeSatang(0, 1000), 0, '1.5 Zero water usage = 0 Satang (no minimum fee)');

  // 2. Room Tiers & Seed Verification (15 rooms across 3 floors)
  assertEqual(INITIAL_15_ROOMS.length, 15, '2.1 Seed contains exactly 15 rooms (101-305)');
  assertEqual(INITIAL_PROPERTY_SETTINGS.commonFeeSatang, 0, '2.2 Common fee is 0 Satang per Rule #3');
  assertEqual(resolvePackageRentSatang('STANDARD'), 250000, '2.3 Standard tier = 2,500 THB');
  assertEqual(resolvePackageRentSatang('SILVER'), 300000, '2.4 Silver tier = 3,000 THB');
  assertEqual(resolvePackageRentSatang('GOLD'), 350000, '2.5 Gold tier = 3,500 THB');

  // 3. 4-Digit Meter Rollover (9999 -> 0000) & Validation
  assertEqual(calculateMeterUnits(1450, 1565, false), 115, '3.1 Normal meter consumption (1450 -> 1565 = 115 units)');
  assertEqual(calculateMeterUnits(9985, 65, true), 80, '3.2 4-digit meter rollover (9985 -> 0065 = 80 units)');
  assertThrows(
    () => calculateMeterUnits(9985, 65, false),
    '3.3 Rejects currReading < prevReading when isRollover is false'
  );

  // 4. Move-In Proration (Fixed 30-day divisor up to the 25th) + Deposit Multiplier - Booking Credit
  const moveInGold = calculateMoveInSummary({
    monthlyRentSatang: 350000, // 3,500 THB -> daily rate = round(350000/30) = 11,667 Satang
    moveInDate: '2026-10-10',  // 10th to 25th inclusive = 16 days
    billingDay: 25,
    depositMonths: 2,          // 2x deposit = 700,000 Satang (7,000 THB)
    bookingCreditSatang: 100000 // 1,000 THB booking credit
  });
  assertEqual(moveInGold.proratedDays, 16, '4.1 Proration from Oct 10 to Oct 25 = 16 days');
  assertEqual(moveInGold.dailyRateSatang, 11667, '4.2 Gold daily rate (350,000 / 30) = 11,667 Satang');
  assertEqual(moveInGold.securityDepositSatang, 700000, '4.3 2x Gold deposit = 700,000 Satang (7,000 THB)');
  assertEqual(
    moveInGold.netMoveInDueSatang,
    11667 * 16 + 700000 - 100000,
    '4.4 Net move-in due deducts booking deposit accurately'
  );

  // 5. Daily Late Fee after the 5th of Following Month
  const onTimeFee = calculateLateFeeSatang({
    balanceDueSatang: 420000,
    dueDate: '2026-11-05',
    asOfDate: '2026-11-05',
    dailyLateFeeSatang: 5000,
    status: 'ISSUED'
  });
  assertEqual(onTimeFee.lateFeeSatang, 0, '5.1 Payment on the 5th incurs 0 late fee');

  const late3Days = calculateLateFeeSatang({
    balanceDueSatang: 420000,
    dueDate: '2026-11-05',
    asOfDate: '2026-11-08',
    dailyLateFeeSatang: 5000,
    status: 'ISSUED'
  });
  assertEqual(late3Days.lateDays, 3, '5.2 Nov 8 is 3 days past Nov 5 due date');
  assertEqual(late3Days.lateFeeSatang, 15000, '5.3 3 late days * 50 THB/day = 15,000 Satang (150 THB)');

  // 6. Monthly Invoice Generation on 25th + Arrears Rollover + Partial Payment
  const prevUnpaidInvoice = {
    id: 'INV-202609-103',
    balanceDueSatang: 120000, // 1,200 THB unpaid from Sept
    dueDate: '2026-10-05',
    status: 'PARTIAL' as const
  };
  const built = buildMonthlyInvoiceWithArrearsRollover({
    newInvoiceId: 'INV-202610-103',
    roomNumber: '103',
    billingPeriod: '2026-10',
    issueDate: '2026-10-25',
    dueDate: '2026-11-05',
    monthlyRentSatang: 350000,
    prevWater: 210,
    currWater: 219, // 9 units * 10 THB = 90 THB (9,000 Satang)
    waterRateSatang: 1000,
    prevElectric: 2310,
    currElectric: 2465, // 155 units * 6.50 THB = 1,007.50 THB (100,750 Satang)
    electricityRateSatang: 650,
    dailyLateFeeSatang: 5000, // 20 days late from Oct 5 to Oct 25 = 1,000 THB (100,000 Satang)
    previousInvoice: prevUnpaidInvoice
  });

  assertEqual(
    built.updatedPreviousInvoice?.status,
    'ROLLED_OVER',
    '6.1 Previous unpaid invoice marked as ROLLED_OVER'
  );
  assertEqual(
    built.updatedPreviousInvoice?.balanceDueSatang,
    0,
    '6.2 Previous rolled-over invoice balanceDueSatang zeroed to prevent double-counting'
  );
  assertEqual(
    built.newInvoice.arrearsForwardSatang,
    220000,
    '6.3 Arrears forward = 1,200 THB unpaid + 1,000 THB accrued late fee = 220,000 Satang'
  );
  assertEqual(
    built.newInvoice.totalAmountSatang,
    350000 + 9000 + 100750 + 220000,
    '6.4 New 25th invoice total = 6,797.50 THB (679,750 Satang)'
  );

  // Partial payment followed by final payment
  const afterPartial = applyPaymentToInvoice(built.newInvoice, 300000);
  assertEqual(afterPartial.status, 'PARTIAL', '6.5 Partial payment transitions invoice to PARTIAL');
  assertEqual(afterPartial.balanceDueSatang, 379750, '6.6 Remaining balance after 3,000 THB partial payment = 3,797.50 THB');

  const afterFull = applyPaymentToInvoice(afterPartial, 379750);
  assertEqual(afterFull.status, 'PAID', '6.7 Final payment transitions invoice to PAID');
  assertEqual(afterFull.balanceDueSatang, 0, '6.8 Paid invoice has 0 Satang balance due');

  // 7. Move-Out Security Deposit Settlement
  const settlement = calculateMoveOutSettlement({
    depositHeldSatang: 350000,
    unpaidArrearsSatang: 0,
    prevWater: 100,
    currWater: 104, // 4 units = 40 THB
    waterRateSatang: 1000,
    prevElectric: 500,
    currElectric: 545, // 45 units * 6.50 THB = 292.50 THB
    electricityRateSatang: 650,
    cleaningFeeSatang: 30000, // 300 THB
    damageFeeSatang: 20000 // 200 THB
  });
  assertEqual(
    settlement.netRefundSatang,
    350000 - (4000 + 29250 + 30000 + 20000),
    '7.1 Move-out net refund = 2,667.50 THB (266,750 Satang)'
  );

  // 8. PromptPay QR Payload + Pre-Production Audit Gate Check
  const qrPayload = generatePromptPayPayload('081-234-5678', built.newInvoice.totalAmountSatang);
  const expectedCrc = computeCrc16Ccitt(qrPayload.slice(0, -4));
  assertEqual(qrPayload.slice(-4), expectedCrc, '8.1 PromptPay EMVCo QR has valid CRC-16/CCITT-FALSE checksum');

  const auditReport = runPreProductionAudit({
    rooms: INITIAL_15_ROOMS.map((r) => ({
      roomNumber: r.roomNumber,
      floorNumber: r.floorNumber,
      status: r.roomNumber === '103' ? 'OCCUPIED' : 'AVAILABLE',
      activeLeaseCount: r.roomNumber === '103' ? 1 : 0,
      meterHistory:
        r.roomNumber === '103'
          ? [
              {
                billingPeriod: '2026-09',
                prevWater: 202,
                currWater: 210,
                waterRollover: false,
                prevElectric: 2180,
                currElectric: 2310,
                electricRollover: false
              },
              {
                billingPeriod: '2026-10',
                prevWater: 210,
                currWater: 219,
                waterRollover: false,
                prevElectric: 2310,
                currElectric: 2465,
                electricRollover: false
              }
            ]
          : []
    })),
    invoices: [
      {
        ...built.newInvoice,
        paidAmountSatang: 300000,
        balanceDueSatang: 379750,
        status: 'PARTIAL',
        rolledIntoInvoiceId: null,
        payments: [{ id: 'PAY-1', amountSatang: 300000 }],
        promptPayQrPayload: qrPayload
      }
    ]
  });
  assertEqual(auditReport.passed, true, '8.2 Pre-Production 5-Gate Audit passes with 0 violations');

  return { total, passed, results };
}

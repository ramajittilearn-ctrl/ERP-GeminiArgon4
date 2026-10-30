// =============================================================================
// Taky Apartment ERP — Milestone 1: Prisma ACID Transaction Repository
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Executes all multi-table mutations inside prisma.$transaction(...)
// =============================================================================

import { prisma } from '../../lib/db';
import {
  resolvePackageRentSatang,
  calculateMoveInSummary,
  buildMonthlyInvoiceWithArrearsRollover,
  applyPaymentToInvoice,
  calculateLateFeeSatang,
  calculateMoveOutSettlement
} from '../../lib/finance';
import {
  CreateReservationInput,
  CreateMoveInLeaseInput,
  BulkMeterEntryInput,
  RecordPaymentInput,
  validateCreateReservationInput,
  validateCreateMoveInLeaseInput,
  validateBulkMeterBatch,
  validateRecordPaymentInput,
  validateRoomNumber
} from '../../lib/validations';

/**
 * 1. Reserve Room inside a Prisma ACID Transaction (AVAILABLE -> RESERVED)
 */
export async function reserveRoomPrismaTx(input: CreateReservationInput) {
  validateCreateReservationInput(input);

  return await prisma.$transaction(async (tx: any) => {
    const room = await tx.room.findUnique({
      where: { roomNumber: input.roomNumber }
    });
    if (!room) {
      throw new Error(`Room ${input.roomNumber} not found`);
    }
    if (room.status !== 'AVAILABLE') {
      throw new Error(`Room ${input.roomNumber} is currently ${room.status}`);
    }

    const reservation = await tx.reservation.create({
      data: {
        roomId: room.id,
        tenantName: input.tenantName.trim(),
        phone: input.phone.trim(),
        lineId: input.lineId || null,
        selectedTier: input.selectedTier,
        agreedRentSatang: input.agreedRentSatang,
        bookingDepositSatang: input.bookingDepositSatang,
        expectedMoveInDate: new Date(input.expectedMoveInDate),
        status: 'ACTIVE_BOOKING'
      }
    });

    await tx.room.update({
      where: { id: room.id },
      data: { status: 'RESERVED' }
    });

    return reservation;
  });
}

/**
 * 2. Move-In & Proration to 25th inside a Prisma ACID Transaction
 * Automatically converts ACTIVE_BOOKING reservation and deducts bookingDepositSatang
 */
export async function createMoveInLeasePrismaTx(input: CreateMoveInLeaseInput) {
  validateCreateMoveInLeaseInput(input);

  return await prisma.$transaction(async (tx: any) => {
    const settings = await tx.propertySetting.findFirstOrThrow();
    const room = await tx.room.findUnique({
      where: { roomNumber: input.roomNumber }
    });
    if (!room) {
      throw new Error(`Room ${input.roomNumber} not found`);
    }
    if (room.status !== 'AVAILABLE' && room.status !== 'RESERVED') {
      throw new Error(`Room ${input.roomNumber} is ${room.status}; cannot create lease`);
    }

    const existingActiveLease = await tx.lease.findFirst({
      where: { roomId: room.id, status: 'ACTIVE' }
    });
    if (existingActiveLease) {
      throw new Error(`Room ${input.roomNumber} already has an ACTIVE lease`);
    }

    const activeReservation = await tx.reservation.findFirst({
      where: { roomId: room.id, status: 'ACTIVE_BOOKING' }
    });

    const monthlyRentSatang = resolvePackageRentSatang(
      input.packageTier,
      input.customRentSatang,
      {
        STANDARD: settings.tierStandardSatang,
        SILVER: settings.tierSilverSatang,
        GOLD: settings.tierGoldSatang
      }
    );

    const bookingCreditSatang = activeReservation
      ? activeReservation.bookingDepositSatang
      : 0;

    const moveInCalc = calculateMoveInSummary({
      monthlyRentSatang,
      moveInDate: input.startDate,
      billingDay: settings.billingDay,
      depositMonths: input.depositMonths,
      bookingCreditSatang,
      isProrated: input.isProratedFirstMonth
    });

    const tenant = await tx.tenant.create({
      data: {
        fullName: input.tenantName.trim(),
        phone: input.phone.trim(),
        nationalId: input.nationalId || null
      }
    });

    const lease = await tx.lease.create({
      data: {
        roomId: room.id,
        tenantId: tenant.id,
        packageTier: input.packageTier,
        monthlyRentSatang,
        depositMonths: input.depositMonths,
        securityDepositSatang: moveInCalc.securityDepositSatang,
        bookingCreditSatang,
        startDate: new Date(input.startDate),
        initialWaterMeter: input.initialWaterMeter,
        initialElectricMeter: input.initialElectricMeter,
        status: 'ACTIVE'
      }
    });

    if (activeReservation) {
      await tx.reservation.update({
        where: { id: activeReservation.id },
        data: {
          status: 'CONVERTED_TO_LEASE',
          convertedLeaseId: lease.id
        }
      });
    }

    await tx.room.update({
      where: { id: room.id },
      data: {
        status: 'OCCUPIED',
        lastWaterMeter: input.initialWaterMeter,
        lastElectricMeter: input.initialElectricMeter
      }
    });

    const invoiceNumber = `INV-MOVEIN-${input.roomNumber}-${input.startDate.replace(/-/g, '')}`;
    const lineItemsData: Array<any> = [
      {
        itemType: input.isProratedFirstMonth ? 'PRORATED_RENT' : 'RENT',
        label: input.isProratedFirstMonth
          ? `ค่าเช่าเฉลี่ยรายวันถึงวันที่ ${settings.billingDay} (${moveInCalc.proratedDays} วัน)`
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
      lineItemsData.push({
        itemType: 'BOOKING_CREDIT',
        label: 'หักเงินมัดจำจองห้องพักล่วงหน้า',
        quantity: 1,
        unitRateSatang: -bookingCreditSatang,
        amountSatang: -bookingCreditSatang
      });
    }

    const moveInInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        leaseId: lease.id,
        roomId: room.id,
        billingPeriod: input.startDate.slice(0, 7),
        invoiceType: 'MOVE_IN',
        issueDate: new Date(input.startDate),
        dueDate: new Date(input.startDate),
        baseRentSatang: moveInCalc.firstMonthRentSatang,
        waterSatang: 0,
        electricSatang: 0,
        arrearsForwardSatang: 0,
        lateFeeSatang: 0,
        discountSatang: bookingCreditSatang,
        totalAmountSatang: moveInCalc.netMoveInDueSatang,
        paidAmountSatang: moveInCalc.netMoveInDueSatang,
        balanceDueSatang: 0,
        status: 'PAID',
        lineItems: {
          create: lineItemsData
        },
        payments: {
          create: [
            {
              paidAt: new Date(input.startDate),
              amountSatang: moveInCalc.netMoveInDueSatang,
              method: 'PROMPTPAY',
              referenceNote: 'ชำระเงินทำสัญญาแรกเข้า'
            }
          ]
        }
      },
      include: { lineItems: true, payments: true }
    });

    return { lease, moveInInvoice, moveInCalculation: moveInCalc };
  });
}

/**
 * 3. Bulk 25th Meter Reading & Monthly Invoice Generation with Arrears Rollover Transaction
 */
export async function run25thBulkMeterBillingPrismaTx(params: {
  billingPeriod: string;
  readingDate: string;
  dueDate: string;
  entries: BulkMeterEntryInput[];
}) {
  validateBulkMeterBatch(params.entries);

  return await prisma.$transaction(async (tx: any) => {
    const settings = await tx.propertySetting.findFirstOrThrow();
    const createdInvoices = [];

    for (const entry of params.entries) {
      const room = await tx.room.findUnique({
        where: { roomNumber: entry.roomNumber }
      });
      if (!room || room.status !== 'OCCUPIED') continue;

      const activeLease = await tx.lease.findFirst({
        where: { roomId: room.id, status: 'ACTIVE' }
      });
      if (!activeLease) continue;

      // Find previous unpaid invoice to roll over
      const previousUnpaidInvoice = await tx.invoice.findFirst({
        where: {
          roomId: room.id,
          status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] },
          balanceDueSatang: { gt: 0 }
        },
        orderBy: { issueDate: 'desc' }
      });

      const invoiceNumber = `INV-${params.billingPeriod}-${entry.roomNumber}`;
      const built = buildMonthlyInvoiceWithArrearsRollover({
        newInvoiceId: invoiceNumber,
        roomNumber: entry.roomNumber,
        billingPeriod: params.billingPeriod,
        issueDate: params.readingDate,
        dueDate: params.dueDate,
        monthlyRentSatang: activeLease.monthlyRentSatang,
        prevWater: room.lastWaterMeter,
        currWater: entry.currWater,
        waterRollover: entry.waterRollover,
        waterRateSatang: settings.waterRateSatang,
        prevElectric: room.lastElectricMeter,
        currElectric: entry.currElectric,
        electricRollover: entry.electricRollover,
        electricityRateSatang: settings.electricityRateSatang,
        dailyLateFeeSatang: settings.dailyLateFeeSatang,
        discountSatang: entry.discountSatang || 0,
        previousInvoice: previousUnpaidInvoice
          ? {
              id: previousUnpaidInvoice.id,
              balanceDueSatang: previousUnpaidInvoice.balanceDueSatang,
              dueDate: previousUnpaidInvoice.dueDate.toISOString().slice(0, 10),
              status: previousUnpaidInvoice.status
            }
          : null
      });

      await tx.meterReading.upsert({
        where: {
          roomId_billingPeriod: {
            roomId: room.id,
            billingPeriod: params.billingPeriod
          }
        },
        update: {
          readingDate: new Date(params.readingDate),
          prevWater: room.lastWaterMeter,
          currWater: entry.currWater,
          waterRollover: Boolean(entry.waterRollover),
          waterUnits: built.newInvoice.waterUnits,
          prevElectric: room.lastElectricMeter,
          currElectric: entry.currElectric,
          electricRollover: Boolean(entry.electricRollover),
          electricUnits: built.newInvoice.electricUnits
        },
        create: {
          roomId: room.id,
          leaseId: activeLease.id,
          billingPeriod: params.billingPeriod,
          readingDate: new Date(params.readingDate),
          prevWater: room.lastWaterMeter,
          currWater: entry.currWater,
          waterRollover: Boolean(entry.waterRollover),
          waterUnits: built.newInvoice.waterUnits,
          prevElectric: room.lastElectricMeter,
          currElectric: entry.currElectric,
          electricRollover: Boolean(entry.electricRollover),
          electricUnits: built.newInvoice.electricUnits
        }
      });

      const createdInv = await tx.invoice.create({
        data: {
          invoiceNumber,
          leaseId: activeLease.id,
          roomId: room.id,
          billingPeriod: params.billingPeriod,
          invoiceType: 'MONTHLY',
          issueDate: new Date(params.readingDate),
          dueDate: new Date(params.dueDate),
          baseRentSatang: built.newInvoice.baseRentSatang,
          waterSatang: built.newInvoice.waterSatang,
          electricSatang: built.newInvoice.electricSatang,
          arrearsForwardSatang: built.newInvoice.arrearsForwardSatang,
          lateFeeSatang: 0,
          discountSatang: built.newInvoice.discountSatang,
          totalAmountSatang: built.newInvoice.totalAmountSatang,
          paidAmountSatang: 0,
          balanceDueSatang: built.newInvoice.balanceDueSatang,
          status: 'ISSUED',
          lineItems: {
            create: built.newInvoice.lineItems
          }
        }
      });

      if (previousUnpaidInvoice && built.updatedPreviousInvoice) {
        await tx.invoice.update({
          where: { id: previousUnpaidInvoice.id },
          data: {
            balanceDueSatang: 0,
            status: 'ROLLED_OVER',
            rolledIntoInvoiceId: createdInv.id
          }
        });
      }

      await tx.room.update({
        where: { id: room.id },
        data: {
          lastWaterMeter: entry.currWater,
          lastElectricMeter: entry.currElectric
        }
      });

      createdInvoices.push(createdInv);
    }

    return createdInvoices;
  });
}

/**
 * 4. Record Full or Partial Payment with Slip Image Attachment inside a Prisma Transaction
 */
export async function recordInvoicePaymentPrismaTx(input: RecordPaymentInput) {
  validateRecordPaymentInput(input);

  return await prisma.$transaction(async (tx: any) => {
    const settings = await tx.propertySetting.findFirstOrThrow();
    const invoice = await tx.invoice.findUnique({
      where: { invoiceNumber: input.invoiceId },
      include: { lineItems: true, payments: true }
    });
    if (!invoice) {
      throw new Error(`Invoice ${input.invoiceId} not found`);
    }

    const { lateDays, lateFeeSatang } = calculateLateFeeSatang({
      balanceDueSatang: invoice.balanceDueSatang,
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      asOfDate: input.paidAt,
      dailyLateFeeSatang: settings.dailyLateFeeSatang,
      status: invoice.status
    });

    const newlyAddedLateFeeSatang = Math.max(0, lateFeeSatang - (invoice.lateFeeSatang || 0));

    const updatedTotals = applyPaymentToInvoice(
      {
        totalAmountSatang: invoice.totalAmountSatang,
        paidAmountSatang: invoice.paidAmountSatang,
        balanceDueSatang: invoice.balanceDueSatang,
        status: invoice.status
      },
      input.amountSatang,
      newlyAddedLateFeeSatang
    );

    if (newlyAddedLateFeeSatang > 0) {
      await tx.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          itemType: 'LATE_FEE',
          label: `ค่าปรับชำระล่าช้า (${lateDays} วัน หลังวันที่ 5)`,
          quantity: lateDays,
          unitRateSatang: settings.dailyLateFeeSatang,
          amountSatang: newlyAddedLateFeeSatang
        }
      });
    }

    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        paidAt: new Date(input.paidAt),
        amountSatang: input.amountSatang,
        method: input.method,
        slipImageUrl: input.slipImageUrl || null,
        referenceNote: input.referenceNote || null
      }
    });

    return await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        lateFeeSatang: (invoice.lateFeeSatang || 0) + newlyAddedLateFeeSatang,
        totalAmountSatang: updatedTotals.totalAmountSatang,
        paidAmountSatang: updatedTotals.paidAmountSatang,
        balanceDueSatang: updatedTotals.balanceDueSatang,
        status: updatedTotals.status
      },
      include: { lineItems: true, payments: true }
    });
  });
}

/**
 * 5. Move-Out & Deposit Settlement inside a Prisma ACID Transaction
 */
export async function settleMoveOutPrismaTx(params: {
  roomNumber: string;
  moveOutDate: string;
  currWater: number;
  waterRollover?: boolean;
  currElectric: number;
  electricRollover?: boolean;
  cleaningFeeSatang: number;
  damageFeeSatang: number;
}) {
  validateRoomNumber(params.roomNumber);

  return await prisma.$transaction(async (tx: any) => {
    const settings = await tx.propertySetting.findFirstOrThrow();
    const room = await tx.room.findUnique({
      where: { roomNumber: params.roomNumber }
    });
    if (!room || room.status !== 'OCCUPIED') {
      throw new Error(`Room ${params.roomNumber} is not OCCUPIED`);
    }

    const activeLease = await tx.lease.findFirst({
      where: { roomId: room.id, status: 'ACTIVE' }
    });
    if (!activeLease) {
      throw new Error(`No active lease for room ${params.roomNumber}`);
    }

    const unpaidInvoices = await tx.invoice.findMany({
      where: {
        roomId: room.id,
        status: { not: 'ROLLED_OVER' },
        balanceDueSatang: { gt: 0 }
      }
    });

    let unpaidArrearsSatang = 0;
    for (const inv of unpaidInvoices) {
      unpaidArrearsSatang += inv.balanceDueSatang;
      await tx.payment.create({
        data: {
          invoiceId: inv.id,
          paidAt: new Date(params.moveOutDate),
          amountSatang: inv.balanceDueSatang,
          method: 'DEPOSIT_DEDUCTION',
          referenceNote: 'หักจากเงินประกันห้องตอนย้ายออก'
        }
      });
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          paidAmountSatang: inv.totalAmountSatang,
          balanceDueSatang: 0,
          status: 'PAID'
        }
      });
    }

    const calc = calculateMoveOutSettlement({
      depositHeldSatang: activeLease.securityDepositSatang,
      unpaidArrearsSatang,
      prevWater: room.lastWaterMeter,
      currWater: params.currWater,
      waterRollover: params.waterRollover,
      waterRateSatang: settings.waterRateSatang,
      prevElectric: room.lastElectricMeter,
      currElectric: params.currElectric,
      electricRollover: params.electricRollover,
      electricityRateSatang: settings.electricityRateSatang,
      cleaningFeeSatang: params.cleaningFeeSatang,
      damageFeeSatang: params.damageFeeSatang
    });

    const settlement = await tx.depositSettlement.create({
      data: {
        leaseId: activeLease.id,
        moveOutDate: new Date(params.moveOutDate),
        depositHeldSatang: calc.depositHeldSatang,
        unpaidArrearsSatang: calc.unpaidArrearsSatang,
        finalWaterUnits: calc.finalWaterUnits,
        finalWaterSatang: calc.finalWaterSatang,
        finalElectricUnits: calc.finalElectricUnits,
        finalElectricSatang: calc.finalElectricSatang,
        cleaningFeeSatang: calc.cleaningFeeSatang,
        damageFeeSatang: calc.damageFeeSatang,
        otherDeductionSatang: calc.otherDeductionSatang,
        netRefundSatang: calc.netRefundSatang
      }
    });

    await tx.lease.update({
      where: { id: activeLease.id },
      data: {
        status: 'MOVED_OUT',
        endDate: new Date(params.moveOutDate)
      }
    });

    await tx.room.update({
      where: { id: room.id },
      data: {
        status: 'AVAILABLE',
        lastWaterMeter: params.currWater,
        lastElectricMeter: params.currElectric
      }
    });

    return settlement;
  });
}

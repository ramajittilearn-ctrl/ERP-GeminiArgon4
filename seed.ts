// =============================================================================
// Taky Apartment ERP — Initial Database Seed (3 Floors, 15 Rooms: 101–305)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// =============================================================================

import { PrismaClient, RoomStatus } from '@prisma/client';

const prisma = new PrismaClient();

export const INITIAL_PROPERTY_SETTINGS = {
  id: 'singleton',
  apartmentName: 'Taky Apartment',
  electricityRateSatang: 650,    // 6.50 THB / unit (no minimum)
  waterRateSatang: 1000,         // 10.00 THB / unit (no minimum)
  commonFeeSatang: 0,            // 0 THB (no monthly common fee)
  billingDay: 25,                // 25th of every month
  dueDayNextMonth: 5,            // 5th of the following month
  dailyLateFeeSatang: 5000,      // 50.00 THB / day after due date
  defaultDepositMonths: 1,       // 1x monthly rent by default
  promptPayId: '0812345678',     // Single PromptPay ID for all rooms
  tierStandardSatang: 250000,    // 2,500.00 THB
  tierSilverSatang: 300000,      // 3,000.00 THB
  tierGoldSatang: 350000         // 3,500.00 THB
};

export const INITIAL_15_ROOMS = [
  // Floor 1
  { roomNumber: '101', floorNumber: 1, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 120, lastElectricMeter: 1450 },
  { roomNumber: '102', floorNumber: 1, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 85,  lastElectricMeter: 980 },
  { roomNumber: '103', floorNumber: 1, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 210, lastElectricMeter: 2310 },
  { roomNumber: '104', floorNumber: 1, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 64,  lastElectricMeter: 620 },
  { roomNumber: '105', floorNumber: 1, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 40,  lastElectricMeter: 510 },
  // Floor 2
  { roomNumber: '201', floorNumber: 2, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 150, lastElectricMeter: 1890 },
  { roomNumber: '202', floorNumber: 2, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 310, lastElectricMeter: 9985 },
  { roomNumber: '203', floorNumber: 2, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 95,  lastElectricMeter: 1200 },
  { roomNumber: '204', floorNumber: 2, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 72,  lastElectricMeter: 840 },
  { roomNumber: '205', floorNumber: 2, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 110, lastElectricMeter: 1320 },
  // Floor 3
  { roomNumber: '301', floorNumber: 3, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 180, lastElectricMeter: 2100 },
  { roomNumber: '302', floorNumber: 3, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 140, lastElectricMeter: 1650 },
  { roomNumber: '303', floorNumber: 3, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 54,  lastElectricMeter: 590 },
  { roomNumber: '304', floorNumber: 3, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 33,  lastElectricMeter: 410 },
  { roomNumber: '305', floorNumber: 3, sizeSqm: 21, status: 'AVAILABLE' as RoomStatus, lastWaterMeter: 165, lastElectricMeter: 1920 }
];

async function main() {
  await prisma.propertySetting.upsert({
    where: { id: 'singleton' },
    update: INITIAL_PROPERTY_SETTINGS,
    create: INITIAL_PROPERTY_SETTINGS
  });

  for (const room of INITIAL_15_ROOMS) {
    await prisma.room.upsert({
      where: { roomNumber: room.roomNumber },
      update: {
        floorNumber: room.floorNumber,
        sizeSqm: room.sizeSqm
      },
      create: room
    });
  }

  console.log('✅ Seeded Taky Apartment: 1 PropertySetting + 15 Rooms (101–305 across 3 floors).');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

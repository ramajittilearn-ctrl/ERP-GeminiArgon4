// =============================================================================
// Taky Apartment ERP — Server State Singleton & Auto Local-Disk Persistence
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Includes KBank Account (696-2-08678-9 • นายรามจิตติ ปสุตนาวิน) & Contact Info
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { InMemoryStore } from './services/room-lease.service';
import { ExpenseRecord, recordPropertyExpense } from './services/expense-report.service';

export interface ErpRuntimeContext {
  store: InMemoryStore & {
    settings: InMemoryStore['settings'] & {
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountOwner?: string;
      contactPhone?: string;
      contactAddress?: string;
    };
  };
  expenses: Map<string, ExpenseRecord>;
}

const LOCAL_DB_FILE = path.join(process.cwd(), 'data', 'taky_erp_local_db.json');

export function saveContextToDisk(ctx: ErpRuntimeContext): void {
  try {
    const dir = path.dirname(LOCAL_DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = {
      updatedAt: new Date().toISOString(),
      settings: ctx.store.settings,
      rooms: Array.from(ctx.store.rooms.entries()),
      reservations: Array.from(ctx.store.reservations.entries()),
      leases: Array.from(ctx.store.leases.entries()),
      invoices: Array.from(ctx.store.invoices.entries()),
      settlements: Array.from(ctx.store.settlements.entries()),
      expenses: Array.from(ctx.expenses.entries())
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(serialized, null, 2), 'utf8');
  } catch {
    // Ignore write errors in read-only test environments
  }
}

export function loadContextFromDisk(): ErpRuntimeContext | null {
  try {
    if (!fs.existsSync(LOCAL_DB_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
    if (!raw || !Array.isArray(raw.rooms) || raw.rooms.length !== 15) return null;

    return {
      store: {
        settings: raw.settings,
        rooms: new Map(raw.rooms),
        reservations: new Map(raw.reservations || []),
        leases: new Map(raw.leases || []),
        invoices: new Map(raw.invoices || []),
        settlements: new Map(raw.settlements || [])
      },
      expenses: new Map(raw.expenses || [])
    };
  } catch {
    return null;
  }
}

export function createCleanGoLiveErpContext(promptPayId = '0928255788'): ErpRuntimeContext {
  const store: ErpRuntimeContext['store'] = {
    settings: {
      apartmentName: 'Taky Apartment',
      electricityRateSatang: 650,
      waterRateSatang: 1000,
      commonFeeSatang: 0,
      billingDay: 25,
      dueDayNextMonth: 5,
      dailyLateFeeSatang: 5000,
      defaultDepositMonths: 1,
      promptPayId,
      bankName: 'ธนาคารกสิกรไทย (KBank)',
      bankAccountNumber: '696-2-08678-9',
      bankAccountOwner: 'นายรามจิตติ ปสุตนาวิน',
      contactPhone: '092-825-5788',
      contactAddress: 'Taky Apartment (15 ห้อง • 3 ชั้น)',
      tierStandardSatang: 250000,
      tierSilverSatang: 300000,
      tierGoldSatang: 350000
    },
    rooms: new Map(),
    reservations: new Map(),
    leases: new Map(),
    invoices: new Map(),
    settlements: new Map()
  };

  for (let floor = 1; floor <= 3; floor++) {
    for (let r = 1; r <= 5; r++) {
      const roomNumber = `${floor}0${r}`;
      store.rooms.set(roomNumber, {
        roomNumber,
        floorNumber: floor,
        sizeSqm: 21,
        status: 'AVAILABLE',
        lastWaterMeter: 0,
        lastElectricMeter: 0
      });
    }
  }

  return { store, expenses: new Map() };
}

export function createInitialTakyErpContext(): ErpRuntimeContext {
  const store: ErpRuntimeContext['store'] = {
    settings: {
      apartmentName: 'Taky Apartment',
      electricityRateSatang: 650,
      waterRateSatang: 1000,
      commonFeeSatang: 0,
      billingDay: 25,
      dueDayNextMonth: 5,
      dailyLateFeeSatang: 5000,
      defaultDepositMonths: 1,
      promptPayId: process.env.PROMPTPAY_ID || '0928255788',
      bankName: 'ธนาคารกสิกรไทย (KBank)',
      bankAccountNumber: '696-2-08678-9',
      bankAccountOwner: 'นายรามจิตติ ปสุตนาวิน',
      contactPhone: '092-825-5788',
      contactAddress: 'Taky Apartment (15 ห้อง • 3 ชั้น)',
      tierStandardSatang: 250000,
      tierSilverSatang: 300000,
      tierGoldSatang: 350000
    },
    rooms: new Map(),
    reservations: new Map(),
    leases: new Map(),
    invoices: new Map(),
    settlements: new Map()
  };

  const expenses = new Map<string, ExpenseRecord>();

  const seedRooms: Array<{
    roomNumber: string;
    floorNumber: number;
    status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE';
    water: number;
    electric: number;
    tenantName?: string;
    phone?: string;
    tier?: 'STANDARD' | 'SILVER' | 'GOLD';
    rentSatang?: number;
    depositMonths?: number;
    startDate?: string;
  }> = [
    { roomNumber: '101', floorNumber: 1, status: 'OCCUPIED', water: 120, electric: 1450, tenantName: 'คุณสมศักดิ์ มีสุข', phone: '081-412-8891', tier: 'STANDARD', rentSatang: 250000, depositMonths: 1, startDate: '2026-03-01' },
    { roomNumber: '102', floorNumber: 1, status: 'OCCUPIED', water: 85, electric: 980, tenantName: 'คุณวิภาดา สายชล', phone: '089-221-3344', tier: 'SILVER', rentSatang: 300000, depositMonths: 1, startDate: '2026-04-01' },
    { roomNumber: '103', floorNumber: 1, status: 'OCCUPIED', water: 210, electric: 2310, tenantName: 'คุณณัฐพล คนขยัน', phone: '086-778-9012', tier: 'GOLD', rentSatang: 350000, depositMonths: 2, startDate: '2026-02-01' },
    { roomNumber: '104', floorNumber: 1, status: 'AVAILABLE', water: 64, electric: 620 },
    { roomNumber: '105', floorNumber: 1, status: 'AVAILABLE', water: 40, electric: 510 },

    { roomNumber: '201', floorNumber: 2, status: 'OCCUPIED', water: 150, electric: 1890, tenantName: 'คุณปิยะพงษ์ วงศ์คำ', phone: '084-556-7788', tier: 'STANDARD', rentSatang: 250000, depositMonths: 1, startDate: '2026-05-01' },
    { roomNumber: '202', floorNumber: 2, status: 'OCCUPIED', water: 310, electric: 9985, tenantName: 'คุณมณีรัตน์ ทองดี', phone: '081-990-4512', tier: 'SILVER', rentSatang: 300000, depositMonths: 1, startDate: '2026-01-01' },
    { roomNumber: '203', floorNumber: 2, status: 'OCCUPIED', water: 95, electric: 1200, tenantName: 'คุณอนุชา ศรีสวัสดิ์', phone: '083-114-5678', tier: 'GOLD', rentSatang: 350000, depositMonths: 1, startDate: '2026-06-01' },
    { roomNumber: '204', floorNumber: 2, status: 'OCCUPIED', water: 72, electric: 840, tenantName: 'คุณชลธิชา นาคิน', phone: '089-654-3210', tier: 'SILVER', rentSatang: 300000, depositMonths: 1, startDate: '2026-07-01' },
    { roomNumber: '205', floorNumber: 2, status: 'MAINTENANCE', water: 110, electric: 1320 },

    { roomNumber: '301', floorNumber: 3, status: 'OCCUPIED', water: 180, electric: 2100, tenantName: 'คุณธนกฤต พัฒนา', phone: '081-777-2345', tier: 'GOLD', rentSatang: 350000, depositMonths: 2, startDate: '2026-03-01' },
    { roomNumber: '302', floorNumber: 3, status: 'OCCUPIED', water: 140, electric: 1650, tenantName: 'คุณอารยา ใจงาม', phone: '085-332-1987', tier: 'GOLD', rentSatang: 350000, depositMonths: 1, startDate: '2026-05-01' },
    { roomNumber: '303', floorNumber: 3, status: 'OCCUPIED', water: 54, electric: 590, tenantName: 'คุณวรพจน์ สุขสันต์', phone: '087-889-0011', tier: 'SILVER', rentSatang: 300000, depositMonths: 1, startDate: '2026-08-01' },
    { roomNumber: '304', floorNumber: 3, status: 'OCCUPIED', water: 33, electric: 410, tenantName: 'คุณสุดาพร อินทร์จันทร์', phone: '082-445-6677', tier: 'STANDARD', rentSatang: 250000, depositMonths: 1, startDate: '2026-09-01' },
    { roomNumber: '305', floorNumber: 3, status: 'OCCUPIED', water: 165, electric: 1920, tenantName: 'คุณกิตติพงศ์ ยิ่งเจริญ', phone: '080-123-9876', tier: 'GOLD', rentSatang: 350000, depositMonths: 1, startDate: '2026-04-01' }
  ];

  for (const r of seedRooms) {
    store.rooms.set(r.roomNumber, {
      roomNumber: r.roomNumber,
      floorNumber: r.floorNumber,
      sizeSqm: 21,
      status: r.status,
      lastWaterMeter: r.water,
      lastElectricMeter: r.electric
    });

    if (r.status === 'OCCUPIED' && r.tenantName && r.tier && r.rentSatang) {
      const leaseId = `LEASE-${r.roomNumber}-${(r.startDate || '2026-01-01').replace(/-/g, '')}`;
      store.leases.set(leaseId, {
        id: leaseId,
        roomNumber: r.roomNumber,
        tenantName: r.tenantName,
        phone: r.phone || '080-000-0000',
        packageTier: r.tier,
        monthlyRentSatang: r.rentSatang,
        depositMonths: r.depositMonths || 1,
        securityDepositSatang: r.rentSatang * (r.depositMonths || 1),
        bookingCreditSatang: 0,
        startDate: r.startDate || '2026-01-01',
        endDate: null,
        initialWaterMeter: r.water,
        initialElectricMeter: r.electric,
        status: 'ACTIVE'
      });
    }
  }

  recordPropertyExpense(expenses, {
    expenseDate: '2026-10-12',
    category: 'COMMON_UTILITY',
    title: 'ค่าไฟโถงทางเดินและปั๊มน้ำส่วนกลาง ต.ค.',
    amountSatang: 145000
  });
  recordPropertyExpense(expenses, {
    expenseDate: '2026-10-18',
    category: 'MAINTENANCE',
    roomNumber: '205',
    title: 'ล้างแอร์และเช็กน้ำยาแอร์ห้อง 205',
    amountSatang: 60000
  });
  recordPropertyExpense(expenses, {
    expenseDate: '2026-10-24',
    category: 'CLEANING',
    title: 'ค่าแม่บ้านทำความสะอาดส่วนกลาง 3 ชั้น',
    amountSatang: 150000
  });

  return { store, expenses };
}

const globalForErp = globalThis as unknown as {
  takyErpContext?: ErpRuntimeContext;
};

export function getErpContext(): ErpRuntimeContext {
  if (!globalForErp.takyErpContext) {
    const fromDisk = loadContextFromDisk();
    globalForErp.takyErpContext = fromDisk || createInitialTakyErpContext();
  }
  return globalForErp.takyErpContext;
}

export function resetErpContext(): ErpRuntimeContext {
  globalForErp.takyErpContext = createInitialTakyErpContext();
  saveContextToDisk(globalForErp.takyErpContext);
  return globalForErp.takyErpContext;
}

export function clearDemoForRealGoLive(promptPayId?: string): ErpRuntimeContext {
  const currentPromptPay =
    promptPayId ||
    globalForErp.takyErpContext?.store.settings.promptPayId ||
    process.env.PROMPTPAY_ID ||
    '0928255788';
  globalForErp.takyErpContext = createCleanGoLiveErpContext(currentPromptPay);
  saveContextToDisk(globalForErp.takyErpContext);
  return globalForErp.takyErpContext;
}

import { describe, it, expect } from 'vitest';
import { createCleanGoLiveErpContext } from '../../src/server/store-singleton';
import { calculateMonthlyPnL } from '../../src/server/services/expense-report.service';

describe('day-one go-live baseline', () => {
  it('has exactly 15 vacant rooms with zero baseline water/electricity meters', () => {
    const { store } = createCleanGoLiveErpContext();
    expect(store.rooms.size).toBe(15);
    expect([...store.rooms.keys()].sort()).toEqual([
      '101', '102', '103', '104', '105',
      '201', '202', '203', '204', '205',
      '301', '302', '303', '304', '305'
    ]);
    for (const room of store.rooms.values()) {
      expect(room.status).toBe('AVAILABLE');
      expect(room.lastWaterMeter).toBe(0);
      expect(room.lastElectricMeter).toBe(0);
    }
  });

  it('has no demo records and zero financial activity but keeps business tariffs', () => {
    const { store, expenses } = createCleanGoLiveErpContext();
    expect(store.leases.size).toBe(0);
    expect(store.reservations.size).toBe(0);
    expect(store.invoices.size).toBe(0);
    expect(store.settlements.size).toBe(0);
    expect(expenses.size).toBe(0);
    const pnl = calculateMonthlyPnL(store, expenses, '2026-10');
    expect(pnl.totalBilledSatang).toBe(0);
    expect(pnl.totalCollectedSatang).toBe(0);
    expect(pnl.totalOutstandingSatang).toBe(0);
    expect(pnl.totalExpensesSatang).toBe(0);
    expect(store.settings.electricityRateSatang).toBeGreaterThan(0);
    expect(store.settings.waterRateSatang).toBeGreaterThan(0);
  });
});

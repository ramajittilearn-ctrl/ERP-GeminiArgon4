// =============================================================================
// Taky Apartment ERP — Phase 3/4 Expense, Monthly P&L & System Settings Service
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Implements Step 10: Property Expenses, Net Operating Income (P&L) & Settings
// =============================================================================

import { assertIntegerSatang } from '../../lib/finance';
import { InMemoryStore } from './room-lease.service';

export type ExpenseCategory =
  | 'MAINTENANCE'
  | 'CLEANING'
  | 'COMMON_UTILITY'
  | 'SUPPLIES'
  | 'OTHER';

export interface ExpenseRecord {
  id: string;
  expenseDate: string; // "YYYY-MM-DD"
  billingPeriod: string; // "YYYY-MM"
  category: ExpenseCategory;
  roomNumber: string | null;
  title: string;
  amountSatang: number;
  receiptImageUrl: string | null;
  note: string | null;
}

export interface MonthlyPnLSummary {
  billingPeriod: string;
  totalBilledSatang: number;
  totalCollectedSatang: number;
  totalOutstandingSatang: number;
  totalExpensesSatang: number;
  netOperatingIncomeSatang: number; // Collected Cash - Property Expenses
  accrualNetProfitSatang: number;   // Billed Revenue - Property Expenses
  expenseBreakdownByCategory: Record<ExpenseCategory, number>;
}

/**
 * Record a new property expense (e.g., aircon maintenance, common hall electricity, cleaning)
 */
export function recordPropertyExpense(
  expenses: Map<string, ExpenseRecord>,
  input: {
    expenseDate: string;
    category: ExpenseCategory;
    roomNumber?: string | null;
    title: string;
    amountSatang: number;
    receiptImageUrl?: string | null;
    note?: string | null;
  }
): ExpenseRecord {
  assertIntegerSatang(input.amountSatang, 'expense.amountSatang');
  if (input.amountSatang <= 0) {
    throw new RangeError('Expense amountSatang must be greater than 0');
  }
  if (!input.title || input.title.trim().length < 2) {
    throw new Error('Expense title is required');
  }

  const id = `EXP-${input.expenseDate.replace(/-/g, '')}-${expenses.size + 1}`;
  const record: ExpenseRecord = {
    id,
    expenseDate: input.expenseDate,
    billingPeriod: input.expenseDate.slice(0, 7),
    category: input.category,
    roomNumber: input.roomNumber || null,
    title: input.title.trim(),
    amountSatang: input.amountSatang,
    receiptImageUrl: input.receiptImageUrl || null,
    note: input.note || null
  };

  expenses.set(id, record);
  return record;
}

/**
 * Calculate Monthly P&L (Net Operating Income) in integer Satang
 */
export function calculateMonthlyPnL(
  store: InMemoryStore,
  expenses: Map<string, ExpenseRecord>,
  billingPeriod: string
): MonthlyPnLSummary {
  let totalBilledSatang = 0;
  let totalCollectedSatang = 0;
  let totalOutstandingSatang = 0;

  for (const inv of store.invoices.values()) {
    if (inv.billingPeriod !== billingPeriod) continue;
    if (inv.status === 'ROLLED_OVER') continue;

    totalBilledSatang += inv.totalAmountSatang;
    totalCollectedSatang += inv.paidAmountSatang;
    totalOutstandingSatang += inv.balanceDueSatang;
  }

  const expenseBreakdownByCategory: Record<ExpenseCategory, number> = {
    MAINTENANCE: 0,
    CLEANING: 0,
    COMMON_UTILITY: 0,
    SUPPLIES: 0,
    OTHER: 0
  };

  let totalExpensesSatang = 0;
  for (const exp of expenses.values()) {
    if (exp.billingPeriod !== billingPeriod) continue;
    totalExpensesSatang += exp.amountSatang;
    expenseBreakdownByCategory[exp.category] =
      (expenseBreakdownByCategory[exp.category] || 0) + exp.amountSatang;
  }

  return {
    billingPeriod,
    totalBilledSatang,
    totalCollectedSatang,
    totalOutstandingSatang,
    totalExpensesSatang,
    netOperatingIncomeSatang: totalCollectedSatang - totalExpensesSatang,
    accrualNetProfitSatang: totalBilledSatang - totalExpensesSatang,
    expenseBreakdownByCategory
  };
}

/**
 * Update Global Property Settings (Rates, Tiers, Late Fee, PromptPay ID)
 */
export function updatePropertySettings(
  store: InMemoryStore,
  patch: Partial<InMemoryStore['settings']>
): InMemoryStore['settings'] {
  if (patch.electricityRateSatang !== undefined) {
    assertIntegerSatang(patch.electricityRateSatang, 'electricityRateSatang');
    if (patch.electricityRateSatang < 0) throw new RangeError('Electricity rate cannot be negative');
    store.settings.electricityRateSatang = patch.electricityRateSatang;
  }
  if (patch.waterRateSatang !== undefined) {
    assertIntegerSatang(patch.waterRateSatang, 'waterRateSatang');
    if (patch.waterRateSatang < 0) throw new RangeError('Water rate cannot be negative');
    store.settings.waterRateSatang = patch.waterRateSatang;
  }
  if (patch.dailyLateFeeSatang !== undefined) {
    assertIntegerSatang(patch.dailyLateFeeSatang, 'dailyLateFeeSatang');
    if (patch.dailyLateFeeSatang < 0) throw new RangeError('Daily late fee cannot be negative');
    store.settings.dailyLateFeeSatang = patch.dailyLateFeeSatang;
  }
  if (patch.tierStandardSatang !== undefined) {
    assertIntegerSatang(patch.tierStandardSatang, 'tierStandardSatang');
    store.settings.tierStandardSatang = patch.tierStandardSatang;
  }
  if (patch.tierSilverSatang !== undefined) {
    assertIntegerSatang(patch.tierSilverSatang, 'tierSilverSatang');
    store.settings.tierSilverSatang = patch.tierSilverSatang;
  }
  if (patch.tierGoldSatang !== undefined) {
    assertIntegerSatang(patch.tierGoldSatang, 'tierGoldSatang');
    store.settings.tierGoldSatang = patch.tierGoldSatang;
  }
  if (patch.billingDay !== undefined) {
    store.settings.billingDay = patch.billingDay;
  }
  if (patch.dueDayNextMonth !== undefined) {
    store.settings.dueDayNextMonth = patch.dueDayNextMonth;
  }
  if (patch.defaultDepositMonths !== undefined) {
    store.settings.defaultDepositMonths = patch.defaultDepositMonths;
  }
  if (patch.promptPayId !== undefined && patch.promptPayId.trim().length > 0) {
    store.settings.promptPayId = patch.promptPayId.trim();
  }

  return store.settings;
}

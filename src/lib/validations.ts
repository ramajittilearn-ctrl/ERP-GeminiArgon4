// =============================================================================
// Taky Apartment ERP — Input Validation Schemas (Zod-compatible + Pure Validator)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Validates all user inputs before entering database transactions
// =============================================================================

export interface UpdateSettingsInput {
  electricityRateSatang: number;
  waterRateSatang: number;
  billingDay: number;
  dueDayNextMonth: number;
  dailyLateFeeSatang: number;
  defaultDepositMonths: number;
  promptPayId: string;
  tierStandardSatang: number;
  tierSilverSatang: number;
  tierGoldSatang: number;
}

export interface CreateReservationInput {
  roomNumber: string;
  tenantName: string;
  phone: string;
  lineId?: string;
  selectedTier: 'STANDARD' | 'SILVER' | 'GOLD' | 'CUSTOM';
  agreedRentSatang: number;
  bookingDepositSatang: number;
  expectedMoveInDate: string; // "YYYY-MM-DD"
}

export interface CreateMoveInLeaseInput {
  roomNumber: string;
  tenantName: string;
  phone: string;
  lineId?: string;
  nationalId?: string;
  packageTier: 'STANDARD' | 'SILVER' | 'GOLD' | 'CUSTOM';
  customRentSatang?: number;
  depositMonths: number;
  startDate: string; // "YYYY-MM-DD"
  isProratedFirstMonth: boolean;
  initialWaterMeter: number;
  initialElectricMeter: number;
}

export interface BulkRoomMeterEntry {
  roomNumber: string;
  currWater: number;
  waterRollover?: boolean;
  currElectric: number;
  electricRollover?: boolean;
  discountSatang?: number;
}

export interface RecordPaymentInput {
  invoiceId: string;
  amountSatang: number;
  paidAt: string; // "YYYY-MM-DD"
  method: 'PROMPTPAY' | 'BANK_TRANSFER' | 'CASH';
  slipImageUrl?: string;
  referenceNote?: string;
}

export function validateRoomNumber(roomNumber: string): void {
  const validRooms = new Set([
    '101', '102', '103', '104', '105',
    '201', '202', '203', '204', '205',
    '301', '302', '303', '304', '305'
  ]);
  if (!validRooms.has(roomNumber)) {
    throw new RangeError(`Invalid roomNumber "${roomNumber}": must be one of 101–105, 201–205, 301–305`);
  }
}

export function validateCreateReservationInput(input: CreateReservationInput): void {
  validateRoomNumber(input.roomNumber);
  if (!input.tenantName || !input.tenantName.trim()) {
    throw new TypeError('tenantName is required for reservation');
  }
  if (!input.phone || !input.phone.trim()) {
    throw new TypeError('phone is required for reservation');
  }
  if (!Number.isInteger(input.bookingDepositSatang) || input.bookingDepositSatang <= 0) {
    throw new RangeError('bookingDepositSatang must be a positive integer in Satang');
  }
}

export function validateCreateMoveInLeaseInput(input: CreateMoveInLeaseInput): void {
  validateRoomNumber(input.roomNumber);
  if (!input.tenantName || !input.tenantName.trim()) {
    throw new TypeError('tenantName is required for move-in lease');
  }
  if (!Number.isInteger(input.depositMonths) || input.depositMonths < 1) {
    throw new RangeError('depositMonths must be at least 1');
  }
  if (!Number.isInteger(input.initialWaterMeter) || input.initialWaterMeter < 0) {
    throw new RangeError('initialWaterMeter must be a non-negative integer');
  }
  if (!Number.isInteger(input.initialElectricMeter) || input.initialElectricMeter < 0) {
    throw new RangeError('initialElectricMeter must be a non-negative integer');
  }
}

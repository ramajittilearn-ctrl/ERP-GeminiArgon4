// =============================================================================
// Taky Apartment ERP — EMVCo PromptPay QR Payload Generator (with CRC-16/CCITT-FALSE)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Generates bank-compliant Thai QR PromptPay strings from a phone/tax ID + Satang amount
// =============================================================================

import { assertIntegerSatang, formatBaht } from './finance';

function formatTlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Computes CRC-16/CCITT-FALSE (poly = 0x1021, init = 0xFFFF) per EMVCo specification
 */
export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formats Thai mobile number (10 digits -> 0066xxxxxxxxx) or National/Tax ID (13 digits)
 */
export function normalizePromptPayTarget(rawTarget: string): {
  subTag: '01' | '02';
  formattedTarget: string;
} {
  const digits = rawTarget.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return {
      subTag: '01', // Mobile number
      formattedTarget: `0066${digits.slice(1)}`
    };
  }
  if (digits.length === 13) {
    return {
      subTag: '02', // National ID / Tax ID
      formattedTarget: digits
    };
  }
  throw new RangeError(
    `Invalid PromptPay target "${rawTarget}": must be a 10-digit Thai mobile number or 13-digit National/Tax ID`
  );
}

/**
 * Generates an EMVCo-compliant PromptPay QR payload with exact Satang amount
 */
export function generatePromptPayPayload(promptPayId: string, amountSatang?: number): string {
  const { subTag, formattedTarget } = normalizePromptPayTarget(promptPayId);

  const merchantInfoValue = [
    formatTlv('00', 'A000000677010111'),
    formatTlv(subTag, formattedTarget)
  ].join('');

  const fields: string[] = [
    formatTlv('00', '01'), // Payload Format Indicator
    formatTlv('01', amountSatang && amountSatang > 0 ? '12' : '11'), // 12 = Dynamic QR with amount, 11 = Static
    formatTlv('29', merchantInfoValue), // Merchant Account Info (PromptPay AID)
    formatTlv('58', 'TH'), // Country Code
    formatTlv('53', '764') // Currency Code (764 = THB)
  ];

  if (amountSatang !== undefined && amountSatang > 0) {
    assertIntegerSatang(amountSatang, 'amountSatang');
    fields.push(formatTlv('54', formatBaht(amountSatang)));
  }

  const rawWithoutCrc = `${fields.join('')}6304`;
  const crcHex = computeCrc16Ccitt(rawWithoutCrc);
  return `${rawWithoutCrc}${crcHex}`;
}

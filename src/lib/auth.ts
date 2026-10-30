// =============================================================================
// Taky Apartment ERP — Milestone 2: Single-Admin Session & Auth Engine (Gate 4)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Uses HMAC-SHA256 signed session tokens with HttpOnly & SameSite=Lax cookies
// =============================================================================

import crypto from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'taky_erp_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days for Local LAN owner session

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'taky-apartment-local-lan-default-secret-key-2026';
}

function getExpectedAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'takyadmin2026';
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const expected = getExpectedAdminPassword();
  const a = Buffer.from(String(inputPassword || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAdminSessionToken(issuedAtMs = Date.now()): string {
  const expiresAtMs = issuedAtMs + SESSION_TTL_MS;
  const payload = `admin:${issuedAtMs}:${expiresAtMs}`;
  const hmac = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
  nowMs = Date.now()
): { valid: boolean; expiresAtMs?: number } {
  if (!token) return { valid: false };
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return { valid: false };
    const [role, issuedStr, expiresStr, providedHmac] = parts;
    if (role !== 'admin') return { valid: false };

    const expiresAtMs = Number(expiresStr);
    if (!Number.isFinite(expiresAtMs) || nowMs > expiresAtMs) {
      return { valid: false };
    }

    const payload = `${role}:${issuedStr}:${expiresStr}`;
    const expectedHmac = crypto
      .createHmac('sha256', getSessionSecret())
      .update(payload)
      .digest('hex');

    const a = Buffer.from(providedHmac);
    const b = Buffer.from(expectedHmac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }

    return { valid: true, expiresAtMs };
  } catch {
    return { valid: false };
  }
}

export function buildSessionCookieHeader(token: string): string {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function buildLogoutCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

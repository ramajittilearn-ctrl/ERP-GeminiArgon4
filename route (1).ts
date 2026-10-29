// =============================================================================
// Taky Apartment ERP — Milestone 2: Single-Admin Auth API Route (/api/auth)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// =============================================================================

import { NextResponse } from 'next/server';
import {
  verifyAdminPassword,
  createAdminSessionToken,
  buildSessionCookieHeader,
  buildLogoutCookieHeader
} from '../../../lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { ok: false, error: 'รหัสผ่านผู้ดูแลหอพักไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    const token = createAdminSessionToken();
    const response = NextResponse.json({
      ok: true,
      role: 'OWNER_ADMIN'
    });
    response.headers.set('Set-Cookie', buildSessionCookieHeader(token));
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'ไม่สามารถเข้าสู่ระบบได้' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', buildLogoutCookieHeader());
  return response;
}

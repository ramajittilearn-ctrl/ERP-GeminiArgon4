// =============================================================================
// Taky Apartment ERP — Milestone 2: Next.js Route Protection Middleware
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Protects Local LAN Admin Routes when REQUIRE_ADMIN_AUTH=true
// =============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE } from './lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow login page, auth API, and static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  // Enforce Single-Admin Session Cookie in Production Local LAN mode
  const requireAuth = process.env.REQUIRE_ADMIN_AUTH === 'true';
  if (requireAuth) {
    const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};

import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PREFIXES = ['/admin'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Portal routes have their own layout and their own session cookie; they
  // do NOT use next-intl. Skip the i18n middleware entirely so they don't
  // get prefixed with /de or /en.
  if (pathname === '/portal' || pathname.startsWith('/portal/')) {
    return NextResponse.next();
  }

  // Strip the locale prefix so route-matching is locale-agnostic.
  const pathWithoutLocale = pathname.replace(/^\/(de|en)(?=\/|$)/, '') || '/';

  if (PROTECTED_PREFIXES.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`))) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

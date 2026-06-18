import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Routes that are always publicly accessible.
 * Patterns are matched against the request pathname.
 */
const PUBLIC_PREFIXES = [
    '/',           // landing page (exact match handled below)
    '/login',
    '/welcome',    // post-checkout confirmation (pre sign-in)
    '/api/auth',   // NextAuth endpoints
    '/api/stripe', // Stripe checkout (pre-auth) + webhook (Stripe-signed)
];

function isPublicRoute(pathname: string): boolean {
    // Exact match for the root path
    if (pathname === '/') return true;

    return PUBLIC_PREFIXES.some(
        (prefix) => prefix !== '/' && pathname.startsWith(prefix),
    );
}

/**
 * NextAuth uses the DATABASE session strategy, so there is no JWT for middleware
 * to read — it sets a session-token cookie (the `__Secure-` variant over HTTPS).
 * Middleware does a cheap presence check; the real validation happens server-side
 * in `getCurrentUser()` (every protected page/route resolves + verifies the
 * session against the DB), so a stale/forged cookie still can't read data.
 */
const SESSION_COOKIES = [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Let public routes through immediately
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

    // Dev bypass: treat as authenticated when the env flag is set (dev only).
    const isDevBypass =
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_AUTH_BYPASS === 'true';

    if (!hasSession && !isDevBypass) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    /*
     * Match all routes except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico
     * - public assets (png, jpg, svg, etc.)
     */
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)).*)',
    ],
};

import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Routes that are always publicly accessible.
 * Patterns are matched against the request pathname.
 */
const PUBLIC_PREFIXES = [
    '/',          // landing page (exact match handled below)
    '/login',
    '/api/auth',  // NextAuth endpoints
    '/api/jobs',  // Internal job execution webhook
];

function isPublicRoute(pathname: string): boolean {
    // Exact match for the root path
    if (pathname === '/') return true;

    return PUBLIC_PREFIXES.some(
        (prefix) => prefix !== '/' && pathname.startsWith(prefix),
    );
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Let public routes through immediately
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // Protect /dashboard/* and any other non-public routes
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    });

    // Dev bypass: treat as authenticated when the env flag is set
    const isDevBypass =
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_AUTH_BYPASS === 'true';

    if (!token && !isDevBypass) {
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

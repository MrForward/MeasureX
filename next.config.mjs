/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
    // NOTE: no `images.remotePatterns` — next/image is not used, so the Image
    // Optimizer (and its remotePatterns DoS surface, GHSA Image Optimizer) is
    // not exposed. Add a narrowly-scoped pattern only if/when remote images ship.
    // Security headers applied to every response (clickjacking, MIME sniffing,
    // HTTPS enforcement, referrer leakage).
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;

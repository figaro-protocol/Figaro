/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// Dev: 'unsafe-eval' for React Refresh/HMR, 'unsafe-inline' for Next.js bootstrap.
// Prod: 'unsafe-inline' required for Next.js RSC/SSR inline JSON payloads.
// TODO(HP-2 followup): replace 'unsafe-inline' in prod with nonce + 'strict-dynamic'.
const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline'";

const BASE_CSP = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: http://127.0.0.1:* https://*.walletconnect.com https://*.walletconnect.org https://*.infura.io",
    "frame-src 'self' https://*.walletconnect.com",
    "frame-ancestors 'none'",
].join('; ');

const nextConfig = {
    reactStrictMode: true,

    // Proxy /rpc → local Anvil node so browser requests avoid CORS and
    // all wagmi/viem transport calls work via a same-origin path.
    // Disabled in production builds to prevent open RPC proxy exposure.
    // NOTE: next.config.mjs takes precedence over next.config.js in
    // Next.js 14, so rewrites MUST live here.
    async rewrites() {
        if (process.env.NODE_ENV === "production") return [];
        return [
            {
                source: '/rpc/:path*',
                destination: 'http://127.0.0.1:8545/:path*',
            },
            {
                source: '/rpc',
                destination: 'http://127.0.0.1:8545',
            },
        ];
    },

    async redirects() {
        return [
            { source: '/workbench', destination: '/terminal', permanent: true },
            { source: '/workbench/:path*', destination: '/terminal/:path*', permanent: true },
        ];
    },

    // AUDIT FIX HP-2: Security Headers
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: BASE_CSP,
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(self)',
                    },
                ],
            },
        ]
    },

    webpack: (config) => {
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            '@react-native-async-storage/async-storage': false,
            'pino-pretty': false,
        };
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
            crypto: false,
            stream: false,
            http: false,
            https: false,
            zlib: false,
            path: false,
            os: false,
            '@react-native-async-storage/async-storage': false,
            'pino-pretty': false,
        };
        config.externals.push("pino-pretty", "lokijs", "encoding");
        return config;
    },
};

export default nextConfig;

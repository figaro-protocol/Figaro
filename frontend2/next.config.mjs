/** @type {import('next').NextConfig} */

// Content-Security-Policy is set per-request by `middleware.ts` so a fresh
// nonce can be inserted into `script-src 'nonce-{value}' 'strict-dynamic'`
// each response (HP-2 hardening; threat-model 🔴 Priority 1). next.config.mjs
// only owns the static security headers below (HSTS, X-Frame-Options, etc).

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

    // Security headers (CSP lives in middleware.ts — see header comment above).
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
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
                    // Web2 audit 🟡 Priority 2: defense-in-depth Cross-Origin
                    // headers. COOP isolates the window object from any
                    // popup-opened cross-origin context (`same-origin-allow-popups`
                    // keeps WalletConnect popups working). CORP prevents other
                    // sites from hotlinking app resources. COEP intentionally
                    // skipped — `require-corp` would force CORS on every embedded
                    // resource without a SharedArrayBuffer / Wasm-threading need.
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin-allow-popups',
                    },
                    {
                        key: 'Cross-Origin-Resource-Policy',
                        value: 'same-origin',
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

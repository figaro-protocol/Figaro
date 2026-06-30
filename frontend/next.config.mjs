/** @type {import('next').NextConfig} */

// Content-Security-Policy is set per-request by `middleware.ts` so a fresh
// nonce can be inserted into `script-src 'nonce-{value}' 'strict-dynamic'`
// each response (HP-2 hardening; threat-model 🔴 Priority 1). next.config.mjs
// only owns the static security headers below (HSTS, X-Frame-Options, etc).

const nextConfig = {
    reactStrictMode: true,

    // Build directory. Defaults to `.next`. The Playwright e2e webServer sets
    // NEXT_DISTDIR=.next-e2e so its :3100 build is isolated from the developer's
    // interactive :3000 server — the two share no build dir, so an e2e run can
    // never clobber the interactive build (and vice versa).
    distDir: process.env.NEXT_DISTDIR || '.next',

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
            { source: '/figaro-eats', destination: '/local-commerce', permanent: true },
            { source: '/figaro-eats/:path*', destination: '/local-commerce/:path*', permanent: true },
            // /i/[slug] removed 2026-05: the assembly runtime was a
            // builder/debug surface that doubled as a parameterised
            // operator shell. Consumers now go through /s/<seller> →
            // checkout → /orders (both parties act there — there is no
            // separate inbox); builders inspect via
            // /builders/designer/view/<slug>. Inbound legacy bookmarks
            // redirect to /discover.
            { source: '/i/:slug', destination: '/discover', permanent: true },
            { source: '/i/:slug/:path*', destination: '/discover', permanent: true },
            // The pre-rename /i/figaro-eats path passes through /i/:slug above.
            // Marketing-tier restructure (2026-04):
            // - /research and /publications were replaced by /cryptoeconomics
            //   (the Voshmgir & Zargham 8-discipline taxonomy + paper portfolio).
            // - /mechanism is the protocol-properties page, now at /protocol.
            // - Per-paper companion pages were retired in favor of /cryptoeconomics
            //   indexing the PDFs directly.
            { source: '/research', destination: '/cryptoeconomics', permanent: true },
            { source: '/publications', destination: '/cryptoeconomics', permanent: true },
            { source: '/economics', destination: '/cryptoeconomics', permanent: true },
            { source: '/sovereign-commerce', destination: '/cryptoeconomics', permanent: true },
            { source: '/legal', destination: '/cryptoeconomics', permanent: true },
            { source: '/labor-law', destination: '/cryptoeconomics', permanent: true },
            { source: '/displaced', destination: '/cryptoeconomics', permanent: true },
            { source: '/mechanism', destination: '/protocol', permanent: true },
            { source: '/verification', destination: '/cryptoeconomics', permanent: true },
            { source: '/network-state', destination: '/cryptoeconomics', permanent: true },
            { source: '/political-economy', destination: '/cryptoeconomics', permanent: true },
            { source: '/political-philosophy', destination: '/cryptoeconomics', permanent: true },
            { source: '/accounting', destination: '/cryptoeconomics', permanent: true },
            // /foundations was the prior URL of the Zargham-disciplines page;
            // it has been renamed to /cryptoeconomics (matches the article title).
            { source: '/foundations', destination: '/cryptoeconomics', permanent: true },
            // /groups restored 2026-04-30 as the canonical working-groups page
            // (cryptoeconomic + composability axes + grants + community).
            // /groups/:slug+ keeps redirecting since per-discipline subpages
            // are not currently shipped.
            { source: '/groups/:slug+', destination: '/groups', permanent: true },
            { source: '/grants', destination: '/groups', permanent: true },
            { source: '/admin', destination: '/', permanent: true },
            // /help and /resources removed 2026-04-30: product-shaped surfaces
            // whose content was either canonically duplicated elsewhere
            // (Q&A → property pages) or pure index (link directory).
            { source: '/help', destination: '/about', permanent: true },
            { source: '/resources', destination: '/spec', permanent: true },
            // Audit unification (2026-05): /financials and /verify were merged
            // into /audit. /audit/[processId] is the process-bound view (was
            // /financials/[processId] + /verify search scoped to that process);
            // /audit (no param) is the generic hash-verification surface (was
            // /verify with no process context).
            { source: '/financials/:processId', destination: '/audit/:processId', permanent: true },
            { source: '/verify', destination: '/audit', permanent: true },
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

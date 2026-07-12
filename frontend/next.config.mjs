/** @type {import('next').NextConfig} */

// STATIC EXPORT. The frontend is a protocol surface with ZERO server routes —
// every page reads chain + IPFS client-side (reads-at-edge). `output: 'export'`
// prerenders each route to static HTML at build time (real content for
// curl/crawlers) and ships it as a plain file tree in `out/`, servable from any
// CDN or static host with no Node.js runtime.
//
// What a static export CANNOT do, and where each moved:
//   - Server `headers()` / CSP  → the hosting/CDN layer. The prior per-request
//     CSP nonce (middleware.ts, now removed — middleware is incompatible with
//     output: export) cannot exist without a server; a static deploy applies a
//     hash- or 'unsafe-inline'-based CSP + the HSTS/X-Frame/etc. headers at the
//     edge. The full policy that must be reproduced there is documented in
//     `docs/FRONTEND.md` § "Static export".
//   - `redirects()` / `rewrites()` → the hosting layer. The legacy-URL
//     redirects and the dev `/rpc` proxy are gone from here; the RPC transport
//     now points straight at the chain endpoint in every environment (see
//     `lib/shared/wagmi.ts`), which is how the production build has always run.
//   - Dynamic route segments over open-world ids → query params. An id (any
//     processId / seller address / assembly slug) is unknowable at build time,
//     so `generateStaticParams` cannot enumerate it. The id-bearing routes read
//     it client-side from a query param behind a Suspense boundary:
//       /orders/view?process=<id>   /audit/view?process=<id>
//       /s/view?seller=<addr>       /s/checkout?seller=<addr>
//       /builders/designer/{view,edit}?slug=<slug>

const nextConfig = {
    reactStrictMode: true,

    // Emit a static export to `out/` on `next build`.
    output: 'export',

    // next/image's default loader needs a server to optimize on demand; a
    // static export has none, so images are served as-authored.
    images: {
        unoptimized: true,
    },

    // Build directory. Defaults to `.next`. The Playwright e2e webServer sets
    // NEXT_DISTDIR=.next-e2e so its build cache is isolated from the developer's
    // interactive :3000 build (`.next`); the static `out/` tree is separate
    // from either build cache.
    distDir: process.env.NEXT_DISTDIR || '.next',

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

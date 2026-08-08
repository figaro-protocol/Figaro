// `next/constants` has no ESM export map entry in this Next version, so the
// phase is matched by its documented literal value.
const PHASE_PRODUCTION_BUILD = 'phase-production-build';

/** @type {import('next').NextConfig} */

// BUILD-TIME SAFETY GATE (security audit 2026-07-22, finding 4).
//
// The test-helper / test-signer paths (?e2e=mock, the injected test private key,
// the fake dev provider) are all gated OFF in code by a `NODE_ENV==='production'`
// check — BUT those gates pivot on `NEXT_PUBLIC_*` flags that are compiled INTO
// the bundle at build time. A `.env.local` carrying `NEXT_PUBLIC_ENABLE_TEST_HELPERS=true`
// is gitignored, so a clean CI build is safe; but a production build accidentally
// run from a developer's working tree would inline `true` and ship a reachable
// mock/test path. No runtime check can catch a compile-time inline, so it must be
// caught here, at build time, and FAIL LOUD.
//
// The Playwright e2e harness legitimately runs a production build WITH these flags;
// it opts in explicitly via `FIGARO_ALLOW_TEST_HELPERS=1`. A real deploy build
// never sets that escape, so a stray test flag aborts the build.
// The gate binds to the PRODUCTION-BUILD PHASE only: `next build` is the sole
// invocation that compiles env flags into a bundle. Other config loads in a
// production NODE_ENV (`next lint`, `next start`) inline nothing and pass.
function assertNoTestFlagsInProductionBuild() {
    const TEST_FLAGS = [
        'NEXT_PUBLIC_ENABLE_TEST_HELPERS',
        'NEXT_PUBLIC_USE_TEST_SIGNER',
        'NEXT_PUBLIC_TEST_PRIVATE_KEY',
        'NEXT_PUBLIC_DEV_ADDRESS',
    ];
    const allowed = process.env.FIGARO_ALLOW_TEST_HELPERS === '1';
    if (!allowed) {
        const leaked = TEST_FLAGS.filter((f) => {
            const v = process.env[f];
            return v !== undefined && v !== '' && v !== '0' && v !== 'false';
        });
        if (leaked.length > 0) {
            throw new Error(
                `Refusing to build: test-helper flag(s) set in a production build: ${leaked.join(', ')}. ` +
                `These inline into the bundle and expose ?e2e=mock / the test signer. Unset them for a deploy ` +
                `build (or set FIGARO_ALLOW_TEST_HELPERS=1 for the e2e harness).`,
            );
        }
    }
}

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
//       /assemblies/designer/{view,edit}?slug=<slug>

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

export default function config(phase) {
    // `next lint` loads the config under the production-build phase too, but
    // compiles nothing into a bundle — the gate must not block it.
    const invokedAsLint = process.argv.includes('lint');
    if (phase === PHASE_PRODUCTION_BUILD && !invokedAsLint) {
        assertNoTestFlagsInProductionBuild();
    }
    return nextConfig;
}

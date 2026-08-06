import { Providers } from "../providers";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

// The whole site is statically exported (`output: 'export'` in
// next.config.mjs) — no server runtime. Wallet-dependent pages in this group
// read window.ethereum + wagmi client state, but only AFTER mount
// (the `useMounted` hydration gate — first render matches the prerendered
// shell, never `ssr:true`), so the static shell hydrates cleanly. The
// id-bearing detail routes (`/orders/view`, `/audit/view`, `/s/view`,
// `/s/checkout`) read their open-world id from a query param via
// `useSearchParams` behind a Suspense boundary — the id is unknowable at
// build time, so it can never be a route segment. Security headers + CSP are
// applied at the hosting/CDN layer, not per-request (a static export runs no
// middleware).

/**
 * Layout for the (app) tier — wallet-aware routes that mount the full
 * `<Providers>` stack (WagmiProvider, QueryClient, ChainGuard,
 * CommerceProvider, HandoffCleanupProvider, CommitmentSignPreviewProvider,
 * ConfigurationBanner, ClientInit, Toaster, RpcBanner) and the
 * wallet-aware `<Header>` (with ConnectWallet + YourTurnBadge).
 *
 * The canonical inventory of (app) routes is the directory listing of
 * `app/(app)/`. (`/builders` itself moved to `(marketing)/`;
 * `/financials/[processId]` and `/verify` were merged into `/audit/*`.)
 *
 * Routes that read like reference but live in `app/(marketing)/` —
 * `/clauses`, `/assemblies`, `/agents`, `/local-commerce`,
 * `/spec`, `/security`, `/builders` (publication) — are intentionally NOT here:
 * they're publication-shaped and don't pull the wallet provider. Don't
 * cross-list them in (app) navs (see `feedback_two_navs_allowed.md`).
 *
 * See CLAUDE.md "Wallet-provider scope per route" for the route-tier
 * classification rule.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <div className="min-h-screen flex flex-col">
                <Header />
                <main id="main-content" className="flex-1">{children}</main>
                <Footer />
            </div>
        </Providers>
    );
}

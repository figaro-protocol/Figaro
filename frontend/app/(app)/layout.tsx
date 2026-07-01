import { Providers } from "../providers";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

// Wallet-dependent pages (everything in this group) read window.ethereum
// + wagmi/RainbowKit client state at render time. Static pre-render would
// require Suspense boundaries around every transitive useSearchParams /
// useAccount call site in the dependency tree (RainbowKit + wagmi).
// Marking the layout `force-dynamic` opts the entire (app) tier out of
// static export — pages render at request time on the server. The
// (marketing) tier is force-dynamic too: the per-request CSP nonce is
// incompatible with static prerender (see (marketing)/layout.tsx).
export const dynamic = "force-dynamic";

/**
 * Layout for the (app) tier — wallet-aware routes that mount the full
 * `<Providers>` stack (WagmiProvider, RainbowKit, QueryClient, ChainGuard,
 * CommerceProvider, HandoffCleanupProvider, CommitmentSignPreviewProvider,
 * ConfigurationBanner, ClientInit, Toaster, RpcBanner) and the
 * wallet-aware `<Header>` (with ConnectButton + YourTurnBadge).
 *
 * The canonical inventory of (app) routes is the directory listing of
 * `app/(app)/`. (`/builders` itself moved to `(marketing)/`;
 * `/financials/[processId]` and `/verify` were merged into `/audit/*`.)
 *
 * Routes that read like reference but live in `app/(marketing)/` —
 * `/integrate`, `/clauses`, `/groups`, `/local-commerce`, `/spec`,
 * `/compliance`, `/builders` (publication) — are intentionally NOT here:
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

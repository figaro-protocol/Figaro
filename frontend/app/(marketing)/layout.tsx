import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { ReadingPathNext } from "@/components/marketing/ReadingPathNext";
import { Footer } from "@/components/shared/Footer";

// Statically exported (`output: 'export'`). These pages prerender to real
// HTML at build time — the content curl/crawlers see — then hydrate. The
// event-driven surfaces (the /registries explorer, and the live counts on
// /assemblies and /clauses) read
// network state client-side after mount (chain → IPFS), so the build-time
// snapshot is only the shell, never stale data. Security headers + CSP are
// applied at the hosting/CDN layer, not per-request (a static export runs no
// middleware).

/**
 * Layout for marketing-tier routes. Canonical inventory is the directory
 * listing of `app/(marketing)/`.
 *
 * Does NOT mount `<Providers>` (WagmiProvider + ChainGuard
 * + CommerceProvider + HandoffCleanupProvider + CommitmentSignPreviewProvider
 * + ConfigurationBanner + ClientInit + Toaster + RpcBanner) — pure
 * publication pages have no wallet semantics. See CLAUDE.md
 * "Wallet-provider scope per route" for the canonical classification.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col">
            <MarketingHeader />
            <main id="main-content" className="flex-1">
                {children}
                {/* The reading path's continuation, derived per route — renders
                    nothing off the path and nothing on the last step. Mounted
                    here so no page carries its own "read this next" line. */}
                <ReadingPathNext />
            </main>
            <Footer />
        </div>
    );
}

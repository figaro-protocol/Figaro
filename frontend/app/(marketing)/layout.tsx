import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { ReadingPathStrip } from "@/components/marketing/ReadingPathStrip";
import { Footer } from "@/components/shared/Footer";

// Statically exported (`output: 'export'`). These pages prerender to real
// HTML at build time — the content curl/crawlers see — then hydrate. The
// event-driven inventories (/assemblies, /clauses, /sellers) read live
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
            <main id="main-content" className="flex-1">{children}</main>
            <ReadingPathStrip />
            <Footer />
        </div>
    );
}

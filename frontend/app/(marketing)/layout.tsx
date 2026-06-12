import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Footer } from "@/components/shared/Footer";

// Render per request, never at build time. middleware.ts issues a
// per-request CSP nonce under `'strict-dynamic'`; statically prerendered
// HTML cannot carry it, so on a production server the browser blocks every
// script on a static page — zero client JS, dead inventories (surfaced by
// the prod-build e2e webServer, 2026-06-12). Per-request rendering also
// keeps the event-driven inventories (/assemblies, /clauses, /sellers)
// reading live network state instead of a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Layout for marketing-tier routes. Canonical inventory is the directory
 * listing of `app/(marketing)/`.
 *
 * Does NOT mount `<Providers>` (WagmiProvider + RainbowKit + ChainGuard
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
            <Footer />
        </div>
    );
}

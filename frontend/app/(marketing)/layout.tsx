import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Footer } from "@/components/shared/Footer";

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

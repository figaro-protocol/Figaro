import { MarketingHeader } from "@/components/shared/MarketingHeader";
import { Footer } from "@/components/shared/Footer";

/**
 * Layout for marketing-tier routes (`/`, `/about`, `/help`, `/research`,
 * `/publications`, `/spec`, `/verification`, `/sovereign-commerce`,
 * `/economics`, `/labor-law`, `/displaced`, `/legal`, `/compliance`,
 * `/mechanism`, `/resources`).
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

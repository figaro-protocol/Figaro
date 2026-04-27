import { Providers } from "../providers";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

/**
 * Layout for reference + transactional routes — everything that's not pure
 * marketing. Mounts the full `<Providers>` stack (WagmiProvider, RainbowKit,
 * QueryClient, ChainGuard, CommerceProvider, HandoffCleanupProvider,
 * CommitmentSignPreviewProvider, ConfigurationBanner, ClientInit, Toaster,
 * RpcBanner) and the wallet-aware `<Header>` (with ConnectButton +
 * NotificationBell).
 *
 * Reference routes (read-only, may surface inline write affordances via
 * `WalletGate`): `/builders*`, `/integrate`, `/schemas`, `/groups*`,
 * `/grants`, `/treasuries`, `/i/[slug]`.
 *
 * Transactional routes (require connected wallet): `/terminal`, `/sign`,
 * `/operators*`, `/console`, `/admin`, `/fig*`, `/evidence-display`,
 * `/accounting`, `/local-commerce`.
 *
 * See CLAUDE.md "Wallet-provider scope per route" for the canonical
 * classification rule.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <div className="min-h-screen flex flex-col bg-white text-black">
                <Header />
                <main id="main-content" className="flex-1">{children}</main>
                <Footer />
            </div>
        </Providers>
    );
}

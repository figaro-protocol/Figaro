import { Providers } from "../providers";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

// Wallet-dependent pages (everything in this group) read window.ethereum
// + wagmi/RainbowKit client state at render time. Static pre-render would
// require Suspense boundaries around every transitive useSearchParams /
// useAccount call site in the dependency tree (RainbowKit + wagmi).
// Marking the layout `force-dynamic` opts the entire (app) tier out of
// static export — pages render at request time on the server. Marketing
// routes in `(marketing)/` stay statically exportable.
export const dynamic = "force-dynamic";

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

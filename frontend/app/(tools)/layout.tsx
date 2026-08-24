import type { Metadata } from "next";
import { Providers } from "../providers";
import { ToolsHeader } from "@/components/shared/ToolsHeader";
import { Footer } from "@/components/shared/Footer";

// Statically exported (`output: 'export'`) — same as the (app) and
// (marketing) tiers. The designer reads live network state (ClauseRegistry →
// IPFS) client-side after mount; the prerendered HTML is only the shell.
// Security headers + CSP live at the hosting/CDN layer (a static export runs
// no middleware).

export const metadata: Metadata = {
    title: "Build on Figaro — Trade Infrastructure",
    description: "Design a trade workflow from protocol components. The protocol handles enforcement. Three levels of composition — no new contract risk required at Level 1.",
    openGraph: {
        title: "Build on Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Build on Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
    },
};

/**
 * Layout for the builder/authoring tier (the assembly designer).
 *
 * It mounts the full `<Providers>` stack like `(app)` — authoring publishes
 * on-chain, so it needs the wallet — but uses the one-row `<ToolsHeader>`
 * (publication nav + ConnectWallet, NO Orders/Members row) and the
 * shared `<Footer>`, so the designer reads as a Builders-section page under
 * the same publication row every site page carries (`NAV_LINKS`), not as
 * the runtime dashboard. The designer routes live here, not in `(app)/`.
 */
export default function BuildersLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <div className="min-h-screen flex flex-col">
                <ToolsHeader />
                <main id="main-content" className="flex-1 min-h-0 flex flex-col">{children}</main>
                <Footer />
            </div>
        </Providers>
    );
}

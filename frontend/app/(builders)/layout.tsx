import type { Metadata } from "next";
import { Providers } from "../providers";
import { BuilderHeader } from "@/components/shared/BuilderHeader";
import { Footer } from "@/components/shared/Footer";

// Render per request, never at build time — same reason as the (app) and
// (marketing) tiers: the per-request CSP nonce is incompatible with static
// prerender, and the designer reads live network state (ClauseRegistry → IPFS).
export const dynamic = "force-dynamic";

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
 * on-chain, so it needs the wallet — but uses the one-row `<BuilderHeader>`
 * (publication nav + ConnectButton, NO Orders/Sellers row) and the
 * shared `<Footer>`, so the designer reads as a Builders-section page with
 * the same chrome as the home nav (Protocol / Builders / Discover), not as
 * the runtime dashboard. The designer routes live here, not in `(app)/`.
 */
export default function BuildersLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <div className="min-h-screen flex flex-col">
                <BuilderHeader />
                <main id="main-content" className="flex-1 min-h-0 flex flex-col">{children}</main>
                <Footer />
            </div>
        </Providers>
    );
}

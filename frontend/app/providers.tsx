"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/lib/shared/wagmi";
import { Toaster } from "sonner";
import { ChainGuard } from "@/components/core/ChainGuard";
import { CommerceProvider } from "@/lib/commerce";
import "@rainbow-me/rainbowkit/styles.css";
import { RpcBanner } from "@/components/core/RpcBanner";
import ClientInit from "@/components/core/ClientInit";
import { HandoffCleanupProvider } from "@/components/core/HandoffCleanupProvider";
import { CommitmentSignPreviewProvider } from "@/components/core/CommitmentSignPreviewProvider";
import { registerAllModules } from "@/components/modules/registerAllModules";
import { ConfigurationBanner } from "@/components/core/ConfigurationBanner";

// Register all built-in mechanism modules once at app startup.
registerAllModules();

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={lightTheme()}>
                    <ChainGuard>
                        <CommerceProvider>
                            <ConfigurationBanner />
                            <ClientInit />
                            <HandoffCleanupProvider />
                            <CommitmentSignPreviewProvider />
                            {children}
                        </CommerceProvider>
                    </ChainGuard>
                    <Toaster
                        position="top-right"
                        richColors
                        theme="dark"
                        closeButton
                        duration={4000}
                        visibleToasts={3}
                    />
                    <RpcBanner />
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/lib/shared/wagmi";
import { Toaster } from "sonner";
import { ChainGuard } from "@/components/runtime/ChainGuard";
import { CommerceProvider } from "@/lib/checkout";
import "@rainbow-me/rainbowkit/styles.css";
import { RpcBanner } from "@/components/runtime/RpcBanner";
import ClientInit from "@/components/runtime/ClientInit";
import { ClauseSpecsLoader } from "@/components/runtime/ClauseSpecsLoader";
import { HandoffCleanupProvider } from "@/components/runtime/HandoffCleanupProvider";
import { CommitmentSignPreviewProvider } from "@/components/runtime/CommitmentSignPreviewProvider";
import { ConfigurationBanner } from "@/components/runtime/ConfigurationBanner";

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
                            <ClauseSpecsLoader />
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

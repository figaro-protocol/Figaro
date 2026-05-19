"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { OrderControls } from "@/components/core/OrderControls";
import { ProcessList } from "@/components/core/ProcessList";
import { TokenBalances } from "@/components/core/TokenBalances";
import { ProtocolStats } from "@/components/core/ProtocolStats";
import { GHGAnchorPanel } from "@/components/core/GHGAnchorPanel";
import { GHGWorkflowPanel } from "@/components/core/GHGWorkflowPanel";
import { SemanticProcessWorkspacePanel } from "@/components/core/SemanticProcessWorkspacePanel";
import { OnboardingBanner } from "@/components/core/OnboardingBanner";
import { CONTRACTS } from "@/lib/core/contracts";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { mockEmitOrder, mockResolveProcess } from "@/lib/core/mockEventStore";
import { useOrderStore } from "@/lib/core/store";

const OrderGraph = dynamic(
    () => import("@/components/core/OrderGraph").then(m => m.OrderGraph),
    { ssr: false, loading: () => <div className="h-64 bg-gray-50 animate-pulse rounded-md" /> }
);

const TABS = [
    { id: "orders", label: "Create Order" },
    { id: "processes", label: "My Processes" },
    { id: "stats", label: "Protocol" },
    { id: "graph", label: "Graph" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function TerminalPage() {
    const [activeTab, setActiveTab] = useState<TabId>("orders");

    useEffect(() => {
        if (!isE2EMockSession()) return;
        // E2E test harness on window global. setViewedProcessId is exposed
        // so injection-based tests (which bypass useFigaroActions.commit
        // — the production path that auto-selects the viewed process for
        // root orders) can drive the resolve capability. Mirrors the
        // existing __FIGARO_SET_VIEWED_PROCESS_ID__ that ClientInit.tsx
        // exposes in devnet mode.
        //
        // ProcessList.tsx:81-85 also auto-selects on its own useEffect,
        // but that path races: the test would have to tab-switch to
        // mount ProcessList, wait for `summaries` to populate from the
        // mock store, AND wait for the auto-select useEffect to fire
        // with the populated summaries — all before tabbing back. The
        // harness setter sidesteps the race deterministically.
        window.__FIGARO_MOCK__ = {
            emitOrder: mockEmitOrder,
            resolveProcess: (pid: string, idStrs: string[]) => mockResolveProcess(pid, idStrs),
            setViewedProcessId: (id: string | null) => useOrderStore.getState().setViewedProcessId(id),
        };
    }, []);

    return (
        <>
            <OnboardingBanner />

            <header className="border-b border-gray-100 pb-6">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                    Protocol Terminal
                </p>
                <h1 className="text-3xl font-bold text-black mb-2">
                    Direct kernel interaction.
                </h1>
                <p className="text-sm text-gray-600 max-w-2xl">
                    Submit orders, inspect processes, and read protocol state without assembly composition.
                    Intended for developers and advanced builders testing against contract primitives directly.
                </p>
            </header>

            <details className="bg-white border border-gray-300 rounded-lg">
                <summary className="p-4 cursor-pointer flex items-center gap-2 text-sm font-medium text-black select-none">
                    <span>ℹ️</span> Contract Addresses
                </summary>
                <div className="px-4 pb-4 space-y-1 font-mono text-xs">
                    <p className="text-black">Core: <span>{CONTRACTS.core || "Not set"}</span></p>
                    <p className="text-black">Token: <span>{CONTRACTS.mockToken || "Not set"}</span></p>
                    {CONTRACTS.schemaRegistry && <p className="text-black">SchemaRegistry: <span>{CONTRACTS.schemaRegistry}</span></p>}
                    {CONTRACTS.attestationCoordinator && <p className="text-black">AttestationCoordinator: <span>{CONTRACTS.attestationCoordinator}</span></p>}
                    {CONTRACTS.dutchAuction && <p className="text-black">DutchAuction: <span>{CONTRACTS.dutchAuction}</span></p>}
                    {CONTRACTS.batchVerifier && <p className="text-black">BatchVerifier: <span>{CONTRACTS.batchVerifier}</span></p>}
                    {MECHANISM_CONTRACTS.operatorRegistry && <p className="text-black">OperatorRegistry: <span>{MECHANISM_CONTRACTS.operatorRegistry}</span></p>}
                    {MECHANISM_CONTRACTS.figToken && <p className="text-black">FigToken: <span>{MECHANISM_CONTRACTS.figToken}</span></p>}
                    {MECHANISM_CONTRACTS.rpgfMinter && <p className="text-black">RpgfMinter: <span>{MECHANISM_CONTRACTS.rpgfMinter}</span></p>}
                </div>
            </details>

            <div className="flex border-b border-gray-200" role="tablist">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        id={`tab-${tab.id}`}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`panel-${tab.id}`}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${activeTab === tab.id
                            ? "border-b-2 border-black text-black"
                            : "text-gray-500 hover:text-black"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "orders" && (
                <div id="panel-orders" role="tabpanel" aria-labelledby="tab-orders" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <OrderControls />
                        {/* Dev-only debugging panel — hidden in production builds.
                            TokenBalances inspects wallet ERC-20 holdings; useful when
                            developing locally against devnet, noisy on the public
                            terminal. Per Web2 UI/UX audit (2026-04-26). */}
                        {process.env.NODE_ENV !== "production" && <TokenBalances />}
                    </div>
                    <SemanticProcessWorkspacePanel />
                </div>
            )}

            {activeTab === "processes" && (
                <div id="panel-processes" role="tabpanel" aria-labelledby="tab-processes" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ProcessList />
                    <SemanticProcessWorkspacePanel />
                </div>
            )}

            {activeTab === "stats" && (
                <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats" className="space-y-6">
                    <ProtocolStats />
                    <GHGAnchorPanel />
                    <GHGWorkflowPanel />
                </div>
            )}

            {activeTab === "graph" && (
                <div id="panel-graph" role="tabpanel" aria-labelledby="tab-graph">
                    <OrderGraph />
                </div>
            )}
        </>
    );
}

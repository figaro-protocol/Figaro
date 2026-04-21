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
import { CONTRACTS } from "@/lib/core/contracts";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";
import { OnboardingBanner } from "@/components/core/OnboardingBanner";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { mockEmitOrder, mockResolveProcess } from "@/lib/core/mockEventStore";

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

export default function WorkbenchPage() {
    const [activeTab, setActiveTab] = useState<TabId>("orders");

    // Expose mock test harness on window regardless of active tab. Tests that
    // inject orders via the harness must work before the Graph tab is opened.
    useEffect(() => {
        if (!isE2EMockSession()) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- E2E test harness on window global
        (window as any).__FIGARO_MOCK__ = {
            emitOrder: mockEmitOrder,
            resolveProcess: (pid: string, idStrs: string[]) => mockResolveProcess(pid, idStrs),
        };
    }, []);

    return (
        <>
            <OnboardingBanner />

            {/* Contract Info — collapsible */}
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
                    {MECHANISM_CONTRACTS.stagedAirdrop && <p className="text-black">StagedMerkleAirdrop: <span>{MECHANISM_CONTRACTS.stagedAirdrop}</span></p>}
                </div>
            </details>

            {/* Tab Bar */}
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

            {/* Tab Panels */}
            {activeTab === "orders" && (
                <div id="panel-orders" role="tabpanel" aria-labelledby="tab-orders" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <OrderControls />
                        <TokenBalances />
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

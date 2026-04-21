"use client";

import { useAccount } from "wagmi";
import { useOrderStore, OrderState } from "@/lib/core/store";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useMounted } from "@/hooks/core/useMounted";
import { useWalletProcessIds } from "@/hooks/core/useWalletProcessIds";
import { Card } from "@/components/ui/Card";
import Activity from "@/components/icons/Coins";
import CheckCircle from "@/components/icons/CheckCircle";
import Clock from "@/components/icons/RefreshCw";

export function ProtocolStats() {
    const mounted = useMounted();
    const { address } = useAccount();
    const viewedProcessId = useOrderStore((state) => state.viewedProcessId);

    // When a process is selected → show that process's order counts.
    // When nothing is selected → show wallet-level aggregates from "My Processes".
    // This prevents the expensive full-chain getLogs scan on initial render.
    const processOrders = useProcessOrders(viewedProcessId);
    const walletSummaries = useWalletProcessIds(address);

    // Derive counts depending on context
    const usingProcess = !!viewedProcessId;
    const totalOrders = usingProcess
        ? processOrders.length
        : walletSummaries.reduce((s, p) => s + p.orderCount, 0);
    const activeOrders = usingProcess
        ? processOrders.filter((o) => o.state === OrderState.Active).length
        : walletSummaries.filter((p) => p.hasActive).length; // processes with ≥1 active
    const resolvedOrders = usingProcess
        ? processOrders.filter((o) => o.state === OrderState.Resolved).length
        : 0; // no resolved count at wallet-summary level (enhancement for later)

    // Gate on mounted — SSR has no wallet/processId, so always render "—" until
    // the client has hydrated. Without this guard the server renders "—" while
    // the client (with a rehydrated wagmi session) renders "My wallet", causing
    // a React hydration mismatch that breaks the entire page.
    const statsLabel = !mounted ? "—" : usingProcess
        ? `Process ${viewedProcessId.slice(0, 8)}…`
        : address ? "My wallet" : "—";

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-4">
            {/* Total Orders */}
            <Card className="bg-white text-black border border-gray-200 shadow-sm flex flex-col justify-between min-h-[120px]">
                <div className="flex flex-col gap-2 p-6">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-black" />
                        <span className="text-sm font-medium text-black">Total Orders</span>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div className="text-3xl font-bold text-black" suppressHydrationWarning>
                        {mounted ? totalOrders : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1" suppressHydrationWarning>{statsLabel}</div>
                </div>
            </Card>

            {/* Active Orders */}
            <Card className="bg-white text-black border border-gray-200 shadow-sm flex flex-col justify-between min-h-[120px]">
                <div className="flex flex-col gap-2 p-6">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-black" />
                        <span className="text-sm font-medium text-black">Active</span>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div className="text-3xl font-bold text-black" suppressHydrationWarning>
                        {mounted ? activeOrders : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1" suppressHydrationWarning>{statsLabel}</div>
                </div>
            </Card>

            {/* Resolved Orders */}
            <Card className="bg-white text-black border border-gray-200 shadow-sm flex flex-col justify-between min-h-[120px]">
                <div className="flex flex-col gap-2 p-6">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-black" />
                        <span className="text-sm font-medium text-black">Resolved</span>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div className="text-3xl font-bold text-black" suppressHydrationWarning>
                        {mounted ? resolvedOrders : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1" suppressHydrationWarning>{statsLabel}</div>
                </div>
            </Card>

            {/* Protocol Fee — live kernel infrastructure is free */}
            <Card className="bg-white text-black border border-gray-200 shadow-sm flex flex-col justify-between min-h-[120px]">
                <div className="flex flex-col gap-2 p-6">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black">Protocol Fee</span>
                    </div>
                    <hr className="my-2 border-gray-100" />
                    <div
                        data-testid="protocol-fee-stats"
                        className="text-2xl font-bold text-black"
                    >
                        0%
                    </div>
                    <div className="text-xs text-black mt-1">Infrastructure is free</div>
                </div>
            </Card>
        </div>
    );
}

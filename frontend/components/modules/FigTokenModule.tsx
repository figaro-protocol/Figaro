"use client";

import { useAccount } from "wagmi";
import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import {
    useFigTokenMetrics,
    useFigBalance,
    useStagedAirdropStage,
    formatFig,
} from "@/lib/mechanisms/useFigToken";

// ── Stat row ─────────────────────────────────────────────────────────────────

export function StatRow({
    label,
    value,
    sub,
    accentTone,
}: {
    label: string;
    value: string;
    sub?: string;
    accentTone?: string;
}) {
    return (
        <div className="flex justify-between items-baseline py-1.5">
            <span className="text-sm text-neutral-500" style={accentTone ? { color: accentTone } : undefined}>{label}</span>
            <div className="text-right">
                <span className="text-sm font-medium text-black">{value}</span>
                {sub && <span className="text-xs text-neutral-500 ml-1">{sub}</span>}
            </div>
        </div>
    );
}

// ── Staged airdrop card (one per stage) ─────────────────────────────────────

const STAGE_LABELS = [
    { label: "Year 2 airdrop (30%)", cap: "300M" },
    { label: "Year 5 airdrop (20%)", cap: "200M" },
    { label: "Year 9 airdrop (10%)", cap: "100M" },
] as const;

function StagedAirdropCard({ stageIndex, accentTone }: { stageIndex: number; accentTone?: string }) {
    const stage = useStagedAirdropStage(stageIndex);
    if (!stage.available) return null;

    const unlockDate = stage.unlockTime > 0n
        ? new Date(Number(stage.unlockTime) * 1000).toLocaleDateString()
        : "—";

    const meta = STAGE_LABELS[stageIndex];

    return (
        <div
            className="border border-neutral-200 rounded-lg p-3"
            data-testid={`fig-airdrop-stage-${stageIndex}`}
            style={accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined}
        >
            <p className="text-xs font-semibold text-neutral-500 mb-2" style={accentTone ? { color: accentTone } : undefined}>
                {meta.label}
            </p>
            <div className="divide-y divide-neutral-100">
                <StatRow label="Pool cap" value={meta.cap} sub="FIG" accentTone={accentTone} />
                <StatRow label="Unlocks" value={unlockDate} accentTone={accentTone} />
                <StatRow
                    label="Status"
                    value={stage.isUnlocked ? "Open" : "Locked"}
                    accentTone={accentTone}
                />
            </div>
        </div>
    );
}

// ── Main panel ───────────────────────────────────────────────────────────────

function FigTokenInternalPanel({ accentTone }: { accentTone?: string }) {
    const { address } = useAccount();
    const tokenMetrics = useFigTokenMetrics();
    const userBalance = useFigBalance();

    if (!tokenMetrics.available) {
        return <p className="text-xs text-neutral-500">FIG token contract not available.</p>;
    }

    return (
        <div className="space-y-4">
            {/* Token overview */}
            <div className="divide-y divide-neutral-100" data-testid="fig-token-metrics">
                <StatRow label="Total Supply" value={formatFig(tokenMetrics.totalSupply)} sub="FIG" accentTone={accentTone} />
                <StatRow
                    label="Deployer Mint"
                    value={tokenMetrics.deployerMintRenounced ? "Renounced" : "Active"}
                    accentTone={accentTone}
                />
            </div>

            {/* User balance */}
            {address && (
                <div className="pt-3 border-t border-neutral-200" data-testid="fig-user-balance">
                    <p className="text-xs font-semibold text-neutral-500 mb-2" style={accentTone ? { color: accentTone } : undefined}>Your Balance</p>
                    <StatRow label="FIG" value={formatFig(userBalance.balance)} accentTone={accentTone} />
                </div>
            )}

            {/* Airdrop stages */}
            <div className="pt-3 border-t border-neutral-200 space-y-3" data-testid="fig-airdrop-stages">
                <p className="text-xs font-semibold text-neutral-500" style={accentTone ? { color: accentTone } : undefined}>Community Airdrop</p>
                <StagedAirdropCard stageIndex={0} accentTone={accentTone} />
                <StagedAirdropCard stageIndex={1} accentTone={accentTone} />
                <StagedAirdropCard stageIndex={2} accentTone={accentTone} />
            </div>
        </div>
    );
}

// ── Module export ────────────────────────────────────────────────────────────

export function FigTokenModule({ context }: ModuleProps) {
    const { accentTone, shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-6"
            data-testid="fig-token-module"
            data-skin={context.skinBundle?.skinId}
            style={cardStyle}
        >
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4" style={labelStyle}>
                {shellLabel}
            </p>
            <FigTokenInternalPanel accentTone={accentTone} />
        </div>
    );
}

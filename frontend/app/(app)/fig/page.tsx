"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import {
    useFigTokenMetrics,
    useFigBalance,
    useRpgfMinterStage,
    useRpgfMinterClaimed,
    formatFig,
} from "@/lib/mechanisms/useFigToken";
import {
    getFigToken,
    getRpgfMinter,
} from "@/lib/mechanisms/contracts";

function ProgressBar({ pct, label }: { pct: number; label: string }) {
    return (
        <div className="mt-2">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>{label}</span>
                <span>{pct.toFixed(2)}%</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-black rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
        </div>
    );
}

const STAGES: { index: 0 | 1 | 2; label: string; amount: string; pct: string }[] = [
    { index: 0, label: "Year 2", amount: "300M", pct: "30%" },
    { index: 1, label: "Year 5", amount: "200M", pct: "20%" },
    { index: 2, label: "Year 9", amount: "100M", pct: "10%" },
];

function formatUnlockDate(unlockTime: bigint): string {
    if (unlockTime === 0n) return "—";
    return new Date(Number(unlockTime) * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function StageRow({
    index,
    label,
    amount,
    pct,
}: {
    index: 0 | 1 | 2;
    label: string;
    amount: string;
    pct: string;
}) {
    const { address } = useAccount();
    const { unlockTime, isUnlocked, available } = useRpgfMinterStage(index);
    const claimed = useRpgfMinterClaimed(index, address);

    const status = !available
        ? "not configured"
        : !isUnlocked
            ? `locked · unlocks ${formatUnlockDate(unlockTime)}`
            : claimed
                ? "claimed"
                : "claimable";

    const showClaim = isUnlocked && !claimed && !!address;

    return (
        <div className="flex items-baseline justify-between border-b border-neutral-100 py-3 last:border-b-0">
            <div>
                <div className="text-sm text-black">
                    {label} — {amount}{" "}
                    <span className="text-neutral-500">({pct})</span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">{status}</div>
            </div>
            {showClaim && (
                <Link
                    href="/fig/claim"
                    className="text-sm text-black underline"
                >
                    Claim
                </Link>
            )}
        </div>
    );
}

export default function FigPage() {
    const { address } = useAccount();
    const tokenMetrics = useFigTokenMetrics();
    const { balance } = useFigBalance();
    const figAddr = getFigToken();
    const airdropAddr = getRpgfMinter();

    const maxSupply = 1_000_000_000n * 10n ** 18n;
    const totalSupply = tokenMetrics.totalSupply;
    const pct = totalSupply > 0n
        ? Number((totalSupply * 10000n) / maxSupply) / 100
        : 0;

    return (
        <div className="container mx-auto px-6 pt-24 pb-24 max-w-3xl space-y-12">
            <section>
                <p className="text-xs font-semibold text-gray-600 mb-4">FIG</p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    A coordination Schelling point.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    FIG is a speech-act identifier, the way ETH, BTC, USDC, and USD are — the name participants converge on when invoking the token in transactions and conversation.
                </p>
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">What FIG is not</h2>
                <ul className="space-y-2 text-base text-gray-700 leading-relaxed list-disc pl-6">
                    <li>Not a governance token. There is no DAO vote on the kernel.</li>
                    <li>Not a staking token. The protocol does not require FIG to participate.</li>
                    <li>Not a bond currency. Figaro works with any ERC-20; the bond token is a per-process choice of the parties, not a protocol concern.</li>
                    <li>Not a yield instrument. Bonds are locked, not productive. No protocol fee, no emission to liquidity providers.</li>
                </ul>
                <p className="text-sm text-gray-600 mt-6">
                    Full treatment: <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/v5/FIG_TOKEN.md" target="_blank" rel="noopener noreferrer" className="underline">FIG_TOKEN.md</a>.
                </p>
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">Supply</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-gray-600">Max supply</dt>
                        <dd className="text-black font-medium">1,000,000,000 FIG (hard cap)</dd>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-gray-600">Vesting</dt>
                        <dd className="text-black font-medium">None</dd>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-gray-600">Standard</dt>
                        <dd className="text-black font-medium">ERC-20 + EIP-2612 permit</dd>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-gray-600">Deployer mint authority</dt>
                        <dd className="text-black font-medium">{tokenMetrics.deployerMintRenounced ? "Renounced" : "Active"}</dd>
                    </div>
                </dl>
                <div className="mt-6">
                    <ProgressBar pct={pct} label="Circulating vs. 1B cap" />
                </div>
                <p className="text-sm text-gray-600 mt-4">
                    <code>MAX_SUPPLY</code> is enforced on every mint. A minter registry caps what each registered minter can emit; the sum of registered caps cannot exceed <code>MAX_SUPPLY</code>. Deployer registers capped minters, then renounces — no further mint registrations are possible.
                </p>
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">Allocation</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-black">Founders</dt>
                        <dd className="text-gray-600">100M · 10% · genesis mint, no unlock schedule</dd>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-black">DAO</dt>
                        <dd className="text-gray-600">300M · 30% · genesis mint, no unlock schedule</dd>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                        <dt className="text-black">Community airdrop</dt>
                        <dd className="text-gray-600">600M · 60% · clause-author RPGF (yr 2 / 5 / 9)</dd>
                    </div>
                </dl>
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">Airdrop stages</h2>
                <div className="mt-3">
                    {STAGES.map((s) => (
                        <StageRow key={s.index} {...s} />
                    ))}
                </div>
                <p className="text-sm text-gray-600 mt-4">
                    Single <code>RpgfMinter</code> contract with three immutable unlock
                    timestamps. Per-tranche Merkle roots are submitted at tranche time
                    by a sequencer after an SP1 proof verifies the clause-author
                    substrate-broadening aggregation. One-shot per (stage, address) on
                    the claim side.
                </p>
                <Link
                    href="/fig/claim"
                    className="mt-4 inline-block text-sm text-black underline"
                >
                    Claim surface &rarr;
                </Link>
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">Your balance</h2>
                {address ? (
                    <div className="text-2xl font-semibold text-black">
                        {formatFig(balance)}{" "}
                        <span className="text-sm font-normal text-neutral-500">FIG</span>
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">
                        Your wallet balance will appear here once connected. Connection is only required for this user-specific view; the protocol state above is readable without a wallet.
                    </p>
                )}
            </section>

            <section className="border-t border-gray-200 pt-8">
                <h2 className="text-2xl font-bold text-black mb-4">Contracts</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4 border-b border-gray-100 pb-2 flex-wrap">
                        <dt className="text-gray-600 shrink-0">FIG Token</dt>
                        <dd className="text-black font-mono text-xs break-all">
                            {figAddr ?? <span className="font-sans text-neutral-500">not configured</span>}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-gray-100 pb-2 flex-wrap">
                        <dt className="text-gray-600 shrink-0">RPGF Minter</dt>
                        <dd className="text-black font-mono text-xs break-all">
                            {airdropAddr ?? <span className="font-sans text-neutral-500">not configured</span>}
                        </dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-4">
                    Source: <a href="https://github.com/figaro-protocol/Figaro/blob/main/src/fig/FigToken.sol" target="_blank" rel="noopener noreferrer" className="underline"><code>FigToken.sol</code></a> · <a href="https://github.com/figaro-protocol/Figaro/blob/main/src/fig/RpgfMinter.sol" target="_blank" rel="noopener noreferrer" className="underline"><code>RpgfMinter.sol</code></a>.
                </p>
            </section>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { formatToken } from "@/lib/shared/utils";
import { useAccount, usePublicClient } from "wagmi";
import { useCourierOffering } from "@/lib/mechanisms/useCourierOffering";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { CONTRACTS, DUTCH_AUCTION_ABI } from "@/lib/core/contracts";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

function TruckIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
            <path d="M15 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 13.52 8H14" />
            <circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" />
        </svg>
    );
}

function MapPinIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    );
}

function ClockIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
    );
}

const COS_LABEL: Record<string, string> = { S: "Standard", E: "Express", F: "Fragile", C: "Cold Chain" };
const COS_COLOR: Record<string, string> = {
    S: "bg-neutral-200 text-neutral-700",
    E: "bg-orange-700 text-orange-100",
    F: "bg-red-700 text-red-100",
    C: "bg-cyan-700 text-cyan-100",
};

interface AuctionJob {
    orderId: string;
    processId: string;
    payment: bigint;
    pickupGeohash: string;
    dropoffGeohash: string;
    cos: string;
    started: boolean;
    currentPrice?: bigint;
}

function getMockAuctionJobs(): AuctionJob[] {
    return [
        {
            orderId: "1",
            processId: "0xabc1",
            payment: 2000000000000000n,
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5reh",
            cos: "S",
            started: true,
            currentPrice: 1800000000000000n,
        },
        {
            orderId: "2",
            processId: "0xabc2",
            payment: 3000000000000000n,
            pickupGeohash: "9q8yy9",
            dropoffGeohash: "9q8yya",
            cos: "E",
            started: true,
            currentPrice: 2500000000000000n,
        },
        {
            orderId: "3",
            processId: "0xabc3",
            payment: 1500000000000000n,
            pickupGeohash: "9q8yyk",
            dropoffGeohash: "9q8yym",
            cos: "F",
            started: false,
        },
    ];
}

/**
 * Fetch live auction data from the DutchAuction contract.
 * Falls back to mock data when no contract address is configured.
 */
function useAuctionJobs(): AuctionJob[] {
    const publicClient = usePublicClient();
    const [liveJobs, setLiveJobs] = useState<AuctionJob[] | null>(null);

    // In mock E2E mode, always return mock data — skip live fetch even if
    // Anvil is running, because the chain won't have auction events.
    const isE2EMock = isE2EMockSession();

    const auctionAddress = CONTRACTS.dutchAuction && CONTRACTS.dutchAuction.length === 42
        ? (CONTRACTS.dutchAuction as `0x${string}`)
        : null;

    useEffect(() => {
        if (isE2EMock || !auctionAddress || !publicClient) return;
        let cancelled = false;

        (async () => {
            try {
                // Fetch AuctionCreated events (last ~5000 blocks or from deploy)
                const logs = await publicClient.getLogs({
                    address: auctionAddress,
                    event: {
                        type: "event",
                        name: "AuctionCreated",
                        inputs: [
                            { type: "bytes32", name: "auctionId", indexed: true },
                            { type: "address", name: "creator", indexed: true },
                            { type: "uint256", name: "maxPrice" },
                            { type: "bytes32", name: "processId", indexed: true },
                            { type: "address", name: "currency" },
                        ],
                    },
                    fromBlock: 0n,
                });

                if (cancelled) return;

                // Read current auction state for each
                const jobs: AuctionJob[] = [];
                for (const log of logs) {
                    const auctionId = log.args.auctionId;
                    if (!auctionId) continue;

                    const data = await publicClient.readContract({
                        address: auctionAddress,
                        abi: DUTCH_AUCTION_ABI,
                        functionName: "auctions",
                        args: [auctionId],
                    }) as readonly [string, bigint, bigint, string, bigint];

                    const [, startTime, maxPrice, provider] = data;
                    const started = startTime > 0n;
                    const claimed = provider !== ZERO_ADDRESS;

                    // Skip claimed auctions
                    if (claimed) continue;

                    let currentPrice: bigint | undefined;
                    if (started) {
                        try {
                            currentPrice = await publicClient.readContract({
                                address: auctionAddress,
                                abi: DUTCH_AUCTION_ABI,
                                functionName: "getCurrentPrice",
                                args: [auctionId],
                            }) as bigint;
                        } catch {
                            // expired auction — getCurrentPrice may revert
                        }
                    }

                    jobs.push({
                        orderId: auctionId.slice(0, 10),
                        processId: log.args.processId?.slice(0, 10) ?? "0x",
                        payment: maxPrice,
                        pickupGeohash: "",
                        dropoffGeohash: "",
                        cos: "",
                        started,
                        currentPrice,
                    });
                }

                if (!cancelled) setLiveJobs(jobs);
            } catch {
                // Contract not available or RPC error — fall back to mock
            }
        })();

        return () => { cancelled = true; };
    }, [isE2EMock, auctionAddress, publicClient]);

    return liveJobs ?? getMockAuctionJobs();
}

function AuctionJobCard({ job, accentTone, tokenDecimals = 18 }: { job: AuctionJob; accentTone?: string; tokenDecimals?: number }) {
    const formattedPayment = formatToken(job.payment, tokenDecimals);
    const formattedPrice = job.currentPrice !== undefined ? formatToken(job.currentPrice, tokenDecimals) : null;
    const cardStyle = accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined;
    const accentStyle = accentTone ? { color: accentTone } : undefined;

    return (
        <div
            data-testid={`auction-card-${job.orderId}`}
            className="bg-white shadow-sm border border-neutral-200 rounded-lg p-5"
            style={cardStyle}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <TruckIcon className="w-5 h-5 text-orange-400 shrink-0" />
                        <h3 className="font-bold text-black truncate">
                            Delivery Job #{job.orderId}
                        </h3>
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-1">
                        Ref: {job.processId.slice(2, 8).toUpperCase()}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Max payout</p>
                    <p className="text-sm font-semibold text-black">{formattedPayment} ETH</p>
                </div>
            </div>

            <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                    <MapPinIcon className="w-4 h-4 text-neutral-500 shrink-0" />
                    <span className="text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded text-xs">
                        Pickup: {job.pickupGeohash}
                    </span>
                    <span className="text-neutral-500">→</span>
                    <span className="text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded text-xs">
                        Dropoff: {job.dropoffGeohash}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {job.cos && (
                        <span className={`px-2 py-0.5 rounded font-semibold ${COS_COLOR[job.cos] ?? "bg-neutral-200 text-neutral-700"}`}>
                            {COS_LABEL[job.cos] ?? job.cos}
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                    {job.started ? (
                        <span className="text-green-600 font-medium">● Auction running</span>
                    ) : (
                        <span className="text-neutral-500">○ Not started</span>
                    )}
                </div>
                {formattedPrice && (
                    <div className="text-sm font-semibold text-blue-600" style={accentStyle}>
                        {formattedPrice} ETH
                    </div>
                )}
            </div>

            {job.started && (
                <button
                    data-testid={`btn-claim-${job.orderId}`}
                    className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                    style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
                >
                    Claim Job
                </button>
            )}
        </div>
    );
}

export function JobMarketModule({ moduleId, context }: ModuleProps) {
    const { selectedRoleKind } = context;
    const accentTone = undefined;
    const labelStyle = accentTone ? { color: accentTone } : undefined;
    const cardStyle = accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined;
    const [geohashFilter, setGeohashFilter] = useState("");
    const { address } = useAccount();
    const { offering } = useCourierOffering(address);

    const auctionJobs = useAuctionJobs();

    const filteredJobs = useMemo(() => {
        if (!geohashFilter.trim()) return auctionJobs;
        return auctionJobs.filter((j) =>
            j.dropoffGeohash.toLowerCase().startsWith(geohashFilter.trim().toLowerCase())
        );
    }, [auctionJobs, geohashFilter]);

    if (selectedRoleKind !== "courier") return null;

    return (
        <div
            data-testid="job-market-module"
            data-module-id={moduleId}
            className="space-y-6"
        >
            <div className="flex items-center gap-2">
                <ClockIcon className="w-6 h-6 text-black" />
                <div>
                    <p className="text-xs font-semibold text-neutral-500 mb-2" style={labelStyle}>
                        {context.shellPresentation.title}
                    </p>
                    <h2 className="text-2xl font-bold text-black">
                        Available Jobs ({geohashFilter.trim() ? `${filteredJobs.length} of ${auctionJobs.length}` : auctionJobs.length})
                    </h2>
                </div>
            </div>

            {/* Courier profile from IPFS */}
            {offering && (
                <div
                    data-testid="courier-profile-banner"
                    className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm flex items-center gap-4"
                    style={cardStyle}
                >
                    {offering.branding?.avatarURI ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Courier avatars are operator-supplied IPFS/HTTP assets resolved at runtime.
                        <img
                            src={resolveContentURI(offering.branding.avatarURI)}
                            alt={offering.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                        />
                    ) : (
                        <span className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-lg">🚗</span>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-black truncate" style={labelStyle}>{offering.displayName}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                            {offering.vehicleType && <span className="capitalize">{offering.vehicleType}</span>}
                            {offering.serviceAreas.map((a) => (
                                <span key={a.geohashPrefix} className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                                    {a.label || a.geohashPrefix}
                                </span>
                            ))}
                            {offering.minimumFee && <span>Min: {offering.minimumFee} ETH</span>}
                        </div>
                    </div>
                </div>
            )}

            <details className="bg-neutral-50 border border-neutral-200 rounded-lg" style={cardStyle}>
                <summary className="p-3 cursor-pointer text-sm font-medium text-black select-none" style={labelStyle}>
                    How delivery auctions work
                </summary>
                <div className="px-4 pb-3 text-xs text-neutral-600 space-y-1">
                    <p>Each delivery job is allocated through a <strong>Dutch auction</strong>. The price starts at a maximum set by the customer and decays over time toward a floor price.</p>
                    <p>The first courier to claim the job gets it at the current price. Waiting longer means a lower payout but risks another courier claiming first.</p>
                    <p>Any surplus between the customer&apos;s budget and the clearing price is refunded to the customer.</p>
                </div>
            </details>

            <div className="flex items-center gap-2 max-w-sm">
                <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                        data-testid="geohash-filter-input"
                        type="text"
                        placeholder="Filter by delivery zone…"
                        value={geohashFilter}
                        onChange={(e) => setGeohashFilter(e.target.value)}
                        maxLength={8}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white text-black placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                {geohashFilter && (
                    <button
                        data-testid="btn-clear-geohash-filter"
                        onClick={() => setGeohashFilter("")}
                        className="text-xs text-neutral-500 hover:text-black px-2 py-1 border border-neutral-200 rounded"
                        style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                    >
                        Clear
                    </button>
                )}
            </div>

            {filteredJobs.length === 0 ? (
                <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center text-neutral-500" style={cardStyle}>
                    {geohashFilter.trim()
                        ? `No jobs match geohash "${geohashFilter}".`
                        : "No active auctions at the moment."}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredJobs.map((job) => (
                        <AuctionJobCard key={job.orderId} job={job} accentTone={accentTone} tokenDecimals={context.tokenDecimals} />
                    ))}
                </div>
            )}
        </div>
    );
}

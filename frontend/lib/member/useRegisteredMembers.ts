"use client";

/**
 * Every registered member, read WALLETLESSLY — the members family's
 * counterpart of `useAllRegisteredClauses` / `usePublishedAssemblies`.
 *
 * Reads through the standalone `publicClient` (not wagmi's provider), so the
 * marketing tier can render it: `MemberRegistered` + `MemberProfileUpdated`
 * + `MemberWithdrawalRequested` through the protocol-tier indexer
 * (`membersRegistryIndexer.ts`), then each profile document from IPFS. Unlike
 * `useMemberListings` (the BUYER's discover list — sellers with an anchored
 * assembly binding), this lists the registry itself: a member with no
 * catalogue and no bindings is a member, and it surfaces here.
 *
 * `stakeWithdrawn` mirrors the K4 de-surfacing rule the indexer applies:
 * a member whose withdrawal request post-dates its registration is no longer
 * active — carried, not dropped, so the explorer's stake facet can show the
 * archival view on request.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getActiveMembers, getAllMemberRegistered } from "@/lib/protocol/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";

export interface RegisteredMemberRow {
    address: `0x${string}`;
    metadataURI: string;
    /** The block of the member's LATEST registration event. */
    blockNumber: bigint;
    stakeWithdrawn: boolean;
    /** The pinned profile, once fetched; null while loading or when the
     *  gateway cannot serve it (the member is registered, counted, unnamed). */
    profile: MemberProfileMetadata | null;
}

export function useRegisteredMembers(): { data: RegisteredMemberRow[] | null; failed: boolean; refetch: () => void } {
    const [data, setData] = useState<RegisteredMemberRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const registry = CONTRACTS.membersRegistry;
        if (!registry || registry.length !== 42) {
            setData([]);
            return;
        }
        let cancelled = false;
        setFailed(false);
        const chainId = publicClient.chain?.id ?? activeChain.id;
        Promise.all([getAllMemberRegistered(publicClient, chainId), getActiveMembers(publicClient, chainId)])
            .then(async ([registered, active]) => {
                if (cancelled) return;
                const activeUri = new Map(active.map((m) => [m.address.toLowerCase(), m.metadataURI]));
                // Latest registration per address (re-registration after a
                // withdrawal is allowed; the newest event is the live one).
                const latest = new Map<string, { address: `0x${string}`; metadataURI: string; blockNumber: bigint }>();
                for (const r of registered) {
                    const key = r.member.toLowerCase();
                    const prev = latest.get(key);
                    if (!prev || BigInt(r.blockNumber) > prev.blockNumber) {
                        latest.set(key, { address: r.member as `0x${string}`, metadataURI: r.metadataURI, blockNumber: BigInt(r.blockNumber) });
                    }
                }
                const rows: RegisteredMemberRow[] = Array.from(latest.entries()).map(([key, r]) => ({
                    address: r.address,
                    // An active member's URI may have moved via updateProfile.
                    metadataURI: activeUri.get(key) ?? r.metadataURI,
                    blockNumber: r.blockNumber,
                    stakeWithdrawn: !activeUri.has(key),
                    profile: null,
                }));
                setData(rows);
                // Profiles resolve lazily and independently — one slow gateway
                // read never blocks the list.
                await Promise.all(rows.map(async (row) => {
                    const profile = await fetchMemberProfile(row.metadataURI).catch(() => null);
                    if (cancelled || !profile) return;
                    setData((prev) => prev?.map((p) => (p.address === row.address ? { ...p, profile } : p)) ?? prev);
                }));
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useRegisteredMembers] registry read failed:", err);
                setFailed(true);
                setData([]);
            });
        return () => { cancelled = true; };
    }, [generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return useMemo(() => ({ data, failed, refetch }), [data, failed, refetch]);
}

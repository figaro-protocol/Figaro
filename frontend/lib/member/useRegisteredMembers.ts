"use client";

/**
 * Every registered member, read WALLETLESSLY — the members family's
 * counterpart of `useAllRegisteredClauses` / `usePublishedAssemblies`.
 *
 * Reads through the standalone `publicClient` (not wagmi's provider), so the
 * marketing tier can render it: `MemberRegistered` + `MemberProfileUpdated`
 * + `MemberWithdrawalRequested` through the protocol-tier indexer
 * (`membersRegistryIndexer.ts`), then each profile document from IPFS. Unlike
 * `useMemberListings` (the BUYER's discover list — members with an anchored
 * assembly binding), this lists the registry itself: a member with no
 * catalog and no bindings is a member, and it surfaces here.
 *
 * `stakeWithdrawn` mirrors the K4 de-surfacing rule the indexer applies:
 * a member whose withdrawal request post-dates its registration is
 * no longer current — carried, not dropped, so the explorer's stake facet
 * can show the archival view on request.
 */

import { useEffect, useMemo, useState } from "react";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getActiveMembers, getAllMemberRegistered } from "@/lib/protocol/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import { scheduleContentRetry } from "@/lib/shared/ipfsService";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import { ABSENT, PENDING, present, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
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

/** Every registered member as a `NetworkRead`: `absent` when the registry
 *  read failed (or no registry is configured), never `[]`. */
export function useRegisteredMembers(): { read: NetworkRead<RegisteredMemberRow[]>; refetch: () => void } {
    const [read, setRead] = useState<NetworkRead<RegisteredMemberRow[]>>(PENDING);
    const { generation, refetch } = useRefetchGeneration();

    useEffect(() => {
        const registry = CONTRACTS.membersRegistry;
        if (!registry || registry.length !== 42) {
            setRead(ABSENT);
            return;
        }
        let canceled = false;
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const chainId = publicClient.chain?.id ?? activeChain.id;
        void readNetwork("useRegisteredMembers", () =>
            Promise.all([getAllMemberRegistered(publicClient, chainId), getActiveMembers(publicClient, chainId)]),
        ).then(async (scan) => {
            if (canceled) return;
            if (scan.status !== "present") {
                setRead(scan);
                return;
            }
            const [registered, active] = scan.value;
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
            setRead(present(rows));
            // Profiles resolve lazily and independently — one slow gateway
            // read never blocks the list. A profile no gateway has served
            // yet (a public gateway finds a fresh pin minutes after the
            // wizard pinned it) is re-read on `contentRetryDelayMs`'s
            // schedule, so the member names itself without a reload.
            const readProfile = async (row: RegisteredMemberRow, attempt: number) => {
                const profile = await fetchMemberProfile(row.metadataURI).catch(() => null);
                if (canceled) return;
                if (!profile) {
                    scheduleContentRetry(timers, attempt, () => void readProfile(row, attempt + 1));
                    return;
                }
                setRead((prev) => (prev.status === "present"
                    ? present(prev.value.map((p) => (p.address === row.address ? { ...p, profile } : p)))
                    : prev));
            };
            await Promise.all(rows.map((row) => readProfile(row, 0)));
        });
        return () => {
            canceled = true;
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
        };
    }, [generation]);

    return useMemo(() => ({ read, refetch }), [read, refetch]);
}

/**
 * MembersRegistry event reader — the protocol-layer half of the cached indexer.
 *
 * Reads the three surviving MembersRegistry events (registration, profile
 * update, withdrawal) and derives current member state from them. Kernel
 * order events (OrderCommitted/OrderResolved) live in the kernel indexer;
 * this module reads a REGISTRY, which is protocol tier, not kernel tier.
 *
 * Fetching goes through the cached indexer (`cachedGetLogsMulti`); DECODING
 * and the LIVENESS FOLD are the SDK's (`parseMembersRegistryLogs` +
 * `reconstructDiscovery` — the one parse and the one fold per family, in
 * (blockNumber, logIndex) order). The readers below are projections over
 * that fold, never a second fold.
 *
 * Lifecycle flags (deactivate/reactivate) and on-chain role tracking remain
 * stripped — availability is signal-by-availability, and there is no
 * categorization field at any layer (no archetype, no role, no serviceType).
 * What an address does is reconstructed from the events it has emitted
 * (registrations, clause attestations, signed commitments).
 */

import type { Address, Log, PublicClient } from "viem";
import { getAbiItem } from "viem";
import {
    parseMembersRegistryLogs,
    reconstructDiscovery,
    type DiscoveryGraph,
    type MembersRegistryEvents,
    type MemberRegisteredEvent,
} from "@figaro-protocol/sdk";
import { hexEqual } from "@/lib/shared/evm";
import { CONTRACTS, MEMBERS_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { cachedGetLogsMulti } from "@/lib/kernel/indexer";

// Event defs come from the canonical SDK ABI, like the clause/assembly readers.
const EV_MEMBER_REGISTERED = getAbiItem({ abi: MEMBERS_REGISTRY_ABI, name: "MemberRegistered" });
const EV_MEMBER_PROFILE_UPDATED = getAbiItem({ abi: MEMBERS_REGISTRY_ABI, name: "MemberProfileUpdated" });
// The DE-SURFACING event, deliberately NOT `MemberWithdrawn`. Withdrawal is two
// calls now: the request clears the guard immediately while the ETH stays locked
// for the cooldown, and the claim can land much later. Folding the claim here
// would keep a member who has already left showing as registered — and, because
// the RPGF gate reads the same liveness, would misreport eligibility too.
const EV_MEMBER_WITHDRAWAL_REQUESTED = getAbiItem({ abi: MEMBERS_REGISTRY_ABI, name: "MemberWithdrawalRequested" });

/** Fetch one event stream through the cache and decode it with the SDK parser.
 *  The cache stores the full log objects (data/topics survive the IDB
 *  round-trip), so the SDK's raw-log decoder runs directly over cached rows. */
async function fetchMemberEvents(
    client: PublicClient,
    chainId: number,
    event: Parameters<typeof cachedGetLogsMulti>[3]["event"],
    eventName: string,
) {
    if (!CONTRACTS.membersRegistry) return { registered: [], withdrawn: [] };
    const logs = await cachedGetLogsMulti(client, chainId, [CONTRACTS.membersRegistry], { event, eventName });
    return parseMembersRegistryLogs(logs as unknown as Log[]);
}

/** All three streams through the cache, merged into the SDK's per-family
 *  event shape. The cache stays keyed per event; the SDK fold re-orders by
 *  (blockNumber, logIndex), so concatenation order carries no meaning. */
async function fetchAllMemberEvents(client: PublicClient, chainId: number): Promise<MembersRegistryEvents> {
    const [registered, profileUpdated, withdrawalRequested] = await Promise.all([
        fetchMemberEvents(client, chainId, EV_MEMBER_REGISTERED, "MemberRegistered"),
        fetchMemberEvents(client, chainId, EV_MEMBER_PROFILE_UPDATED, "MemberProfileUpdated"),
        fetchMemberEvents(client, chainId, EV_MEMBER_WITHDRAWAL_REQUESTED, "MemberWithdrawalRequested"),
    ]);
    return {
        registered: [...registered.registered, ...profileUpdated.registered],
        withdrawn: withdrawalRequested.withdrawn,
    };
}

/** The SDK's latest-lifecycle-event-wins liveness fold over the members
 *  family (the other two registry families contribute nothing here — each
 *  family has its own reader). */
function foldMembers(events: MembersRegistryEvents): DiscoveryGraph {
    return reconstructDiscovery({
        clauseRegistered: [],
        clauseWithdrawn: [],
        memberRegistered: events.registered,
        memberWithdrawn: events.withdrawn,
        assemblyRegistered: [],
        assemblyWithdrawn: [],
    });
}

/** All `MemberRegistered` rows (SDK-decoded; `updated === false`). */
export async function getAllMemberRegistered(client: PublicClient, chainId: number): Promise<MemberRegisteredEvent[]> {
    return (await fetchMemberEvents(client, chainId, EV_MEMBER_REGISTERED, "MemberRegistered")).registered;
}

/**
 * Derive the current member roster: latest metadataURI per address,
 * filtered to only those currently registered — a projection over the SDK
 * liveness fold (most-recent lifecycle event per address wins, in
 * (blockNumber, logIndex) order; a withdrawal REQUEST de-surfaces).
 */
export async function getActiveMembers(client: PublicClient, chainId: number) {
    const graph = foldMembers(await fetchAllMemberEvents(client, chainId));
    return graph.getMembers().map((m) => ({
        address: m.member.toLowerCase(),
        metadataURI: m.metadataURI,
    }));
}

/**
 * Get the latest metadataURI for a specific member address.
 * Returns null if not currently registered (never registered, or withdrawn
 * after most recent registration).
 */
export async function getMemberMetadataURI(client: PublicClient, chainId: number, member: string) {
    const graph = foldMembers(await fetchAllMemberEvents(client, chainId));
    return graph.getMember(member as Address)?.metadataURI ?? null;
}

/**
 * Full state for a single member, derived from events.
 * Returns null if the member has never registered or has left after
 * the most recent registration (the SDK fold's verdict). `registeredBlock`
 * backs the deposit lock-expiry computation and is projected from the
 * member's most recent `MemberRegistered` event; `metadataURI` is the
 * fold's current value (registration, or any subsequent ProfileUpdated).
 */
export async function getMemberState(
    client: PublicClient,
    chainId: number,
    member: string,
): Promise<{ metadataURI: string; registeredBlock: bigint | null } | null> {
    const events = await fetchAllMemberEvents(client, chainId);
    const live = foldMembers(events).getMember(member as Address);
    if (!live) return null;

    // The surviving registration's block. Track the latest by block; tolerate
    // null/0 blockNumbers by always preferring a candidate over no candidate
    // (test indexers occasionally return blockNumber=null for the very latest
    // tx — the SDK parser coerces those to 0; picking it is still the right
    // answer).
    let regBlock = 0;
    for (const row of events.registered) {
        if (row.updated) continue;
        if (!hexEqual(row.member, member)) continue;
        if (row.blockNumber > regBlock) regBlock = row.blockNumber;
    }

    return {
        metadataURI: live.metadataURI,
        registeredBlock: regBlock > 0 ? BigInt(regBlock) : null,
    };
}

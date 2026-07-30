/**
 * MembersRegistry event reader — the protocol-layer half of the cached indexer.
 *
 * Reads the three surviving MembersRegistry events (registration, profile
 * update, withdrawal) and derives current member state from them. Kernel
 * order events (OrderCommitted/OrderResolved) live in the kernel indexer;
 * this module reads a REGISTRY, which is protocol tier, not kernel tier.
 *
 * Fetching goes through the cached indexer (`cachedGetLogsMulti`); DECODING is
 * the SDK's (`parseMembersRegistryLogs` — the one parse per family). The
 * liveness fold below stays here: it is this reader's own derived view.
 *
 * Lifecycle flags (deactivate/reactivate) and on-chain role tracking remain
 * stripped — availability is signal-by-availability, and there is no
 * categorization field at any layer (no archetype, no role, no serviceType).
 * What an address does is reconstructed from the events it has emitted
 * (registrations, clause attestations, signed commitments).
 */

import type { Log, PublicClient } from "viem";
import { getAbiItem } from "viem";
import { parseMembersRegistryLogs, type MemberRegisteredEvent, type MemberWithdrawnEvent } from "@figaro/sdk";
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

/** All `MemberRegistered` rows (SDK-decoded; `updated === false`). */
export async function getAllMemberRegistered(client: PublicClient, chainId: number): Promise<MemberRegisteredEvent[]> {
    return (await fetchMemberEvents(client, chainId, EV_MEMBER_REGISTERED, "MemberRegistered")).registered;
}

async function getAllMemberProfileUpdated(client: PublicClient, chainId: number): Promise<MemberRegisteredEvent[]> {
    return (await fetchMemberEvents(client, chainId, EV_MEMBER_PROFILE_UPDATED, "MemberProfileUpdated")).registered;
}

async function getAllMemberWithdrawalRequested(client: PublicClient, chainId: number): Promise<MemberWithdrawnEvent[]> {
    return (await fetchMemberEvents(client, chainId, EV_MEMBER_WITHDRAWAL_REQUESTED, "MemberWithdrawalRequested")).withdrawn;
}

/**
 * Derive the current member roster: latest metadataURI per address,
 * filtered to only those currently registered (Registered minus Withdrawn).
 *
 * "Current metadataURI" is the most recent MemberRegistered or
 * MemberProfileUpdated event for an address, provided no Withdrawn
 * event sits at or after the registration block (withdraw clears the
 * dedup guard, voiding any subsequent profile updates from a stale
 * registration).
 */
export async function getActiveMembers(client: PublicClient, chainId: number) {
    const [registered, profileUpdated, withdrawn] = await Promise.all([
        getAllMemberRegistered(client, chainId),
        getAllMemberProfileUpdated(client, chainId),
        getAllMemberWithdrawalRequested(client, chainId),
    ]);

    // Latest withdraw block per address (re-registration after withdraw is allowed)
    const latestWithdraw = new Map<string, number>();
    for (const row of withdrawn) {
        const addr = row.member.toLowerCase();
        const prev = latestWithdraw.get(addr) ?? 0;
        if (row.blockNumber > prev) latestWithdraw.set(addr, row.blockNumber);
    }

    // Latest Registered event per address that survives Withdrawn.
    const members = new Map<string, { metadataURI: string; registeredBlock: number; latestBlock: number }>();
    for (const row of registered) {
        const addr = row.member.toLowerCase();
        const withdrawnAfter = (latestWithdraw.get(addr) ?? 0) >= row.blockNumber;
        if (withdrawnAfter) continue;
        const prev = members.get(addr);
        if (!prev || row.blockNumber > prev.registeredBlock) {
            members.set(addr, {
                metadataURI: row.metadataURI,
                registeredBlock: row.blockNumber,
                latestBlock: row.blockNumber,
            });
        }
    }

    // Apply ProfileUpdated events that post-date the surviving Registered event.
    for (const row of profileUpdated) {
        const entry = members.get(row.member.toLowerCase());
        if (!entry) continue;
        if (row.blockNumber < entry.registeredBlock) continue;
        if (row.blockNumber > entry.latestBlock) {
            entry.metadataURI = row.metadataURI || entry.metadataURI;
            entry.latestBlock = row.blockNumber;
        }
    }

    return Array.from(members.entries()).map(([address, op]) => ({
        address,
        metadataURI: op.metadataURI,
    }));
}

/**
 * Get the latest metadataURI for a specific member address.
 * Returns null if not currently registered (never registered, or withdrawn
 * after most recent registration).
 */
export async function getMemberMetadataURI(client: PublicClient, chainId: number, member: string) {
    const active = await getActiveMembers(client, chainId);
    const lc = member.toLowerCase();
    const match = active.find((op) => op.address === lc);
    return match?.metadataURI ?? null;
}

/**
 * Full state for a single member, derived from events.
 * Returns null if the member has never registered or has left after
 * the most recent registration. `registeredBlock` backs the deposit lock-
 * expiry computation; `metadataURI` is the most recent value carried by
 * either the surviving Registered event or any subsequent ProfileUpdated.
 */
export async function getMemberState(
    client: PublicClient,
    chainId: number,
    member: string,
): Promise<{ metadataURI: string; registeredBlock: bigint | null } | null> {

    const [registered, profileUpdated, withdrawn] = await Promise.all([
        getAllMemberRegistered(client, chainId),
        getAllMemberProfileUpdated(client, chainId),
        getAllMemberWithdrawalRequested(client, chainId),
    ]);

    // Most recent Registered for this address. Track the latest by block;
    // tolerate null/0 blockNumbers by always preferring a candidate over no
    // candidate (test indexers occasionally return blockNumber=null for the
    // very latest tx — the SDK parser coerces those to 0; picking it is still
    // the right answer).
    let regRow: MemberRegisteredEvent | undefined;
    let regBlock = 0;
    for (const row of registered) {
        if (!hexEqual(row.member, member)) continue;
        if (!regRow || row.blockNumber > regBlock) {
            regBlock = row.blockNumber;
            regRow = row;
        }
    }
    if (!regRow) return null;

    // If a Withdrawn event exists at or after the most recent Registered,
    // the member has cleared the dedup guard and is no longer current.
    // Only enforce the comparison when at least one withdraw exists for this
    // member — otherwise a registration with blockNumber=null (regBlock=0)
    // would spuriously look "withdrawn" against a default lastWithdrawBlock.
    const memberWithdraws = withdrawn.filter((row) => hexEqual(row.member, member));
    if (memberWithdraws.length > 0) {
        const lastWithdrawBlock = memberWithdraws
            .map((row) => row.blockNumber)
            .reduce((max, b) => (b > max ? b : max), 0);
        if (lastWithdrawBlock >= regBlock) return null;
    }

    // Apply the most recent ProfileUpdated that post-dates the surviving
    // registration, if any.
    let metadataURI = regRow.metadataURI;
    let metadataBlock = regBlock;
    for (const row of profileUpdated) {
        if (!hexEqual(row.member, member)) continue;
        if (row.blockNumber < regBlock) continue;
        if (row.blockNumber > metadataBlock) {
            metadataURI = row.metadataURI || metadataURI;
            metadataBlock = row.blockNumber;
        }
    }

    return {
        metadataURI,
        registeredBlock: regBlock > 0 ? BigInt(regBlock) : null,
    };
}

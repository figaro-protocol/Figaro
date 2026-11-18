"use client";

/**
 * useClauseRegistry — readers for `ClauseRegistry.ClauseRegistered`.
 *
 * The on-chain event carries the clause KEY — `keccak256` of the canonical
 * bytes of the spec without its top-level `block` — and a `contentURI` (the
 * IPFS locator). The chain knows no name: the spec's own `clauseId` and
 * `version` are read from the spec itself once `loadClauseSpec` has verified
 * it against the key. No bundled
 * spec set. `registeredBy` is indexed. (Grouping is `block.design.article` in
 * the spec JSON — no on-chain group field.)
 *
 * `useAllRegisteredClauses` reads the whole registry, unfiltered. It drives
 * the `/clauses` inventory and feeds the clause-spec loader (`useClauseSpecs`),
 * and reads through the standalone `publicClient`, so it works on the
 * marketing tier, which mounts no wallet provider. This file imports nothing
 * from `wagmi`. The clause registry's hooks that need a wallet provider live
 * beside it: `useRegisteredClausesByWallet` and `useRegisterClause` in
 * `@/lib/protocol/useRegisterClause`, `useWithdrawClause` in
 * `@/lib/protocol/useWithdrawStake`.
 */

import { type Log } from "viem";
import { parseClauseRegistryLogs } from "@figaro-protocol/sdk";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/core/contracts";
import { isValidAddress } from "@/lib/shared/evm";
import { sharedRegisterRevertMessage, withdrawRevertMessage } from "@/lib/protocol/registryRevertMessages";
import { createRegistryEventScan } from "@/lib/protocol/registryEventScan";


/** The ClauseRegistry address if it's a well-formed address, else null.
 *  Mirrors `getProcessRegistry` / `getMembersRegistry`. */
export function getClauseRegistry(): `0x${string}` | null {
    const a = CONTRACTS.clauseRegistry;
    return isValidAddress(a) ? a : null;
}

export interface RegisteredClauseEvent {
    /** The clause key — `keccak256` of the canonical bytes of the spec pinned
     *  at `contentURI`, without its top-level `block`;
     *  the key every leaf, attestation, usage count and withdrawal names. SDK
     *  vocabulary (`RegisteredClause.clauseKey`). */
    clauseKey: `0x${string}`;
    /** IPFS locator for the spec; `loadClauseSpec` fetches the bytes from here
     *  and checks they hash to `clauseKey`. */
    contentURI: string;
    registeredBy: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the registeredBy reclaimed the registration stake (K4:
     *  surfacing derives from the live stake — withdraw = de-surface for
     *  NEW compositions). The binding is permanent: committed agreements
     *  keep resolving the clause, so spec-loading NEVER filters on this;
     *  only offering surfaces (drawer, inventory) do. */
    stakeWithdrawn: boolean;
}

/** Decode raw registry logs through the SDK parser and shape the UI rows.
 *  Shared by both readers so the row shape can't drift between them. The
 *  withdraw fold (`DepositWithdrawn` by clause key) rides the same parse. */
function toRegisteredClauseEvents(registeredLogs: Log[], withdrawnLogs: Log[]): RegisteredClauseEvent[] {
    const withdrawnKeys = new Set(
        parseClauseRegistryLogs(withdrawnLogs).withdrawn.map((w) => w.clauseKey.toLowerCase()),
    );
    return parseClauseRegistryLogs(registeredLogs).registered.map((row) => ({
        clauseKey: row.clauseKey.toLowerCase() as `0x${string}`,
        contentURI: row.contentURI,
        registeredBy: row.registeredBy,
        blockNumber: BigInt(row.blockNumber),
        transactionHash: row.transactionHash ?? "0x",
        stakeWithdrawn: withdrawnKeys.has(row.clauseKey.toLowerCase()),
    }));
}

/** The one paired (ClauseRegistered + DepositWithdrawn) cached scan behind
 *  both readers, `useAllRegisteredClauses` here and the wallet-scoped
 *  `useRegisteredClausesByWallet` — the shared factory shape
 *  (`createRegistryEventScan`), so the fetch, the registeredBy narrowing, the
 *  `failed` contract and the row projection can't drift between them. */
export const useClauseRegistryScan = createRegistryEventScan<RegisteredClauseEvent>({
    getRegistry: getClauseRegistry,
    abi: CLAUSE_REGISTRY_ABI,
    registeredEventName: "ClauseRegistered",
    withdrawnEventName: "DepositWithdrawn",
    label: "useClauseRegistry",
    toRows: (registeredLogs, withdrawnLogs) => {
        const items = toRegisteredClauseEvents(registeredLogs, withdrawnLogs);
        items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        return items;
    },
});

/**
 * Read every `ClauseRegistered` event in the registry — the whole on-chain
 * clause set, unfiltered. Reads through the standalone `publicClient` so it works
 * on the marketing tier. `data` is `null` while the first read is in flight, then
 * the event list (empty = registry reachable but empty, or none configured).
 * `failed` is true when the last read THREW — distinct from resolved-empty.
 */
export function useAllRegisteredClauses() {
    return useClauseRegistryScan({});
}

// ── Revert translation (pure — unit-tested) ──────────────────────────────────

/** Map a decoded `registerClause` error name (+ args) to a human-readable
 *  message, or null when unrecognized. Split from the viem extraction so it's
 *  testable without constructing a viem error. Mirrors the SHAPE of
 *  `assemblyRegisterRevertMessage` for assemblies. */
export function clauseRegisterRevertMessage(
    errorName: string | undefined,
    args: readonly unknown[] | undefined,
    clauseLabel: string,
): string | null {
    switch (errorName) {
        case "AlreadyRegistered":
            return `"${clauseLabel}" is already registered: this spec, without its presentation block, hashes to a clause key the registry holds. A clause's key is the hash of its spec without the block, and registration is first-write-wins and immutable, so the same spec always maps to one binding. Adopt the existing clause, or change the spec to register a different one.`;
        case "ZeroClauseKey":
            return "Computed a zero clause key — the spec document is empty or malformed.";
        default:
            return sharedRegisterRevertMessage(errorName, args);
    }
}

/** The clause noun's binding of the shared `withdrawDeposit` revert table
 *  (`withdrawRevertMessage` — the on-chain guards only; the commits==resolves
 *  gate is off-chain/advisory via `useWithdrawGate`). */
export const clauseWithdrawRevertMessage = withdrawRevertMessage("clause");

"use client";

/**
 * useClauseRegistry — readers for `ClauseRegistry.ClauseRegistered`.
 *
 * The on-chain event carries the readable `clauseId` and a `contentURI` (the
 * IPFS locator) directly — so both the human name and the spec location come
 * straight off the chain. No preimage table, no bundled spec set. `registeredBy` is
 * indexed. (Grouping is `block.design.article` in the spec JSON — no on-chain group field.)
 *
 * Two readers:
 *   - `useRegisteredClausesByWallet` — wallet-scoped (the designer's "clauses you
 *     registered" list).
 *   - `useAllRegisteredClauses` — the whole registry, unfiltered. Drives the
 *     `/clauses` inventory and feeds the clause-spec loader (`useClauseSpecs`).
 *     Reads through the standalone `publicClient` so it works on the marketing
 *     tier, which mounts no wallet provider.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Abi, type Log } from "viem";
import { computeClauseKey, parseClauseRegistryLogs } from "@figaro-protocol/sdk";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { canonicalContentHash } from "@/lib/shared/canonicalJson";
import { toError } from "@/lib/shared/errors";
import { isValidAddress } from "@/lib/shared/evm";
import { createUseWithdrawStake } from "@/lib/protocol/useWithdrawStake";
import { publishTail } from "@/lib/protocol/publishTail";


/** The ClauseRegistry address if it's a well-formed address, else null.
 *  Mirrors `getAssemblyRegistry` / `getMembersRegistry`. Internal — the write
 *  hooks below are the only callers. */
function getClauseRegistry(): `0x${string}` | null {
    const a = CONTRACTS.clauseRegistry;
    return isValidAddress(a) ? a : null;
}

export interface RegisteredClauseEvent {
    /** `keccak256(abi.encode(clauseId, version))` — the on-chain key the
     *  Attestation log and the withdraw fold use. SDK vocabulary
     *  (`RegisteredClause.idHash`). */
    idHash: `0x${string}`;
    /** The bare human-readable clause name, read straight from the event (e.g.
     *  "figaro-merchant-process"). SDK vocabulary (`RegisteredClause.clauseId`). */
    clauseId: string;
    version: number;
    /** keccak256 of the canonical spec JSON — integrity digest. */
    contentHash: `0x${string}`;
    /** IPFS locator for the spec; `loadClauseSpec` fetches the spec from here. */
    contentURI: string;
    registeredBy: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the registeredBy reclaimed the registration deposit (K4:
     *  surfacing derives from the live stake — withdraw = de-surface for
     *  NEW compositions). The binding is permanent: committed agreements
     *  keep resolving the clause, so spec-loading NEVER filters on this;
     *  only offering surfaces (drawer, inventory) do. */
    stakeWithdrawn: boolean;
}

/** Decode raw registry logs through the SDK parser and shape the UI rows.
 *  Shared by both readers so the row shape can't drift between them. The
 *  withdraw fold (`DepositWithdrawn` by idHash) rides the same parse. */
function toRegisteredClauseEvents(registeredLogs: Log[], withdrawnLogs: Log[]): RegisteredClauseEvent[] {
    const withdrawnKeys = new Set(
        parseClauseRegistryLogs(withdrawnLogs).withdrawn.map((w) => w.idHash.toLowerCase()),
    );
    return parseClauseRegistryLogs(registeredLogs).registered.map((row) => {
        const idHash = computeClauseKey(row.clauseId, row.version);
        return {
            idHash,
            clauseId: row.clauseId,
            version: row.version,
            contentHash: row.contentHash,
            contentURI: row.contentURI,
            registeredBy: row.registeredBy,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: row.transactionHash ?? "0x",
            stakeWithdrawn: withdrawnKeys.has(idHash.toLowerCase()),
        };
    });
}

/** Read all `DepositWithdrawn` logs, raw — decoded by the SDK parser above.
 *  Through the event cache: from the deployment block, adaptively chunked
 *  (public gateways cap `eth_getLogs` ranges), cached across renders. */
async function fetchWithdrawnClauseLogs(
    client: typeof publicClient,
    addr: `0x${string}`,
): Promise<Log[]> {
    return cachedGetContractEvents(client, client.chain?.id ?? activeChain.id, {
        address: addr,
        abi: CLAUSE_REGISTRY_ABI,
        eventName: "DepositWithdrawn",
    }) as Promise<Log[]>;
}

/** Read all `ClauseRegistered` logs, raw, optionally narrowed to one
 *  registeredBy — the narrowing is client-side over the ONE cached scan. */
async function fetchRegisteredClauseLogs(
    client: typeof publicClient,
    addr: `0x${string}`,
    registeredBy?: `0x${string}`,
): Promise<Log[]> {
    const logs = (await cachedGetContractEvents(client, client.chain?.id ?? activeChain.id, {
        address: addr,
        abi: CLAUSE_REGISTRY_ABI,
        eventName: "ClauseRegistered",
    })) as Log[];
    if (!registeredBy) return logs;
    const want = registeredBy.toLowerCase();
    return logs.filter((l) => String((l as { args?: { registeredBy?: string } }).args?.registeredBy ?? "").toLowerCase() === want);
}

/** Read all `ClauseRegistered` events filtered by the registering wallet. Sorts
 *  most-recent block first. Call `refetch` to pick up newly registered clauses. */
export function useRegisteredClausesByWallet(registeredBy: `0x${string}` | undefined) {
    const client = usePublicClient();
    const [data, setData] = useState<RegisteredClauseEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.clauseRegistry;
        if (!client || !addr || addr.length !== 42 || !registeredBy) {
            setData(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        Promise.all([
            fetchRegisteredClauseLogs(client as typeof publicClient, addr, registeredBy),
            fetchWithdrawnClauseLogs(client as typeof publicClient, addr),
        ])
            .then(([logs, withdrawn]) => {
                if (cancelled) return;
                const items = toRegisteredClauseEvents(logs, withdrawn);
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useRegisteredClausesByWallet] event read failed:", err);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [client, registeredBy, generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    const memoized = useMemo(() => ({ data, isLoading, refetch }), [data, isLoading, refetch]);
    return memoized;
}

/**
 * Read every `ClauseRegistered` event in the registry — the whole on-chain
 * clause set, unfiltered. Reads through the standalone `publicClient` so it works
 * on the marketing tier. `data` is `null` while the first read is in flight, then
 * the event list (empty = registry reachable but empty, or none configured).
 */
export function useAllRegisteredClauses() {
    const [data, setData] = useState<RegisteredClauseEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    /** True when the last registry read THREW — distinct from resolved-empty:
     *  an empty registry is absence (render it); a failed read is unknown
     *  (never report it as loaded). */
    const [failed, setFailed] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.clauseRegistry;
        if (!addr || addr.length !== 42) {
            setData([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setFailed(false);

        Promise.all([
            fetchRegisteredClauseLogs(publicClient, addr),
            fetchWithdrawnClauseLogs(publicClient, addr),
        ])
            .then(([logs, withdrawn]) => {
                if (cancelled) return;
                const items = toRegisteredClauseEvents(logs, withdrawn);
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useAllRegisteredClauses] event read failed:", err);
                setFailed(true);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return useMemo(() => ({ data, isLoading, failed, refetch }), [data, isLoading, failed, refetch]);
}

// ── Revert translation (pure — unit-tested) ──────────────────────────────────

/** Map a decoded `registerClause` error name (+ args) to a human-readable
 *  message, or null when unrecognized. Split from the viem extraction so it's
 *  testable without constructing a viem error. Mirrors the SHAPE of
 *  `translatePublishRevert` for assemblies. */
export function clauseRegisterRevertMessage(
    errorName: string | undefined,
    args: readonly unknown[] | undefined,
    clauseId: string,
): string | null {
    switch (errorName) {
        case "AlreadyRegistered":
            return `"${clauseId}" is already registered at this version. A clause's identity is (name, version) and registration is first-write-wins and immutable, so the same (name, version) always maps to one binding. Bump the spec's version to register a new one, or adopt the existing clause.`;
        case "WrongDeposit": {
            const provided = (args?.[0] as bigint | undefined)?.toString() ?? "?";
            const required = (args?.[1] as bigint | undefined)?.toString() ?? "?";
            return `Registration deposit mismatch (provided ${provided} wei, required ${required} wei). The deposit amount changed between the read and the send — retry.`;
        }
        case "EmptyClauseId":
            return "The spec has an empty clauseId.";
        case "EmptyContentURI":
            return "The IPFS pin returned an empty URI.";
        case "ZeroContentHash":
            return "Computed an empty content hash — the spec document is empty or malformed.";
        default:
            return null;
    }
}

/** Map a decoded `withdrawDeposit` error name to a human-readable message, or
 *  null when unrecognized. The commits==resolves gate is off-chain/advisory
 *  (`useWithdrawGate`), so these are the on-chain guards only: registeredBy-only,
 *  once-only, must-exist. Mirrors assembly `assemblyWithdrawRevertMessage`. */
export function clauseWithdrawRevertMessage(errorName: string | undefined): string | null {
    switch (errorName) {
        case "AlreadyWithdrawn":
            return "This clause's registration stake has already been reclaimed.";
        case "NotRegisteredBy":
            return "Only the wallet that registered this clause can reclaim its stake.";
        case "NotRegistered":
            return "No registration binding exists for this clause.";
        case "TransferFailed":
            return "The stake refund transfer failed. No state changed — retry.";
        default:
            return null;
    }
}

/** Extract the decoded revert from a viem error and route it through the pure
 *  register-message mapper; falls through to the original error. Internal —
 *  the pure `clauseRegisterRevertMessage` above is the unit-tested surface. */
function translateClauseRegisterRevert(err: unknown, clauseId: string): Error {
    if (err instanceof BaseError) {
        const revert = err.walk(
            (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | undefined;
        const message = clauseRegisterRevertMessage(
            revert?.data?.errorName,
            revert?.data?.args,
            clauseId,
        );
        if (message) return new Error(message);
    }
    return toError(err);
}

// ── Write hooks ──────────────────────────────────────────────────────────────

/** The confirmed outcome of a `registerClause` — the registered identity plus
 *  the anchored locator, enough to render a receipt and link to the live
 *  `/clauses` inventory where the clause now appears. */
export interface RegisterClauseOutcome {
    hash: `0x${string}`;
    clauseId: string;
    version: number;
    /** `keccak256(abi.encode(clauseId, version))` — the on-chain key. */
    idHash: `0x${string}`;
    contentURI: string;
}

/**
 * Register a clause on `ClauseRegistry.registerClause` (payable). Mirrors the
 * assembly publish flow (`usePublishAssembly`) for clauses: hash the RAW spec
 * document over the canonical form (INCLUDING `block` — the on-chain
 * `contentHash` covers it, so re-serializing a parsed spec would drop `block`
 * and change the hash), pin the raw document to IPFS, read the registry's
 * deposit ON DEMAND, simulate to surface a typed revert before opening the
 * wallet, send, then wait for a `success` receipt.
 *
 * The caller validates well-formedness via `@figaro-protocol/sdk/clauses`
 * (`parseClauseSpec`) BEFORE calling this — the same off-chain gate that runs
 * at sign-time. This hook takes the already-parsed raw document and does the
 * pin + anchor. Throws on any failure (no wallet, IPFS down, wrong deposit,
 * already-registered collision, on-chain revert).
 */
export function useRegisterClause() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, isPending } = useWriteContract();

    async function register(rawSpec: Record<string, unknown>): Promise<RegisterClauseOutcome> {
        const registry = getClauseRegistry();
        if (!registry) {
            throw new Error("ClauseRegistry address not configured (NEXT_PUBLIC_CLAUSE_REGISTRY).");
        }
        if (!client) throw new Error("No public client available to read the registration deposit.");
        if (!address) throw new Error("Connect a wallet before registering a clause.");

        const clauseId = rawSpec.clauseId as string;
        const version = Number(rawSpec.version);
        const idHash = computeClauseKey(clauseId, version);

        // Digest over the CANONICAL form (sorted keys) of the RAW document —
        // the convention populate-clauses.mjs anchors and loadClauseSpec
        // verifies after fetch. Pin the raw document (verification
        // re-canonicalizes, so the pinned byte order is irrelevant).
        const contentHash = canonicalContentHash(rawSpec);
        const { uri } = await DEFAULT_IPFS_SERVICE.publishJSON(rawSpec);

        // No reward tag is anchored: the 600M reward is UNIFORM (ratified
        // 2026-07-29) — every clause and assembly scores on its real usage
        // alone, with no category or weight — so the registry stores no
        // incentive input. The only classification a clause carries is
        // `block.design.article`, a reader grouping that stays off-chain
        // entirely.
        const deposit = await client.readContract({
            address: registry,
            abi: CLAUSE_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });

        const txHash = await publishTail({
            client,
            writeContractAsync,
            address: registry,
            abi: CLAUSE_REGISTRY_ABI as Abi,
            functionName: "registerClause",
            args: [clauseId, BigInt(version), contentHash, uri],
            value: deposit,
            account: address,
            translateRevert: (err) => translateClauseRegisterRevert(err, clauseId),
            failureMessage: "The clause was not registered.",
        });
        return { hash: txHash, clauseId, version, idHash, contentURI: uri };
    }

    return { register, isPending };
}

/**
 * Reclaim a clause's registration stake (`ClauseRegistry.withdrawDeposit`).
 * Mirrors `useWithdrawAssembly` exactly: the binding is permanent — withdraw
 * only moves the deposit and de-surfaces the clause for NEW compositions;
 * committed agreements keep resolving the clause. Gating on in-flight deals is
 * the caller's job via `useWithdrawGate` (advisory, off-chain); this hook is the
 * plain registeredBy-only write. Simulates first to surface a typed revert before
 * opening the wallet, sends, then waits for a `success` receipt. Throws on any
 * failure.
 */
export const useWithdrawClause = createUseWithdrawStake({
    getRegistry: getClauseRegistry,
    abi: CLAUSE_REGISTRY_ABI,
    notConfiguredMessage: "ClauseRegistry address not configured (NEXT_PUBLIC_CLAUSE_REGISTRY).",
    revertMessage: clauseWithdrawRevertMessage,
});

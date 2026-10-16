/**
 * useAgreementRegistry — on-chain hooks for the `AgreementRegistry`. Parallel
 * to `useAssemblyRegistry` (assemblies) and the clause-registry wiring
 * (clauses) per the separation-of-concerns doctrine: the agreement family has
 * its own anchor, its own events and its own reader.
 *
 * This is the thin on-chain layer: the registry-address resolution, the
 * event-derived read hook, the revert translators, the withdraw hook, and the
 * one reader of a registered agreement — `fetchComposedAgreement`, which reads
 * the binding BY KEY (whatever its stake: bindings are never cleared, so an
 * assembly composed from an agreement keeps working after its stake is
 * reclaimed), fetches the pinned document from IPFS, and verifies it against
 * the key (`anchorComposedAgreement`). `hydrateAssemblyTemplate` runs the SDK's
 * `hydrateAssembly` over that reader: an assembly is offered only when every
 * order slot's agreement reads and verifies — any absence is the assembly's
 * absence, never a fallback to another copy.
 */

import { useMemo, useSyncExternalStore } from "react";
import {
    AGREEMENT_REGISTRY_ABI,
    anchorComposedAgreement,
    hydrateAssembly,
    parseAgreementRegistryLogs,
    type Anchored,
    type AssemblyTemplate,
    type ComposedAgreement,
    type HydratedAssembly,
} from "@figaro-protocol/sdk";
import { isValidAddress } from "@/lib/shared/evm";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { DEFAULT_IPFS_SERVICE, fetchCappedContent } from "@/lib/shared/ipfsService";
import { publicClient } from "@/lib/shared/wagmi";
import {
    createUseWithdrawStake,
    translateContractRevert,
    withdrawRevertMessage,
} from "@/lib/protocol/useWithdrawStake";
import { createRegistryEventScan } from "@/lib/protocol/registryEventScan";

export function getAgreementRegistry(): `0x${string}` | null {
    const a = CONTRACTS.agreementRegistry;
    return isValidAddress(a) ? a : null;
}

/** One registered agreement, reconstructed from an `AgreementRegistered`
 *  event; `stakeWithdrawn` folds the registry's `DepositWithdrawn` events. */
export interface PublishedAgreement {
    agreementKey: `0x${string}`;
    registeredBy: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    stakeWithdrawn: boolean;
}

/** Map an `AgreementRegistry.registerAgreement` revert into a readable Error. */
export function translateAgreementRegisterRevert(err: unknown, agreementKey: string): Error {
    return translateContractRevert(err, (name, args) => {
        switch (name) {
            case "AgreementAlreadyRegistered":
                return `Agreement ${agreementKey} is already registered — the same clauses always key to one registration; bind the existing one.`;
            case "ReservedKeyIsNotARegistration":
                return `${agreementKey} is a reserved format key, never an agreement.`;
            case "WrongDeposit": {
                const provided = (args?.[0] as bigint | undefined)?.toString() ?? "?";
                const required = (args?.[1] as bigint | undefined)?.toString() ?? "?";
                return `Registration stake mismatch (provided ${provided} wei, required ${required} wei). The stake amount changed between the read and the send — retry.`;
            }
            case "EmptyContentURI":
                return "The IPFS pin returned an empty URI.";
            case "ZeroAgreementKey":
                return "Computed an empty agreement key.";
            default:
                return null;
        }
    });
}

/** Reclaim an agreement's registration stake (`AgreementRegistry.withdrawDeposit`).
 *  The binding is permanent; withdraw de-surfaces the agreement for new
 *  compositions while every assembly already composed from it keeps reading it.
 *  @public pending consumer: the designer of record's reclaim affordance,
 *  gated by `useWithdrawGate({ kind: "agreement", agreementKey })`. */
export const useWithdrawAgreement = createUseWithdrawStake({
    getRegistry: getAgreementRegistry,
    abi: AGREEMENT_REGISTRY_ABI,
    notConfiguredMessage: "AgreementRegistry address not configured (NEXT_PUBLIC_AGREEMENT_REGISTRY).",
    revertMessage: withdrawRevertMessage("agreement"),
});

const useAgreementRegistryScan = createRegistryEventScan<PublishedAgreement>({
    getRegistry: getAgreementRegistry,
    abi: AGREEMENT_REGISTRY_ABI,
    registeredEventName: "AgreementRegistered",
    withdrawnEventName: "DepositWithdrawn",
    label: "usePublishedAgreements",
    toRows: (registeredLogs, withdrawnLogs) => {
        const withdrawn = new Set(
            parseAgreementRegistryLogs(withdrawnLogs).withdrawn.map((w) => w.agreementKey.toLowerCase()),
        );
        const items: PublishedAgreement[] = parseAgreementRegistryLogs(registeredLogs).registered.map((row) => ({
            agreementKey: row.agreementKey,
            registeredBy: row.registeredBy,
            contentURI: row.contentURI,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: (row.transactionHash ?? "0x") as `0x${string}`,
            stakeWithdrawn: withdrawn.has(row.agreementKey.toLowerCase()),
        }));
        items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        return items;
    },
});

/** Every registered agreement, most recent first. The network-wide read drops
 *  withdrawn stakes (withdraw = de-surface: the drawer offers only LIVE
 *  agreements for a new composition); a wallet-scoped read, or
 *  `includeWithdrawn`, keeps them flagged. */
export function usePublishedAgreements(
    registeredBy: `0x${string}` | undefined,
    opts?: { includeWithdrawn?: boolean },
) {
    const scan = useAgreementRegistryScan({ registeredBy });
    const keep = !!registeredBy || !!opts?.includeWithdrawn;
    const data = useMemo(
        () => (scan.data && !keep ? scan.data.filter((i) => !i.stakeWithdrawn) : scan.data),
        [scan.data, keep],
    );
    return { ...scan, data };
}

/** The registry's binding for one key, read at the edge. Null when the key is
 *  not bound (resolved-empty), the registry is not configured, or the read
 *  fails. */
export async function readAgreementBinding(
    agreementKey: `0x${string}`,
    client: Pick<typeof publicClient, "readContract"> = publicClient,
): Promise<{ registeredBy: `0x${string}`; registeredAt: bigint; stakeWithdrawn: boolean; contentURI: string } | null> {
    const registry = getAgreementRegistry();
    if (!registry) return null;
    try {
        const [registeredBy, registeredAt, stakeWithdrawn, contentURI] = (await client.readContract({
            address: registry,
            abi: AGREEMENT_REGISTRY_ABI,
            functionName: "bindings",
            args: [agreementKey],
        })) as readonly [`0x${string}`, bigint, boolean, string];
        if (registeredAt === 0n || !contentURI) return null;
        return { registeredBy, registeredAt, stakeWithdrawn, contentURI };
    } catch {
        return null;
    }
}

// ── The verified documents this tab has read (session cache) ──────────────

const verified = new Map<string, Anchored<ComposedAgreement>>();
const inflight = new Map<string, Promise<Anchored<ComposedAgreement> | null>>();
let verifiedVersion = 0;
const listeners = new Set<() => void>();
/** PERMANENT failures, by key: the bytes the binding points at were fetched
 *  and are not the agreement the key names (not JSON, or keying elsewhere).
 *  A gateway miss keeps nothing and is read again; this is never re-read. */
const loadErrors = new Map<string, string>();

/** The permanent load failure recorded for an agreement key, if any — the
 *  document behind the binding was served and is not the agreement. */
export function getComposedAgreementLoadError(agreementKey: string): string | undefined {
    return loadErrors.get(agreementKey.toLowerCase());
}

function noteVerified(): void {
    verifiedVersion += 1;
    for (const l of listeners) l();
}

/** The registered agreement for a key, when this tab has read and verified it
 *  — the synchronous face the design-time build reads (`snapshotToAssemblyTemplate`),
 *  as the clause build reads the warm spec cache. Undefined while unread. */
export function getComposedAgreement(agreementKey: string): Anchored<ComposedAgreement> | undefined {
    return verified.get(agreementKey.toLowerCase());
}

/** Bumps each time a registered agreement is read and verified in this tab —
 *  a surface that reads `getComposedAgreement` re-derives on it. */
export function useComposedAgreementsVersion(): number {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => {
                listeners.delete(l);
            };
        },
        () => verifiedVersion,
        () => verifiedVersion,
    );
}

/** The pinned document at `contentURI`, verified against `agreementKey`, or
 *  null (unreachable, not JSON, or not the agreement the key names). */
async function fetchAgreementDocument(
    contentURI: string,
    agreementKey: `0x${string}`,
): Promise<Anchored<ComposedAgreement> | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(contentURI);
    if (!url) return null;
    try {
        const response = await fetchCappedContent(url);
        if (!response.ok) return null;
        const doc = anchorComposedAgreement(await response.text(), agreementKey);
        if (doc === null) {
            const detail = `integrity failure at ${contentURI}: the document is not the agreement the key ${agreementKey} names`;
            console.warn(`[fetchComposedAgreement] ${detail} — dropping`);
            loadErrors.set(agreementKey.toLowerCase(), detail);
            noteVerified();
        }
        return doc;
    } catch {
        return null;
    }
}

/**
 * Read one registered agreement: the `AgreementRegistry` binding by key (any
 * stake state), the pinned document at its `contentURI`, verified against the
 * key. Null is ABSENCE — no binding, a failed fetch, a failed parse or a key
 * mismatch — and nothing falls back to another copy. A verified document is
 * kept for the session (`getComposedAgreement`); concurrent reads of one key
 * share one fetch.
 */
export async function fetchComposedAgreement(
    agreementKey: `0x${string}`,
    contentURI?: string,
): Promise<Anchored<ComposedAgreement> | null> {
    const key = agreementKey.toLowerCase();
    const known = verified.get(key);
    if (known) return known;
    if (loadErrors.has(key)) return null;
    const pending = inflight.get(key);
    if (pending) return pending;
    const run = (async () => {
        try {
            const uri = contentURI ?? (await readAgreementBinding(agreementKey))?.contentURI;
            if (!uri) return null;
            const doc = await fetchAgreementDocument(uri, agreementKey);
            if (doc) {
                verified.set(key, doc);
                noteVerified();
            }
            return doc;
        } finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, run);
    return run;
}

/** Hydrate an anchored template: every order slot's registered agreement read
 *  through `fetchComposedAgreement` and verified against its key. Null when
 *  any order slot's agreement is absent — the assembly is not offered. */
export function hydrateAssemblyTemplate(
    template: Anchored<AssemblyTemplate> | AssemblyTemplate,
): Promise<HydratedAssembly | null> {
    return hydrateAssembly(template, (agreementKey) => fetchComposedAgreement(agreementKey));
}

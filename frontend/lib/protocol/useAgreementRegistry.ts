/**
 * useAgreementRegistry — on-chain hooks for the `AgreementRegistry`. Parallel
 * to `useAssemblyRegistry` (assemblies) and the clause-registry wiring
 * (clauses) per the separation-of-concerns doctrine: the agreement family has
 * its own anchor, its own events and its own reader.
 *
 * This is the thin on-chain layer: the registry-address resolution, the
 * event-derived read hook, the revert translators, the withdraw hook, and the
 * one reader of a registered agreement — `fetchRegisteredAgreement`, which reads
 * the binding BY KEY (whatever its stake: bindings are never cleared, so an
 * assembly composed from an agreement keeps working after its stake is
 * reclaimed), fetches the pinned document from IPFS, and verifies it against
 * the key (`anchorRegisteredAgreement`). `hydrateAnchoredAssembly` runs the SDK's
 * `hydrateAssembly` over that reader: an assembly is offered only when every
 * agreement's agreement reads and verifies — any absence is the assembly's
 * absence, never a fallback to another copy.
 */

import { useSyncExternalStore } from "react";
import {
    AGREEMENT_REGISTRY_ABI,
    agreementHashOf,
    anchorRegisteredAgreement,
    canonicalize,
    hydrateAssembly,
    parseAgreementRegistryLogs,
    type Anchored,
    type Assembly,
    type RegisteredAgreement,
    type HydratedAssembly,
} from "@figaro-protocol/sdk";
import { isValidAddress } from "@/lib/shared/evm";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { publicClient } from "@/lib/shared/wagmi";
import {
    createUseWithdrawStake,
    sharedRegisterRevertMessage,
    translateContractRevert,
    withdrawRevertMessage,
} from "@/lib/protocol/useWithdrawStake";
import { createRegistryEventScan, useDesurfaced } from "@/lib/protocol/registryEventScan";
import { fetchPinnedDocument, readRegistryBinding } from "@/lib/protocol/registryDocument";

export function getAgreementRegistry(): `0x${string}` | null {
    const a = CONTRACTS.agreementRegistry;
    return isValidAddress(a) ? a : null;
}

/** One registered agreement, reconstructed from an `AgreementRegistered`
 *  event; `stakeWithdrawn` folds the registry's `DepositWithdrawn` events. */
export interface PublishedAgreement {
    agreementHash: `0x${string}`;
    registeredBy: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    stakeWithdrawn: boolean;
}

/** Map an `AgreementRegistry.registerAgreement` revert into a readable Error. */
export function translateAgreementRegisterRevert(err: unknown, agreementHash: string): Error {
    return translateContractRevert(err, (name, args) => {
        switch (name) {
            case "AgreementAlreadyRegistered":
                return `Agreement ${agreementHash} is already registered — the same clauses always key to one registration; bind the existing one.`;
            case "ReservedKeyIsNotARegistration":
                return `${agreementHash} is a reserved format key, never an agreement.`;
            case "ZeroAgreementHash":
                return "Computed an empty agreement hash.";
            default:
                return sharedRegisterRevertMessage(name, args);
        }
    });
}

/** Reclaim an agreement's registration stake (`AgreementRegistry.withdrawDeposit`).
 *  The binding is permanent; withdraw de-surfaces the agreement for new
 *  compositions while every assembly already composed from it keeps reading it.
 *  Consumed by `RegisteredAgreementsReclaim` on the designer landing (gated per
 *  row by `useWithdrawGate({ kind: "agreement", agreementHash })`). */
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
            parseAgreementRegistryLogs(withdrawnLogs).withdrawn.map((w) => w.agreementHash.toLowerCase()),
        );
        const items: PublishedAgreement[] = parseAgreementRegistryLogs(registeredLogs).registered.map((row) => ({
            agreementHash: row.agreementHash,
            registeredBy: row.registeredBy,
            contentURI: row.contentURI,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: (row.transactionHash ?? "0x") as `0x${string}`,
            stakeWithdrawn: withdrawn.has(row.agreementHash.toLowerCase()),
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
    return useDesurfaced(useAgreementRegistryScan({ registeredBy }), registeredBy, opts);
}

/** The registry's binding for one key, read at the edge. Null when the key is
 *  not bound (resolved-empty), the registry is not configured, or the read
 *  fails. */
export async function readAgreementBinding(
    agreementHash: `0x${string}`,
    client: Pick<typeof publicClient, "readContract"> = publicClient,
): Promise<{ registeredBy: `0x${string}`; registeredAt: bigint; stakeWithdrawn: boolean; contentURI: string } | null> {
    const registry = getAgreementRegistry();
    if (!registry) return null;
    const binding = await readRegistryBinding(registry, AGREEMENT_REGISTRY_ABI, agreementHash, client);
    if (!binding) return null;
    const [registeredBy, registeredAt, stakeWithdrawn, contentURI] = binding;
    return { registeredBy, registeredAt, stakeWithdrawn, contentURI };
}

// ── The verified documents this tab has read (session cache) ──────────────

const verified = new Map<string, Anchored<RegisteredAgreement>>();
const inflight = new Map<string, Promise<Anchored<RegisteredAgreement> | null>>();
let verifiedVersion = 0;
const listeners = new Set<() => void>();
/** PERMANENT failures, by key: the bytes the binding points at were fetched
 *  and are not the agreement the key names (not JSON, or keying elsewhere).
 *  A gateway miss keeps nothing and is read again; this is never re-read. */
const loadErrors = new Map<string, string>();

/** The permanent load failure recorded for an agreement hash, if any — the
 *  document behind the binding was served and is not the agreement. */
export function getRegisteredAgreementLoadError(agreementHash: string): string | undefined {
    return loadErrors.get(agreementHash.toLowerCase());
}

function noteVerified(): void {
    verifiedVersion += 1;
    for (const l of listeners) l();
}

/** The registered agreement for a key, when this tab has read and verified it
 *  — the synchronous face the design-time build reads (`snapshotToAssembly`),
 *  as the clause build reads the warm spec cache. Undefined while unread. */
export function getRegisteredAgreement(agreementHash: string): Anchored<RegisteredAgreement> | undefined {
    return verified.get(agreementHash.toLowerCase());
}

/** Test-only — put a registered agreement into this tab's verified cache, as
 *  a read of its binding and pinned document would: verified against its own
 *  key (`anchorRegisteredAgreement` over its canonical bytes). Returns the key. */
export function _primeRegisteredAgreement_TESTING_ONLY(doc: RegisteredAgreement): `0x${string}` {
    const agreementHash = agreementHashOf(doc);
    const anchored = anchorRegisteredAgreement(canonicalize(doc), agreementHash);
    if (!anchored) throw new Error(`the document does not verify against its key ${agreementHash}`);
    verified.set(agreementHash.toLowerCase(), anchored);
    noteVerified();
    return agreementHash;
}

/** Bumps each time a registered agreement is read and verified in this tab —
 *  a surface that reads `getRegisteredAgreement` re-derives on it. */
export function useRegisteredAgreementsVersion(): number {
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

/** The pinned document at `contentURI`, verified against `agreementHash`, or
 *  null (unreachable, not JSON, or not the agreement the key names). */
async function fetchAgreementDocument(
    contentURI: string,
    agreementHash: `0x${string}`,
): Promise<Anchored<RegisteredAgreement> | null> {
    return fetchPinnedDocument(
        contentURI,
        (text) => anchorRegisteredAgreement(text, agreementHash),
        () => {
            const detail = `integrity failure at ${contentURI}: the document is not the agreement the key ${agreementHash} names`;
            console.warn(`[fetchRegisteredAgreement] ${detail} — dropping`);
            loadErrors.set(agreementHash.toLowerCase(), detail);
            noteVerified();
        },
    );
}

/**
 * Read one registered agreement: the `AgreementRegistry` binding by key (any
 * stake state), the pinned document at its `contentURI`, verified against the
 * key. Null is ABSENCE — no binding, a failed fetch, a failed parse or a key
 * mismatch — and nothing falls back to another copy. A verified document is
 * kept for the session (`getRegisteredAgreement`); concurrent reads of one key
 * share one fetch.
 */
export async function fetchRegisteredAgreement(
    agreementHash: `0x${string}`,
    contentURI?: string,
): Promise<Anchored<RegisteredAgreement> | null> {
    const key = agreementHash.toLowerCase();
    const known = verified.get(key);
    if (known) return known;
    if (loadErrors.has(key)) return null;
    const pending = inflight.get(key);
    if (pending) return pending;
    const run = (async () => {
        try {
            const uri = contentURI ?? (await readAgreementBinding(agreementHash))?.contentURI;
            if (!uri) return null;
            const doc = await fetchAgreementDocument(uri, agreementHash);
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

/** Hydrate an anchored assembly: every agreement's registered agreement read
 *  through `fetchRegisteredAgreement` and verified against its key. Null when
 *  any agreement's agreement is absent — the assembly is not offered. */
export function hydrateAnchoredAssembly(
    assembly: Anchored<Assembly> | Assembly,
): Promise<HydratedAssembly | null> {
    return hydrateAssembly(assembly, (agreementHash) => fetchRegisteredAgreement(agreementHash));
}

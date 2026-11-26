/**
 * lib/agent/useDidWeb.ts — React hooks for W3C did:web resolution + an on-chain
 * address consistency check: the frontend's agent-integration surface over the
 * SDK's did:web extension.
 *
 * A DID document naming an address proves only that whoever hosts the document
 * CLAIMS that address — anyone can host a did:web document naming any wallet.
 * So this surface reports CONSISTENCY (the document names this wallet), never
 * "verified": the binding is attacker-forgeable and is a discovery signal, not
 * proof the wallet controls the DID.
 *
 * ALL did:web logic — resolution algorithm, URL derivation, document validation,
 * Ethereum-address extraction, and the DID Document types — lives ONCE in
 * `@figaro-protocol/sdk/agent` (`sdk/src/agent/did.ts`). This file is ONLY the
 * React-state wrapper; it re-implements nothing.
 */
import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import {
    resolveDidWeb,
    didDocumentMatchesAddress,
    isDidWeb,
    type DIDDocument,
} from "@figaro-protocol/sdk/agent";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";
import { applyUntilCleanup } from "@/lib/shared/networkRead";

export type { DIDDocument };

/**
 * Agent-integration surface. Resolve a did:web identifier to its DID
 * Document. Returns `{ document, error, isLoading }`. Consumed by
 * `useDidConsistency` (and available directly for other resolution surfaces).
 */
// lint-allow-duplicate-symbol: the hook that resolves a did:web identifier to the SDK's DIDDocument
export function useDidDocument(did: string | undefined) {
    const [document, setDocument] = useState<DIDDocument | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // The synchronous resets run during render, on the render `did` changes
    // (`useDepsChanged`); the effect resolves only.
    const didChanged = useDepsChanged([did]);
    if (didChanged) {
        if (!did || !isDidWeb(did)) {
            setDocument(null);
            setError(did ? `Not a did:web identifier: ${did}` : null);
        } else {
            setIsLoading(true);
            setError(null);
        }
    }

    useEffect(() => {
        if (!did || !isDidWeb(did)) return;

        const resolution = resolveDidWeb(did).then(
            (result) => ({ resolved: true as const, result }),
            (e: unknown) => ({ resolved: false as const, message: extractErrorMessage(e, String(e)) }),
        );
        return applyUntilCleanup(resolution, (outcome) => {
            if (outcome.resolved) {
                setDocument(outcome.result.document);
                setError(outcome.result.error);
            } else {
                setError(outcome.message);
            }
            setIsLoading(false);
        });
    }, [did]);

    return { document, error, isLoading };
}

/**
 * Resolve a did:web identifier and check whether its DID Document names
 * `address` (via a verification method) on the current chain. Returns
 * `{ document, consistent, error, isLoading }` — `consistent` means the
 * document names this wallet, NOT that the wallet controls the DID (the binding
 * is attacker-forgeable; see the module header). Consumed by
 * `MemberAgentIdentity`.
 */
export function useDidConsistency(
    did: string | undefined,
    address: string | undefined,
) {
    const chainId = useChainId();
    const { document, error, isLoading } = useDidDocument(did);
    const consistent = !!document && !!address && didDocumentMatchesAddress(document, address, chainId);

    return { document, consistent, error, isLoading };
}

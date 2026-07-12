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
 * `@figaro/sdk/agent` (`sdk/src/agent/did.ts`). This file is ONLY the
 * React-state wrapper; it re-implements nothing.
 */
import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import {
    resolveDidWeb,
    didDocumentMatchesAddress,
    isDidWeb,
    type DIDDocument,
} from "@figaro/sdk/agent";
import { extractErrorMessage } from "@/lib/shared/errors";

export type { DIDDocument };

/**
 * @public — agent-integration surface. Resolve a did:web identifier to its DID
 * Document. Returns `{ document, error, isLoading }`. Consumed by
 * `useDidConsistency` (and available directly for other resolution surfaces).
 */
export function useDidDocument(did: string | undefined) {
    const [document, setDocument] = useState<DIDDocument | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!did || !isDidWeb(did)) {
            setDocument(null);
            setError(did ? `Not a did:web identifier: ${did}` : null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        resolveDidWeb(did).then((result) => {
            if (cancelled) return;
            setDocument(result.document);
            setError(result.error);
            setIsLoading(false);
        }).catch((e) => {
            if (cancelled) return;
            setError(extractErrorMessage(e, String(e)));
            setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [did]);

    return { document, error, isLoading };
}

/**
 * Resolve a did:web identifier and check whether its DID Document names
 * `address` (via a verification method) on the current chain. Returns
 * `{ document, consistent, error, isLoading }` — `consistent` means the
 * document names this wallet, NOT that the wallet controls the DID (the binding
 * is attacker-forgeable; see the module header). Consumed by
 * `SellerAgentIdentity`.
 */
export function useDidConsistency(
    did: string | undefined,
    address: string | undefined,
) {
    const chainId = useChainId();
    const { document, error, isLoading } = useDidDocument(did);
    const [consistent, setConsistent] = useState(false);

    useEffect(() => {
        setConsistent(
            !!document && !!address && didDocumentMatchesAddress(document, address, chainId),
        );
    }, [document, address, chainId]);

    return { document, consistent, error, isLoading };
}

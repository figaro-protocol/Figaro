/**
 * lib/agent/useDidWeb.ts — React hooks for W3C did:web resolution + on-chain
 * identity verification: the frontend's agent-integration surface over the SDK's
 * did:web extension.
 *
 * ALL did:web logic — resolution algorithm, URL derivation, document validation,
 * Ethereum-address extraction, and the DID Document types — lives ONCE in
 * `@figaro/core/agent` (`sdk/src/agent/did.ts`). This file is ONLY the
 * React-state wrapper; it re-implements nothing.
 */
import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import {
    resolveDidWeb,
    didDocumentMatchesAddress,
    isDidWeb,
    type DIDDocument,
} from "@figaro/core/agent";
import { extractErrorMessage } from "@/lib/shared/errors";

export type { DIDDocument };

/**
 * @public — agent-integration surface (pending consumer). Resolve a did:web
 * identifier to its DID Document. Returns `{ document, error, isLoading }`.
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
 * @public — agent-integration surface (pending consumer). Resolve a did:web
 * identifier and verify it contains a verification method matching `address` on
 * the current chain. Returns `{ document, verified, error, isLoading }`.
 */
export function useDidVerification(
    did: string | undefined,
    address: string | undefined,
) {
    const chainId = useChainId();
    const { document, error, isLoading } = useDidDocument(did);
    const [verified, setVerified] = useState(false);

    useEffect(() => {
        setVerified(
            !!document && !!address && didDocumentMatchesAddress(document, address, chainId),
        );
    }, [document, address, chainId]);

    return { document, verified, error, isLoading };
}

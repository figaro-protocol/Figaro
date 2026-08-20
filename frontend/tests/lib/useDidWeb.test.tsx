import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useDidConsistency } from "@/lib/agent/useDidWeb";

// The did:web binding is attacker-forgeable, so the hook reports CONSISTENCY
// (the DID document names this wallet), never "verified". These tests pin that
// renamed result shape and the consistent / inconsistent outcomes.

const ADDR = "0x89a932207c485f85226d86f7cd486a89a24fcc12";
const OTHER = "0x0000000000000000000000000000000000000001";

const doc = {
    "@context": "https://www.w3.org/ns/did/v1",
    id: "did:web:example.com",
    verificationMethod: [
        {
            id: "did:web:example.com#controller",
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: "did:web:example.com",
            blockchainAccountId: `eip155:1:${ADDR}`,
        },
    ],
};

vi.mock("wagmi", () => ({ useChainId: () => 1 }));

// Keep the real didDocumentMatchesAddress / isDidWeb; only stub the network fetch.
vi.mock("@figaro-protocol/sdk/agent", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@figaro-protocol/sdk/agent")>();
    return {
        ...actual,
        isDidWeb: () => true,
        resolveDidWeb: vi.fn(() => Promise.resolve({ document: doc, error: null })),
    };
});

describe("useDidConsistency", () => {
    let hookResult: ReturnType<typeof useDidConsistency> | null = null;

    beforeEach(() => {
        hookResult = null;
    });

    function Harness({ address }: { address: string }) {
        hookResult = useDidConsistency("did:web:example.com", address);
        return null;
    }

    it("exposes a consistency-check result shape (no verified-language)", async () => {
        render(<Harness address={ADDR} />);
        await waitFor(() => expect(hookResult?.consistent).toBe(true));
        expect(hookResult).toHaveProperty("consistent");
        expect(hookResult).toHaveProperty("document");
        expect(hookResult).toHaveProperty("error");
        expect(hookResult).toHaveProperty("isLoading");
        // The forgeable-binding downgrade means the old key must be gone.
        expect(hookResult).not.toHaveProperty("verified");
    });

    it("reports consistent when the DID document names the wallet", async () => {
        render(<Harness address={ADDR} />);
        await waitFor(() => expect(hookResult?.consistent).toBe(true));
    });

    it("reports inconsistent when the DID document does not name the wallet", async () => {
        render(<Harness address={OTHER} />);
        await waitFor(() => expect(hookResult?.document).toEqual(doc));
        expect(hookResult?.consistent).toBe(false);
    });
});

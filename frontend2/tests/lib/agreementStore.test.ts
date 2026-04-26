import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOrderAgreement } from "@/lib/core/orderAgreement";
import {
    deleteAgreement,
    hydrateAgreement,
    loadAgreement,
    loadAgreementUri,
    publishAgreement,
    primeAgreementArtifact,
    saveAgreement,
    saveAgreementUri,
} from "@/lib/core/agreementStore";
import { computeAgreementHash } from "@/lib/core/agreementManifest";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

function makeAgreement() {
    // Category-2 manifest values must match the SDK encoder enums so
    // getSectionDataBytes can ABI-encode them for merkle-leaf hashing.
    return buildOrderAgreement({
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        payment: 10n,
        lineItems: [
            {
                itemId: "meal-1",
                name: "Lunch",
                quantity: 2,
                unitPrice: "5",
            },
        ],
        manifestFields: {
            origin: "dr5reg",
            destination: "dr5reh",
            fulfilmentMethod: "delivery",
            handoffMode: "face-to-face",
        },
    });
}

describe("agreementStore", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith("figaro:agreement:") || key?.startsWith("figaro:agreement-uri:")) {
                localStorage.removeItem(key);
            }
        }
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("saves and reloads an agreement with a publication URI", () => {
        const agreement = makeAgreement();
        const agreementHash = saveAgreement(agreement, { uri: "ipfs://bafy-agreement" });

        expect(loadAgreement(agreementHash)).toEqual(agreement);
        expect(loadAgreementUri(agreementHash)).toBe("ipfs://bafy-agreement");
    });

    it("hydrates a missing agreement from its published URI and validates the hash", async () => {
        const agreement = makeAgreement();
        const agreementHash = computeAgreementHash(agreement);
        saveAgreementUri(agreementHash, "ipfs://bafy-agreement");

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => agreement,
        } as Response);

        const loaded = await hydrateAgreement(agreementHash);
        expect(loaded).toEqual(agreement);
        expect(loadAgreement(agreementHash)).toEqual(agreement);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it("discovers a published agreement URI from the public registry when no local hint exists", async () => {
        const agreement = makeAgreement();
        const agreementHash = computeAgreementHash(agreement);

        globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.endsWith(`/api/semantic/agreements/${agreementHash}`)) {
                return {
                    ok: true,
                    json: async () => ({ agreementHash, uri: "ipfs://bafy-agreement" }),
                } as Response;
            }

            if (url.includes("/ipfs/bafy-agreement")) {
                return {
                    ok: true,
                    json: async () => agreement,
                } as Response;
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        const loaded = await hydrateAgreement(agreementHash);

        expect(loaded).toEqual(agreement);
        expect(loadAgreementUri(agreementHash)).toBe("ipfs://bafy-agreement");
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("publishes through an injected evidence transport service", async () => {
        const agreement = makeAgreement();
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

        const evidenceTransport = {
            pinJSON: vi.fn().mockResolvedValue("bafy-injected-agreement"),
            buildURI: vi.fn().mockReturnValue("ipfs://bafy-injected-agreement"),
            resolveFetchUrl: vi.fn(),
        };

        const published = await publishAgreement(agreement, {
            evidenceTransport: evidenceTransport as never,
        });

        expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(agreement);
        expect(evidenceTransport.buildURI).toHaveBeenCalledWith("bafy-injected-agreement");
        expect(published.uri).toBe("ipfs://bafy-injected-agreement");
    });

    it("hydrates through an injected evidence transport service", async () => {
        const agreement = makeAgreement();
        const agreementHash = computeAgreementHash(agreement);
        saveAgreementUri(agreementHash, "ipfs://bafy-injected-agreement");

        const evidenceTransport = {
            pinJSON: vi.fn(),
            buildURI: vi.fn(),
            resolveFetchUrl: vi.fn().mockReturnValue("https://gateway.example/ipfs/bafy-injected-agreement"),
        };
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => agreement,
        } as Response);

        const loaded = await hydrateAgreement(agreementHash, undefined, {
            evidenceTransport: evidenceTransport as never,
        });

        expect(evidenceTransport.resolveFetchUrl).toHaveBeenCalledWith("ipfs://bafy-injected-agreement");
        expect(globalThis.fetch).toHaveBeenCalledWith(
            "https://gateway.example/ipfs/bafy-injected-agreement",
            { method: "GET" },
        );
        expect(loaded).toEqual(agreement);
    });

    it("rejects a shared inline agreement when it does not match the commitment hash", async () => {
        const agreement = makeAgreement();
        const otherAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 99n,
        });

        await expect(
            primeAgreementArtifact({
                agreementHash: computeAgreementHash(agreement),
                agreement: otherAgreement,
            }),
        ).rejects.toThrow("Shared agreement artifact does not match commitment agreementHash");
    });

    it("deletes both the agreement body and the publication URI", () => {
        const agreement = makeAgreement();
        const agreementHash = saveAgreement(agreement, { uri: "ipfs://bafy-agreement" });

        deleteAgreement(agreementHash);

        expect(loadAgreement(agreementHash)).toBeNull();
        expect(loadAgreementUri(agreementHash)).toBeNull();
    });
});

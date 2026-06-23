import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { computeAgreementHash } from "@/lib/core/agreement";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";
import { cf } from "./__fixtures__/clauseFields";
import { primeClauseSpecs } from "./primeClauseSpecs";

// The generic build encoder reads field shapes/defaults from the chain-fed
// spec cache (warmed app-wide by ClauseSpecsLoader in production).
beforeAll(async () => {
    await primeClauseSpecs();
});

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

function makeAgreement() {
    // cross-checked assemblyTemplate values must match the SDK encoder enums so
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
        clauseFields: cf({
            originGeohash: "dr5reg",
            destinationGeohash: "dr5reh",
            modality: "delivery",
            coordination: "seller-assigned",
            handoffPoints: ["face-to-face"],
        }),
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
            text: async () => JSON.stringify(agreement),
        } as Response);

        const loaded = await hydrateAgreement(agreementHash);
        expect(loaded).toEqual(agreement);
        expect(loadAgreement(agreementHash)).toEqual(agreement);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it("returns null when hydrating a hash with no local URI hint", async () => {
        // Post-drift-removal: hydrateAgreement no longer falls back to a
        // server-side registry. A wallet that didn't witness the order
        // (no localStorage entry, no explicitUri arg) cannot hydrate it.
        // That's correct event-driven behavior — the URI travels with the
        // CommitmentPayload via XMTP; non-participants don't have it.
        const agreement = makeAgreement();
        const agreementHash = computeAgreementHash(agreement);

        globalThis.fetch = vi.fn();

        const loaded = await hydrateAgreement(agreementHash);

        expect(loaded).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
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
            text: async () => JSON.stringify(agreement),
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

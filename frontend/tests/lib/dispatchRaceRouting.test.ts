/**
 * The race's profile-keyed endpoint routing (channel-seam ruling 2026-08-14,
 * the DID residual closed 2026-08-20): a declared did:web routes through the
 * DID-VERIFYING resolver, and a DID that fails verification yields NO
 * endpoint — never a fallback to the raw `services.rest` it was supposed to
 * vouch for.
 */

import { describe, it, expect } from "vitest";
import { resolveAgentEndpoint } from "@/lib/checkout/dispatchRace";

const CANDIDATE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const CHAIN_ID = 11155111;
const DID = "did:web:agent.example";

function didDocument({ address = CANDIDATE as string, services = true } = {}) {
    return {
        "@context": "https://www.w3.org/ns/did/v1",
        id: DID,
        verificationMethod: [{
            id: `${DID}#eth`,
            type: "EcdsaSecp256k1RecoveryMethod2020",
            controller: DID,
            blockchainAccountId: `eip155:${CHAIN_ID}:${address}`,
        }],
        ...(services ? {
            service: [{
                id: `${DID}#rest`,
                type: "RESTEndpoint",
                serviceEndpoint: "https://agent.example/offers",
            }],
        } : {}),
    };
}

function fetchServing(document: unknown): typeof fetch {
    return (async () => new Response(JSON.stringify(document), {
        status: 200,
        headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const fetchFailing: typeof fetch = async () => { throw new Error("host unreachable"); };

describe("resolveAgentEndpoint — the profile-keyed rule", () => {
    it("no services, or no endpoint declaration, yields no endpoint (relay candidate)", async () => {
        expect(await resolveAgentEndpoint(undefined, CANDIDATE, CHAIN_ID, fetchFailing)).toBeUndefined();
        expect(await resolveAgentEndpoint({}, CANDIDATE, CHAIN_ID, fetchFailing)).toBeUndefined();
    });

    it("a bare services.rest keeps the raw endpoint — today's https-guarded path", async () => {
        expect(await resolveAgentEndpoint(
            { rest: "https://raw.example/offers" }, CANDIDATE, CHAIN_ID, fetchFailing,
        )).toBe("https://raw.example/offers");
    });

    it("a DID of an unresolvable method falls back to the raw rest endpoint", async () => {
        expect(await resolveAgentEndpoint(
            { did: "did:key:z6Mk", rest: "https://raw.example/offers" }, CANDIDATE, CHAIN_ID, fetchFailing,
        )).toBe("https://raw.example/offers");
    });

    it("a consistent did:web yields the DID document's RESTEndpoint, not services.rest", async () => {
        const endpoint = await resolveAgentEndpoint(
            { did: DID, rest: "https://raw.example/offers" },
            CANDIDATE, CHAIN_ID, fetchServing(didDocument()),
        );
        expect(endpoint).toBe("https://agent.example/offers");
    });

    it("a DID naming a DIFFERENT address yields NO endpoint — no rest fallback", async () => {
        expect(await resolveAgentEndpoint(
            { did: DID, rest: "https://raw.example/offers" },
            CANDIDATE, CHAIN_ID, fetchServing(didDocument({ address: OTHER })),
        )).toBeUndefined();
    });

    it("an unreachable DID host yields NO endpoint — no rest fallback", async () => {
        expect(await resolveAgentEndpoint(
            { did: DID, rest: "https://raw.example/offers" },
            CANDIDATE, CHAIN_ID, fetchFailing,
        )).toBeUndefined();
    });

    it("a consistent DID with no RESTEndpoint service yields NO endpoint", async () => {
        expect(await resolveAgentEndpoint(
            { did: DID, rest: "https://raw.example/offers" },
            CANDIDATE, CHAIN_ID, fetchServing(didDocument({ services: false })),
        )).toBeUndefined();
    });
});

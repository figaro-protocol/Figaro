/**
 * A signed agreement read from IPFS is used only when its body hashes to the
 * `checkoutHash` the chain holds (`fetchAgreement`, through the SDK's
 * `anchorAgreement`). A body that does not is absent: never shown, never
 * remembered as the agreement's location.
 *
 * Proves: the served body of the agreement is present; a body with one clause
 * changed, served under the same hash, is absent, and its URI is not kept.
 * Does not prove: anything about the gateway, which is untrusted by design.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeCheckoutHash, type Agreement } from "@figaro-protocol/sdk";
import { fetchAgreement, witnessedAgreementUri } from "@/lib/core/agreementFetch";

const AGREEMENT: Agreement = {
    version: "a1",
    buyer: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    clauses: [{ clause: `0x${"0c".repeat(32)}`, data: { payment: "1" } }],
};
const TAMPERED: Agreement = { ...AGREEMENT, clauses: [{ clause: `0x${"0c".repeat(32)}`, data: { payment: "2" } }] };

const transport = { pinJSON: vi.fn(), buildURI: (c: string) => `ipfs://${c}`, resolveFetchUrl: (u: string) => `https://gw.example/${u}` };

function serve(body: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })));
}

describe("fetchAgreement keeps only a body that hashes to its checkoutHash", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("the agreement's own body is present", async () => {
        const checkoutHash = computeCheckoutHash(AGREEMENT);
        serve(AGREEMENT);
        const read = await fetchAgreement(checkoutHash, "ipfs://QmTheAgreement", { evidenceTransport: transport });
        expect(read.status).toBe("present");
    });

    it("a changed body served under the same hash is absent, and its URI is not kept", async () => {
        const checkoutHash = computeCheckoutHash(AGREEMENT);
        serve(TAMPERED);
        expect(await fetchAgreement(checkoutHash, "ipfs://QmSwapped", { evidenceTransport: transport }))
            .toEqual({ status: "absent" });
        expect(witnessedAgreementUri(checkoutHash)).not.toBe("ipfs://QmSwapped");
    });
});

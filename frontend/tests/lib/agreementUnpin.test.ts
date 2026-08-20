/**
 * unpinAgreement — controller-erasure of the committed-agreement pin.
 *
 * The agreement body is the highest-PII IPFS artifact and, until now, the one
 * with no erasure affordance. unpinAgreement best-effort unpins THIS wallet's
 * copy and forgets the witnessed-URI pointer (unpin + forget), never throwing
 * on a node hiccup; a forgotten pointer means a later fetch returns null.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchAgreement, publishAgreement, unpinAgreement } from "@/lib/kernel/agreementFetch";
import type { Agreement } from "@figaro-protocol/sdk";

const AGREEMENT: Agreement = {
    version: "a1",
    buyer: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    sections: [{ clause: "figaro-commerce", version: 1, data: { payment: "1" } }],
};

function seedTransport(cid: string) {
    return {
        pinJSON: vi.fn().mockResolvedValue(cid),
        buildURI: (c: string) => `ipfs://${c}`,
        resolveFetchUrl: (uri: string) => uri,
    };
}

describe("unpinAgreement", () => {
    it("unpins the pinned CID and forgets the pointer (a later fetch is null)", async () => {
        const transport = seedTransport("QmAgreementBody");
        const { agreementHash } = await publishAgreement(AGREEMENT, { evidenceTransport: transport });

        const unpin = vi.fn().mockResolvedValue(undefined);
        await unpinAgreement(agreementHash, { unpin });

        expect(unpin).toHaveBeenCalledExactlyOnceWith("QmAgreementBody");
        // Pointer forgotten: with no URI, fetch can no longer resolve a body.
        expect(await fetchAgreement(agreementHash, undefined, { evidenceTransport: transport })).toBeNull();
    });

    it("swallows an unpin failure and still forgets the pointer", async () => {
        const transport = seedTransport("QmDoomedBody");
        const { agreementHash } = await publishAgreement(AGREEMENT, { evidenceTransport: transport });

        const unpin = vi.fn().mockRejectedValue(new Error("node down"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(unpinAgreement(agreementHash, { unpin })).resolves.toBeUndefined();
        expect(unpin).toHaveBeenCalledOnce();
        expect(await fetchAgreement(agreementHash, undefined, { evidenceTransport: transport })).toBeNull();
        warn.mockRestore();
    });

    it("is a no-op with no witnessed URI (nothing to unpin)", async () => {
        const unpin = vi.fn().mockResolvedValue(undefined);
        await expect(
            unpinAgreement("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef0", { unpin }),
        ).resolves.toBeUndefined();
        expect(unpin).not.toHaveBeenCalled();
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    SIGNED_UNSENT_STORAGE_KEY,
    forgetSignedUnsent,
    listSignedUnsent,
    rememberSignedUnsent,
} from "@/lib/checkout/signedUnsentOrders";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";

/**
 * A buyer's signed order must survive navigation until it is sent — the beta
 * panel's agent-owner and procurement buyer both lost one — and it must not
 * leak across wallets, across chains, or past its relay.
 */

// The order hash needs a core domain; the app reads it from the environment.
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x00000000000000000000000000000000000000c0" } };
});

const BUYER = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const CHAIN = 31337;

const payload = (salt: bigint): CommitmentPayload => ({
    commitment: {
        processId: `0x${"00".repeat(32)}`,
        buyer: BUYER,
        seller: "0x1111111111111111111111111111111111111111",
        currency: `0x${"44".repeat(20)}`,
        payment: 3n,
        expectedCumulativeValue: 3n,
        agreementHash: `0x${"ab".repeat(32)}`,
        salt,
        deadline: 4_000_000_000n,
    },
    agreement: {},
    buyerSig: "0xdeadbeef",
} as unknown as CommitmentPayload);

beforeEach(() => {
    sessionStorage.removeItem(SIGNED_UNSENT_STORAGE_KEY);
});

describe("signedUnsentOrders", () => {
    it("remembers a signed payload and lists it back, bigints intact", () => {
        const orderId = rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        const listed = listSignedUnsent({ address: BUYER, chainId: CHAIN });
        expect(listed.map((o) => o.orderId)).toEqual([orderId]);
        expect(listed[0]!.payload.commitment.payment).toBe(3n);
        expect(listed[0]!.payload.buyerSig).toBe("0xdeadbeef");
    });

    it("keeps one entry per order, however often it is remembered", () => {
        rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(2n) });
        expect(listSignedUnsent({ address: BUYER, chainId: CHAIN })).toHaveLength(2);
    });

    it("scopes by wallet and by chain", () => {
        rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        expect(listSignedUnsent({ address: OTHER, chainId: CHAIN })).toEqual([]);
        expect(listSignedUnsent({ address: BUYER, chainId: 11155111 })).toEqual([]);
        expect(listSignedUnsent({ address: BUYER.toUpperCase(), chainId: CHAIN })).toHaveLength(1);
    });

    it("forgets an order once it is sent or discarded", () => {
        const orderId = rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        forgetSignedUnsent({ address: BUYER, chainId: CHAIN, orderId });
        expect(listSignedUnsent({ address: BUYER, chainId: CHAIN })).toEqual([]);
        expect(sessionStorage.getItem(SIGNED_UNSENT_STORAGE_KEY)).toBe("{}");
    });

    it("lives in the tab, never in durable storage", () => {
        rememberSignedUnsent({ address: BUYER, chainId: CHAIN, payload: payload(1n) });
        expect(localStorage.getItem(SIGNED_UNSENT_STORAGE_KEY)).toBeNull();
    });
});

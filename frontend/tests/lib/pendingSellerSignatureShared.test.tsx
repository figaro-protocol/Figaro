import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
    usePendingSellerSignature,
    awaitsMyCounterSign,
} from "@/lib/checkout/orderPendingSellerSignature";
import { RuntimeServicesProvider } from "@/lib/shared/runtimeServicesContext";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";

const SELLER = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";

const useAccountMock = vi.fn();
const useWalletClientMock = vi.fn();

vi.mock("wagmi", () => ({
    useAccount: () => useAccountMock(),
    useWalletClient: () => useWalletClientMock(),
    useChainId: () => 31337,
}));

vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

// The pin gate verifies a counterparty signature before pinning (audit
// 2026-07-23); these tests exercise dismiss/resubscription with fixture
// sigs, so treat the signature as valid and give the gate a core domain.
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x00000000000000000000000000000000000000c0" } };
});
vi.mock("@figaro/sdk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@figaro/sdk")>();
    return { ...actual, verifyCommitmentSignature: vi.fn().mockResolvedValue(true) };
});

// The payload fetch: return the serialized payload JSON so the REAL
// deserializeCommitmentPayload runs (never mock the parse itself).
// Agreement pinning is a side effect of witnessing — a no-op for this test.
vi.mock("@/lib/kernel/agreementFetch", () => ({
    publishAgreement: vi.fn().mockResolvedValue(undefined),
}));

// One order awaiting the seller's counter-signature (buyer has signed).
const PAYLOAD = {
    commitment: { buyer: BUYER, seller: SELLER },
    agreement: {},
    buyerSig: "0xdeadbeef",
};
// The payload is delivered INLINE over the coordination channel (audit F Arm 2),
// so the callback receives the serialized body directly — no IPFS fetch.
const inboundBody = JSON.stringify(PAYLOAD);

// Captured subscription callbacks — one per mounted hook instance.
let callbacks: Array<(payload: string, orderId: string) => Promise<void> | void>;

function makeServices(): RuntimeServices {
    return {
        catalogue: {} as RuntimeServices["catalogue"],
        discovery: {} as RuntimeServices["discovery"],
        evidenceTransport: {
            resolveFetchUrl: (uri: string) => `https://gateway.test/${uri}`,
        } as unknown as RuntimeServices["evidenceTransport"],
        handoffMessaging: {
            subscribeAnyCommitmentPayload: ({
                callback,
            }: {
                callback: (cid: string, orderId: string) => Promise<void> | void;
            }) => {
                callbacks.push(callback);
                return Promise.resolve(() => undefined);
            },
        } as unknown as RuntimeServices["handoffMessaging"],
        handoffPersistence: {} as RuntimeServices["handoffPersistence"],
        tokenConversion: {} as RuntimeServices["tokenConversion"],
    };
}

function wrapper(services: RuntimeServices) {
    return ({ children }: { children: ReactNode }) => (
        <RuntimeServicesProvider services={services}>{children}</RuntimeServicesProvider>
    );
}

beforeEach(() => {
    callbacks = [];
    useAccountMock.mockReset();
    useWalletClientMock.mockReset();
    useAccountMock.mockReturnValue({ address: SELLER });
    useWalletClientMock.mockReturnValue({ data: null });
});

describe("usePendingSellerSignature shared dismiss state", () => {
    it("a dismissal in one instance immediately clears the pending order in the other", async () => {
        const services = makeServices();
        const w = wrapper(services);

        // Two independent mount sites (header badge + accept surface).
        const a = renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: w });
        const b = renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: w });

        // The same relayed order reaches both subscriptions.
        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-1");
        });

        await waitFor(() => {
            expect(a.result.current.pending).toHaveLength(1);
            expect(b.result.current.pending).toHaveLength(1);
        });

        // The seller dismisses (or accepts) on ONE surface.
        act(() => {
            a.result.current.dismiss(0);
        });

        // Both surfaces must reflect it — the badge cannot keep counting it.
        await waitFor(() => {
            expect(a.result.current.pending).toHaveLength(0);
            expect(b.result.current.pending).toHaveLength(0);
        });
    });
});

describe("usePendingSellerSignature wallet-arrival resubscription", () => {
    it("an instance whose subscription failed before the wallet client resolved re-subscribes when it arrives", async () => {
        // Mirror the real channel factory: the XMTP channel can only be
        // CREATED with the wallet signer, so a subscribe attempt without one
        // rejects. (The mock/devnet channel never rejects — which is why only
        // the real-transport smoke caught the silently-dead instance: badge
        // counting 1 while /orders rendered its empty state.)
        const services = makeServices();
        const subscribeAttempts: Array<unknown> = [];
        services.handoffMessaging = {
            subscribeAnyCommitmentPayload: (params: {
                walletClient: unknown;
                callback: (cid: string, orderId: string) => Promise<void> | void;
            }) => {
                subscribeAttempts.push(params.walletClient);
                if (!params.walletClient) {
                    return Promise.reject(new Error("signMessage callback required for XMTP channel outside test mode"));
                }
                callbacks.push(params.callback);
                return Promise.resolve(() => undefined);
            },
        } as unknown as RuntimeServices["handoffMessaging"];

        const h = renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), {
            wrapper: wrapper(services),
        });

        // First attempt ran without a signer and died — no live callback.
        await waitFor(() => expect(subscribeAttempts).toHaveLength(1));
        expect(callbacks).toHaveLength(0);

        // wagmi resolves the wallet client → the hook must retry, not stay dead.
        useWalletClientMock.mockReturnValue({ data: { signMessage: async () => "0xsig" } });
        h.rerender();
        await waitFor(() => expect(callbacks).toHaveLength(1));

        // The relayed order now reaches this (previously dead) surface.
        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-2");
        });
        await waitFor(() => expect(h.result.current.pending).toHaveLength(1));
    });
});

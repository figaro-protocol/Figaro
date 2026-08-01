import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
    usePendingSellerSignature,
    awaitsMyCounterSign,
    isCommitmentParty,
} from "@/lib/checkout/orderPendingSellerSignature";
import { RuntimeServicesProvider } from "@/lib/shared/runtimeServicesContext";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";
import { publishAgreement } from "@/lib/kernel/agreementFetch";

/**
 * Regression for the unsolicited-pin finding (frontend security audit,
 * 2026-07-22, finding 2): `COMMITMENT_PAYLOAD` carries no wallet-auth, so any
 * inbox that can DM the wallet can deliver one. Pre-fix, the handler pinned the
 * referenced agreement to THIS wallet's own IPFS node BEFORE checking party
 * membership — a "pin arbitrary data to a stranger's node" + storage-
 * amplification primitive. The pin must now be gated behind `isCommitmentParty`.
 */

const SELLER = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";
const STRANGER_A = "0x3333333333333333333333333333333333333333";
const STRANGER_B = "0x4444444444444444444444444444444444444444";

const useAccountMock = vi.fn();
const useWalletClientMock = vi.fn();

vi.mock("wagmi", () => ({
    useAccount: () => useAccountMock(),
    useWalletClient: () => useWalletClientMock(),
    useChainId: () => 31337,
}));

vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

// A stable devnet core so the sig-verification gate has a domain (partial mock
// — other modules import MEMBERS_REGISTRY_ABI etc. from here).
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return {
        ...actual,
        CONTRACTS: { ...actual.CONTRACTS, core: "0x00000000000000000000000000000000000000c0" },
    };
});

// The pin gate now ALSO requires a present signature to recover to its named
// party (audit 2026-07-23, pin-amplification) — `isCommitmentParty` alone
// trusts sender-controlled buyer/seller fields. We control recovery here.
const verifyCommitmentSignatureMock = vi.fn();
vi.mock("@figaro/sdk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@figaro/sdk")>();
    return {
        ...actual,
        verifyCommitmentSignature: (...args: unknown[]) => verifyCommitmentSignatureMock(...args),
    };
});

// The pin — the side effect the gate must protect. We assert on its calls.
vi.mock("@/lib/kernel/agreementFetch", () => ({
    publishAgreement: vi.fn().mockResolvedValue(undefined),
}));

let callbacks: Array<(cid: string, orderId: string) => Promise<void> | void>;

function makeServices(): RuntimeServices {
    return {
        catalogue: {} as RuntimeServices["catalogue"],
        discovery: {} as RuntimeServices["discovery"],
        evidenceTransport: {
            resolveFetchUrl: (uri: string) => `https://gateway.test/${uri}`,
        } as unknown as RuntimeServices["evidenceTransport"],
        coordinationMessaging: {
            subscribeAnyCommitmentPayload: ({
                callback,
            }: {
                callback: (cid: string, orderId: string) => Promise<void> | void;
            }) => {
                callbacks.push(callback);
                return Promise.resolve(() => undefined);
            },
        } as unknown as RuntimeServices["coordinationMessaging"],
        handoffPersistence: {} as RuntimeServices["handoffPersistence"],
        tokenConversion: {} as RuntimeServices["tokenConversion"],
    };
}

function wrapper(services: RuntimeServices) {
    return ({ children }: { children: ReactNode }) => (
        <RuntimeServicesProvider services={services}>{children}</RuntimeServicesProvider>
    );
}

describe("isCommitmentParty gate (finding 2)", () => {
    it("is true only for the buyer or seller of the commitment", () => {
        const p = { commitment: { buyer: BUYER, seller: SELLER } } as never;
        expect(isCommitmentParty(p, BUYER)).toBe(true);
        expect(isCommitmentParty(p, SELLER)).toBe(true);
        expect(isCommitmentParty(p, STRANGER_A)).toBe(false);
    });
});

describe("usePendingSellerSignature does not pin a stranger's payload (finding 2)", () => {
    beforeEach(() => {
        callbacks = [];
        useAccountMock.mockReset();
        useWalletClientMock.mockReset();
        verifyCommitmentSignatureMock.mockReset();
        // Default: a present signature recovers to its named party (the
        // legitimate case). Targeted-forgery tests override to false.
        verifyCommitmentSignatureMock.mockResolvedValue(true);
        vi.mocked(publishAgreement).mockClear();
        // The connected wallet is a STRANGER to the payloads it receives.
        useAccountMock.mockReturnValue({ address: STRANGER_A });
        useWalletClientMock.mockReturnValue({ data: null });
    });

    it("never calls publishAgreement for a payload the wallet is not a party to", async () => {
        const services = makeServices();
        renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: wrapper(services) });

        // An attacker DMs a payload between two OTHER parties, referencing
        // attacker-chosen agreement content.
        const inboundBody = JSON.stringify({
                    commitment: { buyer: BUYER, seller: STRANGER_B },
                    agreement: { sections: [{ clause: "x", version: 1, data: { evil: true } }] },
                    buyerSig: "0xdeadbeef",
                });

        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-evil");
        });

        // The pin must never fire — the stranger cannot force this node to host
        // its content.
        expect(publishAgreement).not.toHaveBeenCalled();
    });

    it("does pin when the wallet IS a party (the legitimate witness path)", async () => {
        useAccountMock.mockReturnValue({ address: SELLER });
        const services = makeServices();
        renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: wrapper(services) });

        const inboundBody = JSON.stringify({
                    commitment: { buyer: BUYER, seller: SELLER },
                    agreement: { sections: [] },
                    buyerSig: "0xdeadbeef",
                });

        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-mine");
        });

        await waitFor(() => expect(publishAgreement).toHaveBeenCalledTimes(1));
    });
});

describe("pin gate also requires a REAL counterparty signature (audit 2026-07-23)", () => {
    beforeEach(() => {
        callbacks = [];
        useAccountMock.mockReset();
        useWalletClientMock.mockReset();
        verifyCommitmentSignatureMock.mockReset();
        vi.mocked(publishAgreement).mockClear();
        // This wallet is genuinely NAMED as the seller — passing isCommitmentParty.
        useAccountMock.mockReturnValue({ address: SELLER });
        useWalletClientMock.mockReturnValue({ data: null });
    });

    it("does NOT pin when a targeted attacker names the victim but no signature recovers", async () => {
        // The attacker names SELLER (the victim) as a party — isCommitmentParty
        // passes — but the buyerSig is forged and recovers to no one.
        verifyCommitmentSignatureMock.mockResolvedValue(false);
        const services = makeServices();
        renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: wrapper(services) });

        const inboundBody = JSON.stringify({
                    commitment: { buyer: BUYER, seller: SELLER },
                    agreement: { sections: [] },
                    buyerSig: "0xforged",
                });

        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-forged");
        });

        // isCommitmentParty passed, but the signature gate blocks the pin.
        expect(verifyCommitmentSignatureMock).toHaveBeenCalled();
        expect(publishAgreement).not.toHaveBeenCalled();
    });

    it("does pin when a real counterparty signature recovers (the genuine inbound order)", async () => {
        verifyCommitmentSignatureMock.mockResolvedValue(true);
        const services = makeServices();
        renderHook(() => usePendingSellerSignature(awaitsMyCounterSign), { wrapper: wrapper(services) });

        const inboundBody = JSON.stringify({
                    commitment: { buyer: BUYER, seller: SELLER },
                    agreement: { sections: [] },
                    buyerSig: "0xrealbuyersig",
                });

        await act(async () => {
            for (const cb of callbacks) await cb(inboundBody, "order-real");
        });

        await waitFor(() => expect(publishAgreement).toHaveBeenCalledTimes(1));
    });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";

const mocked = vi.hoisted(() => ({
    signTypedDataAsync: vi.fn(),
    commit: vi.fn(),
    saveCommitment: vi.fn(),
    computeOrderHash: vi.fn(() => "0x" + "a".repeat(64)),
    primeAgreementArtifact: vi.fn(),
    hydrateAgreement: vi.fn(),
    saveAgreementUri: vi.fn(),
    currentAddress: "0x00000000000000000000000000000000000000b0" as `0x${string}`,
}));

mocked.primeAgreementArtifact.mockResolvedValue(undefined);
mocked.hydrateAgreement.mockResolvedValue(undefined);

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: mocked.currentAddress }),
    useChainId: () => 31337,
    useSignTypedData: () => ({ signTypedDataAsync: mocked.signTypedDataAsync }),
}));

vi.mock("@/lib/core/contracts", () => ({
    CONTRACTS: {
        core: "0x00000000000000000000000000000000000000c0",
    },
}));

vi.mock("@/lib/core/useFigaroActions", () => ({
    ZERO_PROCESS_ID: ("0x" + "0".repeat(64)) as `0x${string}`,
    useFigaroActions: () => ({
        commit: mocked.commit,
    }),
}));

vi.mock("@/lib/console/commitmentStore", () => ({
    saveCommitment: mocked.saveCommitment,
    computeOrderHash: mocked.computeOrderHash,
}));

vi.mock("@/lib/core/agreementStore", () => ({
    primeAgreementArtifact: mocked.primeAgreementArtifact,
    hydrateAgreement: mocked.hydrateAgreement,
    saveAgreementUri: mocked.saveAgreementUri,
    // loadAgreement is called by the pre-sign preview gate; tests don't
    // need a real value, the modal is auto-approved by global setup.
    loadAgreement: () => null,
}));

function makeCommitment() {
    return {
        processId: ("0x" + "0".repeat(64)) as `0x${string}`,
        buyer: "0x00000000000000000000000000000000000000a1" as `0x${string}`,
        seller: "0x00000000000000000000000000000000000000b0" as `0x${string}`,
        currency: "0x00000000000000000000000000000000000000d0" as `0x${string}`,
        payment: 1000n,
        expectedCumulativeValue: 1000n,
        agreementHash: ("0x" + "1".repeat(64)) as `0x${string}`,
        salt: 42n,
        deadline: 9999999999n,
    };
}

describe("useCommitmentFlow", () => {
    beforeEach(() => {
        mocked.signTypedDataAsync.mockReset();
        mocked.commit.mockReset();
        mocked.saveCommitment.mockReset();
        mocked.computeOrderHash.mockClear();
        mocked.primeAgreementArtifact.mockClear();
        mocked.hydrateAgreement.mockClear();
        mocked.saveAgreementUri.mockClear();
        sessionStorage.clear();
        mocked.currentAddress = "0x00000000000000000000000000000000000000b0" as `0x${string}`;
        window.history.pushState({}, "", "/");
        Reflect.deleteProperty(window as Window & { ethereum?: unknown }, "ethereum");
    });

    it("initiates a seller proposal with only the seller signature attached", async () => {
        mocked.signTypedDataAsync.mockResolvedValue("0xsellersig");
        const { result } = renderHook(() => useCommitmentFlow());
        const commitment = makeCommitment();

        let payload;
        await act(async () => {
            payload = await result.current.initiateAsParty(commitment, "seller");
        });

        expect(payload).toMatchObject({
            commitment,
            buyerSig: undefined,
            sellerSig: "0xsellersig",
        });
        expect(result.current.step).toBe("awaiting-counter");
    });

    it("auto-collects the counterparty signature only in explicit devnet mode", async () => {
        mocked.signTypedDataAsync.mockResolvedValue("0xsellersig");
        mocked.commit.mockResolvedValue("0xcommittx");
        window.history.pushState({}, "", "/?e2e=devnet");

        const request = vi.fn(async ({ method }: { method: string }) => {
            if (method === "eth_signTypedData_v4") {
                return "0xbuyersig";
            }
            if (method === "eth_sendTransaction") {
                return "0xapprovaltx";
            }
            throw new Error(`Unexpected method: ${method}`);
        });
        Object.defineProperty(window, "ethereum", {
            configurable: true,
            value: { request },
        });

        const { result } = renderHook(() => useCommitmentFlow());
        const commitment = makeCommitment();

        let txHash;
        await act(async () => {
            txHash = await result.current.signAndBroadcast(commitment, undefined, "seller");
        });

        expect(txHash).toBe("0xcommittx");
        expect(mocked.commit).toHaveBeenCalledWith(commitment, "0xbuyersig", "0xsellersig");
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_signTypedData_v4" }));
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
        expect(result.current.step).toBe("done");
    });
});

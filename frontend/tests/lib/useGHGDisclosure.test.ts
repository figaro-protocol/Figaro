import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { encodeFunctionData, type PublicClient } from "viem";
import { GHG_MEASUREMENT_CLAUSE_ID, GHG_CLAUSE_ID } from "@/lib/core/agreement";
import {
    DISCLOSURE_KIND,
    MEASUREMENT_KIND,
} from "@/lib/mechanisms/contracts";
import {
    decodeMeasurementGramsContent,
    encodeMeasurementGramsContent,
    getAttestationContent,
    useGhgDisclosureActions,
} from "@/lib/mechanisms/useGHGDisclosure";
import { ATTESTATION_COORDINATOR_ABI } from "@/lib/core/contracts";

const submitSellerAttestationMock = vi.fn(async () => "0xhash");
const submitBuyerAttestationMock = vi.fn(async () => "0xhash");

vi.mock("@/lib/mechanisms/useAttestationCoordinatorActions", () => ({
    ZERO_BYTES32: "0x" + "00".repeat(32),
    useAttestationCoordinatorActions: () => ({
        submitSellerAttestation: submitSellerAttestationMock,
        submitBuyerAttestation: submitBuyerAttestationMock,
        isPending: true,
        isConfirming: false,
        isSuccess: true,
        error: "coordinator error",
        isAvailable: true,
    }),
}));

describe("decodeMeasurementGramsContent", () => {
    it("decodes a 32-byte abi.encode(uint256) back to bigint", () => {
        const content = encodeMeasurementGramsContent(1250n);
        expect(decodeMeasurementGramsContent(content)).toBe(1250n);
    });

    it("returns null for null/empty/zero content", () => {
        expect(decodeMeasurementGramsContent(null)).toBeNull();
        expect(decodeMeasurementGramsContent(undefined)).toBeNull();
        expect(decodeMeasurementGramsContent("0x")).toBeNull();
        expect(decodeMeasurementGramsContent(("0x" + "00".repeat(32)) as `0x${string}`)).toBeNull();
    });
});

describe("getAttestationContent", () => {
    function makeClientWithCalldata(input: `0x${string}`): PublicClient {
        return {
            getTransaction: vi.fn().mockResolvedValue({ input }),
        } as unknown as PublicClient;
    }

    it("recovers the bytes content arg from an attestAsSeller calldata", async () => {
        const grams = encodeMeasurementGramsContent(4242n);
        const COMMITMENT_ZERO = {
            processId: `0x${"00".repeat(32)}` as `0x${string}`,
            buyer: `0x${"00".repeat(20)}` as `0x${string}`,
            seller: `0x${"00".repeat(20)}` as `0x${string}`,
            currency: `0x${"00".repeat(20)}` as `0x${string}`,
            payment: 0n,
            expectedCumulativeValue: 0n,
            agreementHash: `0x${"00".repeat(32)}` as `0x${string}`,
            salt: 0n,
            deadline: 0n,
        };
        const calldata = encodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            functionName: "attestAsSeller",
            // New signature: (role, target, clauseId, stage, sectionData, proof, content)
            args: [
                COMMITMENT_ZERO,
                COMMITMENT_ZERO,
                GHG_CLAUSE_ID as `0x${string}`,
                DISCLOSURE_KIND.inventory,
                "0x" as `0x${string}`,
                [] as readonly `0x${string}`[],
                grams,
            ],
        });
        const client = makeClientWithCalldata(calldata);
        const content = await getAttestationContent(client, ("0x" + "ab".repeat(32)) as `0x${string}`);
        expect(content).toBe(grams);
        expect(decodeMeasurementGramsContent(content)).toBe(4242n);
    });

    it("recovers the bytes content arg from an attestAsBuyer calldata", async () => {
        const grams = encodeMeasurementGramsContent(99n);
        const COMMITMENT_ZERO = {
            processId: `0x${"00".repeat(32)}` as `0x${string}`,
            buyer: `0x${"00".repeat(20)}` as `0x${string}`,
            seller: `0x${"00".repeat(20)}` as `0x${string}`,
            currency: `0x${"00".repeat(20)}` as `0x${string}`,
            payment: 0n,
            expectedCumulativeValue: 0n,
            agreementHash: `0x${"00".repeat(32)}` as `0x${string}`,
            salt: 0n,
            deadline: 0n,
        };
        const calldata = encodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            functionName: "attestAsBuyer",
            // New signature: (target, clauseId, stage, sectionData, proof, content)
            args: [
                COMMITMENT_ZERO,
                GHG_CLAUSE_ID as `0x${string}`,
                DISCLOSURE_KIND.inventory,
                "0x" as `0x${string}`,
                [] as readonly `0x${string}`[],
                grams,
            ],
        });
        const client = makeClientWithCalldata(calldata);
        const content = await getAttestationContent(client, ("0x" + "cd".repeat(32)) as `0x${string}`);
        expect(content).toBe(grams);
    });

    it("returns null when the tx calldata is for some other function", async () => {
        const client = makeClientWithCalldata("0xdeadbeef");
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });

    it("returns null when getTransaction throws", async () => {
        const client = {
            getTransaction: vi.fn().mockRejectedValue(new Error("network")),
        } as unknown as PublicClient;
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });

    it("returns null when the tx has no input data", async () => {
        const client = makeClientWithCalldata("0x");
        expect(
            await getAttestationContent(client, ("0x" + "ef".repeat(32)) as `0x${string}`),
        ).toBeNull();
    });
});

describe("useGhgDisclosureActions", () => {
    it("forwards coordinator transaction state and encodes disclosure submissions", async () => {
        const orderHash = `0x${"11".repeat(32)}`;
        const { result } = renderHook(() => useGhgDisclosureActions());

        await result.current.submitCommitmentForOrder(orderHash);
        await result.current.submitActualForOrder(orderHash, 1250n);

        expect(result.current.isPending).toBe(true);
        expect(result.current.isConfirming).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.error).toBe("coordinator error");
        expect(result.current.isAvailable).toBe(true);

        // Commitment stage under the disclosure clause — content omitted so
        // coordinator-actions default it to the committed sectionData (the
        // {standard, scope} clause). Category-2 byte-equality thus passes.
        expect(submitSellerAttestationMock).toHaveBeenNthCalledWith(1, {
            orderHash,
            clauseId: GHG_CLAUSE_ID,
            stage: DISCLOSURE_KIND.commitment,
        });
        // Grams land under the measurement clause (Category-1, no byte-equality).
        expect(submitSellerAttestationMock).toHaveBeenNthCalledWith(2, {
            orderHash,
            clauseId: GHG_MEASUREMENT_CLAUSE_ID,
            stage: MEASUREMENT_KIND.measured,
            content: encodeMeasurementGramsContent(1250n),
        });
        expect(submitBuyerAttestationMock).not.toHaveBeenCalled();
    });
});
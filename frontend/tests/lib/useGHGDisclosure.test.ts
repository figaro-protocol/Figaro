import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { GHG_SCHEMA_ID, DISCLOSURE_KIND } from "@/lib/mechanisms/contracts";
import {
    encodeActualGramsDisclosureRef,
    encodeCommitmentDisclosureRef,
    useGhgDisclosureActions,
} from "@/lib/mechanisms/useGHGDisclosure";

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

describe("useGhgDisclosureActions", () => {
    it("forwards coordinator transaction state and encodes disclosure submissions", async () => {
        const orderHash = `0x${"11".repeat(32)}`;
        const { result } = renderHook(() => useGhgDisclosureActions());

        await result.current.submitCommitmentForOrder(orderHash, "restaurant");
        await result.current.submitActualForOrder(orderHash, 1250n);

        expect(result.current.isPending).toBe(true);
        expect(result.current.isConfirming).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.error).toBe("coordinator error");
        expect(result.current.isAvailable).toBe(true);

        expect(submitSellerAttestationMock).toHaveBeenNthCalledWith(1, {
            orderHash,
            schemaId: GHG_SCHEMA_ID,
            stage: DISCLOSURE_KIND.commitment,
            contentRef: encodeCommitmentDisclosureRef(orderHash, "restaurant"),
        });
        expect(submitSellerAttestationMock).toHaveBeenNthCalledWith(2, {
            orderHash,
            schemaId: GHG_SCHEMA_ID,
            stage: DISCLOSURE_KIND.inventory,
            contentRef: encodeActualGramsDisclosureRef(1250n),
        });
        expect(submitBuyerAttestationMock).not.toHaveBeenCalled();
    });
});
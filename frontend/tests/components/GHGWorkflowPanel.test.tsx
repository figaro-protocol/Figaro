import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const executeCapabilityMock = vi.fn(async () => undefined);
const refreshMock = vi.fn(async () => undefined);

vi.mock("@/lib/core/store", () => ({
    useOrderStore: (selector: (state: { viewedProcessId: `0x${string}` | null }) => unknown) => selector({
        viewedProcessId: ("0x" + "11".repeat(32)) as `0x${string}`,
    }),
}));

vi.mock("@/hooks/core/useSemanticProcessWorkspace", () => ({
    useSemanticProcessWorkspace: () => ({
        processModel: {
            processId: "0x" + "11".repeat(32),
            rootOrderId: "root-order",
            currency: undefined,
            orders: [
                {
                    orderId: "root-order",
                    processId: "0x" + "11".repeat(32),
                    buyer: "0x1234567890123456789012345678901234567890",
                    seller: "0x9999999999999999999999999999999999999999",
                    currency: "0x2222222222222222222222222222222222222222",
                    payment: 1n,
                    state: "Active",
                    parentOrderIds: [],
                    attachments: [],
                    capabilities: [
                        {
                            id: "commitment-cap",
                            label: "Record Disclosure Commitment",
                            actionKind: "submit-disclosure-commitment",
                            action: {
                                executionType: "transaction",
                                kind: "submit-disclosure-commitment",
                                orderHash: "root-order",
                                disclosureRole: "merchant",
                            },
                        },
                        {
                            id: "inventory-cap",
                            label: "Submit Emissions Inventory",
                            actionKind: "submit-disclosure-inventory",
                            action: {
                                executionType: "transaction",
                                kind: "submit-disclosure-inventory",
                                orderHash: "root-order",
                            },
                        },
                    ],
                },
            ],
        },
        executableCapabilityIds: new Set(["commitment-cap", "inventory-cap"]),
        executeCapability: executeCapabilityMock,
    }),
}));

vi.mock("@/lib/mechanisms/useGHGDisclosure", () => ({
    useProcessDisclosureSummary: () => ({
        loading: false,
        summary: {
            processId: "0x" + "11".repeat(32),
            attestationCount: 0,
            commitmentCount: 0,
            actualCount: 0,
            totalActualGrams: 0n,
            attestations: [],
        },
    }),
    useOrderDisclosureTasks: () => ({
        loading: false,
        tasks: [],
        refresh: refreshMock,
    }),
    formatActualGrams: (grams: bigint) => `${grams} g CO2e`,
}));

import { GHGWorkflowPanel } from "@/components/core/GHGWorkflowPanel";

describe("GHGWorkflowPanel", () => {
    beforeEach(() => {
        executeCapabilityMock.mockReset();
        refreshMock.mockReset();
    });

    it("routes disclosure writes through the semantic capability executor", async () => {
        const user = userEvent.setup();

        render(<GHGWorkflowPanel processId="0xtestprocess" />);

        await user.click(screen.getByRole("button", { name: /root-order/i }));
        await user.click(screen.getByRole("button", { name: /submit commitment/i }));

        await waitFor(() => {
            expect(executeCapabilityMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: "commitment-cap" }),
            );
        });

        expect(refreshMock).toHaveBeenCalledTimes(1);
    });
});
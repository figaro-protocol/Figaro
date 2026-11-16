/**
 * /orders/view shows the chain's root: its seller in the buyer's line and its
 * modality. The process model is the real derivation over a two-order
 * process whose sub-order's agreement carries no topology leaf, has not
 * loaded, or carries `[]`; only the page's hooks are mocked.
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { present } from "@/lib/shared/networkRead";
import { truncateHex } from "@/lib/shared/formatHex";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import type { ProcessModel } from "@/lib/semantic/models";
import {
    BUYER, PROCESS, ROOT_MODALITY, ROOT_SELLER, SUB_ORDER_CASES, SUB_SELLER,
    agreementsFor, loadModalitySpec, rootOrder, subOrder, summary,
} from "../lib/twoOrderProcess";

const m = vi.hoisted(() => ({ model: null as unknown }));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));
vi.mock("@/hooks/useSemanticProcessWorkspace", () => ({
    useSemanticProcessWorkspace: () => ({
        processModelRead: present(m.model),
        processModel: m.model,
        runtimeCapabilities: [],
        executableCapabilityIds: new Set(),
        executingCapabilityId: null,
        executeCapability: async () => undefined,
        actionError: null,
    }),
}));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ read: present([]) }) }));
vi.mock("@/components/runtime/OrderInteractionSurfaces", () => ({ OrderInteractionSurfaces: () => null }));
vi.mock("@/components/runtime/CapabilityRail", () => ({ CapabilityRail: () => null }));
vi.mock("@/components/runtime/StageAttestationComparison", () => ({ StageAttestationComparison: () => null }));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

beforeAll(loadModalitySpec);
afterEach(cleanup);

describe("/orders/view names the chain's root", () => {
    for (const sub of SUB_ORDER_CASES) {
        it(`sub-order agreement ${sub}: the buyer's line names the root's seller and the root's modality`, () => {
            const model: ProcessModel = deriveProcessModelFromRuntime(summary, [subOrder, rootOrder], agreementsFor(sub), BUYER);
            m.model = model;
            render(<OrderTimelineView processId={PROCESS} />);
            const view = screen.getByTestId("order-timeline-view");
            expect(view.textContent).toContain(`${truncateHex(ROOT_SELLER)} has your order`);
            expect(view.textContent).not.toContain(truncateHex(SUB_SELLER));
            expect(screen.getByTestId("order-modality").textContent).toContain(ROOT_MODALITY);
        });
    }
});

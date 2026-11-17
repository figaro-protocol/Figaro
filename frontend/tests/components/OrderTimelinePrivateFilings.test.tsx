/**
 * /orders/view mounts the private-filings panel for an order only where the
 * order carries a filing of the counterparty whose set the clause's spec,
 * once read, declares private (`privateFilingsInPlay`). While the spec is
 * unread, or when its read failed, the filing is not counted and no panel
 * mounts; when the spec arrives the page reads again and the panel mounts.
 * The panel itself is a stub here: what it shows is its own test's
 * (`PrivateFilingsPanel.test.tsx`).
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Hex } from "viem";
import { present } from "@/lib/shared/networkRead";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { BUYER, PROCESS, ROOT_HASH, ROOT_SELLER, agreementsFor, loadModalitySpec, rootOrder, subOrder, summary } from "../lib/twoOrderProcess";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const m = vi.hoisted(() => ({ model: null as unknown, attestations: [] as unknown[] }));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x1111111111111111111111111111111111111111", isConnected: true }),
}));
vi.mock("@/hooks/useSemanticProcessWorkspace", () => ({
    useSemanticProcessWorkspace: () => ({
        processModelRead: present(m.model),
        processModel: m.model,
        processAttestations: m.attestations,
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
vi.mock("@/components/runtime/PrivateFilingsPanel", () => ({
    PrivateFilingsPanel: ({ orderHash }: { orderHash: string }) => <div data-testid={`private-filings-mounted-${orderHash}`} />,
}));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

const READING = [
    { name: "reading", type: "string", required: true, disposition: "private" },
    { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
];
const specNamed = (clauseId: string) => pinSpec({
    clauseId, version: 1, title: "Private reading", description: "A private witness stage.",
    fields: [{ name: "note", type: "string", required: true, disposition: "public" }],
    stages: { "1": READING },
});
const ARRIVES = specNamed("test-page-private-arrives");
const FAILS = specNamed("test-page-private-fails");

const sellerFiling = (clauseId: Hex) => ({
    clauseId, orderHash: ROOT_HASH, stage: 1, attester: ROOT_SELLER,
    contentRef: `0x${"ef".repeat(32)}`, blockNumber: 9, universe: "direct",
});

beforeAll(async () => {
    await loadModalitySpec();
    setClauseSpecFetcher(async () => { throw new Error("gateway unreachable"); });
    await loadClauseSpec(FAILS.clauseKey, "mem://fails").catch(() => undefined);
});
afterEach(cleanup);

const mounted = () => screen.queryByTestId(`private-filings-mounted-${ROOT_HASH}`);

describe("/orders/view mounts the private-filings panel only for a filing read as private", () => {
    it("a filing whose clause's spec failed to read mounts no panel", () => {
        m.model = deriveProcessModelFromRuntime(summary, [subOrder, rootOrder], agreementsFor("no-leaf"), BUYER);
        m.attestations = [sellerFiling(FAILS.clauseKey)];
        render(<OrderTimelineView processId={PROCESS} />);
        expect(screen.getByTestId("order-timeline-view")).toBeTruthy();
        expect(mounted()).toBeNull();
    });

    it("a filing whose clause's spec is not loaded mounts no panel; once the spec arrives the page reads again and mounts it", async () => {
        m.model = deriveProcessModelFromRuntime(summary, [subOrder, rootOrder], agreementsFor("no-leaf"), BUYER);
        m.attestations = [sellerFiling(ARRIVES.clauseKey)];
        const { rerender } = render(<OrderTimelineView processId={PROCESS} />);
        expect(mounted()).toBeNull();

        setClauseSpecFetcher(async () => ARRIVES.bytes);
        await loadClauseSpec(ARRIVES.clauseKey, "mem://arrives");
        // The workspace hook re-renders the page when a spec lands (`useClauseSpecs`' version).
        rerender(<OrderTimelineView processId={PROCESS} />);
        expect(mounted()).not.toBeNull();
    });
});

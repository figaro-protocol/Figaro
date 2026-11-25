/**
 * ViewAssemblyClient — opening an assembly to read it never touches the
 * designer's drafts. A published assembly opened at
 * /assemblies/designer/view?slug=<slug> renders from the chain, and a local
 * draft opened there for review renders from its named draft; neither writes
 * any autosave of the canvas or any named draft, byte for byte.
 *
 * The harness is the one `ViewAssemblyClientFailedRead.test.tsx` uses.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { deriveProcessDesignSlug } from "@/lib/shared/assembly";

const DESIGNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const SLUG = deriveProcessDesignSlug(HASH);

const mocks = vi.hoisted(() => ({ readContract: vi.fn() }));
const CLIENT = { chain: { id: 31337 }, readContract: (...a: unknown[]) => mocks.readContract(...a) };

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => DESIGNER, client: () => CLIENT }));
const PUBLISHED = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/registries/useProcessRegistry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/registries/useProcessRegistry")>()),
    getProcessRegistry: () => "0x3333333333333333333333333333333333333333",
    usePublishedAssemblies: () => PUBLISHED.value,
    fetchHydratedAssembly: async () => ({ assembly: { name: "Point of sale", agreements: [] }, agreements: {} }),
}));
vi.mock("@/lib/registries/useWithdrawStake", () => ({ useWithdrawAssembly: () => ({ withdraw: vi.fn() }) }));
vi.mock("@/lib/registries/withdrawGate", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/withdrawGate")>();
    const gate = { status: "present", value: { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 } };
    return { ...actual, useWithdrawGate: () => ({ gate }) };
});
vi.mock("@/lib/designer/assemblyToDraft", () => ({ assemblyToOrders: () => [] }));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAssembly: () => ({ publish: vi.fn() }) }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/TopologyCanvas", () => ({
    TopologyCanvas: ({ orders }: { orders: unknown[] }) => <div data-testid="view-canvas" data-orders={orders.length} />,
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({ AgreementDrawer: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({ AssemblyTermsPanel: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyIdentity", () => ({ AssemblyIdentity: () => null }));

PUBLISHED.value = {
    read: { status: "present", value: [{ slug: SLUG, processDesignHash: HASH, contentURI: "ipfs://a", registeredBy: DESIGNER, stakeWithdrawn: false }] },
    refetch: () => undefined,
};

import { ViewAssemblyClient } from "@/app/(tools)/assemblies/designer/view/ViewAssemblyClient";
import {
    saveAutosave,
    saveNamedDraft,
    type DesignSnapshot,
} from "@/lib/designer/syntheticDesignStore";
import {
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    startSyntheticSession,
} from "@/lib/designer/syntheticProcess";

/** A draft as the canvas writes it: orders from the canvas's own builders. */
function draft(slug: string, name: string): DesignSnapshot {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    const sub = createSyntheticSubOrder(session, root.order);
    return {
        slug,
        name,
        processId: session.processId,
        nextOrderIndex: session.nextOrderIndex,
        nextSellerIndex: session.nextSellerIndex,
        orders: [root.order, sub.order],
        clausesByOrderId: { [sub.order.orderHash]: { [`0x${"a1".repeat(32)}`]: { note: "unsaved" } } },
        assemblyClauses: { [`0x${"c3".repeat(32)}`]: { forum: "kleros" } },
        createdAt: 1,
        updatedAt: 1,
    };
}

/** Every designer key in localStorage, with its bytes. */
function designerStorage(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        if (key.startsWith("figaro:designer:")) out[key] = window.localStorage.getItem(key);
    }
    return out;
}

beforeEach(() => {
    window.localStorage.clear();
    // Unsaved work on the new design and on a saved draft, and the saved draft.
    saveAutosave(null, draft("", "Unsaved work"));
    saveAutosave("asm-draft-0000beef", draft("asm-draft-0000beef", "Unsaved edit"));
    saveNamedDraft(draft("asm-draft-0000beef", "Saved draft"));
});

describe("ViewAssemblyClient — reading an assembly leaves the drafts as they were", () => {
    it("a published assembly opened for viewing writes no draft and no autosave", async () => {
        mocks.readContract.mockResolvedValue([DESIGNER, 1n, false, "ipfs://a"]);
        const before = designerStorage();
        expect(Object.keys(before).sort()).toEqual([
            "figaro:designer:autosave:drafts:asm-draft-0000beef",
            "figaro:designer:autosave:new",
            "figaro:designer:drafts",
            "figaro:designer:drafts:asm-draft-0000beef",
        ]);
        render(<ViewAssemblyClient slug={SLUG} />);
        // The page has resolved the published assembly and read its binding.
        await screen.findByTestId("view-withdraw-button");
        expect(designerStorage()).toEqual(before);
    });

    it("a saved draft opened for review writes no draft and no autosave", async () => {
        const before = designerStorage();
        render(<ViewAssemblyClient slug="asm-draft-0000beef" />);
        await waitFor(() => expect(screen.getByTestId("view-canvas").getAttribute("data-orders")).toBe("2"));
        expect(designerStorage()).toEqual(before);
    });
});

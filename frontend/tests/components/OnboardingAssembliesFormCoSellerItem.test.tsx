/**
 * OnboardingAssembliesForm — the binding seller names, for each co-seller it
 * designates, one item from that co-seller's OWN catalog, chosen from a live
 * read of the catalog. A read that resolves empty or fails shows no list, and
 * the binding names no item.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const COURIER = "0x4444444444444444444444444444444444444444" as const;
const BOUND = `0x${"ab".repeat(32)}` as const;
const CLAUSE = `0x${"cd".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
    update: vi.fn(),
    catalogs: { read: { status: "pending" } as { status: string; value?: unknown } },
}));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
const ONBOARDING = {
    state: {
        assemblies: [{
            bindingId: `binding:${ADDRESS}:${BOUND}`,
            subjectAddress: ADDRESS,
            assemblyHash: BOUND,
            coSellerBindings: [{ clauseKey: CLAUSE, addresses: [COURIER] }],
        }],
    },
    loaded: true,
    subject: ADDRESS,
    update: mocks.update,
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ONBOARDING,
    onboardingNextHref: () => "/next",
    onboardingPrevHref: () => "/prev",
}));
const CHOICES = vi.hoisted(() => ({
    read: {
        status: "present",
        value: [{ assemblyHash: `0x${"ab".repeat(32)}`, slug: "asm-ab", state: "loaded", hydratedAssembly: {}, clauses: [] }],
    },
}));
vi.mock("@/lib/protocol/assemblyChoices", () => ({
    useAssemblyChoices: () => CHOICES,
    requiredCoSellerClauses: () => [`0x${"cd".repeat(32)}`],
}));
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => mocks.catalogs }));
vi.mock("@/components/members/ProfileClauseValues", () => ({ ProfileClauseValues: () => null }));
vi.mock("@/components/members/PinnedTokenNote", () => ({ PinnedTokenNote: () => null }));
vi.mock("@/components/members/AssemblyChoiceRow", () => ({
    AssemblyChoiceRow: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));

import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

const COURIER_CATALOG = {
    address: COURIER,
    name: "Courier",
    items: [
        { id: "ride-short", name: "Short ride", price: "2", available: true },
        { id: "ride-long", name: "Long ride", price: "5", available: true },
        { id: "ride-night", name: "Night ride", price: "9", available: false },
    ],
};

const lastBinding = () => {
    const patches = mocks.update.mock.calls.map(([p]) => p as { assemblies?: Array<{ coSellerBindings?: unknown[] }> });
    const last = patches.filter((p) => p.assemblies).at(-1);
    return last?.assemblies?.[0]?.coSellerBindings?.[0] as { addresses: string[]; itemIds?: Record<string, string> } | undefined;
};

describe("OnboardingAssembliesForm — naming a co-seller's item", () => {
    beforeEach(() => mocks.update.mockClear());

    it("lists the co-seller's offered items from the live read and records the one picked, keyed by its address", async () => {
        mocks.catalogs = { read: { status: "present", value: [COURIER_CATALOG] } };
        render(<OnboardingAssembliesForm />);
        const select = await screen.findByTestId(`co-seller-${CLAUSE}-item-${COURIER}`) as HTMLSelectElement;
        const options = Array.from(select.options).map((o) => o.textContent);
        expect(options).toEqual([
            "No item named: the co-seller's first available item prices the order",
            "Short ride (2)",
            "Long ride (5)",
        ]);
        fireEvent.change(select, { target: { value: "ride-long" } });
        await waitFor(() => expect(lastBinding()?.itemIds).toEqual({ [COURIER]: "ride-long" }));
        expect(lastBinding()?.addresses).toEqual([COURIER]);
    });

    it("a failed read shows no list, and the binding names no item", async () => {
        mocks.catalogs = { read: { status: "absent" } };
        render(<OnboardingAssembliesForm />);
        await screen.findByTestId(`co-seller-${CLAUSE}-input-0`);
        expect(screen.queryByTestId(`co-seller-${CLAUSE}-item-${COURIER}`)).toBeNull();
        await waitFor(() => expect(lastBinding()).toBeDefined());
        expect(lastBinding()?.itemIds).toBeUndefined();
    });

    it("a read that resolves with no item for the co-seller shows no list, and the binding names no item", async () => {
        mocks.catalogs = { read: { status: "present", value: [{ ...COURIER_CATALOG, items: [] }] } };
        render(<OnboardingAssembliesForm />);
        await screen.findByTestId(`co-seller-${CLAUSE}-input-0`);
        expect(screen.queryByTestId(`co-seller-${CLAUSE}-item-${COURIER}`)).toBeNull();
        await waitFor(() => expect(lastBinding()).toBeDefined());
        expect(lastBinding()?.itemIds).toBeUndefined();
    });
});

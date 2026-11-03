/**
 * OnboardingCatalogForm — a member need not sell anything. A catalog step left
 * blank continues with no items; a row started but left without a name or a
 * price is still refused, so a half-typed item is never dropped silently.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/components/members/IpfsImageUpload", () => ({ IpfsImageUpload: () => null }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/lib/protocol/assemblyChoices", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/protocol/assemblyChoices")>()),
    useAssemblyChoices: () => ({ read: { status: "present", value: [] } }),
}));
const TOKEN = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const STATE = {
    profile: { name: "Member", defaultTokenAddress: TOKEN, acceptedTokens: [{ address: TOKEN, symbol: "TKN" }] },
    assemblies: [],
};
vi.mock("@/lib/member/onboardingState", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/onboardingState")>()),
    useOnboardingState: () => ({ state: STATE, loaded: true, subject: ADDRESS, update: vi.fn() }),
}));

import { OnboardingCatalogForm } from "@/components/members/OnboardingCatalogForm";

describe("OnboardingCatalogForm — no item is a catalog of none", () => {
    it("a blank step continues with no items", async () => {
        const onSave = vi.fn(async () => {});
        render(<OnboardingCatalogForm onSave={onSave} submitLabel="Save catalog" />);
        fireEvent.click(screen.getByRole("button", { name: "Save catalog" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith([], "metric"));
        expect(screen.queryByText(/at least one item/i)).toBeNull();
    });

    it("a started row without a price is refused, not dropped", async () => {
        const onSave = vi.fn(async () => {});
        const { container } = render(<OnboardingCatalogForm onSave={onSave} submitLabel="Save catalog" />);
        const name = container.querySelector<HTMLInputElement>("input[type='text']")!;
        fireEvent.change(name, { target: { value: "Half-typed" } });
        fireEvent.click(screen.getByRole("button", { name: "Save catalog" }));
        expect(await screen.findByText(/name and a price/i)).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });
});

/**
 * MemberEditCatalog — a member need not sell anything. Saving the catalog
 * form with no item clears `catalogURI` from the profile (the same act as the
 * delete footer) and pins no catalog; saving with items pins the catalog and
 * links its URI from the profile.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CatalogItemMetadata, MemberCatalogMetadata, UnitSystem } from "@/lib/member/memberCatalogMetadata";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const ITEM: CatalogItemMetadata = { id: "i1", name: "Bread", description: "", price: "2", available: true };

const m = vi.hoisted(() => {
    const state = {
        save: (async () => undefined) as (...args: unknown[]) => Promise<void>,
        publish: (async () => ({ uri: "ipfs://new-catalog" })) as (catalog: unknown) => Promise<{ uri: string }>,
        // One editor across renders, as the hook keeps its profile and
        // callbacks stable between them.
        editor: undefined as unknown,
    };
    state.editor = {
        gate: null,
        existingProfile: { name: "Seller", subjectAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", catalogURI: "ipfs://old-catalog" },
        address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        markReadAbsent: () => {},
        updater: { save: (...args: unknown[]) => state.save(...args), error: null },
        saveInFlight: false,
        externalError: null,
    };
    return state;
});
vi.mock("@/lib/member/useMemberProfileEditor", () => ({ useMemberProfileEditor: () => m.editor }));
vi.mock("@/lib/member/catalogFetcher", () => ({
    fetchMemberCatalog: async (): Promise<MemberCatalogMetadata> => ({ subjectAddress: WALLET, items: [ITEM], version: "1.2.0" }),
}));
vi.mock("@/lib/member/catalogPublisher", () => ({ publishMemberCatalog: (catalog: unknown) => m.publish(catalog) }));
// The form's own validation is its tests'; here it hands the items to onSave.
vi.mock("@/components/members/OnboardingCatalogForm", () => ({
    OnboardingCatalogForm: ({ onSave }: { onSave: (items: CatalogItemMetadata[], unitSystem: UnitSystem) => Promise<void> }) => (
        <div>
            <button type="button" onClick={() => void onSave([], "metric")}>save no items</button>
            <button type="button" onClick={() => void onSave([ITEM], "metric")}>save one item</button>
        </div>
    ),
}));

import { MemberEditCatalog } from "@/components/members/MemberEditCatalog";

beforeEach(() => {
    m.save = vi.fn(async () => undefined);
    m.publish = vi.fn(async () => ({ uri: "ipfs://new-catalog" }));
});

describe("MemberEditCatalog — saving", () => {
    it("with no item, clears catalogURI from the profile and pins no catalog", async () => {
        render(<MemberEditCatalog />);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "save no items" })); });
        expect(m.publish).not.toHaveBeenCalled();
        expect(m.save).toHaveBeenCalledTimes(1);
        expect(m.save).toHaveBeenCalledWith({}, { clear: ["catalogURI"] });
    });

    it("with items, pins the catalog and links its URI from the profile", async () => {
        render(<MemberEditCatalog />);
        // The existing catalog (its version) is read from IPFS first.
        await act(async () => { await Promise.resolve(); });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "save one item" })); });
        expect(m.publish).toHaveBeenCalledWith({ subjectAddress: WALLET, items: [ITEM], version: "1.2.0", unitSystem: "metric" });
        expect(m.save).toHaveBeenCalledWith({ catalogURI: "ipfs://new-catalog" });
    });
});

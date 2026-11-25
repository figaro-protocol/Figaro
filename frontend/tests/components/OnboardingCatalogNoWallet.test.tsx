/**
 * `/members/catalog` with no wallet connected: the wallet signs, it is never a
 * login (docs/FRONTEND.md § "Wallet-provider scope per route").
 *
 * The page reads the item fields each bound assembly's clauses ask the catalog
 * for. The anonymous draft binds one registered assembly; the registry read
 * answers it with the freight-class clause (its spec, from `clauses/`,
 * declares the catalog fills), and the page asks for those fields in the item
 * row. Nothing asks the visitor to connect.
 *
 * Stood in for: the wallet (none connected), the draft's storage, the
 * assembly registry's answer, the image upload. The page, the form, the
 * clause-spec cache and the fill derivation are real.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

const m = vi.hoisted(() => ({
    design: `0x${"de".repeat(32)}`,
    clauseKey: "" as string,
}));

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
    usePathname: () => "/members/catalog",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/components/members/IpfsImageUpload", () => ({ IpfsImageUpload: () => null }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 1 }) }));
vi.mock("@/lib/registries/assemblyChoices", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/registries/assemblyChoices")>()),
    useAssemblyChoices: () => ({
        read: { status: "present", value: [{ processDesignHash: m.design, clauses: [m.clauseKey], state: "loaded", name: "Freight" }] },
    }),
}));
const TOKEN = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
vi.mock("@/lib/registries/onboardingState", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/registries/onboardingState")>()),
    useOnboardingState: () => ({
        state: {
            profile: { name: "Member", defaultTokenAddress: TOKEN, acceptedTokens: [{ address: TOKEN, symbol: "TKN" }] },
            assemblies: [{ processDesignHash: m.design }],
        },
        loaded: true,
        subject: "anonymous",
        update: vi.fn(),
    }),
}));

import OnboardingCatalogPage from "@/app/(app)/members/catalog/page";

describe("/members/catalog", () => {
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        m.clauseKey = keyOf("figaro-freight-class");
    });

    it("no wallet, read present: the item fields the bound assembly's clause asks for show, and no prompt to connect stands in for them", async () => {
        render(<OnboardingCatalogPage />);
        expect(await screen.findByText("Item properties the assemblies you bound ask for (all optional)")).toBeInTheDocument();
        expect(screen.getByText("Freight class")).toBeInTheDocument();
        for (const field of ["nmfcClass", "nmfcItem"]) {
            expect(document.querySelector(`[data-testid*="-clause-${m.clauseKey}-${field}"]`), field).not.toBeNull();
        }
        expect(screen.queryByText(/connect (a|your) wallet/i)).toBeNull();
    });
});

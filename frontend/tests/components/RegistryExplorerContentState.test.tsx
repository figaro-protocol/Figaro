import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

vi.mock("next/navigation", () => ({
    usePathname: () => "/registries",
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(searchParams),
}));
let searchParams = "family=clauses";

const clauseEventsMock = vi.fn();
vi.mock("@/lib/protocol/useClauseRegistry", () => ({ useAllRegisteredClauses: () => clauseEventsMock() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, loadedCount: 0, total: 0, errors: [], version: 1 }) }));
const assembliesMock = vi.fn();
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => assembliesMock() }));
vi.mock("@/lib/member/useRegisteredMembers", () => ({ useRegisteredMembers: () => ({ data: [], failed: false }) }));
vi.mock("@/components/assemblies/AssemblyShapeLine", () => ({ AssemblyShapeLine: () => null }));

import { RegistryExplorer } from "@/components/registries/RegistryExplorer";

const ev = (clauseId: string) => ({
    idHash: "0x01", clauseId, version: 1, contentHash: undefined, contentURI: `ipfs://${clauseId}`,
    registrar: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", blockNumber: 1n, stakeWithdrawn: false,
});

describe("RegistryExplorer — the state of the content behind a pointer is shown, never mistaken for its absence", () => {
    beforeEach(() => { _resetClauseSpecCache_TESTING_ONLY(); assembliesMock.mockReturnValue({ data: [] }); });
    afterEach(() => { _resetClauseSpecCache_TESTING_ONLY(); });

    it("a clause whose spec has not resolved is grouped as unserved — NOT as (unclassified); a resolved spec with no article IS (unclassified)", async () => {
        searchParams = "family=clauses";
        // figaro-noarticle: resolved, declares no article. figaro-fresh: never served. figaro-bad: served but wrong (verification failure).
        setClauseSpecFetcher(async (uri) => {
            if (uri === "ipfs://figaro-noarticle") return { clauseId: "figaro-noarticle", version: 1, title: "No article", description: "d", fields: [{ name: "x", type: "string", required: true }] };
            if (uri === "ipfs://figaro-bad") return { clauseId: "figaro-other", version: 1, title: "Other", description: "d", fields: [{ name: "x", type: "string", required: true }] };
            throw new Error("504");
        });
        await loadClauseSpec("figaro-noarticle", 1, "ipfs://figaro-noarticle");
        await loadClauseSpec("figaro-bad", 1, "ipfs://figaro-bad").catch(() => undefined);
        clauseEventsMock.mockReturnValue({ data: [ev("figaro-noarticle"), ev("figaro-fresh"), ev("figaro-bad")], failed: false });

        render(<RegistryExplorer />);

        const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
        expect(headings).toContain("(unclassified)");
        expect(headings).toContain("(content not served by the gateway yet — re-reading)");
        expect(headings).toContain("(content unavailable — the pinned document failed verification)");
        // The unresolved rows still show their on-chain identity.
        expect(screen.getByText("figaro-fresh")).toBeInTheDocument();
        expect(screen.getByText("figaro-bad")).toBeInTheDocument();
        // (unclassified) holds ONLY the resolved-no-article clause.
        const unclassified = screen.getByRole("heading", { level: 3, name: "(unclassified)" }).parentElement!;
        expect(unclassified.textContent).toContain("figaro-noarticle");
        expect(unclassified.textContent).not.toContain("figaro-fresh");
        expect(screen.getAllByTestId("content-resolving")).toHaveLength(1);
        expect(screen.getAllByTestId("content-unavailable")).toHaveLength(1);
    });

    it("an assembly whose template has not resolved shows its slug with the unserved note; a resolved one shows its name, no note", () => {
        searchParams = "family=assemblies";
        clauseEventsMock.mockReturnValue({ data: [], failed: false });
        assembliesMock.mockReturnValue({ data: [
            { slug: "asm-fresh", author: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", compositionHash: "0x1", contentURI: "ipfs://a", blockNumber: 2n, networkTargets: [], state: "error", name: "asm-fresh", agreementCount: null, clauses: null, assemblyTemplate: null },
            { slug: "asm-named", author: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", compositionHash: "0x2", contentURI: "ipfs://b", blockNumber: 3n, networkTargets: [], state: "loaded", name: "Containerised import chain", agreementCount: 3, clauses: [], assemblyTemplate: { name: "Containerised import chain", agreements: [] } },
        ] });

        render(<RegistryExplorer />);

        expect(screen.getByTestId("assembly-view-asm-fresh").textContent).toBe("asm-fresh");
        expect(screen.getByTestId("assembly-view-asm-named").textContent).toBe("Containerised import chain");
        expect(screen.getAllByTestId("content-resolving")).toHaveLength(1);
        expect(screen.getByTestId("content-resolving").textContent).toMatch(/not served by the gateway yet/);
    });
});

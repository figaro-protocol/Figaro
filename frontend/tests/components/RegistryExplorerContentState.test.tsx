import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { pinSpec } from "../lib/primeClauseSpecs";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/registries",
    useRouter: () => ({ replace: replaceMock }),
    useSearchParams: () => new URLSearchParams(searchParams),
}));
let searchParams = "family=clauses";

const clauseEventsMock = vi.fn();
vi.mock("@/lib/protocol/useClauseRegistry", () => ({ useAllRegisteredClauses: () => clauseEventsMock() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, loadedCount: 0, total: 0, errors: [], version: 1 }) }));
const assembliesMock = vi.fn();
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => assembliesMock() }));
vi.mock("@/lib/member/useRegisteredMembers", () => ({ useRegisteredMembers: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/components/assemblies/AssemblyShapeLine", () => ({ AssemblyShapeLine: () => null }));

import { RegistryExplorer } from "@/components/registries/RegistryExplorer";

/** The registry row for one clause key: the key and the URI it is pinned at. */
const ev = (clauseKey: string) => ({
    clauseKey, contentURI: `ipfs://${clauseKey}`, transactionHash: "0x",
    registeredBy: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", blockNumber: 1n, stakeWithdrawn: false,
});

const present = (value: unknown) => ({ read: { status: "present", value } });

describe("RegistryExplorer — a row only once its content resolves; a failed read renders nothing", () => {
    beforeEach(() => { _resetClauseSpecCache_TESTING_ONLY(); assembliesMock.mockReturnValue(present([])); });
    afterEach(() => { _resetClauseSpecCache_TESTING_ONLY(); });

    it("a clause whose spec has not resolved, or failed verification, is no row — no hash as its name, no placeholder article", async () => {
        searchParams = "family=clauses&sort=article";
        const noArticle = pinSpec({ clauseId: "figaro-noarticle", version: 1, title: "No article", description: "d", fields: [{ name: "x", type: "string", required: true }] });
        const other = pinSpec({ clauseId: "figaro-other", version: 1, title: "Other", description: "d", fields: [{ name: "x", type: "string", required: true }] });
        const FRESH = `0x${"f1".repeat(32)}` as const;
        const BAD = `0x${"ba".repeat(32)}` as const;
        setClauseSpecFetcher(async (uri) => {
            if (uri === `ipfs://${noArticle.clauseKey}`) return noArticle.bytes;
            if (uri === `ipfs://${BAD}`) return other.bytes; // bytes that are not BAD's
            throw new Error("504");
        });
        await loadClauseSpec(noArticle.clauseKey, `ipfs://${noArticle.clauseKey}`);
        await loadClauseSpec(BAD, `ipfs://${BAD}`).catch(() => undefined);
        clauseEventsMock.mockReturnValue(present([ev(noArticle.clauseKey), ev(FRESH), ev(BAD)]));

        render(<RegistryExplorer />);

        expect(screen.getByText(noArticle.clauseKey)).toBeInTheDocument();
        expect(document.body.textContent).toContain("No article · figaro-noarticle v1");
        expect(screen.queryByText(FRESH)).toBeNull();
        expect(screen.queryByText(BAD)).toBeNull();
        expect(document.body.textContent).not.toMatch(/unclassified|content unavailable|not served by the gateway/);
    });

    it("a FAILED registry read renders nothing for the family — no failure text, no count, no empty state", () => {
        searchParams = "family=clauses";
        clauseEventsMock.mockReturnValue({ read: { status: "absent" } });
        render(<RegistryExplorer />);
        expect(screen.queryByTestId("registry-count")).toBeNull();
        expect(screen.queryByTestId("registry-empty")).toBeNull();
        expect(screen.queryByTestId("registry-loading")).toBeNull();
        expect(document.body.textContent).not.toMatch(/read failed|RPC endpoint/);
    });

    it("\"assemblies composing it\" carries the clause facet INTO the assemblies family — the family change resets only what the click did not set", async () => {
        searchParams = "family=clauses&article=logistics";
        const cargo = pinSpec({ clauseId: "figaro-cargo", version: 1, title: "Cargo", description: "d", fields: [{ name: "x", type: "string", required: true }], block: { design: { article: "logistics" } } });
        setClauseSpecFetcher(async () => cargo.bytes);
        await loadClauseSpec(cargo.clauseKey, `ipfs://${cargo.clauseKey}`);
        clauseEventsMock.mockReturnValue(present([ev(cargo.clauseKey)]));
        replaceMock.mockClear();

        render(<RegistryExplorer />);
        fireEvent.click(screen.getByRole("button", { name: "assemblies composing it" }));

        expect(replaceMock).toHaveBeenCalledTimes(1);
        const url = String(replaceMock.mock.calls[0][0]);
        expect(url).toContain("family=assemblies");
        expect(url).toContain(`clause=${cargo.clauseKey}`);
        // The clauses-only article facet is dropped by the family change.
        expect(url).not.toContain("article=");
    });

    it("an assembly still loading is no row; a loaded one shows its name and summary", () => {
        searchParams = "family=assemblies";
        clauseEventsMock.mockReturnValue(present([]));
        assembliesMock.mockReturnValue(present([
            { slug: "asm-fresh", registeredBy: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", assemblyHash: "0x1", contentURI: "ipfs://a", blockNumber: 2n, networkTargets: [], state: "loading", name: "asm-fresh", agreementCount: null, clauses: null, hydratedAssembly: null },
            { slug: "asm-named", registeredBy: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", assemblyHash: "0x2", contentURI: "ipfs://b", blockNumber: 3n, networkTargets: [], state: "loaded", name: "Containerized import chain", agreementCount: 3, clauses: [], hydratedAssembly: { assembly: { name: "Containerized import chain", summary: "Six bonded parties move a container.", agreements: [] }, agreements: {} } },
        ]));

        render(<RegistryExplorer />);

        expect(screen.queryByTestId("assembly-view-asm-fresh")).toBeNull();
        expect(screen.getByTestId("assembly-view-asm-named").textContent).toBe("Containerized import chain");
        expect(screen.getByText("Six bonded parties move a container.")).toBeTruthy();
    });
});

describe("RegistryExplorer — the family tabs are a WAI-ARIA tab set with 44px targets", () => {
    beforeEach(() => {
        searchParams = "family=clauses";
        clauseEventsMock.mockReturnValue(present([]));
        assembliesMock.mockReturnValue(present([]));
    });

    it("each tab controls the one tabpanel, which is labeled by the selected tab and holds the results", () => {
        render(<RegistryExplorer />);
        const tabs = screen.getAllByRole("tab");
        const panel = screen.getByRole("tabpanel");
        for (const tab of tabs) expect(tab.getAttribute("aria-controls")).toBe(panel.id);
        const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
        expect(selected).toHaveLength(1);
        expect(selected[0].id).toBeTruthy();
        expect(panel.getAttribute("aria-labelledby")).toBe(selected[0].id);
        expect(panel).toContainElement(screen.getByTestId("registry-search"));
        expect(panel).toContainElement(screen.getByTestId("registry-count"));
    });

    it("roving tabindex: only the selected tab is in the tab order", () => {
        render(<RegistryExplorer />);
        for (const tab of screen.getAllByRole("tab")) {
            expect(tab.getAttribute("tabindex")).toBe(tab.getAttribute("aria-selected") === "true" ? "0" : "-1");
        }
    });

    it("arrow keys, Home and End move the selection along the row", () => {
        replaceMock.mockClear();
        render(<RegistryExplorer />);
        const tabs = screen.getAllByRole("tab");
        const familyOf = (t: HTMLElement) => t.dataset.testid!.replace("registry-family-", "");
        const first = tabs[0];
        expect(first.getAttribute("aria-selected")).toBe("true");
        fireEvent.keyDown(first, { key: "ArrowRight" });
        expect(replaceMock.mock.calls.at(-1)?.[0]).toContain(`family=${familyOf(tabs[1])}`);
        fireEvent.keyDown(first, { key: "ArrowLeft" });
        expect(replaceMock.mock.calls.at(-1)?.[0]).toContain(`family=${familyOf(tabs.at(-1)!)}`);
        fireEvent.keyDown(first, { key: "Home" });
        expect(replaceMock.mock.calls.at(-1)?.[0]).toContain(`family=${familyOf(tabs[0])}`);
        fireEvent.keyDown(first, { key: "End" });
        expect(replaceMock.mock.calls.at(-1)?.[0]).toContain(`family=${familyOf(tabs.at(-1)!)}`);
    });

    it("every tab is a 44px target (WCAG 2.5.5) on the tile radius", () => {
        render(<RegistryExplorer />);
        for (const tab of screen.getAllByRole("tab")) {
            const cls = tab.getAttribute("class") ?? "";
            expect(cls).toContain("min-h-11");
            expect(cls).toContain("rounded-tile");
            expect(cls).not.toMatch(/(^|\s)rounded(\s|$)/);
        }
    });
});

describe("RegistryExplorer — the search field and the facet selects are the §7 form controls", () => {
    beforeEach(() => { _resetClauseSpecCache_TESTING_ONLY(); assembliesMock.mockReturnValue(present([])); });
    afterEach(() => { _resetClauseSpecCache_TESTING_ONLY(); });

    it("each is a 44px target (WCAG 2.5.5) on the tile radius, with the focus token's ring", async () => {
        searchParams = "family=clauses";
        const cargo = pinSpec({ clauseId: "figaro-cargo", version: 1, title: "Cargo", description: "d", fields: [{ name: "x", type: "string", required: true }], block: { design: { article: "logistics" } } });
        setClauseSpecFetcher(async () => cargo.bytes);
        await loadClauseSpec(cargo.clauseKey, `ipfs://${cargo.clauseKey}`);
        clauseEventsMock.mockReturnValue(present([ev(cargo.clauseKey)]));

        render(<RegistryExplorer />);

        for (const id of ["registry-search", "registry-sort", "registry-stake", "registry-article"]) {
            const cls = screen.getByTestId(id).getAttribute("class") ?? "";
            expect(cls).toContain("min-h-11");
            expect(cls).toContain("rounded-tile");
            expect(cls).toContain("focus-visible:ring-focus");
            expect(cls).not.toMatch(/(^|\s)rounded(\s|$)/);
            expect(cls).not.toMatch(/\[[^\]]*\]/);
        }
    });
});

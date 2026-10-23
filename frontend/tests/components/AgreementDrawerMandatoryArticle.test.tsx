/**
 * The drawer's mandatory article — the DAO's clauses, with nothing to choose.
 *
 * An agreement is not an agreement without commerce and topology, so the
 * canvas writes them into every agreement before the designer composes
 * anything. The article shows which clauses those are on the network this
 * site reads: the DAO wallet's live registrations whose spec declares the
 * mandatory article (`mandatoryClausesForCanvas`), by registrant and stake.
 * A mandatory-article registration by any other wallet is an ordinary clause
 * and is not listed here; no mandatory clause is offered as a checkbox.
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { computeClauseKey, canonicalize, type Hex } from "@figaro-protocol/sdk";

vi.mock("@/lib/protocol/useAgreementRegistry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/protocol/useAgreementRegistry")>();
    return {
        ...actual,
        usePublishedAgreements: () => ({ data: [], refetch: async () => undefined }),
        fetchRegisteredAgreement: async (key: `0x${string}`) => actual.getRegisteredAgreement(key) ?? null,
    };
});
vi.mock("@/lib/protocol/useClauseRegistry", async () => {
    const { listKnownClauses } = await import("@/lib/shared/clauseSpecSource");
    return {
        useAllRegisteredClauses: () => ({
            data: listKnownClauses().map((c) => ({ clauseKey: c.clauseKey, contentURI: "", stakeWithdrawn: false })),
        }),
    };
});
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));

import { AgreementDrawer } from "@/app/(tools)/assemblies/designer/_components/AgreementDrawer";
import { createSyntheticRootOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import { loadClauseSpec, mandatoryClausesForCanvas, mandatoryClausesPending, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import path from "node:path";
import { TEST_DAO_TREASURY, canonicalFileBytes, keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

const STRANGER = "0x1111111111111111111111111111111111111111" as const;
const NOBODY = "0x2222222222222222222222222222222222222222" as const;
let strangersCommerce: Hex;
let commerce: Hex;
let topology: Hex;
let schedule: Hex;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology", "figaro-schedule"]);
    // The DAO's keys, read before a look-alike shares commerce's name.
    commerce = keyOf("figaro-commerce");
    topology = keyOf("figaro-topology");
    schedule = keyOf("figaro-schedule");
    // Another wallet's registration of a commerce look-alike: the DAO's spec
    // with another title — same shape, another key, another registrant.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-commerce.json"), "utf8")) as Record<string, unknown>;
    const lookalike = { ...raw, title: "Commerce (a stranger's registration)" };
    const bytes = canonicalize(lookalike);
    strangersCommerce = computeClauseKey(lookalike);
    setClauseSpecFetcher(async (uri) => (uri === "mem://strangers-commerce" ? bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(strangersCommerce, "mem://strangers-commerce", { registeredBy: STRANGER, blockNumber: 99n, stakeWithdrawn: false });
});

afterEach(() => {
    process.env.NEXT_PUBLIC_DAO_TREASURY = TEST_DAO_TREASURY;
});

function renderDrawer() {
    const order = createSyntheticRootOrder(startSyntheticSession()).order;
    render(<AgreementDrawer embedded order={order} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("drawer-tab-registry"));
}

describe("AgreementDrawer — the mandatory article shows the DAO's clauses, with nothing to choose", () => {
    it("lists the DAO wallet's live commerce and topology, and not another wallet's mandatory registration", () => {
        renderDrawer();
        const article = screen.getByTestId("drawer-mandatory-article");
        expect(article.querySelector(`[data-testid="drawer-mandatory-clause-${commerce}"]`)).not.toBeNull();
        expect(article.querySelector(`[data-testid="drawer-mandatory-clause-${topology}"]`)).not.toBeNull();
        expect(article.querySelector(`[data-testid="drawer-mandatory-clause-${strangersCommerce}"]`)).toBeNull();
        expect(article.querySelectorAll("input")).toHaveLength(0);
        expect(article.textContent).toContain("nothing here is chosen");
    });

    it("says that nothing publishes when the DAO's wallet holds no live mandatory clause on this network", () => {
        process.env.NEXT_PUBLIC_DAO_TREASURY = NOBODY;
        renderDrawer();
        expect(screen.getByTestId("drawer-mandatory-empty").textContent).toMatch(/nothing publishes/);
        expect(screen.queryByTestId("drawer-mandatory-list")).toBeNull();
    });

    it("says that nothing publishes when the site names no DAO wallet", () => {
        delete process.env.NEXT_PUBLIC_DAO_TREASURY;
        renderDrawer();
        expect(screen.getByTestId("drawer-mandatory-empty").textContent).toMatch(/names no DAO wallet/);
    });

    it("offers no mandatory clause as a checkbox of its own", () => {
        renderDrawer();
        expect(screen.queryByTestId(`drawer-registry-clause-${commerce}`)).toBeNull();
        expect(screen.queryByTestId(`drawer-registry-clause-${topology}`)).toBeNull();
        expect(screen.getByTestId(`drawer-registry-clause-${schedule}`)).toBeTruthy();
    });

    it("offers another wallet's mandatory-article registration as an ordinary clause", () => {
        // A stranger's commerce look-alike declares the mandatory article, but
        // the article is not the canvas's set: it is a clause like any other,
        // chosen or not, and the build refuses a second commerce shape.
        renderDrawer();
        expect(screen.getByTestId(`drawer-registry-clause-${strangersCommerce}`)).toBeTruthy();
    });

    it("a withdrawn DAO registration is never revived by a later load stating no registration fact", async () => {
        // The registry reader states a withdrawal; a spec warm (the agreement
        // fetch path) then loads the same key with no registration. The row
        // stays withdrawn, so the canvas writes the DAO's other commerce.
        const { readFileSync } = await import("node:fs");
        const path = await import("node:path");
        const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-commerce.json"), "utf8")) as Record<string, unknown>;
        const withdrawn = { ...raw, title: "Commerce (the DAO's withdrawn registration)" };
        const bytes = canonicalize(withdrawn);
        const key = computeClauseKey(withdrawn);
        setClauseSpecFetcher(async (uri) => (uri === "mem://dao-withdrawn" ? bytes : canonicalFileBytes(uri)));
        await loadClauseSpec(key, "mem://dao-withdrawn", { registeredBy: TEST_DAO_TREASURY, blockNumber: 500n, stakeWithdrawn: true });
        await loadClauseSpec(key, "mem://dao-withdrawn");
        await loadClauseSpec(key, "mem://dao-withdrawn", { registeredBy: TEST_DAO_TREASURY, blockNumber: 500n, stakeWithdrawn: false });
        expect(Object.keys(mandatoryClausesForCanvas())).toContain(commerce);
        expect(Object.keys(mandatoryClausesForCanvas())).not.toContain(key);
    });

    it("says a DAO registration is still being read, and writes nothing, while a live DAO spec is unread", async () => {
        const unread = `0x${"77".repeat(32)}` as const;
        setClauseSpecFetcher(async (uri) => {
            if (uri === "mem://dao-unread") throw new Error("gateway unreachable");
            return canonicalFileBytes(uri);
        });
        await expect(loadClauseSpec(unread, "mem://dao-unread", { registeredBy: TEST_DAO_TREASURY, blockNumber: 900n, stakeWithdrawn: false })).rejects.toThrow();
        expect(mandatoryClausesPending()).toBe(true);
        expect(mandatoryClausesForCanvas()).toEqual({});
        renderDrawer();
        expect(screen.getByTestId("drawer-mandatory-empty").textContent).toMatch(/still being read/);
        // Read at last: the set is known again.
        setClauseSpecFetcher(async (uri) => (uri === "mem://dao-unread" ? canonicalFileBytes(path.resolve(process.cwd(), "../clauses/figaro-schedule.json")) : canonicalFileBytes(uri)));
        await expect(loadClauseSpec(unread, "mem://dao-unread")).rejects.toThrow(/integrity/);
        expect(mandatoryClausesPending()).toBe(false);
        expect(Object.keys(mandatoryClausesForCanvas())).toContain(commerce);
    });
});

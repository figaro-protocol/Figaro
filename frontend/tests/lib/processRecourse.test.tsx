/**
 * Process recourse — the forum an agreement names, read from the clause's own
 * spec. `deriveProcessRecourse` keeps a clause whose spec declares the
 * dispute-resolution article, never one a code path names; `RecoursePanel`
 * shows each from its spec, with the forum link the spec declares in
 * `block.design.composes.forumUrl`.
 *
 * The specs come from `clauses/` (the Kleros clause, the commerce clause as a
 * clause that is no recourse). A second forum is built here from the Kleros
 * spec under another id, title and forum link, and registered like any other:
 * it surfaces with no change to the code under test.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Hex } from "@figaro-protocol/sdk";
import type { Agreement } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/kernel/store";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { deriveProcessRecourse } from "@/lib/semantic/processRecourse";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs, TEST_DAO_TREASURY } from "./primeClauseSpecs";

const agreementsState = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
vi.mock("wagmi", () => ({ usePublicClient: () => undefined, useChainId: () => 31337 }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({
    useRuntimeServices: () => ({ evidenceTransport: { pinBlob: async () => "cid", unpin: async () => undefined } }),
}));
vi.mock("@/lib/audit/auditBundlePdf", () => ({ buildAuditBundlePdfBlob: async () => new Blob(["pdf"]) }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => agreementsState.map }));

import { RecoursePanel } from "@/components/runtime/RecoursePanel";

const PROCESS = `0x${"ab".repeat(32)}` as const;
const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
const SECOND_FORUM_URL = "https://disputes.acme-forum.example";

let kleros: Hex;
let commerce: Hex;
let acme: Hex;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-arbitration-kleros", "figaro-commerce"]);
    kleros = keyOf("figaro-arbitration-kleros");
    commerce = keyOf("figaro-commerce");
    // A second forum: the Kleros spec under another id, title and link. Its
    // own article marks it as recourse; nothing in code names it.
    const raw = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-arbitration-kleros.json"), "utf8")) as Record<string, any>;
    const second = {
        ...raw,
        clauseId: "figaro-arbitration-acme-forum",
        title: "Acme forum arbitration",
        block: { ...raw.block, design: { ...raw.block.design, composes: { interface: "dispute-forum", forumUrl: SECOND_FORUM_URL } } },
    };
    const { clauseKey, bytes } = pinSpec(second);
    acme = clauseKey;
    setClauseSpecFetcher(async (uri) => (uri === "mem://acme-forum" ? bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(acme, "mem://acme-forum", { registeredBy: TEST_DAO_TREASURY, blockNumber: 50n, stakeWithdrawn: false });
});

const orderOf = (checkoutHash: string | undefined) => ({ checkoutHash }) as unknown as Order;
const agreementOf = (...entries: [Hex, Record<string, unknown> | undefined][]) =>
    ({ clauses: entries.map(([clause, data]) => (data === undefined ? { clause } : { clause, data })) }) as unknown as Agreement;

describe("deriveProcessRecourse — a clause is recourse by its article, read from its spec", () => {
    it("keeps the Kleros clause an order's agreement composes, with its committed data, and drops a clause of another article", () => {
        const agreements = new Map([["0xh1", agreementOf([commerce, { amount: 1 }], [kleros, { klerosCourt: "general" }])]]);
        expect(deriveProcessRecourse([orderOf("0xh1")], agreements)).toEqual([
            { clauseKey: kleros, data: { klerosCourt: "general" } },
        ]);
    });

    it("keeps a second forum, built from another spec, with no change to the reader", () => {
        const agreements = new Map([["0xh1", agreementOf([acme, { klerosCourt: "blockchain-technical" }])]]);
        expect(deriveProcessRecourse([orderOf("0xh1")], agreements).map((r) => r.clauseKey)).toEqual([acme]);
    });

    it("returns every distinct forum in first-seen order, and a repeat of the same clause with the same data once", () => {
        const agreements = new Map([
            ["0xh1", agreementOf([kleros, { klerosCourt: "general" }])],
            ["0xh2", agreementOf([kleros, { klerosCourt: "general" }], [acme, {}])],
            ["0xh3", agreementOf([kleros, { klerosCourt: "english-language" }])],
        ]);
        const out = deriveProcessRecourse([orderOf("0xh1"), orderOf("0xh2"), orderOf("0xh3")], agreements);
        expect(out.map((r) => [r.clauseKey, r.data])).toEqual([
            [kleros, { klerosCourt: "general" }],
            [acme, {}],
            [kleros, { klerosCourt: "english-language" }],
        ]);
    });

    it("reads a clause with no committed data as empty data", () => {
        const agreements = new Map([["0xh1", agreementOf([kleros, undefined])]]);
        expect(deriveProcessRecourse([orderOf("0xh1")], agreements)).toEqual([{ clauseKey: kleros, data: {} }]);
    });

    it("is empty where nothing was read: no orders, an order with no checkout hash, an agreement not yet read", () => {
        expect(deriveProcessRecourse([], new Map())).toEqual([]);
        expect(deriveProcessRecourse([orderOf(undefined)], new Map([["0xh1", agreementOf([kleros, {}])]]))).toEqual([]);
        expect(deriveProcessRecourse([orderOf("0xh1")], new Map())).toEqual([]);
    });

    it("leaves out a clause whose spec is not loaded: no article is known, so none is guessed", () => {
        const unknown = `0x${"77".repeat(32)}` as Hex;
        expect(deriveProcessRecourse([orderOf("0xh1")], new Map([["0xh1", agreementOf([unknown, {}])]]))).toEqual([]);
    });

    it("reads nothing once the spec cache is empty", () => {
        // Last in this block: it clears the cache the other cases read.
        const agreements = new Map([["0xh1", agreementOf([kleros, {}])]]);
        _resetClauseSpecCache_TESTING_ONLY();
        expect(deriveProcessRecourse([orderOf("0xh1")], agreements)).toEqual([]);
    });
});

describe("RecoursePanel — shows each forum from its own spec", () => {
    beforeEach(async () => {
        agreementsState.map = new Map();
        await primeClauseSpecs(["figaro-arbitration-kleros", "figaro-commerce"]);
        const raw = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-arbitration-kleros.json"), "utf8")) as Record<string, any>;
        const second = {
            ...raw,
            clauseId: "figaro-arbitration-acme-forum",
            title: "Acme forum arbitration",
            block: { ...raw.block, design: { ...raw.block.design, composes: { interface: "dispute-forum", forumUrl: SECOND_FORUM_URL } } },
        };
        const { bytes } = pinSpec(second);
        setClauseSpecFetcher(async (uri) => (uri === "mem://acme-forum" ? bytes : canonicalFileBytes(uri)));
        await loadClauseSpec(acme, "mem://acme-forum", { registeredBy: TEST_DAO_TREASURY, blockNumber: 50n, stakeWithdrawn: false });
    });

    it("shows the Kleros clause's title, its chosen court and the forum link its spec declares", async () => {
        render(<RecoursePanel processId={PROCESS} recourses={[{ clauseKey: kleros, data: { klerosCourt: "blockchain-technical" } }]} />);
        const row = await screen.findByTestId(`dispute-recourse-${kleros}`);
        expect(row.textContent).toContain("Kleros decentralized arbitration");
        expect(row.textContent).toContain("Blockchain — Technical");
        expect(row.querySelector('[data-testid="dispute-open-forum"]')?.getAttribute("href")).toBe("https://resolve.kleros.io");
    });

    it("shows a second forum, with its own link, beside the first", async () => {
        render(
            <RecoursePanel
                processId={PROCESS}
                recourses={[{ clauseKey: kleros, data: {} }, { clauseKey: acme, data: {} }]}
            />,
        );
        const second = await screen.findByTestId(`dispute-recourse-${acme}`);
        expect(second.textContent).toContain("Acme forum arbitration");
        expect(second.querySelector('[data-testid="dispute-open-forum"]')?.getAttribute("href")).toBe(SECOND_FORUM_URL);
        expect(screen.getByTestId(`dispute-recourse-${kleros}`)).toBeTruthy();
    });

    it("leaves the forum list's place empty where nothing was read: no recourse given, or an empty list", async () => {
        const { rerender } = render(<RecoursePanel processId={PROCESS} />);
        await screen.findByText("Dispute Resolution");
        expect(screen.queryByTestId("dispute-recourse-list")).toBeNull();
        rerender(<RecoursePanel processId={PROCESS} recourses={[]} />);
        expect(screen.queryByTestId("dispute-recourse-list")).toBeNull();
        // No stand-in text names a forum, and no error is shown.
        expect(screen.queryByTestId("dispute-open-forum")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("offers the evidence bundle only when the process has orders", async () => {
        const { rerender } = render(<RecoursePanel processId={PROCESS} orders={[]} />);
        await screen.findByText("Dispute Resolution");
        expect(screen.queryByTestId("dispute-evidence-bundle")).toBeNull();
        rerender(<RecoursePanel processId={PROCESS} orders={[orderOf("0xh1")]} />);
        await waitFor(() => expect(screen.getByTestId("dispute-evidence-prepare")).toBeTruthy());
    });
});

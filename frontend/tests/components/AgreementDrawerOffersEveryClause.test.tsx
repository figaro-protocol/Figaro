/**
 * The drawer offers every live agreement-scoped clause as a checkbox.
 *
 * No clause is written into an agreement by the canvas: the commerce clause
 * is offered like any other, and the designer composes it or leaves it out.
 * A stranger's registration whose `block.design.article` is a word this
 * reader has no rule for (`mandatory` among them) is offered like any other
 * clause, grouped under its own word.
 *
 * The two composition surfaces of the designer partition the live registry by
 * the scope each clause declares (`block.design.scope`, parsed by
 * `lib/shared/clauseBlockBinding.ts`, read by `clauseIsAssemblyScoped`): the
 * drawer offers every agreement-scoped clause and no assembly-scoped one, and
 * the assembly terms panel offers every assembly-scoped clause and no
 * agreement-scoped one. A stranger's clause that declares `"assembly"` is
 * read by its declaration alone, never by its name.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { computeClauseKey, canonicalize, type Hex } from "@figaro-protocol/sdk";

vi.mock("@/lib/registries/useAgreementRegistry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/useAgreementRegistry")>();
    return {
        ...actual,
        usePublishedAgreements: () => ({ read: { status: "present", value: [] }, refetch: async () => undefined }),
        fetchRegisteredAgreement: async (key: `0x${string}`) => actual.getRegisteredAgreement(key) ?? null,
    };
});
vi.mock("@/lib/registries/useClauseRegistry", async () => {
    const { listKnownClauses } = await import("@/lib/shared/clauseSpecSource");
    return {
        useAllRegisteredClauses: () => ({
            read: {
                status: "present",
                value: listKnownClauses().map((c) => ({ clauseKey: c.clauseKey, contentURI: "", stakeWithdrawn: false })),
            },
        }),
    };
});
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));

import { AgreementDrawer } from "@/app/(tools)/assemblies/designer/_components/AgreementDrawer";
import { AssemblyTermsPanel } from "@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel";
import { createSyntheticRootOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { canonicalFileBytes, keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

let strangers: Hex;
/** A stranger's clause with commerce's fields that declares `design.scope: "assembly"`. */
let strangersShared: Hex;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-schedule", "figaro-applicable-law"]);
    // Another wallet's registration: commerce's fields under another name,
    // declaring an article this reader has no rule for.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-commerce.json"), "utf8")) as {
        block: { design: Record<string, unknown> };
    } & Record<string, unknown>;
    const theirs = {
        ...raw,
        clauseId: "stranger-line-items",
        title: "A stranger's line items",
        block: { ...raw.block, design: { ...raw.block.design, article: "mandatory" } },
    };
    const bytes = canonicalize(theirs);
    strangers = computeClauseKey(theirs);
    const shared = {
        ...raw,
        clauseId: "stranger-shared-terms",
        title: "A stranger's shared terms",
        block: { ...raw.block, design: { ...raw.block.design, scope: "assembly" } },
    };
    const sharedBytes = canonicalize(shared);
    strangersShared = computeClauseKey(shared);
    setClauseSpecFetcher(async (uri) =>
        uri === "mem://strangers" ? bytes : uri === "mem://strangers-shared" ? sharedBytes : canonicalFileBytes(uri),
    );
    await loadClauseSpec(strangers, "mem://strangers");
    await loadClauseSpec(strangersShared, "mem://strangers-shared");
});

function renderDrawer() {
    const order = createSyntheticRootOrder(startSyntheticSession()).order;
    render(<AgreementDrawer embedded order={order} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("drawer-tab-registry"));
}

describe("AgreementDrawer — every live agreement-scoped clause is the designer's to compose", () => {
    it("offers the commerce clause as a checkbox, as it offers any clause", () => {
        renderDrawer();
        expect(screen.getByTestId(`drawer-registry-clause-${keyOf("figaro-commerce")}`)).toBeTruthy();
        expect(screen.getByTestId(`drawer-registry-clause-${keyOf("figaro-schedule")}`)).toBeTruthy();
    });

    it("shows no section of clauses written in without a choice", () => {
        renderDrawer();
        expect(screen.queryByTestId("drawer-mandatory-article")).toBeNull();
    });

    it("offers a stranger's clause whose article is `mandatory` as an ordinary clause", () => {
        renderDrawer();
        expect(screen.getByTestId(`drawer-registry-clause-${strangers}`)).toBeTruthy();
    });
});

describe("the designer's two surfaces partition the registry by block.design.scope", () => {
    const agreementScoped = () => [keyOf("figaro-commerce"), keyOf("figaro-schedule"), strangers];
    const assemblyScoped = () => [keyOf("figaro-applicable-law"), strangersShared];

    it("the drawer offers every agreement-scoped clause and no assembly-scoped one", () => {
        renderDrawer();
        for (const key of agreementScoped()) expect(screen.getByTestId(`drawer-registry-clause-${key}`)).toBeTruthy();
        for (const key of assemblyScoped()) expect(screen.queryByTestId(`drawer-registry-clause-${key}`)).toBeNull();
    });

    it("the assembly terms panel offers every assembly-scoped clause and no agreement-scoped one", () => {
        render(<AssemblyTermsPanel values={{}} onToggleClause={() => {}} onSetClauseField={() => {}} />);
        for (const key of assemblyScoped()) expect(screen.getByTestId(`assembly-terms-clause-${key}`)).toBeTruthy();
        for (const key of agreementScoped()) expect(screen.queryByTestId(`assembly-terms-clause-${key}`)).toBeNull();
    });
});

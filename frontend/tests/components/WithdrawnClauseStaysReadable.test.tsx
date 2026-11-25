/**
 * A clause whose designer has reclaimed its stake leaves the surfaces that
 * offer clauses for a new composition, and stays readable on an order that
 * already committed it.
 *
 * The registry read marks such a registration `stakeWithdrawn` (the
 * `DepositWithdrawn` event by clause key, `lib/registries/useClauseRegistry.ts`),
 * and the offer reads `isLiveRegistration`. The spec loader reads every
 * registration, withdrawn or not (`lib/registries/useClauseSpecs.ts`), so the
 * clause's spec stays in the cache and every reader of a committed order
 * still names it through its spec.
 *
 * Proves: the designer's drawer does not offer a withdrawn agreement-scoped
 * clause, the assembly terms panel does not offer a withdrawn assembly-scoped
 * one, each still offers a live one, and the review of an order that
 * committed the withdrawn clause shows its committed values and names it by
 * its spec's title.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ZERO_BYTES32, type Agreement, type Commitment } from "@figaro-protocol/sdk";

const withdrawn = vi.hoisted(() => new Set<string>());

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
                value: listKnownClauses().map((c) => ({
                    clauseKey: c.clauseKey,
                    contentURI: "",
                    stakeWithdrawn: withdrawn.has(c.clauseKey.toLowerCase()),
                })),
            },
        }),
    };
});
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));
vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));

import { AgreementDrawer } from "@/app/(tools)/assemblies/designer/_components/AgreementDrawer";
import { AssemblyTermsPanel } from "@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel";
import { AgreementReview } from "@/components/runtime/AgreementReview";
import { createSyntheticRootOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import { describeClause } from "@/lib/shared/clauseSpecSource";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-schedule", "figaro-applicable-law", "figaro-arbitration-kleros"]);
    // The schedule (agreement-scoped) and the applicable law (assembly-scoped)
    // are withdrawn; the commerce and the arbitration clauses stay live.
    withdrawn.add(keyOf("figaro-schedule").toLowerCase());
    withdrawn.add(keyOf("figaro-applicable-law").toLowerCase());
});

describe("a withdrawn clause leaves the offer for a new composition", () => {
    it("the designer's drawer offers the live clause and not the withdrawn one", () => {
        const order = createSyntheticRootOrder(startSyntheticSession()).order;
        render(<AgreementDrawer embedded order={order} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("drawer-tab-registry"));
        expect(screen.getByTestId(`drawer-registry-clause-${keyOf("figaro-commerce")}`)).toBeTruthy();
        expect(screen.queryByTestId(`drawer-registry-clause-${keyOf("figaro-schedule")}`)).toBeNull();
    });

    it("the assembly terms panel offers the live clause and not the withdrawn one", () => {
        render(<AssemblyTermsPanel values={{}} onToggleClause={() => {}} onSetClauseField={() => {}} />);
        expect(screen.getByTestId(`assembly-terms-clause-${keyOf("figaro-arbitration-kleros")}`)).toBeTruthy();
        expect(screen.queryByTestId(`assembly-terms-clause-${keyOf("figaro-applicable-law")}`)).toBeNull();
    });
});

describe("a withdrawn clause stays readable on an order that committed it", () => {
    const WINDOW = { windowStart: "2031-03-01T09:00:00Z", windowEnd: "2031-03-01T17:00:00Z" };
    const commitment: Commitment = {
        processId: ZERO_BYTES32,
        buyer: "0x1111111111111111111111111111111111111111",
        seller: "0x2222222222222222222222222222222222222222",
        token: "0x3333333333333333333333333333333333333333",
        payment: 10n,
        runningTotal: 10n,
        checkoutHash: `0x${"ab".repeat(32)}`,
        salt: 1n,
        commitDeadline: 1_900_000_000n,
    };

    it("the review shows its committed values, and its spec still names it", () => {
        const clause = keyOf("figaro-schedule");
        const agreement = { buyer: commitment.buyer, seller: commitment.seller, clauses: [{ clause, data: WINDOW }] } as unknown as Agreement;
        render(<AgreementReview commitment={commitment} agreement={agreement} />);
        const clauses = screen.getByTestId("preview-clauses");
        expect(clauses.textContent).toContain(clause);
        expect(clauses.textContent).toContain(WINDOW.windowStart);
        expect(clauses.textContent).toContain(WINDOW.windowEnd);
        const described = describeClause(clause, WINDOW);
        expect(described.title).toBe("Schedule");
        expect(described.fields.map((f) => f.name)).toEqual(["windowStart", "windowEnd"]);
    });
});

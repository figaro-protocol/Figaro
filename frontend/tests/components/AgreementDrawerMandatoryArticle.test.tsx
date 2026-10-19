/**
 * The drawer's mandatory article — registered agreements, not clauses.
 *
 * The article lists every live `AgreementRegistry` registration whose clauses
 * are all mandatory-article (`isMandatoryAgreement`), whoever registered it:
 * the DAO's and any other wallet's. The designer picks one for the order;
 * nothing is preselected. A registration carrying any other clause is not
 * listed here (it binds on the agreements tab), and no mandatory clause is
 * offered as a checkbox on its own.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Hex, RegisteredAgreement } from "@figaro-protocol/sdk";

const rows = vi.hoisted(() => ({ agreements: [] as { agreementKey: `0x${string}`; contentURI: string; stakeWithdrawn: boolean }[] }));

vi.mock("@/lib/protocol/useAgreementRegistry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/protocol/useAgreementRegistry")>();
    return {
        ...actual,
        usePublishedAgreements: () => ({ data: rows.agreements, refetch: async () => undefined }),
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
import { _primeRegisteredAgreement_TESTING_ONLY } from "@/lib/protocol/useAgreementRegistry";
import { createSyntheticRootOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import { keyOf, primeClauseSpecs, primeMandatoryPick } from "../lib/primeClauseSpecs";

let daoPick: Hex;
let otherPick: Hex;
let notMandatory: Hex;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology", "figaro-schedule"]);
    // The DAO's registration: the reference agreement holding the mandatory clauses alone.
    daoPick = await primeMandatoryPick();
    // Another wallet's registration whose clauses are all mandatory-article too.
    otherPick = _primeRegisteredAgreement_TESTING_ONLY({ name: "Topology only", clauses: { [keyOf("figaro-topology")]: {} } } as RegisteredAgreement);
    // A registration carrying a clause outside the mandatory article.
    notMandatory = _primeRegisteredAgreement_TESTING_ONLY({
        name: "Scheduled work",
        clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {}, [keyOf("figaro-schedule")]: {} },
    } as RegisteredAgreement);
    rows.agreements = [daoPick, otherPick, notMandatory].map((agreementKey) => ({ agreementKey, contentURI: "", stakeWithdrawn: false }));
});

function renderDrawer(props: Partial<React.ComponentProps<typeof AgreementDrawer>> = {}) {
    const order = createSyntheticRootOrder(startSyntheticSession()).order;
    const onPickMandatory = vi.fn();
    render(<AgreementDrawer embedded order={order} onClose={() => {}} onPickMandatory={onPickMandatory} {...props} />);
    fireEvent.click(screen.getByTestId("drawer-tab-registry"));
    return { onPickMandatory };
}

describe("AgreementDrawer — the mandatory article lists registered agreements", () => {
    it("lists every registration whose clauses are all mandatory-article, any wallet's, and no other", () => {
        renderDrawer();
        const article = screen.getByTestId("drawer-mandatory-article");
        expect(article.querySelector(`[data-testid="drawer-mandatory-agreement-${daoPick}"]`)).not.toBeNull();
        expect(article.querySelector(`[data-testid="drawer-mandatory-agreement-${otherPick}"]`)).not.toBeNull();
        expect(article.querySelector(`[data-testid="drawer-mandatory-agreement-${notMandatory}"]`)).toBeNull();
        // The pinned document's name labels the row.
        expect(article.textContent).toContain("Mandatory clauses");
    });

    it("preselects nothing; a click picks that registration for the order", () => {
        const { onPickMandatory } = renderDrawer();
        const rowsShown = screen.getAllByTestId(/^drawer-mandatory-agreement-/) as HTMLInputElement[];
        expect(rowsShown.length).toBe(2);
        for (const row of rowsShown) expect(row.checked).toBe(false);
        fireEvent.click(screen.getByTestId(`drawer-mandatory-agreement-${otherPick}`));
        expect(onPickMandatory).toHaveBeenCalledWith(otherPick);
    });

    it("shows the order's pick as checked", () => {
        renderDrawer({ mandatoryAgreementKey: daoPick });
        expect((screen.getByTestId(`drawer-mandatory-agreement-${daoPick}`) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByTestId(`drawer-mandatory-agreement-${otherPick}`) as HTMLInputElement).checked).toBe(false);
    });

    it("offers no mandatory clause as a checkbox of its own", () => {
        renderDrawer();
        expect(screen.queryByTestId(`drawer-registry-clause-${keyOf("figaro-commerce")}`)).toBeNull();
        expect(screen.queryByTestId(`drawer-registry-clause-${keyOf("figaro-topology")}`)).toBeNull();
        expect(screen.getByTestId(`drawer-registry-clause-${keyOf("figaro-schedule")}`)).toBeTruthy();
    });
});

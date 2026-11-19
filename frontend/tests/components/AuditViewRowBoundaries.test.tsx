/**
 * Every row `/audit/view` shows names what backs it, in the SDK's closed
 * vocabulary (`TruthBoundary`, docs/DATA_LAYER.md § "Truth boundaries").
 *
 * Proves, on the page's two row-bearing sections:
 *   - the financial statements: every cash-flow line and every balance-sheet
 *     and income-statement entry is protocol-enforced, derived at read time
 *     from the order events;
 *   - the clause evidence: each signature row is protocol-enforced, each
 *     committed field is institution-declared and read from the agreement the
 *     parties signed, and each attestation row is protocol-derived, read from
 *     its Attestation event.
 * A row rendered without its label fails the test.
 *
 * Does not prove: that the labels reach the audit-bundle PDF, which carries
 * the same documents through its own renderer.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const ORDER = `0x${"0a".repeat(32)}`;
const PROCESS = `0x${"ab".repeat(32)}`;
const ORDERS = { status: "present", value: [{ orderHash: ORDER, processId: PROCESS, checkoutHash: `0x${"cd".repeat(32)}`, buyer: "0x1", seller: "0x2" }] };
const { rows, agreementReads, ordersRead } = vi.hoisted(() => ({
    rows: [] as unknown[],
    agreementReads: new Map<string, unknown>(),
    ordersRead: { current: null as unknown },
}));

vi.mock("wagmi", () => ({ usePublicClient: () => ({ chain: { id: 31337 } }) }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ordersRead.current }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreementReads: () => agreementReads }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByOrder: async () => rows }));
vi.mock("@/lib/data/audit/signatureVerdicts", () => ({
    verifyOrderCommitSignatures: async () => ({ buyer: "valid", seller: "valid", transactionHash: null, batch: null }),
}));
vi.mock("@/lib/core/witnessContent", () => ({ resolveHeldWitnessContent: async () => null, heldWitnessReader: () => () => null }));
vi.mock("@/lib/core/useWitnessHolder", () => ({ useWitnessHolder: () => null }));
vi.mock("@/components/runtime/WitnessPinErasure", () => ({ WitnessPinErasure: () => null }));
vi.mock("@/components/runtime/CredentialVerifyButton", () => ({ CredentialVerifyButton: () => null }));
vi.mock("@/components/runtime/DownloadAuditBundleButton", () => ({ DownloadAuditBundleButton: () => null }));

import { ProcessClauseEvidence } from "@/app/(app)/audit/_components/ProcessClauseEvidence";
import { ProcessFinancialsView } from "@/app/(app)/audit/_components/ProcessFinancialsView";
import { buildOrderAgreement } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { present } from "@/lib/shared/networkRead";
import { OrderState, type Order } from "@/lib/core/store";
import { pinSpec } from "../lib/primeClauseSpecs";

const spec = pinSpec({
    clauseId: "figaro-test-row-boundary",
    version: 1,
    title: "Row boundary",
    description: "A made-up clause with two committed fields and one stage.",
    fields: [
        { name: "term", type: "string", required: true },
        { name: "grade", type: "string", required: true },
    ],
    stages: { "1": [{ name: "note", type: "string", required: true }] },
});

beforeAll(async () => {
    setClauseSpecFetcher(async () => spec.bytes);
    await loadClauseSpec(spec.clauseKey, "mem://spec");
});

/** The one label a row carries: exactly one, with its boundary and a source. */
function expectLabel(row: HTMLElement, boundary: string) {
    const labels = within(row).getAllByTestId("row-boundary");
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe(boundary);
    expect(within(row).getByTestId("row-source").textContent).toMatch(/\S/);
}

describe("/audit/view — every row names what backs it", () => {
    it("the clause evidence: signatures are the Core's, committed fields the parties' declaration, attestations anchored by their event", async () => {
        const built = buildOrderAgreement(
            "0x00000000000000000000000000000000000000b1",
            "0x00000000000000000000000000000000000000a1",
            { [spec.clauseKey]: { term: "agreed", grade: "a" } },
            specSource(),
        );
        ordersRead.current = ORDERS;
        agreementReads.clear();
        agreementReads.set(ORDERS.value[0].checkoutHash, present(built.agreement));
        rows.splice(0, rows.length, ...[1, 2].map((n) => ({
            orderHash: ORDER, processId: PROCESS, attester: "0x00000000000000000000000000000000000000a1",
            clauseId: spec.clauseKey, stage: 1, contentRef: `0x${String(n).repeat(64)}`, transactionHash: null, blockNumber: 5 + n, universe: "direct",
        })));
        render(<ProcessClauseEvidence processId={PROCESS} />);

        for (const party of ["buyer", "seller"]) {
            expectLabel(await screen.findByTestId(`audit-sig-${party}-${ORDER}`), "protocol-enforced");
        }
        for (const field of ["term", "grade"]) {
            const row = await screen.findByTestId(`audit-field-${spec.clauseKey}-${field}`);
            expectLabel(row, "institution-declared");
            expect(within(row).getByTestId("row-source").textContent).toMatch(/agreement the parties signed/);
        }
        for (const i of [0, 1]) {
            const row = await screen.findByTestId(`audit-log-${spec.clauseKey}-${i}`);
            expectLabel(row, "protocol-derived");
            expect(within(row).getByTestId("row-source").textContent).toMatch(/Attestation event/);
        }
    });

    it("the financial statements: every line and every entry is protocol-enforced, derived from the order events", () => {
        const order = (hash: string, state: OrderState): Order => ({
            orderHash: hash, processId: PROCESS, buyer: "0xB", seller: "0xS", token: "0xT",
            runningTotal: 100n, payment: 100n, state, sellerBond: 200n, buyerBond: 200n, salt: 0n, commitDeadline: 0n,
        });
        ordersRead.current = present([order("0x1", OrderState.Resolved), order("0x2", OrderState.Active)]);
        render(<ProcessFinancialsView processId={PROCESS} />);
        const lines = screen.getAllByTestId("document-line");
        const entries = screen.getAllByTestId("document-entry");
        expect(lines.length).toBeGreaterThan(0);
        expect(entries.length).toBeGreaterThan(0);
        for (const row of [...lines, ...entries]) {
            expectLabel(row, "protocol-enforced");
            expect(within(row).getByTestId("row-source").textContent).toMatch(/order events/);
        }
    });
});

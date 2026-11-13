/**
 * The audit page's clause evidence shows an attestation made in a batch, and
 * names the path that emitted each attestation.
 *
 * Proves: an `Attestation` row tagged "batch" (emitted by the batch verifier)
 * renders in the clause evidence of `/audit/view` beside a direct one, each
 * with its own path line.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { getByOrderMock } = vi.hoisted(() => ({ getByOrderMock: vi.fn() }));
const ORDER = `0x${"0a".repeat(32)}`;
const PROCESS = `0x${"ab".repeat(32)}`;
const ORDERS = { status: "present", value: [{ orderHash: ORDER, processId: PROCESS, checkoutHash: `0x${"cd".repeat(32)}`, buyer: "0x1", seller: "0x2" }] };

vi.mock("wagmi", () => ({ usePublicClient: () => ({ chain: { id: 31337 } }) }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ORDERS }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => new Map() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));
vi.mock("@/lib/composition/indexer", () => ({ getAttestationsByOrder: (...a: unknown[]) => getByOrderMock(...a) }));
vi.mock("@/lib/audit/signatureVerdicts", () => ({ verifyOrderCommitSignatures: async () => { throw new Error("no verdict"); } }));
vi.mock("@/lib/composition/witnessContent", () => ({ fetchWitnessContent: async () => null }));
vi.mock("@/components/runtime/WitnessPinErasure", () => ({ WitnessPinErasure: () => null }));
vi.mock("@/components/runtime/CredentialVerifyButton", () => ({ CredentialVerifyButton: () => null }));

import { ProcessClauseEvidence } from "@/app/(app)/audit/_components/ProcessClauseEvidence";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const spec = pinSpec({
    clauseId: "figaro-test-evidence-stage",
    version: 1,
    title: "Evidence stage",
    description: "A made-up clause for this test.",
    fields: [{ name: "designNote", type: "string", required: true, minLength: 1, maxLength: 140, label: "Design note" }],
    stages: { "1": [{ name: "note", type: "string", required: true, minLength: 1, maxLength: 140, label: "Note" }] },
    block: {
        design: { article: "test-article", scope: "assembly", nestsUnder: null, fills: ["designNote"], composes: null },
        checkout: { catalogueFills: [], profileFills: [] },
        runtime: { interaction: null, fields: [] },
    },
});

beforeAll(async () => {
    setClauseSpecFetcher(async () => spec.bytes);
    await loadClauseSpec(spec.clauseKey, "mem://spec");
});

const row = (universe: "direct" | "batch", stage: number, ref: string) => ({
    orderHash: ORDER, processId: PROCESS, attester: "0x00000000000000000000000000000000000000a1",
    clauseId: spec.clauseKey, stage, contentRef: ref, transactionHash: null, blockNumber: 5, universe,
});

describe("ProcessClauseEvidence on both paths", () => {
    it("renders the batched attestation beside the direct one, each naming its path", async () => {
        getByOrderMock.mockResolvedValue([row("direct", 1, `0x${"d1".repeat(32)}`), row("batch", 1, `0x${"ba".repeat(32)}`)]);
        render(<ProcessClauseEvidence processId={PROCESS} />);
        const refs = await screen.findAllByTestId(`audit-content-ref-${spec.clauseKey}-1`);
        expect(refs).toHaveLength(2);
        expect(refs[1].textContent).toContain(`0x${"ba".repeat(32)}`);
        const paths = screen.getAllByTestId(`audit-attestation-path-${spec.clauseKey}-1`);
        expect(paths.map((p) => p.getAttribute("data-universe"))).toEqual(["direct", "batch"]);
        expect(paths[1].textContent).toBe("Batch path — emitted by the batch verifier");
    });
});

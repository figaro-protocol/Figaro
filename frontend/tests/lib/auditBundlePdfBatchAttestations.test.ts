/**
 * The evidence file's per-order bundle is built from the attestations of BOTH
 * paths, each keeping the `universe` that emitted it; the file's process logs
 * carry it onto the page.
 *
 * Proves: an `Attestation` emitted by the batch verifier reaches the bundle
 * `buildAuditBundlePdfBlob` hands the PDF, and reaches the process-log entry
 * with its `universe`.
 */
import { describe, expect, it, vi } from "vitest";

const { buildMock, getByOrderMock } = vi.hoisted(() => ({ buildMock: vi.fn(), getByOrderMock: vi.fn() }));

vi.mock("@/lib/composition/indexer", () => ({ getAttestationsByOrder: (...a: unknown[]) => getByOrderMock(...a) }));
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [], getActiveMembers: async () => [] }));
vi.mock("@/lib/audit/auditBundle", () => ({ buildAuditBundle: (...a: unknown[]) => buildMock(...a) }));
vi.mock("@/lib/audit/documentProjection", () => ({ projectDocuments: () => [], projectAllFinancialStatements: () => [] }));
vi.mock("@/lib/audit/processTimeline", () => ({ buildProcessTimeline: async () => null }));
vi.mock("@react-pdf/renderer", () => ({ pdf: () => ({ toBlob: async () => new Blob([]) }) }));
vi.mock("@/lib/audit/pdfBundle", () => ({ AuditBundlePdf: () => null }));

import { buildAuditBundlePdfBlob } from "@/lib/audit/auditBundlePdf";

const ORDER = `0x${"0d".repeat(32)}`;
const CHECKOUT = `0x${"cd".repeat(32)}`;

describe("buildAuditBundlePdfBlob reads both paths", () => {
    it("hands the bundle the batched attestation with its universe", async () => {
        const batched = { orderHash: ORDER, processId: `0x${"ab".repeat(32)}`, attester: "0xa1", clauseId: `0x${"c1".repeat(32)}`, stage: 1, contentRef: `0x${"ba".repeat(32)}`, transactionHash: null, blockNumber: 5, universe: "batch" };
        getByOrderMock.mockResolvedValue([batched]);
        buildMock.mockReturnValue({});
        const order = { orderHash: ORDER, checkoutHash: CHECKOUT, buyer: "0xb1", currency: undefined };
        await buildAuditBundlePdfBlob("0xab", [order as never], {} as never, 31337, new Map([[CHECKOUT, {} as never]]), { includeTimeline: false });
        expect(getByOrderMock).toHaveBeenCalledWith({}, 31337, ORDER);
        const attestations = buildMock.mock.calls[0][2] as { universe: string; contentRef: string }[];
        expect(attestations.map((a) => [a.universe, a.contentRef])).toEqual([["batch", batched.contentRef]]);
    });
});

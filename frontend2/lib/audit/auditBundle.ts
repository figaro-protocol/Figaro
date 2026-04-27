/**
 * Audit-bundle assembler — composes the 4 extractor outputs (contract,
 * invoice, BoL, hash appendix) into one structured deliverable.
 *
 * Phase D's PDF renderer consumes this. Phase E's `/verify` page also
 * reads it (or a subset) to drive recomputation of each hash against
 * user-supplied content.
 *
 * The financial-statements panel is not part of this bundle directly —
 * it lives in `lib/semantic/financialsProjection.ts` and is composed
 * alongside the bundle by the consumer (the PDF renderer renders both).
 */

import type { Agreement } from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { extractContract, type ContractDocument } from "./contractExtract";
import { extractInvoice, type InvoiceDocument } from "./invoiceExtract";
import { extractBillOfLading, type BillOfLadingDocument } from "./billOfLadingExtract";
import { extractEmissions, type EmissionsDocument } from "./emissionsExtract";
import { extractProximity, type ProximityDocument } from "./proximityExtract";
import { extractProcessLogs, type ProcessLogsDocument } from "./processLogsExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";

export interface AuditBundle {
    contract: ContractDocument;
    invoice: InvoiceDocument;
    billOfLading: BillOfLadingDocument;
    emissions: EmissionsDocument;
    proximity: ProximityDocument;
    processLogs: ProcessLogsDocument;
    hashAppendix: HashAppendixDocument;
}

export function buildAuditBundle(
    order: Order,
    agreement: Agreement,
    attestations: readonly AttestationRecord[],
): AuditBundle {
    return {
        contract: extractContract(order, agreement),
        invoice: extractInvoice(order, agreement),
        billOfLading: extractBillOfLading(order, agreement, attestations),
        emissions: extractEmissions(order, agreement, attestations),
        proximity: extractProximity(order, agreement, attestations),
        processLogs: extractProcessLogs(order, attestations),
        hashAppendix: buildHashAppendix(order, agreement, attestations),
    };
}

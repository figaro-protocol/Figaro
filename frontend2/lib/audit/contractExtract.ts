/**
 * Contract extractor — pure function from on-chain order + signed
 * agreement to a structured contract document for inclusion in the audit
 * bundle.
 *
 * The "contract" in Figaro is the off-chain document referenced by
 * `agreementHash`. Both parties signed an EIP-712 commitment that bound
 * them to its byte-exact content. This extractor produces a structured
 * view of that document — parties, monetary terms, every clause section
 * with its merkle-leaf hash anchor.
 */

import {
    type Agreement,
    type AgreementSection,
    COMMERCE_SCHEMA_KEY,
    FULFILMENT_SCHEMA_KEY,
    JURISDICTION_SCHEMA_KEY,
    TOPOLOGY_SCHEMA_KEY,
    computeSectionLeaf,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { ExtractedDocument } from "./types";

/** `getSectionById` in agreementManifest.ts takes a keccak bytes32; this
 *  helper matches by the human-readable schema key string (which is what
 *  the extractors carry as compile-time constants). */
function getSectionByKey(agreement: Agreement, schemaKey: string): AgreementSection | undefined {
    return agreement.sections.find((s) => s.schema === schemaKey);
}

/** Human-readable title for each schema clause (best-effort display label). */
const SCHEMA_TITLE: Record<string, string> = {
    "figaro-commerce-v1": "Commerce — line items + payment",
    "figaro-geo-v1": "Geography — origin + destination",
    "figaro-handoff-v1": "Handoff — physical-exchange modality",
    "figaro-fulfilment-v1": "Fulfilment — modality + who-organizes",
    "figaro-topology-v1": "Topology — DAG lineage",
    "figaro-jurisdiction-v1": "Jurisdiction — applicable law + forum",
    "figaro-ghg-protocol-v1": "GHG — Protocol Corporate Standard",
    "figaro-ghg-iso-14064-v1": "GHG — ISO 14064",
    "figaro-ghg-pas-2050-v1": "GHG — PAS 2050",
    "figaro-ghg-en-16258-v1": "GHG — EN 16258",
    "figaro-ghg-custom-v1": "GHG — Custom methodology",
    "figaro-ghg-measurement-v1": "GHG — Runtime measurement",
    "figaro-delivery-lifecycle-v1": "Delivery lifecycle — stage progression",
    "figaro-proximity-policy-v1": "Proximity policy — committed band",
    "figaro-proximity-proof-v1": "Proximity proof — runtime witness",
    "figaro-merchant-process-v1": "Merchant process — sovereign event log",
    "figaro-courier-process-v1": "Courier process — sovereign event log",
};

export interface ContractClause {
    /** Schema key (e.g. "figaro-commerce-v1"). */
    schemaKey: string;
    /** Human-readable title. */
    title: string;
    /** The clause's data payload — schema-specific structure. */
    body: Record<string, unknown>;
    /** Merkle leaf hash of this section under the agreementHash root.
     *  Auditor recomputes this from the body and verifies it appears in
     *  the agreementHash merkle tree. */
    leafHash: `0x${string}`;
}

export interface ContractDocument extends ExtractedDocument {
    parties: { buyer: string; seller: string };
    /** Currency address for the order's payment denomination. */
    currency: string;
    /** Payment value (P) in token smallest units. */
    payment: bigint;
    /** Cumulative value (G) at this order's commit. */
    cumulativeValue: bigint;
    /** EIP-712 commitment salt + deadline (for full reconstruction). */
    salt: bigint;
    deadline: bigint;
    /** Each clause section in the agreement, in canonical (sorted-by-schema) order. */
    clauses: ContractClause[];
    /** Optional jurisdiction summary if a jurisdiction clause is present. */
    jurisdiction?: {
        applicableLaw: string;
        forum?: string;
        language?: string;
    };
    /**
     * Process-tree lineage for this order. Surfaces the topology-clause
     * data so the auditor can locate this order in its process DAG without
     * having to dig into the generic clauses array.
     *
     *   - `parentOrderHashes` is empty for a root order.
     *   - For a sub-order it lists each parent order's hash; for a
     *     diamond / fan-in node it lists multiple parents.
     */
    lineage: {
        parentOrderHashes: string[];
        topologyMode?: string;
    };
    /** Optional fulfilment summary if a fulfilment clause is present. */
    fulfilment?: {
        /** Canonical 5-value enum: consume-onsite | pickup |
         *  deliver:buyer-assigned | deliver:seller-assigned |
         *  deliver:dutch-auction. */
        method: string;
    };
    /** Block number when OrderCommitted was mined, if known. */
    committedAtBlock?: number;
}

function clauseFromSection(section: AgreementSection): ContractClause {
    return {
        schemaKey: section.schema,
        title: SCHEMA_TITLE[section.schema] ?? section.schema,
        body: section.data,
        leafHash: computeSectionLeaf(section),
    };
}

function extractJurisdictionSummary(agreement: Agreement) {
    const jurisdiction = getSectionByKey(agreement, JURISDICTION_SCHEMA_KEY);
    if (!jurisdiction) return undefined;
    const data = jurisdiction.data as { applicableLaw?: string; forum?: string; language?: string };
    if (!data.applicableLaw || typeof data.applicableLaw !== "string") return undefined;
    return {
        applicableLaw: data.applicableLaw,
        forum: typeof data.forum === "string" && data.forum.length > 0 ? data.forum : undefined,
        language: typeof data.language === "string" && data.language.length > 0 ? data.language : undefined,
    };
}

function extractLineage(agreement: Agreement) {
    const topology = getSectionByKey(agreement, TOPOLOGY_SCHEMA_KEY);
    const data = topology?.data as
        | { parentOrderHashes?: unknown; topologyMode?: unknown }
        | undefined;
    const parentOrderHashes = Array.isArray(data?.parentOrderHashes)
        ? (data.parentOrderHashes.filter((p) => typeof p === "string") as string[])
        : [];
    const topologyMode = typeof data?.topologyMode === "string" ? data.topologyMode : undefined;
    return { parentOrderHashes, topologyMode };
}

function extractFulfilmentSummary(agreement: Agreement) {
    const fulfilment = getSectionByKey(agreement, FULFILMENT_SCHEMA_KEY);
    const data = fulfilment?.data as { method?: unknown } | undefined;
    if (typeof data?.method !== "string" || data.method.length === 0) return undefined;
    return { method: data.method };
}

export function extractContract(order: Order, agreement: Agreement): ContractDocument {
    // Currency: prefer the agreement's commerce-section currency (signed by both
    // parties) over the order's currency field (which is event-derived, normally
    // identical, but the commerce section is the authoritative party-signed
    // source).
    const commerce = getSectionByKey(agreement, COMMERCE_SCHEMA_KEY);
    const commerceCurrency = (commerce?.data as { currency?: string } | undefined)?.currency;

    return {
        title: "Bonded commitment",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        parties: { buyer: order.buyer, seller: order.seller },
        currency: commerceCurrency ?? order.currency ?? "0x0000000000000000000000000000000000000000",
        payment: order.payment,
        cumulativeValue: order.cumulativeValue,
        salt: order.salt,
        deadline: order.deadline,
        clauses: agreement.sections.map(clauseFromSection),
        jurisdiction: extractJurisdictionSummary(agreement),
        lineage: extractLineage(agreement),
        fulfilment: extractFulfilmentSummary(agreement),
        committedAtBlock: order.blockNumber,
    };
}

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
    type AnyAgreementSection,
    type RedactableAgreement,
    APPLICABLE_LAW_SCHEMA_KEY,
    COMMERCE_SCHEMA_KEY,
    FULFILMENT_V2_SCHEMA_KEY,
    TOPOLOGY_SCHEMA_KEY,
    computeSectionLeaf,
    isRedactedSection,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { ExtractedDocument } from "./types";

/** Match a section by schema key. Returns either form (cleartext or
 *  redacted); callers that need cleartext-only must check via
 *  `isRedactedSection`. */
function findAnySection(
    agreement: Agreement | RedactableAgreement,
    schemaKey: string,
): AnyAgreementSection | undefined {
    return agreement.sections.find((s) => s.schema === schemaKey);
}

/** Match a section by schema key, returning only its cleartext form. If
 *  the section is redacted (or absent), returns undefined. */
function findCleartextSection(
    agreement: Agreement | RedactableAgreement,
    schemaKey: string,
): AgreementSection | undefined {
    const s = findAnySection(agreement, schemaKey);
    if (!s) return undefined;
    return isRedactedSection(s) ? undefined : s;
}

/** Human-readable title for each schema clause (best-effort display label). */
const SCHEMA_TITLE: Record<string, string> = {
    "figaro-commerce-v1": "Commerce — line items + payment",
    "figaro-geo-v2": "Geography — origin + destination + mass + volume + class",
    "figaro-fulfilment-v2": "Fulfilment — modality + coordination + handoffPoint",
    "figaro-topology-v1": "Topology — DAG lineage",
    "figaro-arbitration-kleros-v1": "Arbitration — Kleros decentralized court",
    "figaro-applicable-law-v1": "Applicable law — state / ADR / forum",
    "figaro-ghg-protocol-v1": "GHG — Protocol Corporate Standard",
    "figaro-ghg-iso-14064-v1": "GHG — ISO 14064",
    "figaro-ghg-pas-2050-v1": "GHG — PAS 2050",
    "figaro-ghg-en-16258-v1": "GHG — EN 16258",
    "figaro-ghg-custom-v1": "GHG — Custom methodology",
    "figaro-ghg-measurement-v1": "GHG — Runtime measurement",
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
    /** The clause's data payload — schema-specific structure. Empty
     *  object when the clause is sealed (see `sealed` flag). */
    body: Record<string, unknown>;
    /** Merkle leaf hash of this section under the agreementHash root.
     *  Auditor recomputes this from the body and verifies it appears in
     *  the agreementHash merkle tree. For sealed clauses this leaf
     *  is the value carried directly in the redacted section — the
     *  cleartext that produces the same leaf is held by the original
     *  parties and can be selectively revealed via
     *  `verifyRevealedSection`. */
    leafHash: `0x${string}`;
    /** True when this clause's body has been redacted in the input
     *  agreement. Verifiers see `body: {}` and a leaf-only commitment;
     *  the clause's content can be revealed selectively by the holder. */
    sealed?: boolean;
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

function clauseFromSection(section: AnyAgreementSection): ContractClause {
    if (isRedactedSection(section)) {
        return {
            schemaKey: section.schema,
            title: SCHEMA_TITLE[section.schema] ?? section.schema,
            body: {},
            leafHash: section.leaf,
            sealed: true,
        };
    }
    return {
        schemaKey: section.schema,
        title: SCHEMA_TITLE[section.schema] ?? section.schema,
        body: section.data,
        leafHash: computeSectionLeaf(section),
    };
}

function extractJurisdictionSummary(agreement: Agreement | RedactableAgreement) {
    const applicableLaw = findCleartextSection(agreement, APPLICABLE_LAW_SCHEMA_KEY);
    if (!applicableLaw) return undefined;
    const data = applicableLaw.data as { applicableLaw?: string; forum?: string; language?: string };
    if (!data.applicableLaw || typeof data.applicableLaw !== "string") return undefined;
    return {
        applicableLaw: data.applicableLaw,
        forum: typeof data.forum === "string" && data.forum.length > 0 ? data.forum : undefined,
        language: typeof data.language === "string" && data.language.length > 0 ? data.language : undefined,
    };
}

function extractLineage(agreement: Agreement | RedactableAgreement) {
    const topology = findCleartextSection(agreement, TOPOLOGY_SCHEMA_KEY);
    const data = topology?.data as
        | { parentOrderHashes?: unknown; topologyMode?: unknown }
        | undefined;
    const parentOrderHashes = Array.isArray(data?.parentOrderHashes)
        ? (data.parentOrderHashes.filter((p) => typeof p === "string") as string[])
        : [];
    const topologyMode = typeof data?.topologyMode === "string" ? data.topologyMode : undefined;
    return { parentOrderHashes, topologyMode };
}

function extractFulfilmentSummary(agreement: Agreement | RedactableAgreement) {
    const fulfilment = findCleartextSection(agreement, FULFILMENT_V2_SCHEMA_KEY);
    const data = fulfilment?.data as { modality?: unknown; coordination?: unknown } | undefined;
    const modality = typeof data?.modality === "string" ? data.modality : undefined;
    if (!modality) return undefined;
    const coordination = typeof data?.coordination === "string" ? data.coordination : undefined;
    // Reconstruct the legacy canonical method string for backward-compat
    // consumers. v2 stores modality + coordination as independent fields;
    // the canonical method collapses them.
    if (modality === "delivery" && coordination) {
        return { method: `deliver:${coordination}` };
    }
    if (modality === "consume-onsite") return { method: "consume-onsite" };
    if (modality === "pickup") return { method: "pickup" };
    return undefined;
}

export function extractContract(
    order: Order,
    agreement: Agreement | RedactableAgreement,
): ContractDocument {
    // Currency: prefer the agreement's commerce-section currency (signed by both
    // parties) over the order's currency field (which is event-derived, normally
    // identical, but the commerce section is the authoritative party-signed
    // source). When commerce is redacted, fall back to order.currency — the
    // kernel records currency on the commitment regardless of redaction.
    const commerce = findCleartextSection(agreement, COMMERCE_SCHEMA_KEY);
    const commerceCurrency = (commerce?.data as { currency?: string } | undefined)?.currency;

    return {
        title: "Bonded commitment",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        parties: { buyer: order.buyer, seller: order.seller },
        currency: commerceCurrency ?? order.currency ?? ZERO_ADDRESS,
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

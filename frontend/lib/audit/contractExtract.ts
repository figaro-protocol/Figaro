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
    computeSectionLeaf,
} from "@figaro/core";
import { sectionByField } from "@/lib/kernel/agreementSections";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/kernel/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { ExtractedDocument } from "./types";

/** Human-readable display label for a clause — the registered spec's title
 *  (the network-defined SSoT), falling back to the raw clauseId while the
 *  spec is uncached. The label set is OPEN: any registered clause labels
 *  itself; no table in code. */
function clauseTitle(clauseId: string): string {
    return getClauseSpec(clauseId)?.title ?? clauseId;
}

interface ContractClause {
    /** Readable clauseId from the registry. */
    clauseKey: string;
    /** Human-readable title. */
    title: string;
    /** The clause's data payload — clause-specific structure. */
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
    /** Each clause section in the agreement, in canonical (sorted-by-clause) order. */
    clauses: ContractClause[];
    /** Optional jurisdiction summary if a jurisdiction clause is present. */
    jurisdiction?: {
        applicableLaw: string;
        forum?: string;
        language?: string;
    };
    /**
     * Process topology for this order. Surfaces the topology-clause
     * data so the auditor can locate this order in its process topology without
     * having to dig into the generic clauses array.
     *
     *   - `parentOrderHashes` is empty for a root order.
     *   - For a sub-order it lists each parent order's hash; for a
     *     diamond / fan-in node it lists multiple parents.
     */
    topology: {
        parentOrderHashes: string[];
    };
    /** Canonical method — the modality clause's raw value (consume-onsite |
     *  pickup | delivery | virtual | any registry-defined modality). The
     *  courier-edge fill mechanism is DERIVED (binding state), never
     *  encoded here. */
    method?: string;
    /** Block number when OrderCommitted was mined, if known. */
    committedAtBlock?: number;
}

function clauseFromSection(section: AgreementSection): ContractClause {
    // Agreements are cleartext: the IPFS body carries every section in full and
    // the audit recomputes each leaf. Selective disclosure, if ever needed, is a
    // merkle inclusion proof (@figaro/core), not a redacted distribution form.
    return {
        clauseKey: section.clause,
        title: clauseTitle(section.clause),
        body: section.data,
        leafHash: computeSectionLeaf(section),
    };
}

function extractJurisdictionSummary(agreement: Agreement) {
    const applicableLaw = sectionByField(agreement, "applicableLaw");
    if (!applicableLaw) return undefined;
    const data = applicableLaw.data as { applicableLaw?: string; forum?: string; language?: string };
    if (!data.applicableLaw || typeof data.applicableLaw !== "string") return undefined;
    return {
        applicableLaw: data.applicableLaw,
        forum: typeof data.forum === "string" && data.forum.length > 0 ? data.forum : undefined,
        language: typeof data.language === "string" && data.language.length > 0 ? data.language : undefined,
    };
}

function extractTopology(agreement: Agreement) {
    const topology = sectionByField(agreement, "parentOrderHashes");
    const data = topology?.data as { parentOrderHashes?: unknown } | undefined;
    const parentOrderHashes = Array.isArray(data?.parentOrderHashes)
        ? (data.parentOrderHashes.filter((p) => typeof p === "string") as string[])
        : [];
    return { parentOrderHashes };
}

function extractMethodSummary(agreement: Agreement) {
    // The modality section is found by its declared FIELD, never by clause
    // name. Single-select scalar; the raw value flows through verbatim — an
    // unseen modality the registry defines must NOT fall into an undefined hole
    // (open-world). There is no coordination field: the courier-edge fill
    // mechanism is derived (binding state),
    // not stored, so it never appears in the canonical method.
    const modalityData = sectionByField(agreement, "modality")?.data as
        | { modality?: unknown }
        | undefined;
    return typeof modalityData?.modality === "string" ? modalityData.modality : undefined;
}

export function extractContract(
    order: Order,
    agreement: Agreement,
): ContractDocument {
    // Currency: prefer the agreement's commerce-section currency (signed by both
    // parties) over the order's currency field (which is event-derived, normally
    // identical, but the commerce section is the authoritative party-signed
    // source). When the commerce section is absent, fall back to order.currency
    // — the kernel records currency on the commitment regardless.
    const commerce = sectionByField(agreement, "lineItems");
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
        topology: extractTopology(agreement),
        method: extractMethodSummary(agreement),
        committedAtBlock: order.blockNumber,
    };
}

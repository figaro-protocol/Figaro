/**
 * Contract extractor — pure function from on-chain order + signed
 * agreement to a structured contract document for inclusion in the audit
 * bundle.
 *
 * The "contract" in Figaro is the off-chain document referenced by
 * `checkoutHash`. Both parties signed an EIP-712 commitment that bound
 * them to its byte-exact content. This extractor produces a structured
 * view of that document — parties, monetary terms, every clause
 * with its merkle-leaf hash anchor.
 */

import {
    type Agreement,
    type AgreementClause,
    computeClauseLeaf,
} from "@figaro-protocol/sdk";
import { clauseByField } from "@figaro-protocol/sdk";
import { getClauseSpec, specSource } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/kernel/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { ExtractedDocument } from "./types";

/** Human-readable display label for a clause — the registered spec's title
 *  (the network-defined SSoT), falling back to the clause key while the
 *  spec is uncached. The label set is OPEN: any registered clause labels
 *  itself; no table in code. */
function clauseTitle(clauseKey: string): string {
    return getClauseSpec(clauseKey)?.title ?? clauseKey;
}

interface ContractClause {
    /** The clause key the clause carries. */
    clauseKey: string;
    /** Human-readable title. */
    title: string;
    /** The clause's data payload — clause-specific structure. Absent for a
     *  content-withheld (`private`) clauseEntry: only its fingerprint is public,
     *  so there is no cleartext body to show; the `leafHash` still binds it. */
    body?: Record<string, unknown>;
    /** Merkle leaf hash of this clause under the checkoutHash root.
     *  Auditor recomputes this from the body and verifies it appears in
     *  the checkoutHash merkle tree. */
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
    /** Each clause in the agreement, in canonical (sorted-by-clause) order. */
    clauses: ContractClause[];
    /** Optional jurisdiction summary if a jurisdiction clause is present. */
    jurisdiction?: {
        applicableLaw: string;
        forum?: string;
        language?: string;
    };
    /**
     * This order's place in its process, each part from its own evidence:
     *   - `position` from the chain: a root order's cumulative value equals its
     *     payment, and every later order's is larger.
     *   - `composed`: whether the agreement composes a topology clause.
     *   - `follows`: the parent links that clause holds (several for a
     *     fan-in node), empty when it composes none.
     */
    topology: {
        position: "root" | "sub-order";
        composed: boolean;
        follows: string[];
    };
    /** Canonical method — the modality clause's raw value (consume-onsite |
     *  pickup | delivery | virtual | any registry-defined modality). The
     *  courier-edge fill mechanism is DERIVED (binding state), never
     *  encoded here. */
    method?: string;
    /** Block number when OrderCommitted was mined, if known. */
    committedAtBlock?: number;
}

function contractClauseFrom(clauseEntry: AgreementClause): ContractClause {
    // Agreements are cleartext: the IPFS body carries every clause in full and
    // the audit recomputes each leaf. Selective disclosure, if ever needed, is a
    // merkle inclusion proof (@figaro-protocol/sdk), not a redacted distribution form.
    return {
        clauseKey: clauseEntry.clause,
        title: clauseTitle(clauseEntry.clause),
        body: clauseEntry.data,
        leafHash: computeClauseLeaf(clauseEntry),
    };
}

function extractJurisdictionSummary(agreement: Agreement) {
    const applicableLaw = clauseByField(agreement, "applicableLaw", specSource());
    if (!applicableLaw) return undefined;
    // `data` is undefined on a content-WITHHELD clause (a private-disposition
    // clause on the public pin) — guard like the sibling extractors below, so a
    // redacted jurisdiction clause reads as absence, not a crash.
    const data = applicableLaw.data as { applicableLaw?: string; forum?: string; language?: string } | undefined;
    if (!data?.applicableLaw || typeof data.applicableLaw !== "string") return undefined;
    return {
        applicableLaw: data.applicableLaw,
        forum: typeof data.forum === "string" && data.forum.length > 0 ? data.forum : undefined,
        language: typeof data.language === "string" && data.language.length > 0 ? data.language : undefined,
    };
}

function extractTopology(order: Order, agreement: Agreement): ContractDocument["topology"] {
    const topology = clauseByField(agreement, "follows", specSource());
    const data = topology?.data as { follows?: unknown } | undefined;
    const follows = Array.isArray(data?.follows)
        ? (data.follows.filter((p) => typeof p === "string") as string[])
        : [];
    return {
        position: order.cumulativeValue === order.payment ? "root" : "sub-order",
        composed: topology !== undefined,
        follows,
    };
}

function extractMethodSummary(agreement: Agreement) {
    // The modality clause is found by its declared FIELD, never by clause
    // name. Single-select scalar; the raw value flows through verbatim — an
    // unseen modality the registry defines must NOT fall into an undefined hole
    // (open-world). There is no coordination field: the courier-edge fill
    // mechanism is derived (binding state),
    // not stored, so it never appears in the canonical method.
    const modalityData = clauseByField(agreement, "modality", specSource())?.data as
        | { modality?: unknown }
        | undefined;
    return typeof modalityData?.modality === "string" ? modalityData.modality : undefined;
}

export function extractContract(
    order: Order,
    agreement: Agreement,
): ContractDocument {
    // Currency: prefer the agreement's commerce-clause currency (signed by both
    // parties) over the order's currency field (which is event-derived, normally
    // identical, but the commerce clause is the authoritative party-signed
    // source). When the commerce clause is absent, fall back to order.currency
    // — FigaroCore emits the commitment's currency regardless.
    const commerce = clauseByField(agreement, "lineItems", specSource());
    const commerceCurrency = (commerce?.data as { currency?: string } | undefined)?.currency;

    return {
        title: "Bonded commitment",
        orderHash: order.orderHash,
        processId: order.processId,
        checkoutHash: order.checkoutHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        parties: { buyer: order.buyer, seller: order.seller },
        currency: commerceCurrency ?? order.currency ?? ZERO_ADDRESS,
        payment: order.payment,
        cumulativeValue: order.cumulativeValue,
        salt: order.salt,
        deadline: order.deadline,
        clauses: agreement.clauses.map(contractClauseFrom),
        jurisdiction: extractJurisdictionSummary(agreement),
        topology: extractTopology(order, agreement),
        method: extractMethodSummary(agreement),
        committedAtBlock: order.blockNumber,
    };
}

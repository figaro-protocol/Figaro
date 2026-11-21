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
import { isProcessRoot } from "@figaro-protocol/sdk";
import { committedJurisdiction, committedModality, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { topologyFollows } from "@/lib/semantic/processTopology";
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
    runningTotal: bigint;
    /** EIP-712 commitment salt + deadline (for full reconstruction). */
    salt: bigint;
    deadline: bigint;
    /** Each clause in the agreement, in canonical (sorted-by-clause) order. */
    clauses: ContractClause[];
    /** The jurisdiction, where a committed clause's spec marks one
     *  (`block.runtime.jurisdiction`): the governing law, and the forum and
     *  the language when committed. */
    jurisdiction?: {
        law: string;
        forum?: string;
        language?: string;
    };
    /**
     * This order's place in its process, each part from its own evidence:
     *   - `position` from the chain: a root order's cumulative value equals its
     *     payment, and every later order's is larger.
     *   - `composed`: whether the agreement carries its topology leaf.
     *   - `follows`: the parent links that leaf holds (several for a
     *     fan-in node), empty for a root and when it carries none.
     */
    topology: {
        position: "root" | "sub-order";
        composed: boolean;
        follows: string[];
    };
    /** The order's modality, the raw value of the field a committed clause's
     *  spec marks (`block.runtime.modality`), whatever value the clause
     *  declares. The courier-edge fill mechanism is DERIVED (binding
     *  state), never encoded here. */
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


function extractTopology(order: Order, agreement: Agreement): ContractDocument["topology"] {
    const follows = topologyFollows(agreement);
    return {
        position: isProcessRoot(order) ? "root" : "sub-order",
        composed: follows !== null,
        follows: follows ?? [],
    };
}

export function extractContract(
    order: Order,
    agreement: Agreement,
): ContractDocument {
    // Currency: the commitment's own, from the chain's event (`order.token`).
    // A clause's copy of the token is never read here: a clause that names
    // another token than the commitment would show a token the chain did not move.
    return {
        title: "Bonded commitment",
        orderHash: order.orderHash,
        processId: order.processId,
        checkoutHash: order.checkoutHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        parties: { buyer: order.buyer, seller: order.seller },
        currency: order.token ?? ZERO_ADDRESS,
        payment: order.payment,
        runningTotal: order.runningTotal,
        salt: order.salt,
        deadline: order.commitDeadline,
        clauses: agreement.clauses.map(contractClauseFrom),
        // Each read through the mark a clause's spec declares, never through
        // a field's name (`committedJurisdiction`, `committedModality`).
        jurisdiction: committedJurisdiction(agreement.clauses),
        topology: extractTopology(order, agreement),
        method: committedModality(agreement.clauses),
        committedAtBlock: order.blockNumber,
    };
}

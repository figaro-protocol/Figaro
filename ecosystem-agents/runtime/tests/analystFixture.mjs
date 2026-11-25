/**
 * The analyst's fixture corpus, shared by analyst.test.mjs and the live model
 * test (analyst.live.test.mjs).
 */

import { keccak256 } from "viem";
import {
    projectProcessGraph, projectResolutionGraph, extractOverlays, projectValueFlow,
} from "@figaro-protocol/sdk/derive";

// ── A fixture corpus ────────────────────────────────────────────────────────
// Two orders in one process (a value-added chain), one resolved attestation.
// Built from the same event shapes fetchCoreEvents returns, so the projections
// under test are the shipped ones, not re-implementations.

/** A clause key no registry names — the agreement leaf needs a key, never a name. */
export const X_DEMO = `0x${"de".repeat(32)}`;
export const BUYER = "0x1111111111111111111111111111111111111111";
export const SELLER_A = "0x2222222222222222222222222222222222222222";
export const SELLER_B = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
export const PROCESS = `0x${"ab".repeat(32)}`;
export const ORDER_A = `0x${"01".repeat(32)}`;
const ORDER_B = `0x${"02".repeat(32)}`;
export const CLAUSE_KEY = `0x${"cc".repeat(32)}`;

const SUBSTANCE = "0xdeadbeef";
export const CONTENT_REF = keccak256(SUBSTANCE);

export function fixtureCorpus({ recovered = true } = {}) {
    const committed = (orderHash, seller, payment, cumulative, blockNumber) => ({
        orderHash, processId: PROCESS, buyer: BUYER, seller, token: TOKEN,
        payment, runningTotal: cumulative, checkoutHash: `0x${"ee".repeat(32)}`,
        salt: 1n, commitDeadline: 9_999_999_999n, blockNumber,
    });
    const core = {
        orderCommitted: [
            committed(ORDER_A, SELLER_A, 100n, 100n, 10),
            committed(ORDER_B, SELLER_B, 50n, 150n, 11),
        ],
        orderResolved: [
            { orderHash: ORDER_A, processId: PROCESS, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 20 },
            { orderHash: ORDER_B, processId: PROCESS, sellerPayout: 350n, buyerPayout: 50n, blockNumber: 20 },
        ],
        processResolved: [{ processId: PROCESS, orderCount: 2, blockNumber: 20 }],
        orderSeller: [],
    };
    const attestation = {
        orderHash: ORDER_A, processId: PROCESS, attester: SELLER_A, clauseId: CLAUSE_KEY,
        stage: 1, contentRef: CONTENT_REF, blockNumber: 15, transactionHash: null,
        universe: "direct",
    };
    const specs = { get: () => undefined, list: () => [] };
    const recoveredRecords = [{ event: attestation, content: recovered ? SUBSTANCE : null }];
    const resolution = projectResolutionGraph(core);
    return {
        chainId: 31337,
        fromBlock: 0n,
        syncedToBlock: 99n,
        core,
        attestations: [attestation],
        specs,
        specsLoaded: 0,
        specsSkipped: [],
        recovered: recoveredRecords,
        framedSubstance: recovered
            ? new Map([[CONTENT_REF.toLowerCase(), `⟦FIGARO-DATA nonce…⟧\n${SUBSTANCE}\n⟦/FIGARO-DATA nonce…⟧`]])
            : new Map(),
        substanceRecovered: recovered ? 1 : 0,
        held: { byHash: new Map(), rejected: [], committedRoots: 1 },
        graphs: {
            process: projectProcessGraph(core),
            resolution,
            overlays: extractOverlays(recoveredRecords, specs),
            valueFlow: projectValueFlow(resolution, [], []),
        },
    };
}

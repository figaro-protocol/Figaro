/**
 * The evidence timeline reads BOTH paths for the page's own deployment: the
 * order events at FigaroCore and at FigaroBatchVerifier, the attestations at
 * the coordinator and at the verifier, each row tagged with the `universe` that
 * emitted it, the token's decimals from whichever commit exists. For another
 * deployment (a link names a core) the site's verifier means nothing and is
 * never scanned.
 *
 * Proves: OrderCommitted, OrderResolved and Attestation emitted by the verifier
 * alone reach `buildProcessTimeline`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attestationLog, orderCommittedLog, orderResolvedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";
import { activeChain } from "@/lib/shared/chains";

const { cachedMock, CORE, VERIFIER, COORD } = vi.hoisted(() => ({
    cachedMock: vi.fn(),
    CORE: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    COORD: "0x1111111111111111111111111111111111111111",
}));

vi.mock("@/lib/kernel/eventCache", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/eventCache")>()),
    cachedGetContractEvents: (...a: unknown[]) => cachedMock(...a),
    deploymentBlock: () => 0n,
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => COORD,
    getBatchVerifier: () => VERIFIER,
}));
vi.mock("@/lib/shared/clauseSpecSource", () => ({
    describeAttestation: () => ({ clauseTitle: "Clause", eventLabel: "Stage" }),
}));

import { buildProcessTimeline } from "@/lib/audit/processTimeline";

const PROCESS = word(0xab);
const ORDER = word(0x0d);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const CLAUSE = word(0xc1a);
const TOKEN = "0x00000000000000000000000000000000000000c1";

// Each log carries the decoded args the cache attaches (`orderCommittedLog` has none; add what the timeline reads).
const commit: FixtureLog = {
    ...orderCommittedLog({ address: VERIFIER, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: 5_000_000n }),
    args: { orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, currency: TOKEN, payment: 5_000_000n },
};
const resolved = orderResolvedLog({ address: VERIFIER, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: 5_000_000n, buyerPayout: 0n });
const attested = attestationLog({ address: VERIFIER, blockNumber: 6n, orderHash: ORDER, processId: PROCESS, attester: SELLER, clauseId: CLAUSE, stage: 1, contentRef: word(0xba) });

function client() {
    return {
        getChainId: async () => activeChain.id,
        getBlock: async () => ({ timestamp: 1n }),
        readContract: vi.fn(async () => 6),
    };
}

describe("buildProcessTimeline folds both paths", () => {
    beforeEach(() => {
        cachedMock.mockReset();
        cachedMock.mockImplementation(async (_c: unknown, _id: number, p: { address: string; eventName: string }) => {
            if (p.address !== VERIFIER) return [];
            return [commit, resolved, attested].filter((l) => l.topics[0] && (
                (p.eventName === "OrderCommitted" && l === commit) ||
                (p.eventName === "OrderResolved" && l === resolved) ||
                (p.eventName === "Attestation" && l === attested)
            ));
        });
    });

    it("shows a batched commit, resolution and attestation, each tagged batch, with the amounts in the token's decimals", async () => {
        const tl = await buildProcessTimeline(client() as never, PROCESS);
        expect(tl.events.map((e) => [e.eventName, e.universe])).toEqual([
            ["OrderCommitted", "batch"],
            ["Attestation", "batch"],
            ["OrderResolved", "batch"],
        ]);
        expect(tl.summary.orderCount).toBe(1);
        expect(tl.summary.resolvedCount).toBe(1);
        expect(tl.summary.totalPayment).toBe("5");
        expect(tl.batchVerifierAddress).toBe(VERIFIER);
    });

    it("never scans the site's verifier for a core other than the page's deployment's", async () => {
        await buildProcessTimeline(client() as never, PROCESS, "0x992f81049444A5275b4F92e69805a2F8c88B6386");
        const asked = cachedMock.mock.calls.map((c) => (c[2] as { address: string }).address.toLowerCase());
        expect(asked).not.toContain(VERIFIER.toLowerCase());
    });
});

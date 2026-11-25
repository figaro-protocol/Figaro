/**
 * The evidence file's per-order bundle is built from the attestations of BOTH
 * paths, each keeping the `universe` that emitted it; the file's process logs
 * and its process timeline carry it onto the page.
 *
 * The chain is the event cache's rows, answered per emitter: an `Attestation`
 * at the coordinator (the direct path) and one at the batch verifier (its
 * re-emission). The attestation reader (`getAttestationsByOrder`), the bundle
 * builder (`buildAuditBundle`), the process-log extract and the timeline
 * (`buildProcessTimeline`) are the real ones; only the PDF renderer is stood in.
 *
 * Proves: the batch verifier's `Attestation` reaches the bundle's process-log
 * entry with `universe: "batch"`, beside the coordinator's with `"direct"`,
 * and the timeline names it as the batch path's.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Agreement } from "@figaro-protocol/sdk";
import { attestationLog, word } from "./__fixtures__/coreLogs";

const { cachedGetLogsMock, CORE, COORDINATOR, VERIFIER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    COORDINATOR: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
}));

vi.mock("@/lib/core/eventCache", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/eventCache")>()),
    cachedGetLogs: (...a: unknown[]) => cachedGetLogsMock(...a),
    cachedGetContractEvents: (...a: unknown[]) => cachedGetLogsMock(...a),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER }, coordinator: () => COORDINATOR, batchVerifier: () => VERIFIER }));
vi.mock("@/lib/registries/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [], getActiveMembers: async () => [] }));

import { buildAuditBundleData } from "@/lib/data/audit/auditBundlePdf";
import { OrderState, type Order } from "@/lib/core/store";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { activeChain } from "@/lib/shared/chains";
import { pinSpec } from "./primeClauseSpecs";

// A process-log clause (article `attestations`), so its attestations are
// placed in the clause's timeline.
const base = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-consent.json"), "utf8"));
const LOG = pinSpec({ ...base, version: 77, block: { ...base.block, design: { ...base.block.design, article: "attestations" } } });

const ORDER = word(0x0d);
const PROCESS = word(0xab);
const CHECKOUT = word(0xcd);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const DIRECT_REF = word(0xd1);
const BATCH_REF = word(0xba);

const rows: Record<string, Record<string, unknown[]>> = {
    [COORDINATOR]: {
        Attestation: [attestationLog({ address: COORDINATOR, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, attester: SELLER, clauseId: LOG.clauseKey, contentRef: DIRECT_REF })],
    },
    [VERIFIER]: {
        Attestation: [attestationLog({ address: VERIFIER, blockNumber: 5n, orderHash: ORDER, processId: PROCESS, attester: SELLER, clauseId: LOG.clauseKey, stage: 1, contentRef: BATCH_REF })],
    },
};
const CLIENT = {
    getChainId: async () => activeChain.id,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_700_000_000n + blockNumber }),
    readContract: async () => { throw new Error("no token in this test"); },
};

describe("buildAuditBundleData reads both paths", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        setClauseSpecFetcher(async (uri) => (uri === `mem://${LOG.clauseKey}` ? LOG.bytes : ""));
        await loadClauseSpec(LOG.clauseKey, `mem://${LOG.clauseKey}`);
        cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            rows[opts.address.toLowerCase()]?.[opts.eventName] ?? []);
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("carries the batched attestation into the process-log entry, tagged batch, and into the timeline", async () => {
        const agreement: Agreement = { version: "a1", buyer: BUYER, seller: SELLER, clauses: [{ clause: LOG.clauseKey, data: { documents: [] } }] };
        const order: Order = {
            orderHash: ORDER, processId: PROCESS, checkoutHash: CHECKOUT, buyer: BUYER, seller: SELLER,
            payment: 1n, runningTotal: 1n, sellerBond: 2n, buyerBond: 2n, salt: 1n, commitDeadline: 2n,
            state: OrderState.Active,
        };
        const data = await buildAuditBundleData(PROCESS, [order], CLIENT as never, activeChain.id, new Map([[CHECKOUT, agreement]]));

        const [bundle] = data.perOrderBundles;
        const entries = bundle!.processLogs.logs.flatMap((g) => g.events).map((e) => [e.universe, e.contentRef]);
        expect(entries).toEqual([["direct", DIRECT_REF], ["batch", BATCH_REF]]);

        expect(data.timeline).not.toBeNull();
        const attested = data.timeline!.events.filter((e) => e.eventName === "Attestation").map((e) => e.universe);
        expect(attested).toEqual(["direct", "batch"]);
    });
});

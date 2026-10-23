import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared event cache is the one store every page reads; a timeline read
// through an RPC the link chose must never write into it (frontend invariant
// S-3: a displayed view cannot be forged through a link).
const cached = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/kernel/eventCache", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/kernel/eventCache")>();
    return { ...real, cachedGetContractEvents: cached };
});
// The site's own coordinator: configured here so a read of ANOTHER core can be
// shown never to scan it — the Core holds no pointer to its coordinator, so on
// another deployment only the link can name one.
const SITE_COORD = "0x1111111111111111111111111111111111111111" as const;
vi.mock("@/lib/composition/contracts", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/composition/contracts")>();
    return { ...real, getAttestationCoordinator: () => SITE_COORD };
});

import { buildProcessTimeline } from "@/lib/audit/processTimeline";

const PROCESS = `0x${"ab".repeat(32)}` as const;
const CORE = "0x992f81049444A5275b4F92e69805a2F8c88B6386";
const LINK_COORD = "0x2222222222222222222222222222222222222222" as const;

function outsideRpc() {
    const getLogs = vi.fn(async () => []);
    return {
        getLogs,
        client: {
            getChainId: async () => 11155111,
            getBlockNumber: async () => 100n,
            getLogs,
            getBlock: async () => ({ timestamp: 1n }),
        },
    };
}

describe("buildProcessTimeline through an outside RPC", () => {
    beforeEach(() => cached.mockClear());

    it("reads the chain directly and leaves the shared event cache untouched", async () => {
        const { client, getLogs } = outsideRpc();
        const tl = await buildProcessTimeline(client as never, PROCESS, CORE, { sharedCache: false });
        expect(cached).not.toHaveBeenCalled();
        expect(getLogs).toHaveBeenCalled();
        expect(tl.chainId).toBe(11155111);
    });

    it("reads through the shared cache for the site's own client", async () => {
        const { client } = outsideRpc();
        await buildProcessTimeline(client as never, PROCESS, CORE);
        expect(cached).toHaveBeenCalled();
    });
});

describe("buildProcessTimeline on a core other than the site's — the link names the coordinator and the first block", () => {
    const scanned = (getLogs: ReturnType<typeof vi.fn>) =>
        (getLogs.mock.calls as unknown as [{ address: string; fromBlock: bigint }][]).map(([p]) => p);

    it("never scans the site's coordinator for another core; with none named, reads FigaroCore alone from genesis", async () => {
        const { client, getLogs } = outsideRpc();
        const tl = await buildProcessTimeline(client as never, PROCESS, CORE, { sharedCache: false });
        const calls = scanned(getLogs);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((c) => c.address.toLowerCase() === CORE.toLowerCase())).toBe(true);
        expect(calls.some((c) => c.address.toLowerCase() === SITE_COORD.toLowerCase())).toBe(false);
        expect(calls.every((c) => c.fromBlock === 0n)).toBe(true);
        expect(tl.coordinatorAddress).toBeNull();
        expect(tl.scannedFromBlock).toBe(0n);
    });

    it("scans the coordinator the link names, from the block the link names, and says so", async () => {
        const { client, getLogs } = outsideRpc();
        const tl = await buildProcessTimeline(client as never, PROCESS, CORE, {
            sharedCache: false, coordinatorAddress: LINK_COORD, fromBlock: 7n,
        });
        const calls = scanned(getLogs);
        expect(calls.some((c) => c.address.toLowerCase() === LINK_COORD.toLowerCase())).toBe(true);
        expect(calls.some((c) => c.address.toLowerCase() === SITE_COORD.toLowerCase())).toBe(false);
        expect(calls.every((c) => c.fromBlock === 7n)).toBe(true);
        expect(tl.coordinatorAddress).toBe(LINK_COORD);
        expect(tl.scannedFromBlock).toBe(7n);
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared event cache is the one store every page reads; a timeline read
// through an RPC the link chose must never write into it (frontend invariant
// S-3: a displayed view cannot be forged through a link).
const cached = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/kernel/eventCache", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/kernel/eventCache")>();
    return { ...real, cachedGetContractEvents: cached };
});

import { buildProcessTimeline } from "@/lib/audit/processTimeline";

const PROCESS = `0x${"ab".repeat(32)}` as const;
const CORE = "0x992f81049444A5275b4F92e69805a2F8c88B6386";

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

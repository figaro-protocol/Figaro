/**
 * /evidence-display reads what its link names, and says so when that is not
 * this site's own deployment.
 *
 * The page is the reader a forum embeds: its link names the RPC, the core,
 * the coordinator and the first block. A link can name a node that answers
 * anything, so the page names the RPC's origin on every render, and warns
 * whenever the RPC, the chain or the core is not the site's own. A link that
 * names one chain while its RPC answers for another is refused with both ids.
 * The read itself never enters the site's shared event cache
 * (`tests/lib/processTimelineOutsideRpc.test.ts`).
 *
 * Proves: the warning shows for an outside RPC, an outside core and an
 * outside chain, and not for the site's own triple; the RPC origin is printed;
 * a chain mismatch shows no timeline. Does not prove: that the RPC the link
 * names answers truly, which nothing on the page can check.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ProcessTimeline } from "@/lib/data/audit/processTimeline";

const m = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_FIGARO_CORE = "0x00000000000000000000000000000000000c0e01";
    return { params: new URLSearchParams(), timeline: null as unknown as ProcessTimeline };
});

vi.mock("next/navigation", () => ({
    useSearchParams: () => m.params,
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
    usePathname: () => "/evidence-display",
}));
vi.mock("@/lib/data/audit/processTimeline", () => ({ buildProcessTimeline: async () => m.timeline }));

import EvidenceDisplayPage from "@/app/(app)/evidence-display/page";
import { CONTRACTS } from "@/lib/core/contracts";
import { activeChain } from "@/lib/shared/chains";
import { siteRpcUrl } from "@/lib/shared/publicClient";

const PROCESS = `0x${"5e".repeat(32)}`;
const OUTSIDE_RPC = "https://rpc.outside.example";
const OUTSIDE_CORE = "0x00000000000000000000000000000000000ffe01";

function timeline(over: Partial<ProcessTimeline> = {}): ProcessTimeline {
    return {
        processId: PROCESS,
        chainId: activeChain.id,
        coreAddress: CONTRACTS.core,
        coordinatorAddress: null,
        batchVerifierAddress: null,
        scannedFromBlock: 0n,
        generatedAt: "2000-01-01T00:00:00.000Z",
        events: [],
        participants: [],
        missing: [],
        summary: { orderCount: 0, resolvedCount: 0, totalPayment: "0", totalSellerPayout: "0", totalBuyerPayout: "0" },
        ...over,
    } as unknown as ProcessTimeline;
}

function link(params: Record<string, string>) {
    m.params = new URLSearchParams({ processId: PROCESS, ...params });
}

async function rendered() {
    render(<EvidenceDisplayPage />);
    await waitFor(() => expect(screen.queryByText(/Loading process timeline/)).toBeNull());
}

describe("/evidence-display names what its link chose", () => {
    beforeEach(() => {
        m.timeline = timeline();
    });

    it("the site's own RPC, chain and core: the origin is named and no warning shows", async () => {
        link({ arbitrableJsonRpcUrl: siteRpcUrl });
        await rendered();
        expect(screen.getByText(`rpc: ${new URL(siteRpcUrl).origin}`)).toBeInTheDocument();
        expect(screen.queryByTestId("evidence-outside-deployment")).toBeNull();
    });

    it("an RPC the link chose: the warning names its origin", async () => {
        link({ arbitrableJsonRpcUrl: OUTSIDE_RPC });
        await rendered();
        expect(screen.getByTestId("evidence-outside-deployment")).toHaveTextContent(`The link chose what this page reads (${OUTSIDE_RPC})`);
    });

    it("the site's RPC with another core: the warning shows", async () => {
        m.timeline = timeline({ coreAddress: OUTSIDE_CORE as `0x${string}` });
        link({ arbitrableJsonRpcUrl: siteRpcUrl, coreAddress: OUTSIDE_CORE });
        await rendered();
        expect(screen.getByTestId("evidence-outside-deployment")).toBeInTheDocument();
    });

    it("the site's RPC answering for another chain: the warning shows", async () => {
        m.timeline = timeline({ chainId: activeChain.id + 1 });
        link({ arbitrableJsonRpcUrl: siteRpcUrl });
        await rendered();
        expect(screen.getByTestId("evidence-outside-deployment")).toBeInTheDocument();
    });

    it("a link naming one chain while its RPC answers for another: refused with both ids, no timeline", async () => {
        m.timeline = timeline({ chainId: 5 });
        link({ arbitrableJsonRpcUrl: OUTSIDE_RPC, chainID: "7" });
        await rendered();
        expect(screen.getByText("The link names chain 7, but its RPC answers for chain 5.")).toBeInTheDocument();
        expect(screen.queryByText("Figaro Process Timeline")).toBeNull();
    });
});

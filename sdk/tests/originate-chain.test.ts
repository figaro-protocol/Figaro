import { describe, it, expect } from "vitest";
import { createWalletClient, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    buildChainOffers, originateChain, counterSignOffer, type AssemblyTemplate, type ChainNodeSpec, type OfferPolicy,
} from "../src/agent/originate.js";
import { InProcessChannel } from "../src/agent/coordination.js";
import { computeCommitmentProcessId, computeOrderHash, ZERO_PROCESS_ID } from "../src/commitments.js";
import type { Address } from "../src/types.js";

const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
const S0 = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
const S1 = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"); // anvil[2]
const S2 = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"); // anvil[3]
const CURRENCY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const CHAIN = 31337;

const w = (acc: typeof BUYER) => createWalletClient({ account: acc, transport: http("http://localhost:0") });
const buyerW = w(BUYER);

// A 3-order value-added chain: root (order-0) + two subs under it (like the seed chain).
const template: AssemblyTemplate = {
    agreements: [
        { id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } },
        { id: "order-1", clauses: { "figaro-courier-process": {}, "figaro-topology": { parentOrderHashes: ["order-0"] } } },
        { id: "order-2", clauses: { "figaro-merchant-process": {}, "figaro-topology": { parentOrderHashes: ["order-0"] } } },
    ],
};
const nodes: ChainNodeSpec[] = [
    { nodeId: "order-0", seller: S0.address, payment: 1000n, overrides: { "figaro-commerce": { currency: CURRENCY, payment: "1000", lineItems: [{ itemId: "m", name: "Meal", quantity: 1, unitPrice: "1000" }] } } },
    { nodeId: "order-1", seller: S1.address, payment: 500n },
    { nodeId: "order-2", seller: S2.address, payment: 300n },
];
const params = { template, currency: CURRENCY, chainId: CHAIN, core: CORE, nodes, salt: () => 42n, deadline: 1_900_000_000n };

// A chain-tolerant operator policy: no requireRootShape (sub-orders carry the
// running cumulative value), the chain's currency, cap above the 1800 total.
const policy: OfferPolicy = { currencyAllowlist: [CURRENCY], maxValue: 10_000n };

function topologyParents(offer: { agreement: { sections: { clause: string; data: Record<string, unknown> }[] } }): unknown {
    return offer.agreement.sections.find((s) => s.clause === "figaro-topology")?.data.parentOrderHashes;
}

describe("buildChainOffers — the value-added chain walk", () => {
    it("orders root first and accumulates cumulative value across the chain", async () => {
        const offers = await buildChainOffers(buyerW, params);
        expect(offers.map((o) => o.nodeId)).toEqual(["order-0", "order-1", "order-2"]);
        expect(offers[0].offer.commitment.expectedCumulativeValue).toBe(1000n);
        expect(offers[1].offer.commitment.expectedCumulativeValue).toBe(1500n);
        expect(offers[2].offer.commitment.expectedCumulativeValue).toBe(1800n);
    });

    it("root signs processId=0; sub-orders name the root's derived processId", async () => {
        const offers = await buildChainOffers(buyerW, params);
        expect(offers[0].offer.commitment.processId).toBe(ZERO_PROCESS_ID);
        const derived = computeCommitmentProcessId(offers[0].offer.commitment, CHAIN, CORE);
        expect(offers[1].offer.commitment.processId).toBe(derived);
        expect(offers[2].offer.commitment.processId).toBe(derived);
    });

    it("wires each sub-order's topology to its parent's REAL order hash (not the template id)", async () => {
        const offers = await buildChainOffers(buyerW, params);
        const rootHash = computeOrderHash(offers[0].offer.commitment, CHAIN, CORE);
        expect(topologyParents(offers[0].offer)).toEqual([]);
        expect(topologyParents(offers[1].offer)).toEqual([rootHash]);
        expect(topologyParents(offers[2].offer)).toEqual([rootHash]);
    });

    it("carries each node to its own seller, all buyer-signed", async () => {
        const offers = await buildChainOffers(buyerW, params);
        expect(offers.map((o) => o.seller)).toEqual([S0.address, S1.address, S2.address]);
        expect(offers.every((o) => !!o.offer.buyerSig)).toBe(true);
    });

    it("throws when a template node has no seller/payment spec", async () => {
        await expect(buildChainOffers(buyerW, { ...params, nodes: nodes.slice(0, 2) })).rejects.toThrow(/no seller\/payment spec/i);
    });
});

describe("originateChain — abort on any decline (nothing commits)", () => {
    it("returns null and touches no chain when a mid-chain seller declines", async () => {
        const channel = new InProcessChannel();
        channel.register(S0.address, (o) => counterSignOffer(w(S0), o, { chainId: CHAIN, core: CORE }, () => true, policy));
        channel.register(S1.address, async () => null); // courier declines
        channel.register(S2.address, (o) => counterSignOffer(w(S2), o, { chainId: CHAIN, core: CORE }, () => true, policy));
        // A PublicClient that throws if used — proves abort happens before any chain call.
        const explodingPub = { getChainId: () => { throw new Error("chain must not be touched on abort"); } } as unknown as PublicClient;
        const result = await originateChain(buyerW, explodingPub, { core: CORE }, { ...params, channel });
        expect(result).toBeNull();
    });
});

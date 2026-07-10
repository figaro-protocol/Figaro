import { describe, it, expect } from "vitest";
import { keccak256, toBytes, encodeAbiParameters, pad, type Log } from "viem";
import {
    DiscoveryGraph,
    reconstructDiscovery,
    computeClauseKey,
    parseClauseRegistryLogs,
    parseSellerRegistryLogs,
    parseAssemblyRegistryLogs,
    type DiscoveryEvents,
} from "../src/discovery.js";
import type { Address, Hex } from "../src/types.js";

const SELLER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const AUTHOR = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const REGISTRAR = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
const COMP_1 = "0x0000000000000000000000000000000000000000000000000000000000000011" as Hex;
const COMP_2 = "0x0000000000000000000000000000000000000000000000000000000000000012" as Hex;
const CONTENT_HASH = "0x0000000000000000000000000000000000000000000000000000000000000099" as Hex;

function mkEvents(overrides: Partial<DiscoveryEvents> = {}): DiscoveryEvents {
    return {
        clauseRegistered: [],
        clauseWithdrawn: [],
        sellerRegistered: [],
        sellerWithdrawn: [],
        assemblyRegistered: [],
        assemblyWithdrawn: [],
        ...overrides,
    };
}

describe("computeClauseKey", () => {
    it("matches keccak256(abi.encode(name, version))", () => {
        expect(computeClauseKey("clause-a", 1)).toBe(
            keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], ["clause-a", 1n])),
        );
    });

    it("different names produce different keys", () => {
        expect(computeClauseKey("key-a", 1)).not.toBe(computeClauseKey("key-b", 1));
    });

    it("different versions produce different keys", () => {
        expect(computeClauseKey("clause-a", 1)).not.toBe(computeClauseKey("clause-a", 2));
    });
});

describe("DiscoveryGraph — clauses", () => {
    it("surfaces a registered clause with its derived on-chain key", () => {
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [{
                clauseId: "figaro-courier-process", version: 1,
                contentHash: CONTENT_HASH, contentURI: "ipfs://spec", registrar: REGISTRAR,
                blockNumber: 1, logIndex: 0,
            }],
        }));
        const clauses = g.getClauses();
        expect(clauses).toHaveLength(1);
        expect(clauses[0].clauseId).toBe("figaro-courier-process");
        expect(clauses[0].idHash).toBe(computeClauseKey("figaro-courier-process", 1));
        expect(g.getClause(clauses[0].idHash)?.contentURI).toBe("ipfs://spec");
    });

    it("de-surfaces a clause once its deposit is withdrawn (withdraw keys on the idHash)", () => {
        const idHash = computeClauseKey("figaro-emissions", 2);
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [{
                clauseId: "figaro-emissions", version: 2,
                contentHash: CONTENT_HASH, contentURI: "ipfs://ghg", registrar: REGISTRAR,
                blockNumber: 1, logIndex: 0,
            }],
            clauseWithdrawn: [{ idHash, registrar: REGISTRAR, blockNumber: 5, logIndex: 0 }],
        }));
        expect(g.getClauses()).toHaveLength(0);
        expect(g.getClause(idHash)).toBeUndefined();
    });

    it("same name, different version = two distinct live clauses", () => {
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [
                { clauseId: "figaro-proximity", version: 1, contentHash: CONTENT_HASH, contentURI: "ipfs://v1", registrar: REGISTRAR, blockNumber: 1, logIndex: 0 },
                { clauseId: "figaro-proximity", version: 2, contentHash: CONTENT_HASH, contentURI: "ipfs://v2", registrar: REGISTRAR, blockNumber: 2, logIndex: 0 },
            ],
        }));
        expect(g.getClauses()).toHaveLength(2);
    });
});

describe("DiscoveryGraph — assemblies", () => {
    it("surfaces registered assemblies and de-surfaces on withdraw", () => {
        const g = reconstructDiscovery(mkEvents({
            assemblyRegistered: [
                { compositionHash: COMP_1, author: AUTHOR, contentURI: "ipfs://a1", blockNumber: 1, logIndex: 0 },
                { compositionHash: COMP_2, author: AUTHOR, contentURI: "ipfs://a2", blockNumber: 1, logIndex: 1 },
            ],
            assemblyWithdrawn: [{ compositionHash: COMP_1, author: AUTHOR, blockNumber: 9, logIndex: 0 }],
        }));
        const live = g.getAssemblies();
        expect(live).toHaveLength(1);
        expect(live[0].compositionHash).toBe(COMP_2);
        expect(g.getAssembly(COMP_1)).toBeUndefined();
        expect(g.getAssembly(COMP_2)?.contentURI).toBe("ipfs://a2");
    });
});

describe("DiscoveryGraph — sellers (order-dependent liveness)", () => {
    it("current metadataURI is the most-recent register/update", () => {
        const g = reconstructDiscovery(mkEvents({
            sellerRegistered: [
                { seller: SELLER_A, metadataURI: "ipfs://old", updated: false, blockNumber: 1, logIndex: 0 },
                { seller: SELLER_A, metadataURI: "ipfs://new", updated: true, blockNumber: 3, logIndex: 0 },
            ],
        }));
        expect(g.getSeller(SELLER_A)?.metadataURI).toBe("ipfs://new");
    });

    it("withdraw de-surfaces the seller", () => {
        const g = reconstructDiscovery(mkEvents({
            sellerRegistered: [{ seller: SELLER_A, metadataURI: "ipfs://x", updated: false, blockNumber: 1, logIndex: 0 }],
            sellerWithdrawn: [{ seller: SELLER_A, blockNumber: 4, logIndex: 0 }],
        }));
        expect(g.getSellers()).toHaveLength(0);
        expect(g.getSeller(SELLER_A)).toBeUndefined();
    });

    it("re-registration after withdraw re-surfaces the seller (latest event wins, not raw counts)", () => {
        const g = reconstructDiscovery(mkEvents({
            sellerRegistered: [
                { seller: SELLER_A, metadataURI: "ipfs://first", updated: false, blockNumber: 1, logIndex: 0 },
                { seller: SELLER_A, metadataURI: "ipfs://second", updated: false, blockNumber: 7, logIndex: 0 },
            ],
            sellerWithdrawn: [{ seller: SELLER_A, blockNumber: 4, logIndex: 0 }],
        }));
        const live = g.getSellers();
        expect(live).toHaveLength(1);
        expect(g.getSeller(SELLER_A)?.metadataURI).toBe("ipfs://second");
    });

    it("orders a within-block withdraw AFTER a same-block registration by logIndex", () => {
        const g = reconstructDiscovery(mkEvents({
            sellerRegistered: [{ seller: SELLER_B, metadataURI: "ipfs://y", updated: false, blockNumber: 2, logIndex: 0 }],
            sellerWithdrawn: [{ seller: SELLER_B, blockNumber: 2, logIndex: 1 }],
        }));
        expect(g.getSeller(SELLER_B)).toBeUndefined();
    });

    it("is idempotent under re-applied overlapping batches", () => {
        const g = new DiscoveryGraph();
        const batch = mkEvents({
            sellerRegistered: [{ seller: SELLER_A, metadataURI: "ipfs://z", updated: false, blockNumber: 1, logIndex: 0 }],
        });
        g.applyEvents(batch);
        g.applyEvents(batch);
        expect(g.getSellers()).toHaveLength(1);
        expect(g.getSeller(SELLER_A)?.metadataURI).toBe("ipfs://z");
    });
});

describe("registry log parsers (decode round-trip — no chain)", () => {
    // Hand-build the exact { data, topics } shape a node returns, then parse it
    // back — proves the ABI decode + field mapping (the silent
    // a.clauseId/a.compositionHash trap). topic0 = keccak(canonical signature);
    // indexed params are the remaining topics; non-indexed params are the data.
    const addrTopic = (a: Address): Hex => pad(a.toLowerCase() as Hex, { size: 32 });
    function mkLog(
        sig: string,
        indexed: Hex[],
        dataTypes: { type: string }[],
        dataValues: unknown[],
        blockNumber: bigint,
        logIndex: number,
    ): Log {
        const topics = [keccak256(toBytes(sig)), ...indexed] as [Hex, ...Hex[]];
        const data = dataTypes.length ? encodeAbiParameters(dataTypes, dataValues) : ("0x" as Hex);
        return { data, topics, blockNumber, logIndex, address: SELLER_A, transactionHash: "0x" as Hex,
            transactionIndex: 0, blockHash: "0x" as Hex, removed: false } as unknown as Log;
    }

    it("parses ClauseRegistered + DepositWithdrawn with the idHash key", () => {
        const idHash = computeClauseKey("figaro-cargo", 1);
        const reg = mkLog("ClauseRegistered(string,uint64,bytes32,string,address)", [addrTopic(REGISTRAR)],
            [{ type: "string" }, { type: "uint64" }, { type: "bytes32" }, { type: "string" }],
            ["figaro-cargo", 1n, CONTENT_HASH, "ipfs://c"], 1n, 0);
        const wd = mkLog("DepositWithdrawn(bytes32,address,uint256)", [idHash, addrTopic(REGISTRAR)],
            [{ type: "uint256" }], [10n], 2n, 0);
        const parsed = parseClauseRegistryLogs([reg, wd]);
        expect(parsed.registered[0].clauseId).toBe("figaro-cargo");
        expect(parsed.registered[0].version).toBe(1);
        expect(parsed.registered[0].contentURI).toBe("ipfs://c");
        expect(parsed.withdrawn[0].idHash).toBe(idHash);
    });

    it("parses SellerRegistered, SellerProfileUpdated, and SellerWithdrawn", () => {
        const reg = mkLog("SellerRegistered(address,string)", [addrTopic(SELLER_A)],
            [{ type: "string" }], ["ipfs://s"], 1n, 0);
        const upd = mkLog("SellerProfileUpdated(address,string)", [addrTopic(SELLER_A)],
            [{ type: "string" }], ["ipfs://s2"], 2n, 0);
        const wd = mkLog("SellerWithdrawn(address,uint256)", [addrTopic(SELLER_A)],
            [{ type: "uint256" }], [10n], 3n, 0);
        const parsed = parseSellerRegistryLogs([reg, upd, wd]);
        expect(parsed.registered.map((r) => r.updated)).toEqual([false, true]);
        expect(parsed.registered[1].metadataURI).toBe("ipfs://s2");
        expect(parsed.withdrawn[0].seller.toLowerCase()).toBe(SELLER_A.toLowerCase());
    });

    it("parses AssemblyRegistered + DepositWithdrawn keyed by compositionHash", () => {
        const reg = mkLog("AssemblyRegistered(bytes32,address,string)", [COMP_1, addrTopic(AUTHOR)],
            [{ type: "string" }], ["ipfs://a"], 1n, 0);
        const wd = mkLog("DepositWithdrawn(bytes32,address,uint256)", [COMP_1, addrTopic(AUTHOR)],
            [{ type: "uint256" }], [10n], 2n, 0);
        const parsed = parseAssemblyRegistryLogs([reg, wd]);
        expect(parsed.registered[0].compositionHash).toBe(COMP_1);
        expect(parsed.registered[0].contentURI).toBe("ipfs://a");
        expect(parsed.withdrawn[0].compositionHash).toBe(COMP_1);
    });

    it("end-to-end: decoded logs fold to the correct live view", () => {
        const regLog = mkLog("AssemblyRegistered(bytes32,address,string)", [COMP_2, addrTopic(AUTHOR)],
            [{ type: "string" }], ["ipfs://live"], 1n, 0);
        const { registered, withdrawn } = parseAssemblyRegistryLogs([regLog]);
        const g = reconstructDiscovery({
            clauseRegistered: [], clauseWithdrawn: [], sellerRegistered: [], sellerWithdrawn: [],
            assemblyRegistered: registered, assemblyWithdrawn: withdrawn,
        });
        expect(g.getAssemblies()).toHaveLength(1);
        expect(g.getAssembly(COMP_2)?.contentURI).toBe("ipfs://live");
    });
});

describe("DiscoveryGraph — empty", () => {
    it("returns empty views with no events", () => {
        const g = reconstructDiscovery(mkEvents());
        expect(g.getClauses()).toEqual([]);
        expect(g.getSellers()).toEqual([]);
        expect(g.getAssemblies()).toEqual([]);
    });
});

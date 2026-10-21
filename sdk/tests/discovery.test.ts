import { describe, it, expect, vi } from "vitest";
import { keccak256, toBytes, encodeAbiParameters, pad, type Log, type PublicClient } from "viem";
import {
    DiscoveryGraph,
    reconstructDiscovery,
    computeClauseKey,
    parseClauseRegistryLogs,
    parseMembersRegistryLogs,
    parseAssemblyRegistryLogs,
    parseAgreementRegistryLogs,
    fetchDiscoveryEvents,
    type DiscoveryEvents,
} from "../src/discovery.js";
import type { Address, FigaroAddresses, Hex } from "../src/types.js";
import { canonicalize } from "../src/agreement.js";

const MEMBER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const MEMBER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const ASM_REGISTERED_BY = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const CLAUSE_REGISTERED_BY = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
const COMP_1 = "0x0000000000000000000000000000000000000000000000000000000000000011" as Hex;
const COMP_2 = "0x0000000000000000000000000000000000000000000000000000000000000012" as Hex;
const KEY_1 = "0x00000000000000000000000000000000000000000000000000000000000000a1" as Hex;
const KEY_2 = "0x00000000000000000000000000000000000000000000000000000000000000a2" as Hex;
function mkEvents(overrides: Partial<DiscoveryEvents> = {}): DiscoveryEvents {
    return {
        clauseRegistered: [],
        clauseWithdrawn: [],
        memberRegistered: [],
        memberWithdrawn: [],
        assemblyRegistered: [],
        assemblyWithdrawn: [],
        agreementRegistered: [],
        agreementWithdrawn: [],
        ...overrides,
    };
}

describe("computeClauseKey", () => {
    it("is keccak256 of the spec's canonical bytes (key order does not matter)", () => {
        const spec = { clauseId: "clause-a", version: 1, fields: { b: 1, a: 2 } };
        expect(computeClauseKey(spec)).toBe(keccak256(toBytes(canonicalize(spec))));
        expect(computeClauseKey({ fields: { a: 2, b: 1 }, version: 1, clauseId: "clause-a" })).toBe(computeClauseKey(spec));
    });

    it("two specs with the same name and version but different bytes are two keys", () => {
        expect(computeClauseKey({ clauseId: "clause-a", version: 1, x: 1 }))
            .not.toBe(computeClauseKey({ clauseId: "clause-a", version: 1, x: 2 }));
    });
});

describe("DiscoveryGraph — clauses", () => {
    it("surfaces a registered clause under its key", () => {
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [{
                clauseKey: KEY_1, contentURI: "ipfs://spec", registeredBy: CLAUSE_REGISTERED_BY,
                blockNumber: 1, logIndex: 0, transactionHash: null,
            }],
        }));
        const clauses = g.getClauses();
        expect(clauses).toEqual([{ clauseKey: KEY_1, contentURI: "ipfs://spec", registeredBy: CLAUSE_REGISTERED_BY, stakeWithdrawn: false }]);
        expect(g.getClause(KEY_1)?.contentURI).toBe("ipfs://spec");
    });

    it("de-surfaces a clause once its deposit is withdrawn (the withdrawal carries the same key)", () => {
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [{
                clauseKey: KEY_1, contentURI: "ipfs://ghg", registeredBy: CLAUSE_REGISTERED_BY,
                blockNumber: 1, logIndex: 0, transactionHash: null,
            }],
            clauseWithdrawn: [{ clauseKey: KEY_1, registeredBy: CLAUSE_REGISTERED_BY, blockNumber: 5, logIndex: 0 }],
        }));
        expect(g.getClauses()).toHaveLength(0);
        expect(g.getClause(KEY_1)).toBeUndefined();
    });

    it("two keys are two live clauses", () => {
        const g = reconstructDiscovery(mkEvents({
            clauseRegistered: [
                { clauseKey: KEY_1, contentURI: "ipfs://v1", registeredBy: CLAUSE_REGISTERED_BY, blockNumber: 1, logIndex: 0, transactionHash: null },
                { clauseKey: KEY_2, contentURI: "ipfs://v2", registeredBy: CLAUSE_REGISTERED_BY, blockNumber: 2, logIndex: 0, transactionHash: null },
            ],
        }));
        expect(g.getClauses()).toHaveLength(2);
    });
});

describe("DiscoveryGraph — assemblies", () => {
    it("surfaces registered assemblies and de-surfaces on withdraw", () => {
        const g = reconstructDiscovery(mkEvents({
            assemblyRegistered: [
                { compositionHash: COMP_1, registeredBy: ASM_REGISTERED_BY, contentURI: "ipfs://a1", blockNumber: 1, logIndex: 0 },
                { compositionHash: COMP_2, registeredBy: ASM_REGISTERED_BY, contentURI: "ipfs://a2", blockNumber: 1, logIndex: 1 },
            ],
            assemblyWithdrawn: [{ compositionHash: COMP_1, registeredBy: ASM_REGISTERED_BY, blockNumber: 9, logIndex: 0 }],
        }));
        const live = g.getAssemblies();
        expect(live).toHaveLength(1);
        expect(live[0].compositionHash).toBe(COMP_2);
        expect(g.getAssembly(COMP_1)).toBeUndefined();
        expect(g.getAssembly(COMP_2)?.contentURI).toBe("ipfs://a2");
    });
});

describe("DiscoveryGraph — registered agreements", () => {
    const AGR_1 = ("0x" + "e1".repeat(32)) as Hex;
    const AGR_2 = ("0x" + "e2".repeat(32)) as Hex;

    it("surfaces live agreements, de-surfaces on withdraw, and keeps the binding readable whatever the stake", () => {
        const g = reconstructDiscovery(mkEvents({
            agreementRegistered: [
                { agreementHash: AGR_1, registeredBy: ASM_REGISTERED_BY, contentURI: "ipfs://g1", blockNumber: 3, logIndex: 0, transactionHash: null },
                { agreementHash: AGR_2, registeredBy: ASM_REGISTERED_BY, contentURI: "ipfs://g2", blockNumber: 4, logIndex: 1, transactionHash: null },
            ],
            agreementWithdrawn: [{ agreementHash: AGR_1, registeredBy: ASM_REGISTERED_BY, blockNumber: 9, logIndex: 0 }],
        }));
        expect(g.getAgreements()).toEqual([{
            agreementHash: AGR_2, contentURI: "ipfs://g2", registeredBy: ASM_REGISTERED_BY, registeredAt: 4, stakeWithdrawn: false,
        }]);
        expect(g.getAgreement(AGR_1)).toBeUndefined();
        expect(g.getAgreement(AGR_2.toUpperCase().replace("0X", "0x") as Hex)?.contentURI).toBe("ipfs://g2");
        // A withdrawn agreement's binding stays readable for hydration.
        expect(g.getAgreementBinding(AGR_1)).toMatchObject({ contentURI: "ipfs://g1", stakeWithdrawn: true });
        expect(g.getAgreementBinding(("0x" + "e3".repeat(32)) as Hex)).toBeUndefined();
    });

    it("first-seen wins for a key", () => {
        const g = reconstructDiscovery(mkEvents({
            agreementRegistered: [
                { agreementHash: AGR_1, registeredBy: ASM_REGISTERED_BY, contentURI: "ipfs://first", blockNumber: 1, logIndex: 0, transactionHash: null },
                { agreementHash: AGR_1, registeredBy: MEMBER_A, contentURI: "ipfs://second", blockNumber: 2, logIndex: 0, transactionHash: null },
            ],
        }));
        expect(g.getAgreements().map((a) => a.contentURI)).toEqual(["ipfs://first"]);
    });
});

describe("DiscoveryGraph — members (order-dependent liveness)", () => {
    it("current metadataURI is the most-recent register/update", () => {
        const g = reconstructDiscovery(mkEvents({
            memberRegistered: [
                { member: MEMBER_A, metadataURI: "ipfs://old", updated: false, blockNumber: 1, logIndex: 0 },
                { member: MEMBER_A, metadataURI: "ipfs://new", updated: true, blockNumber: 3, logIndex: 0 },
            ],
        }));
        expect(g.getMember(MEMBER_A)?.metadataURI).toBe("ipfs://new");
    });

    it("requesting withdrawal de-surfaces the member", () => {
        const g = reconstructDiscovery(mkEvents({
            memberRegistered: [{ member: MEMBER_A, metadataURI: "ipfs://x", updated: false, blockNumber: 1, logIndex: 0 }],
            memberWithdrawn: [{ member: MEMBER_A, blockNumber: 4, logIndex: 0 }],
        }));
        expect(g.getMembers()).toHaveLength(0);
        expect(g.getMember(MEMBER_A)).toBeUndefined();
    });

    it("re-registration after leaving re-surfaces the member (latest event wins, not raw counts)", () => {
        const g = reconstructDiscovery(mkEvents({
            memberRegistered: [
                { member: MEMBER_A, metadataURI: "ipfs://first", updated: false, blockNumber: 1, logIndex: 0 },
                { member: MEMBER_A, metadataURI: "ipfs://second", updated: false, blockNumber: 7, logIndex: 0 },
            ],
            memberWithdrawn: [{ member: MEMBER_A, blockNumber: 4, logIndex: 0 }],
        }));
        const live = g.getMembers();
        expect(live).toHaveLength(1);
        expect(g.getMember(MEMBER_A)?.metadataURI).toBe("ipfs://second");
    });

    it("orders a within-block withdrawal request AFTER a same-block registration by logIndex", () => {
        const g = reconstructDiscovery(mkEvents({
            memberRegistered: [{ member: MEMBER_B, metadataURI: "ipfs://y", updated: false, blockNumber: 2, logIndex: 0 }],
            memberWithdrawn: [{ member: MEMBER_B, blockNumber: 2, logIndex: 1 }],
        }));
        expect(g.getMember(MEMBER_B)).toBeUndefined();
    });

    it("is idempotent under re-applied overlapping batches", () => {
        const g = new DiscoveryGraph();
        const batch = mkEvents({
            memberRegistered: [{ member: MEMBER_A, metadataURI: "ipfs://z", updated: false, blockNumber: 1, logIndex: 0 }],
        });
        g.applyEvents(batch);
        g.applyEvents(batch);
        expect(g.getMembers()).toHaveLength(1);
        expect(g.getMember(MEMBER_A)?.metadataURI).toBe("ipfs://z");
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
        return { data, topics, blockNumber, logIndex, address: MEMBER_A, transactionHash: "0x" as Hex,
            transactionIndex: 0, blockHash: "0x" as Hex, removed: false } as unknown as Log;
    }

    it("parses ClauseRegistered + DepositWithdrawn under the clause key", () => {
        const reg = mkLog("ClauseRegistered(bytes32,string,address)", [KEY_1, addrTopic(CLAUSE_REGISTERED_BY)],
            [{ type: "string" }], ["ipfs://c"], 1n, 0);
        const wd = mkLog("DepositWithdrawn(bytes32,address,uint256)", [KEY_1, addrTopic(CLAUSE_REGISTERED_BY)],
            [{ type: "uint256" }], [10n], 2n, 0);
        const parsed = parseClauseRegistryLogs([reg, wd]);
        expect(parsed.registered[0].clauseKey).toBe(KEY_1);
        expect(parsed.registered[0].contentURI).toBe("ipfs://c");
        expect(parsed.registered[0].registeredBy.toLowerCase()).toBe(CLAUSE_REGISTERED_BY);
        expect(parsed.withdrawn[0].clauseKey).toBe(KEY_1);
    });

    it("parses MemberRegistered, MemberProfileUpdated, and MemberWithdrawalRequested", () => {
        const reg = mkLog("MemberRegistered(address,string)", [addrTopic(MEMBER_A)],
            [{ type: "string" }], ["ipfs://s"], 1n, 0);
        const upd = mkLog("MemberProfileUpdated(address,string)", [addrTopic(MEMBER_A)],
            [{ type: "string" }], ["ipfs://s2"], 2n, 0);
        const req = mkLog("MemberWithdrawalRequested(address,uint256,uint256)", [addrTopic(MEMBER_A)],
            [{ type: "uint256" }, { type: "uint256" }], [10n, 99n], 3n, 0);
        const parsed = parseMembersRegistryLogs([reg, upd, req]);
        expect(parsed.registered.map((r) => r.updated)).toEqual([false, true]);
        expect(parsed.registered[1].metadataURI).toBe("ipfs://s2");
        expect(parsed.withdrawn[0].member.toLowerCase()).toBe(MEMBER_A.toLowerCase());
    });

    it("de-surfaces on the REQUEST, not on the later ETH release", () => {
        // MemberWithdrawn is the custody event and can land a whole cooldown after
        // the member left. Folding it as the de-surfacing signal would keep a
        // departed member in the live set for that entire window.
        const claim = mkLog("MemberWithdrawn(address,uint256)", [addrTopic(MEMBER_A)],
            [{ type: "uint256" }], [10n], 9n, 0);
        expect(parseMembersRegistryLogs([claim]).withdrawn).toHaveLength(0);
    });

    it("parses AssemblyRegistered + DepositWithdrawn keyed by compositionHash", () => {
        const reg = mkLog("AssemblyRegistered(bytes32,address,string)", [COMP_1, addrTopic(ASM_REGISTERED_BY)],
            [{ type: "string" }], ["ipfs://a"], 1n, 0);
        const wd = mkLog("DepositWithdrawn(bytes32,address,uint256)", [COMP_1, addrTopic(ASM_REGISTERED_BY)],
            [{ type: "uint256" }], [10n], 2n, 0);
        const parsed = parseAssemblyRegistryLogs([reg, wd]);
        expect(parsed.registered[0].compositionHash).toBe(COMP_1);
        expect(parsed.registered[0].contentURI).toBe("ipfs://a");
        expect(parsed.withdrawn[0].compositionHash).toBe(COMP_1);
    });

    it("parses AgreementRegistered + DepositWithdrawn keyed by agreementHash", () => {
        const AGR = ("0x" + "e1".repeat(32)) as Hex;
        const reg = mkLog("AgreementRegistered(bytes32,address,string)", [AGR, addrTopic(ASM_REGISTERED_BY)],
            [{ type: "string" }], ["ipfs://g"], 5n, 2);
        const wd = mkLog("DepositWithdrawn(bytes32,address,uint256)", [AGR, addrTopic(ASM_REGISTERED_BY)],
            [{ type: "uint256" }], [10n], 6n, 0);
        const parsed = parseAgreementRegistryLogs([reg, wd]);
        expect(parsed.registered[0]).toMatchObject({ agreementHash: AGR, contentURI: "ipfs://g", blockNumber: 5, logIndex: 2 });
        expect(parsed.registered[0].registeredBy.toLowerCase()).toBe(ASM_REGISTERED_BY);
        expect(parsed.withdrawn[0].agreementHash).toBe(AGR);
        // A clause registry's event is not an agreement registration.
        const clause = mkLog("ClauseRegistered(bytes32,string,address)", [KEY_1, addrTopic(CLAUSE_REGISTERED_BY)],
            [{ type: "string" }], ["ipfs://c"], 1n, 0);
        expect(parseAgreementRegistryLogs([clause]).registered).toHaveLength(0);
    });

    it("end-to-end: decoded logs fold to the correct live view", () => {
        const regLog = mkLog("AssemblyRegistered(bytes32,address,string)", [COMP_2, addrTopic(ASM_REGISTERED_BY)],
            [{ type: "string" }], ["ipfs://live"], 1n, 0);
        const { registered, withdrawn } = parseAssemblyRegistryLogs([regLog]);
        const g = reconstructDiscovery({
            clauseRegistered: [], clauseWithdrawn: [], memberRegistered: [], memberWithdrawn: [],
            assemblyRegistered: registered, assemblyWithdrawn: withdrawn,
            agreementRegistered: [], agreementWithdrawn: [],
        });
        expect(g.getAssemblies()).toHaveLength(1);
        expect(g.getAssembly(COMP_2)?.contentURI).toBe("ipfs://live");
    });
});

describe("DiscoveryGraph — empty", () => {
    it("returns empty views with no events", () => {
        const g = reconstructDiscovery(mkEvents());
        expect(g.getClauses()).toEqual([]);
        expect(g.getMembers()).toEqual([]);
        expect(g.getAssemblies()).toEqual([]);
        expect(g.getAgreements()).toEqual([]);
    });
});

describe("fetchDiscoveryEvents — chunked getLogs", () => {
    /** A stub client whose `getLogs` always answers empty (only the chunking of
     *  the CALLS themselves is under test here — decoding is covered above),
     *  and whose calls are recorded for assertion. */
    function mockClient(): PublicClient {
        const getLogs = vi.fn(async () => [] as Log[]);
        return { getLogs } as unknown as PublicClient;
    }

    const addresses: FigaroAddresses = {
        core: "0x000000000000000000000000000000000000c0de" as Address,
        clauseRegistry: "0x0000000000000000000000000000000000c1a05e" as Address,
        membersRegistry: "0x0000000000000000000000000000000000dead01" as Address,
        assemblyRegistry: "0x0000000000000000000000000000000000a55e60" as Address,
        agreementRegistry: "0x0000000000000000000000000000000000a62ee0" as Address,
    };

    it("threads a custom chunkSize through to every configured registry's getLogs calls", async () => {
        const client = mockClient();
        await fetchDiscoveryEvents(client, addresses, 0n, 25n, 10n);
        // Four registries × three 10-block chunks over [0,25] = 12 calls.
        expect(client.getLogs).toHaveBeenCalledTimes(12);
        expect(client.getLogs).toHaveBeenCalledWith({ address: addresses.agreementRegistry, fromBlock: 0n, toBlock: 9n });
        expect(client.getLogs).toHaveBeenCalledWith({
            address: addresses.clauseRegistry,
            fromBlock: 20n,
            toBlock: 25n,
        });
    });

    it("defaults to DEFAULT_LOG_CHUNK_SIZE, issuing one call per registry on a devnet-sized range", async () => {
        const client = mockClient();
        await fetchDiscoveryEvents(client, addresses, 0n, 100n);
        expect(client.getLogs).toHaveBeenCalledTimes(4);
    });
});

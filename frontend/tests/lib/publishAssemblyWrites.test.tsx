/**
 * The designer's two publish writes, as they reach the registries.
 *
 * `useRegisterDesignedAgreement` composes one order's clauses through the SDK's one
 * composition rule (exactly the clauses the designer selected), pins the
 * document and sends `AgreementRegistry.registerAgreement(key, uri)` with the
 * registry's stake, the key being the pinned document's own agreement hash.
 *
 * `usePublishAssembly` refuses, before anything is pinned or simulated, an
 * assembly with more orders than the SDK plans to fit in one atomic
 * resolveProcess (the message names that figure as the SDK's own estimate,
 * not a limit the chain enforces) and a build that is not the composition
 * reviewed; otherwise it pins the assembly and simulates its registration,
 * pins and simulates each newly composed agreement no registry binds yet —
 * every check before any write — then sends each agreement's registration
 * and last `ProcessRegistry.registerProcess(processDesignHash, uri)`, each with
 * its registry's stake and each simulated, sent and held to a success
 * receipt in that order.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PROCESS_REGISTRY_ABI, agreementHashOf, processDesignHashOf, type ProcessDesign, type RegisteredAgreement, type Hex } from "@figaro-protocol/sdk";
import { revertOf } from "../support/contractRevert";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";

const PROCESS_REGISTRY = "0x00000000000000000000000000000000000a5501";
const AGREEMENT_REGISTRY = "0x00000000000000000000000000000000000a9e01";
const DESIGNER = "0x1111111111111111111111111111111111111111";
const ASSEMBLY_STAKE = 7n * 10n ** 16n;
const AGREEMENT_STAKE = 5n * 10n ** 16n;
const TX = `0x${"77".repeat(32)}` as Hex;

const s = vi.hoisted(() => ({
    calls: [] as string[],
    pins: [] as unknown[],
    bound: new Set<string>(),
    cap: 10,
    client: {} as Record<string, ReturnType<typeof import("vitest").vi.fn>>,
    write: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => DESIGNER, client: () => s.client }, {
    useWriteContract: () => ({ writeContractAsync: s.write, data: undefined, isPending: false, error: null }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
}));
vi.mock("@/lib/registries/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/contracts")>();
    return { ...actual, REGISTRY_CONTRACTS: { ...actual.REGISTRY_CONTRACTS, processRegistry: "0x00000000000000000000000000000000000a5501", agreementRegistry: "0x00000000000000000000000000000000000a9e01" } };
});
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: {} }));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/ipfsService")>();
    return {
        ...actual,
        DEFAULT_IPFS_SERVICE: {
            ...actual.DEFAULT_IPFS_SERVICE,
            publishJSON: async (doc: unknown) => {
                s.pins.push(doc);
                s.calls.push(`pin:${s.pins.length}`);
                return { uri: `ipfs://pin-${s.pins.length}` };
            },
        },
    };
});
vi.mock("@/lib/shared/chainGasCeilings", () => ({ maxOrdersResolvablePerProcess: async () => s.cap }));

import { useRegisterDesignedAgreement, usePublishAssembly } from "@/lib/designer/publishAssembly";
import { activeChain } from "@/lib/shared/chains";
import { createSyntheticRootOrder, createSyntheticSubOrder, startSyntheticSession } from "@/lib/designer/syntheticProcess";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

type Call = { address: string; functionName: string; args: readonly unknown[]; value?: bigint; chainId?: number };
const shape = ({ address, functionName, args, value }: Call) => ({ address: address.toLowerCase(), functionName, args, value });

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-schedule", "figaro-acceptance-criteria"]);
});
beforeEach(() => {
    s.calls = [];
    s.pins = [];
    s.bound = new Set();
    s.cap = 10;
    s.client = {
        readContract: vi.fn(async ({ address, functionName, args }: { address: string; functionName: string; args?: [string] }) => {
            if (functionName === "registrationDeposit") return address.toLowerCase() === PROCESS_REGISTRY ? ASSEMBLY_STAKE : AGREEMENT_STAKE;
            if (functionName === "bindings") {
                return s.bound.has(String(args?.[0]).toLowerCase())
                    ? [DESIGNER, 1n, false, "ipfs://already"]
                    : [ZERO_ADDRESS, 0n, false, ""];
            }
            throw new Error(`unstubbed read ${functionName}`);
        }),
        simulateContract: vi.fn(async (call: Call) => { s.calls.push(`simulate:${call.functionName}`); return { request: {} }; }),
        waitForTransactionReceipt: vi.fn(async () => { s.calls.push("receipt"); return { status: "success" }; }),
    };
    s.write = vi.fn(async (call: Call) => { s.calls.push(`write:${call.functionName}`); return TX; });
});

/** A root and one sub-order, each composing a clause of its own, so the
 *  build composes two new agreements beside the assembly. */
function snapshot(): DesignSnapshot {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    const sub = createSyntheticSubOrder(session, root.order);
    return {
        slug: "publish-writes",
        name: "Publish writes",
        processId: session.processId,
        nextOrderIndex: session.nextOrderIndex,
        nextSellerIndex: session.nextSellerIndex,
        orders: [root.order, sub.order],
        createdAt: 1,
        updatedAt: 1,
        clausesByOrderId: {
            [root.order.orderHash]: { [keyOf("figaro-schedule")]: {} },
            [sub.order.orderHash]: { [keyOf("figaro-acceptance-criteria")]: {} },
        },
    };
}

async function caught(run: () => Promise<unknown>): Promise<unknown> {
    let out: unknown;
    await act(async () => { try { await run(); } catch (e) { out = e; } });
    return out;
}

describe("useRegisterDesignedAgreement — one order's agreement registered on its own", () => {
    it("pins the composed document and registers its own key with the registry's stake, simulated, sent and held to a success receipt", async () => {
        const { result } = renderHook(() => useRegisterDesignedAgreement());
        let outcome: Awaited<ReturnType<typeof result.current.registerDesignedAgreement>> | undefined;
        await act(async () => { outcome = await result.current.registerDesignedAgreement({ clauses: { [keyOf("figaro-schedule")]: {} }, name: "Scheduled work" }); });
        const pinned = s.pins[0] as RegisteredAgreement;
        // Exactly the designer's clauses: nothing is written in.
        expect(Object.keys(pinned.clauses)).toEqual([keyOf("figaro-schedule")]);
        expect(pinned.name).toBe("Scheduled work");
        const key = agreementHashOf(pinned);
        expect(s.write.mock.calls.map(([c]) => shape(c))).toEqual([
            { address: AGREEMENT_REGISTRY, functionName: "registerAgreement", args: [key, "ipfs://pin-1"], value: AGREEMENT_STAKE },
        ]);
        expect(s.write.mock.calls[0][0].chainId).toBe(activeChain.id);
        expect(s.calls).toEqual(["pin:1", "simulate:registerAgreement", "write:registerAgreement", "receipt"]);
        expect(outcome).toEqual({ agreementHash: key, hash: TX, ipfsURI: "ipfs://pin-1" });
    });

    it("an order with no clause registers nothing", async () => {
        const { result } = renderHook(() => useRegisterDesignedAgreement());
        const e = await caught(() => result.current.registerDesignedAgreement({ clauses: {} }));
        expect((e as Error).message).toMatch(/Compose at least one clause/);
        expect(s.calls).toEqual([]);
    });
});

describe("usePublishAssembly — the agreements, then the assembly", () => {
    it("checks everything before any write, then registers each new agreement and last the assembly, each with its stake", async () => {
        const { result } = renderHook(() => usePublishAssembly());
        let outcome: Awaited<ReturnType<typeof result.current.publish>> | undefined;
        await act(async () => { outcome = await result.current.publish(snapshot()); });
        // Pins: the assembly first, then each new agreement's document.
        const [assemblyDoc, ...agreementDocs] = s.pins as [ProcessDesign, ...RegisteredAgreement[]];
        const processDesignHash = processDesignHashOf(assemblyDoc);
        const keys = agreementDocs.map((d) => agreementHashOf(d));
        expect(keys).toHaveLength(2);
        expect(assemblyDoc.agreements.map((a) => a.agreementHash)).toEqual(keys);
        expect(s.write.mock.calls.map(([c]) => shape(c))).toEqual([
            { address: AGREEMENT_REGISTRY, functionName: "registerAgreement", args: [keys[0], "ipfs://pin-2"], value: AGREEMENT_STAKE },
            { address: AGREEMENT_REGISTRY, functionName: "registerAgreement", args: [keys[1], "ipfs://pin-3"], value: AGREEMENT_STAKE },
            { address: PROCESS_REGISTRY, functionName: "registerProcess", args: [processDesignHash, "ipfs://pin-1"], value: ASSEMBLY_STAKE },
        ]);
        for (const [c] of s.write.mock.calls) expect(c.chainId).toBe(activeChain.id);
        expect(s.calls).toEqual([
            "pin:1", "simulate:registerProcess",
            "pin:2", "simulate:registerAgreement",
            "pin:3", "simulate:registerAgreement",
            "simulate:registerAgreement", "write:registerAgreement", "receipt",
            "simulate:registerAgreement", "write:registerAgreement", "receipt",
            "simulate:registerProcess", "write:registerProcess", "receipt",
        ]);
        expect(outcome).toMatchObject({
            hash: TX, ipfsURI: "ipfs://pin-1",
            agreements: [{ agreementHash: keys[0], hash: TX, ipfsURI: "ipfs://pin-2" }, { agreementHash: keys[1], hash: TX, ipfsURI: "ipfs://pin-3" }],
        });
    });

    it("skips an agreement the registry already binds — nothing pinned or sent for it", async () => {
        // Learn the two keys from a first publish, then bind the first.
        const snap = snapshot();
        const first = renderHook(() => usePublishAssembly());
        await act(async () => { await first.result.current.publish(snap); });
        const boundKey = agreementHashOf(s.pins[1] as RegisteredAgreement);
        const otherKey = agreementHashOf(s.pins[2] as RegisteredAgreement);
        s.calls = [];
        s.pins = [];
        s.write.mockClear();
        s.bound.add(boundKey.toLowerCase());
        const { result } = renderHook(() => usePublishAssembly());
        await act(async () => { await result.current.publish(snap); });
        expect(s.write.mock.calls.map(([c]) => [c.functionName, c.args[0]])).toEqual([
            ["registerAgreement", otherKey],
            ["registerProcess", processDesignHashOf(s.pins[0] as ProcessDesign)],
        ]);
    });

    it("a registration that would revert sends nothing at all — no agreement registered, no stake placed", async () => {
        s.client.simulateContract.mockImplementationOnce(async () => {
            throw revertOf(PROCESS_REGISTRY_ABI, "ProcessAlreadyRegistered", [`0x${"00".repeat(32)}`], "registerProcess");
        });
        const { result } = renderHook(() => usePublishAssembly());
        const e = await caught(() => result.current.publish(snapshot()));
        expect(e).toBeInstanceOf(Error);
        expect(s.write).not.toHaveBeenCalled();
    });

    it("refuses a build that is not the composition reviewed, before anything is pinned", async () => {
        const { result } = renderHook(() => usePublishAssembly());
        const reviewed = `0x${"9e".repeat(32)}` as Hex;
        const e = await caught(() => result.current.publish(snapshot(), reviewed));
        expect((e as Error).message).toMatch(/builds a different composition than the one reviewed/);
        expect(s.pins).toEqual([]);
        expect(s.write).not.toHaveBeenCalled();
    });

    it("refuses an assembly past the resolve cap, naming the cap as the SDK's own estimate and not a chain limit, before anything is pinned", async () => {
        s.cap = 1;
        const { result } = renderHook(() => usePublishAssembly());
        const e = await caught(() => result.current.publish(snapshot()));
        expect((e as Error).message).toBe(
            "Assembly has 2 orders; 1 is the most the SDK plans to fit in one atomic resolveProcess on this chain "
            + "(its own estimate from the block's gas limit, not a limit the chain enforces). Compose multiple processes instead.",
        );
        expect((e as Error).message).not.toMatch(/this chain resolves at most/);
        expect(s.calls).toEqual([]);
    });
});

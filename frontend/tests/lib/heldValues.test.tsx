/**
 * heldValues — at checkout an enum field whose spec declares
 * `block.checkout.heldValues` offers only the values the chain in use holds,
 * read through the reader the hint names. The spec is the Kleros clause from
 * `clauses/`; the chain is a mocked `readContract` holding Ethereum Sepolia's
 * court list as `test/fixtures/kleros-courts.json` holds it, where only the
 * General Court of the clause's four exists. A second clause, the same spec
 * under another id, shows the filter reads no clause id.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BaseError, ContractFunctionRevertedError, type Abi } from "viem";
import type { FieldSpec } from "@figaro-protocol/sdk/clauses";
import type { Hex } from "@figaro-protocol/sdk";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import type { HeldValuesHint } from "@/lib/shared/clauseBlockBinding";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

const chain = vi.hoisted(() => ({ id: 11155111, readContract: undefined as unknown }));
vi.mock("wagmi", () => ({
    useChainId: () => chain.id,
    usePublicClient: () => ({ readContract: chain.readContract }),
}));

import { offeredValues, readHeldValues, useHeldValues } from "@/lib/composition/heldValues";
import { FieldControl } from "@/components/runtime/FieldControl";

interface Court { id: number; parent: number; name: string; policy: string }
const fixture = JSON.parse(readFileSync(path.resolve(process.cwd(), "../test/fixtures/kleros-courts.json"), "utf8")) as {
    chains: { chainId: number; arbitrator: string; policyRegistry: string; courts: Court[] }[];
};
const SEPOLIA = fixture.chains.find((c) => c.chainId === 11155111)!;

/** A revert as viem throws it, so the reader reads the end of the court list. */
function revert(): Error {
    return new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: [] as Abi, functionName: "courts" }) });
}

/** A chain whose arbitrator and PolicyRegistry hold `courts`, each policy
 *  link the fixture's, and each policy document naming its court. */
function chainHolding(courts: readonly Court[]) {
    const readContract = vi.fn(async ({ functionName, args }: { address: string; functionName: string; args: readonly unknown[] }) => {
        const id = Number(args[0]);
        const court = courts.find((c) => c.id === id);
        if (functionName === "courts") {
            if (!court) throw revert();
            return [BigInt(court.parent), false, 0n, 0n, 0n, 0n];
        }
        if (functionName === "policies") return court ? court.policy : "";
        throw new Error(`unexpected call ${functionName}`);
    });
    const fetchJson = async (uri: string) => ({ name: courts.find((c) => c.policy === uri)?.name });
    return { readContract, fetchJson };
}

let kleros: Hex;
let lookalike: Hex;
let hint: HeldValuesHint;
let courtField: FieldSpec & { type: "enum" };

beforeAll(async () => {
    await primeClauseSpecs(["figaro-arbitration-kleros"]);
    kleros = keyOf("figaro-arbitration-kleros");
    const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-arbitration-kleros.json"), "utf8")) as Record<string, unknown>;
    const { clauseKey, bytes } = pinSpec({ ...raw, clauseId: "figaro-arbitration-lookalike", title: "Another court clause" });
    lookalike = clauseKey;
    setClauseSpecFetcher(async (uri) => (uri === "mem://lookalike" ? bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(lookalike, "mem://lookalike");
    const spec = getClauseSpec(kleros)!;
    hint = spec.block!.checkout.heldValues.klerosCourt!;
    courtField = spec.fields.find((f) => f.name === "klerosCourt") as FieldSpec & { type: "enum" };
});

describe("readHeldValues — kleros-liquid-policy-courts", () => {
    it("on a chain holding only the General Court of the four, holds general only", async () => {
        const io = chainHolding(SEPOLIA.courts);
        expect(await readHeldValues(hint, 11155111, io)).toEqual(["general"]);
        // The reader reads the contracts the hint gives for the chain.
        const called = new Set(io.readContract.mock.calls.map(([a]) => a.address.toLowerCase()));
        expect(called).toEqual(new Set([SEPOLIA.arbitrator.toLowerCase(), SEPOLIA.policyRegistry.toLowerCase()]));
    });

    it("on a chain holding every court the clause names, holds all four", async () => {
        const mainnet = fixture.chains.find((c) => c.chainId === 1)!;
        const held = await readHeldValues(hint, 1, chainHolding(mainnet.courts));
        expect(held === "all" ? held : [...held].sort()).toEqual([...courtField.values].sort());
    });

    it("a court whose policy cannot be read has no name, so no value finds it", async () => {
        const io = chainHolding(SEPOLIA.courts);
        const held = await readHeldValues(hint, 11155111, { readContract: io.readContract, fetchJson: async () => null });
        expect(held).toEqual([]);
    });

    it("a failed court read, or a reader this frontend does not know, holds no value", async () => {
        const failing = { readContract: async () => { throw new Error("rpc down"); }, fetchJson: async () => null };
        expect(await readHeldValues(hint, 11155111, failing)).toEqual([]);
        expect(await readHeldValues({ ...hint, reader: "no-such-standard" }, 11155111, chainHolding(SEPOLIA.courts))).toEqual([]);
    });

    it("a chain the hint gives no contracts for is not filtered", async () => {
        expect(await readHeldValues(hint, 31337, chainHolding([]))).toBe("all");
        expect(offeredValues(courtField.values, "all")).toEqual(courtField.values);
        expect(offeredValues(courtField.values, undefined)).toEqual([]);
    });
});

describe("useHeldValues — what checkout offers", () => {
    it("with a court absent from the chain, checkout offers no such value, for any clause naming the standard", async () => {
        const io = chainHolding(SEPOLIA.courts);
        // The hook reads through the wagmi client; the policy documents are
        // the fixture's, served through the same mocked fetch.
        chain.readContract = io.readContract;
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const name = SEPOLIA.courts.find((c) => String(input).endsWith(c.policy))?.name;
            return new Response(JSON.stringify({ name }), { status: 200 });
        });
        try {
            const { result } = renderHook(() => useHeldValues([kleros, lookalike], true));
            // In flight: no value is offered.
            expect(result.current.offered(kleros, "klerosCourt", courtField.values)).toEqual([]);
            await waitFor(() => expect(result.current.offered(kleros, "klerosCourt", courtField.values)).toEqual(["general"]));
            expect(result.current.offered(lookalike, "klerosCourt", courtField.values)).toEqual(["general"]);
            // A field with no hint offers every value.
            expect(result.current.offered(kleros, "klerosMinJurors", ["a", "b"])).toEqual(["a", "b"]);

            const offered = { ...courtField, values: result.current.offered(kleros, "klerosCourt", courtField.values) };
            render(<FieldControl field={offered} value={undefined} onChange={() => {}} testId="court" />);
            expect(screen.getByTestId("court-general")).toBeTruthy();
            for (const absent of ["blockchain-nontechnical", "blockchain-technical", "english-language"]) {
                expect(screen.queryByTestId(`court-${absent}`)).toBeNull();
            }
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

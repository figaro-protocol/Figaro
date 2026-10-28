/**
 * The SDK's hand-written ABIs (`src/abis.ts`) against the ABIs the contracts
 * compile to (`abi/*.json`, emitted from the forge artifacts by
 * `scripts/emit-abi-bundle.sh`). Every function, event and error the SDK
 * declares must exist in the contract with the same name, the same input
 * types — events with the same `indexed` flags, since the topics decode by
 * them — and, for functions, the same output types. A drifted fragment
 * encodes calls the contract refuses or decodes logs into nothing, and is
 * otherwise seen only on a live chain.
 *
 * And the reverse, for errors: every error a contract compiles is in the SDK's
 * ABI, so a refused call decodes by name instead of raw bytes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Abi, AbiParameter } from "viem";
import {
    CORE_ABI, ATTESTATION_COORDINATOR_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI, AGREEMENT_REGISTRY_ABI, FLORIN_TOKEN_ABI, USAGE_COUNTER_ABI, RPGF_MINTER_ABI, BATCH_VERIFIER_ABI,
} from "../src/abis.js";

const ROOT = path.resolve(__dirname, "..", "..");

function compiled(name: string): Abi {
    const raw = JSON.parse(readFileSync(path.join(ROOT, "abi", `${name}.json`), "utf8"));
    return (Array.isArray(raw) ? raw : raw.abi) as Abi;
}

/** A parameter's canonical type: tuples expanded, arrays kept. */
function typeOf(p: AbiParameter): string {
    const components = (p as { components?: readonly AbiParameter[] }).components;
    if (p.type.startsWith("tuple") && components) {
        return `(${components.map(typeOf).join(",")})${p.type.slice("tuple".length)}`;
    }
    return p.type;
}

/** What must agree between the two ABIs for an item to encode and decode alike. */
function shape(item: Abi[number]): string | null {
    if (item.type === "function") {
        return `function ${item.name}(${item.inputs.map(typeOf).join(",")}) returns (${item.outputs.map(typeOf).join(",")})`;
    }
    if (item.type === "event") {
        return `event ${item.name}(${item.inputs.map((p) => `${typeOf(p)}${(p as { indexed?: boolean }).indexed ? " indexed" : ""}`).join(",")})`;
    }
    if (item.type === "error") {
        return `error ${item.name}(${item.inputs.map(typeOf).join(",")})`;
    }
    return null;
}

/** The denomination token's ERC-6093 errors, as OpenZeppelin's ERC-20 compiles
 *  them — read from the repo's own OpenZeppelin ERC-20, FlorinToken. FigaroCore
 *  pulls bonds with safeTransferFrom, so these revert inside the token and
 *  bubble up through a Core call; the SDK carries them so they decode by name. */
const tokenErrors = (): Abi =>
    compiled("FlorinToken").filter((i) => i.type === "error" && i.name.startsWith("ERC20"));

/** The compiled errors an SDK ABI lacks, as `error Name(types)`. */
function missingErrors(sdkAbi: Abi, compiledAbi: Abi): string[] {
    const ours = new Set(sdkAbi.map(shape));
    return compiledAbi
        .filter((i) => i.type === "error")
        .map(shape)
        .filter((s): s is string => s !== null && !ours.has(s));
}

const PAIRS: [string, Abi, string, (() => Abi)?][] = [
    ["CORE_ABI", CORE_ABI, "FigaroCore", tokenErrors],
    ["ATTESTATION_COORDINATOR_ABI", ATTESTATION_COORDINATOR_ABI, "AttestationCoordinator"],
    ["CLAUSE_REGISTRY_ABI", CLAUSE_REGISTRY_ABI, "ClauseRegistry"],
    ["MEMBERS_REGISTRY_ABI", MEMBERS_REGISTRY_ABI, "MembersRegistry"],
    ["ASSEMBLY_REGISTRY_ABI", ASSEMBLY_REGISTRY_ABI, "AssemblyRegistry"],
    ["AGREEMENT_REGISTRY_ABI", AGREEMENT_REGISTRY_ABI, "AgreementRegistry"],
    ["FLORIN_TOKEN_ABI", FLORIN_TOKEN_ABI, "FlorinToken"],
    ["USAGE_COUNTER_ABI", USAGE_COUNTER_ABI, "UsageCounter"],
    ["RPGF_MINTER_ABI", RPGF_MINTER_ABI, "RpgfMinter"],
    ["BATCH_VERIFIER_ABI", BATCH_VERIFIER_ABI, "FigaroBatchVerifier"],
];

describe("the SDK's ABIs are the contracts' ABIs", () => {
    for (const [sdkName, sdkAbi, contract, alsoReverts] of PAIRS) {
        it(`${sdkName} declares nothing ${contract} does not have, as it has it`, () => {
            const reference = [...compiled(contract), ...(alsoReverts?.() ?? [])];
            const theirs = new Set(reference.map(shape).filter((s): s is string => s !== null));
            const drifted = sdkAbi.map(shape).filter((s): s is string => s !== null && !theirs.has(s));
            expect(drifted, `${sdkName} fragments not in abi/${contract}.json`).toEqual([]);
        });
        it(`${sdkName} carries every error ${contract} compiles`, () => {
            expect(missingErrors(sdkAbi, compiled(contract)), `abi/${contract}.json errors not in ${sdkName}`).toEqual([]);
        });
    }

    it("a drifted fragment is caught", () => {
        // The check reads what it claims to: an indexed flag moved is a miss.
        const committed = CORE_ABI.find((i) => i.type === "event" && i.name === "OrderCommitted")!;
        const moved = {
            ...committed,
            inputs: (committed as { inputs: AbiParameter[] }).inputs.map((p, i) => (i === 3 ? { ...p, indexed: true } : p)),
        } as Abi[number];
        const theirs = new Set(compiled("FigaroCore").map(shape));
        expect(theirs.has(shape(committed))).toBe(true);
        expect(theirs.has(shape(moved))).toBe(false);
    });

    it("an error the SDK drops is caught", () => {
        // The reverse check reads what it claims to: one error removed is a miss.
        const dropped = BATCH_VERIFIER_ABI.filter((i) => !(i.type === "error" && i.name === "ZeroVerifier")) as Abi;
        expect(missingErrors(dropped, compiled("FigaroBatchVerifier"))).toEqual(["error ZeroVerifier()"]);
    });
});

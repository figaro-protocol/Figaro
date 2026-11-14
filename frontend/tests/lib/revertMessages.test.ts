/**
 * The text shown for a contract's refusal (`FIGARO_ERROR_MESSAGES` in
 * `lib/shared/errors.ts`) matches the errors the contracts can raise:
 * every custom error in the ABIs the app decodes with has a text, and no
 * text names an error that no ABI holds. The ABIs are the SDK's lists (the
 * ones every write and simulation passes to viem) and the compiled
 * `abi/*.json` files, so a contract that gains or loses an error fails here
 * until the map follows.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    AGREEMENT_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, ATTESTATION_COORDINATOR_ABI, BATCH_VERIFIER_ABI,
    CLAUSE_REGISTRY_ABI, CORE_ABI, FLORIN_TOKEN_ABI, MEMBERS_REGISTRY_ABI, RPGF_MINTER_ABI,
    USAGE_COUNTER_ABI, WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
} from "@figaro-protocol/sdk";
import { FIGARO_ERROR_MESSAGES, contractRevertMessage } from "@/lib/shared/errors";

type AbiItem = { type: string; name?: string };
const sdkAbis: readonly (readonly AbiItem[])[] = [
    AGREEMENT_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, ATTESTATION_COORDINATOR_ABI, BATCH_VERIFIER_ABI,
    CLAUSE_REGISTRY_ABI, CORE_ABI, FLORIN_TOKEN_ABI, MEMBERS_REGISTRY_ABI, RPGF_MINTER_ABI,
    USAGE_COUNTER_ABI, WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
];
const errorsOf = (abi: readonly AbiItem[]) => abi.filter((x) => x.type === "error").map((x) => x.name!);

const sdkErrors = new Set(sdkAbis.flatMap(errorsOf));
const abiDir = path.resolve(__dirname, "../../../abi");
const compiledErrors = new Set(
    readdirSync(abiDir).filter((f) => f.endsWith(".json")).flatMap((f) => {
        const j = JSON.parse(readFileSync(path.join(abiDir, f), "utf8"));
        return errorsOf(Array.isArray(j) ? j : j.abi);
    }),
);
const mapped = Object.keys(FIGARO_ERROR_MESSAGES);

describe("the refusal texts match the contracts' errors", () => {
    it("every custom error in the SDK's ABIs has a text", () => {
        expect([...sdkErrors].filter((e) => !(e in FIGARO_ERROR_MESSAGES)).sort()).toEqual([]);
    });

    it("every custom error in the compiled abi/*.json files has a text", () => {
        expect([...compiledErrors].filter((e) => !(e in FIGARO_ERROR_MESSAGES)).sort()).toEqual([]);
    });

    it("no text names an error that no ABI holds", () => {
        const held = new Set([...sdkErrors, ...compiledErrors]);
        expect(mapped.filter((e) => !held.has(e)).sort()).toEqual([]);
    });

    it("every text is a plain sentence without a placeholder", () => {
        for (const [name, text] of Object.entries(FIGARO_ERROR_MESSAGES)) {
            expect(text.length, name).toBeGreaterThan(10);
            expect(text, name).toMatch(/[.]$/);
        }
    });

    it("NotProcessBuyer fits both places FigaroCore raises it: adding an order and resolving", () => {
        const text = FIGARO_ERROR_MESSAGES.NotProcessBuyer;
        expect(text).toMatch(/add an order/);
        expect(text).toMatch(/resolve/);
        expect(contractRevertMessage("NotProcessBuyer")).toBe(text);
    });

    it("an error name the map lacks falls back to the name itself", () => {
        expect(contractRevertMessage("SomethingNew")).toBe("SomethingNew");
    });
});

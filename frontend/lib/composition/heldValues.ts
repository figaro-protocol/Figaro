"use client";

/**
 * heldValues — which values of an enum content field the chain in use holds,
 * read at checkout from the contracts a clause spec's
 * `block.checkout.heldValues` hint names (placement 1 of
 * `docs/OPEN_WORLD.md` § "Where a composed contract may stand": a contract
 * supplies the terms a party may choose before anyone signs).
 *
 * One open registry of readers, keyed by the STANDARD the hint names, never by
 * a clause: a stranger's clause that names a registered standard, with its own
 * contracts and values, is filtered the same way. The registry's extension
 * point is `registerHeldValuesReader`, as `registerCheckoutDerivation` is the
 * derivation registry's.
 *
 * What a checkout offers, per hinted field:
 *   - the chain in use is not among the hint's chains: the hint says nothing
 *     about it, and every value is offered;
 *   - a reader standard this frontend does not know, a read that fails, or a
 *     read that resolves empty: no value;
 *   - otherwise: the values the reader found, in the spec's order.
 * A read in flight offers no value either.
 *
 * The one registered standard, `kleros-liquid-policy-courts`: the court list
 * of a KlerosLiquid arbitrator (`courts(uint256)`, read from 0 up to the first
 * revert) and each court's name in its PolicyRegistry (`policies(uint256)`, a
 * link to a JSON document whose `name` names the court). A value lists the
 * names of its court from the root down; the General Court, the root (court
 * 0), is named alone, and any other court by the names of the courts above it
 * below the root, then its own. A value is held when exactly one court of the
 * chain carries that list. A court whose policy cannot be read has no name, so
 * no value finds it.
 */

import { useEffect, useState } from "react";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { useChainId, usePublicClient } from "wagmi";
import { getClauseSpec, type ClauseSpecWithBlock } from "@/lib/shared/clauseSpecSource";
import { fetchCappedContent, resolveContentUri } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

/** One `block.checkout.heldValues` entry, as the spec loader parses it
 *  (`HeldValuesHint`, `frontend/lib/shared/clauseBlockBinding.ts`). */
type HeldValuesHint = NonNullable<ClauseSpecWithBlock["block"]>["checkout"]["heldValues"][string];

/** The one chain call a reader makes: viem's `readContract` shape. */
export type HeldValuesContractRead = (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
}) => Promise<unknown>;

/** What a reader is handed: the chain read, a document fetch (null when the
 *  document cannot be read) and the hint's contracts for the chain in use. */
export interface HeldValuesReadContext {
    readContract: HeldValuesContractRead;
    fetchJson: (uri: string) => Promise<unknown>;
    contracts: Readonly<Record<string, `0x${string}`>>;
    values: Readonly<Record<string, readonly string[]>>;
}

/** A reader: the values (keys of `values`) the chain holds. Throws when the
 *  read fails. */
export type HeldValuesReader = (ctx: HeldValuesReadContext) => Promise<readonly string[]>;

/** Whether `err` is the contract reverting, as opposed to the read failing. */
function isRevert(err: unknown): boolean {
    return err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError) !== null;
}

const KLEROS_LIQUID_COURTS_ABI = [{
    type: "function",
    name: "courts",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
        { name: "parent", type: "uint96" },
        { name: "hiddenVotes", type: "bool" },
        { name: "minStake", type: "uint256" },
        { name: "alpha", type: "uint256" },
        { name: "feeForJuror", type: "uint256" },
        { name: "jurorsForCourtJump", type: "uint256" },
    ],
}] as const;

const POLICY_REGISTRY_ABI = [{
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
}] as const;

/** The most courts read from one arbitrator. */
const MAX_COURTS = 256;

async function readKlerosLiquidPolicyCourts(ctx: HeldValuesReadContext): Promise<readonly string[]> {
    const arbitrator = ctx.contracts.arbitrator;
    const policyRegistry = ctx.contracts.policyRegistry;
    if (!arbitrator || !policyRegistry) throw new Error("the hint names no arbitrator or no policy registry");

    const parents: number[] = [];
    for (let id = 0; id < MAX_COURTS; id++) {
        let court: unknown;
        try {
            court = await ctx.readContract({ address: arbitrator, abi: KLEROS_LIQUID_COURTS_ABI, functionName: "courts", args: [BigInt(id)] });
        } catch (err) {
            if (isRevert(err)) break;
            throw err;
        }
        const parent = Array.isArray(court) ? court[0] : undefined;
        if (typeof parent !== "bigint" && typeof parent !== "number") throw new Error("a court read returned no parent");
        parents.push(Number(parent));
    }

    const names = await Promise.all(parents.map(async (_parent, id): Promise<string | undefined> => {
        try {
            const uri = await ctx.readContract({ address: policyRegistry, abi: POLICY_REGISTRY_ABI, functionName: "policies", args: [BigInt(id)] });
            if (typeof uri !== "string" || uri === "") return undefined;
            const doc = await ctx.fetchJson(uri);
            const name = doc !== null && typeof doc === "object" ? (doc as { name?: unknown }).name : undefined;
            return typeof name === "string" && name !== "" ? name : undefined;
        } catch {
            return undefined;
        }
    }));

    /** A court's names from the root down; null when one is unreadable or
     *  the parents do not lead to the root. */
    const pathOf = (id: number): string[] | null => {
        if (id === 0) return names[0] === undefined ? null : [names[0]];
        const path: string[] = [];
        for (let c = id, steps = 0; c !== 0; c = parents[c]!, steps++) {
            const name = names[c];
            if (name === undefined || steps >= parents.length || c >= parents.length) return null;
            path.unshift(name);
        }
        return path;
    };
    const paths = parents.map((_p, id) => pathOf(id)).map((p) => (p === null ? null : JSON.stringify(p)));

    return Object.entries(ctx.values)
        .filter(([, wanted]) => paths.filter((p) => p === JSON.stringify(wanted)).length === 1)
        .map(([value]) => value);
}

const READERS = new Map<string, HeldValuesReader>([
    ["kleros-liquid-policy-courts", readKlerosLiquidPolicyCourts],
]);

/** Register a reader under the standard name a spec's
 *  `block.checkout.heldValues` entry gives it. Last write wins: a standard a
 *  stranger's clause names lands here without touching checkout code.
 *  @public */
export function registerHeldValuesReader(standard: string, reader: HeldValuesReader): void {
    READERS.set(standard, reader);
}

/** "all" when the hint names no contracts for this chain; otherwise the
 *  values held, empty when the reader is unknown or the read fails. */
export type HeldValues = "all" | readonly string[];

/** The fetch of a policy-style document: its JSON, or null. */
async function fetchJsonDocument(uri: string): Promise<unknown> {
    const url = resolveContentUri(uri);
    if (!url) return null;
    return safeJsonFromResponse(await fetchCappedContent(url));
}

/** The values one hint holds on `chainId`. Never throws. */
export async function readHeldValues(
    hint: HeldValuesHint,
    chainId: number,
    io: { readContract: HeldValuesContractRead; fetchJson?: (uri: string) => Promise<unknown> },
): Promise<HeldValues> {
    const contracts = hint.contracts[String(chainId)];
    if (!contracts) return "all";
    const reader = READERS.get(hint.reader);
    if (!reader) return [];
    try {
        const held = await reader({ readContract: io.readContract, fetchJson: io.fetchJson ?? fetchJsonDocument, contracts, values: hint.values });
        return Object.keys(hint.values).filter((v) => held.includes(v));
    } catch {
        return [];
    }
}

/** The values a checkout offers for one field, from what was read. */
export function offeredValues(values: readonly string[], held: HeldValues | undefined): readonly string[] {
    if (held === "all") return values;
    if (held === undefined) return [];
    return values.filter((v) => held.includes(v));
}

const KEY_SEPARATOR = "\u0000";
const keyOf = (clauseKey: string, field: string) => `${clauseKey}${KEY_SEPARATOR}${field}`;

/** Every hinted field of `clauseKeys` whose hint names contracts on `chainId`. */
function hintedFields(clauseKeys: readonly string[], chainId: number): { key: string; hint: HeldValuesHint }[] {
    return [...new Set(clauseKeys)].sort().flatMap((clauseKey) =>
        Object.entries(getClauseSpec(clauseKey)?.block?.checkout.heldValues ?? {})
            .filter(([, hint]) => hint.contracts[String(chainId)] !== undefined)
            .map(([field, hint]) => ({ key: keyOf(clauseKey, field), hint })));
}

/**
 * The held values of every hinted field of `clauseKeys` on the chain in use.
 * `offered(clauseKey, field, values)` returns what a checkout offers: the
 * values themselves for a field with no hint or no contracts on this chain,
 * the filter's result once the read is in, and none while it is in flight.
 * `specsLoaded` holds the read until the specs that carry the hints are in.
 */
export function useHeldValues(clauseKeys: readonly string[], specsLoaded: boolean): {
    offered: (clauseKey: string, field: string, values: readonly string[]) => readonly string[];
} {
    const chainId = useChainId();
    const publicClient = usePublicClient();
    // The clause keys as one string, so the read reruns only when the set changes.
    const keysText = specsLoaded ? [...new Set(clauseKeys)].sort().join(KEY_SEPARATOR) : "";
    const keysOf = (text: string) => (text === "" ? [] : text.split(KEY_SEPARATOR));
    const requestKey = `${chainId}|${hintedFields(keysOf(keysText), chainId).map((h) => h.key).join(",")}`;
    const [read, setRead] = useState<{ key: string; held: ReadonlyMap<string, HeldValues> } | null>(null);

    useEffect(() => {
        const hinted = hintedFields(keysText === "" ? [] : keysText.split(KEY_SEPARATOR), chainId);
        if (hinted.length === 0) return;
        let canceled = false;
        const readContract: HeldValuesContractRead = (args) => {
            if (!publicClient) return Promise.reject(new Error("no chain client"));
            return publicClient.readContract(args as Parameters<typeof publicClient.readContract>[0]);
        };
        const key = requestKey;
        void Promise.all(hinted.map(async (h) => [h.key, await readHeldValues(h.hint, chainId, { readContract })] as const))
            .then((entries) => { if (!canceled) setRead({ key, held: new Map(entries) }); });
        return () => { canceled = true; };
    }, [requestKey, keysText, chainId, publicClient]);

    const held = read?.key === requestKey ? read.held : null;
    return {
        offered: (clauseKey, field, values) => {
            const hint = getClauseSpec(clauseKey)?.block?.checkout.heldValues[field];
            if (!hint || hint.contracts[String(chainId)] === undefined) return values;
            return offeredValues(values, held?.get(keyOf(clauseKey, field)));
        },
    };
}

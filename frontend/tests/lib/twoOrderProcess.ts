/**
 * A two-order process for the readers that name a process's root. The root
 * is the order whose `cumulativeValue` equals its `payment`, as the
 * `OrderCommitted` event carries it on both paths; the sub-order's cumulative
 * value is the root's payment plus its own. The sub-order's hash sorts
 * before the root's, so a reader that takes "the first order with no edges"
 * names the sub-order. Each agreement carries a modality clause whose spec is
 * served from memory, so a reader that shows the root's modality shows the
 * root's value.
 */
import type { Agreement } from "@figaro-protocol/sdk";
import { pinSpec } from "./primeClauseSpecs";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { OrderState, type Order } from "@/lib/core/store";
import type { ProcessSummary } from "@/lib/core/walletProcessQueries";

export const BUYER = "0x1111111111111111111111111111111111111111";
export const ROOT_SELLER = "0x2222222222222222222222222222222222222222";
export const SUB_SELLER = "0x5555555555555555555555555555555555555555";
export const PROCESS = `0x${"ab".repeat(32)}`;
/** Sorts after the sub-order's hash. */
export const ROOT_HASH = `0x${"02".repeat(32)}`;
export const SUB_HASH = `0x${"01".repeat(32)}`;
const ROOT_CHECKOUT = `0x${"e2".repeat(32)}`;
const SUB_CHECKOUT = `0x${"e1".repeat(32)}`;

const MODALITY_SPEC = {
    clauseId: "test-modality",
    version: 1,
    title: "Modality",
    description: "One single-select modality value.",
    fields: [{ name: "modality", type: "string", required: true }],
    stages: {},
};
const pinned = pinSpec(MODALITY_SPEC);

/** Serve the modality spec to the spec cache, as the registry read does. */
export async function loadModalitySpec(): Promise<void> {
    setClauseSpecFetcher(async () => pinned.bytes);
    await loadClauseSpec(pinned.clauseKey, "mem://test-modality");
}

const base = {
    processId: PROCESS,
    buyer: BUYER,
    currency: `0x${"33".repeat(20)}`,
    state: OrderState.Active,
    salt: 1n,
    deadline: 0n,
};

export const rootOrder: Order = {
    ...base,
    orderHash: ROOT_HASH,
    seller: ROOT_SELLER,
    payment: 3n,
    cumulativeValue: 3n,
    sellerBond: 6n,
    buyerBond: 6n,
    checkoutHash: ROOT_CHECKOUT,
};

export const subOrder: Order = {
    ...base,
    orderHash: SUB_HASH,
    seller: SUB_SELLER,
    payment: 2n,
    cumulativeValue: 5n,
    sellerBond: 10n,
    buyerBond: 4n,
    checkoutHash: SUB_CHECKOUT,
};

const agreementOf = (seller: `0x${string}`, modality: string, follows?: Agreement["follows"]): Agreement => ({
    version: "a1",
    buyer: BUYER,
    seller,
    clauses: [{ clause: pinned.clauseKey, data: { modality } }],
    ...(follows === undefined ? {} : { follows }),
});

export const ROOT_MODALITY = "root-modality";
export const SUB_MODALITY = "sub-order-modality";

/** How the sub-order's agreement reaches the reader. */
export type SubOrderAgreement =
    /** Read, and carrying no topology leaf. */
    | "no-leaf"
    /** Not in the map: a failed read and a read in flight leave no entry. */
    | "not-loaded"
    /** Read, and its leaf is the empty list. */
    | "empty-leaf";

export const SUB_ORDER_CASES: SubOrderAgreement[] = ["no-leaf", "not-loaded", "empty-leaf"];

/** The agreements map a reader is handed, keyed by checkout hash. */
export function agreementsFor(sub: SubOrderAgreement): Map<string, Agreement> {
    const map = new Map<string, Agreement>([[ROOT_CHECKOUT, agreementOf(ROOT_SELLER, ROOT_MODALITY, [])]]);
    if (sub === "no-leaf") map.set(SUB_CHECKOUT, agreementOf(SUB_SELLER, SUB_MODALITY));
    if (sub === "empty-leaf") map.set(SUB_CHECKOUT, agreementOf(SUB_SELLER, SUB_MODALITY, []));
    return map;
}

export const summary: ProcessSummary = {
    processId: PROCESS,
    orderCount: 2,
    hasActive: true,
    createdAt: 0,
    orders: [],
};

/**
 * The assembly parity vectors' inputs — shared by `assemblyParity.test.ts`
 * (which freezes them into `test/fixtures/assembly-vectors.json`) and
 * `merkleParity.test.ts` (whose design-carrying agreement names the third
 * assembly's root and its first agreement's agreement in its provenance).
 *
 * Three registered agreements drawn from the three merkle-vector agreements
 * (their clause keys and values; the topology clause composed with `{}`),
 * and three assemblies over them: one agreement, two agreements, and three
 * agreements with a parent edge and non-empty assembly-scoped terms.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import type { Assembly, ComposedAgreement } from "../src/assembly.js";
import { agreementKeyOf } from "../src/assembly.js";
import { computeClauseKey } from "../src/discovery.js";

const CLAUSES_DIR = path.resolve(__dirname, "../../clauses");
/** The real key of a reference clause: the hash of its spec's canonical bytes. */
export const K = (name: string): Hex =>
    computeClauseKey(JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${name}.json`), "utf8")));

export const COMPOSED_THREE: ComposedAgreement = {
    clauses: {
        [K("figaro-modalities")]: { modality: "delivery" },
        [K("figaro-geolocation")]: { hops: 2, origin: "site-7" },
        [K("figaro-applicable-law")]: { law: "ch" },
    },
};
export const COMPOSED_ONE: ComposedAgreement = {
    clauses: { [K("figaro-modalities")]: { modality: "pickup" } },
};
export const COMPOSED_DESIGN: ComposedAgreement = {
    clauses: {
        [K("figaro-commerce")]: { currency: "0x0000000000000000000000000000000000000000", payment: "7" },
        [K("figaro-topology")]: {},
    },
};

export const ASSEMBLY_ONE: Assembly = {
    agreements: [{ id: "order-0", agreementKey: agreementKeyOf(COMPOSED_ONE), clauses: {} }],
};
export const ASSEMBLY_TWO: Assembly = {
    agreements: [
        { id: "order-0", agreementKey: agreementKeyOf(COMPOSED_THREE), clauses: {} },
        { id: "order-1", agreementKey: agreementKeyOf(COMPOSED_ONE), clauses: {} },
    ],
};
export const ASSEMBLY_THREE: Assembly = {
    assemblyClauses: {
        [K("figaro-applicable-law")]: { applicableLaw: "ch", forum: "Zurich", language: "en" },
    },
    agreements: [
        { id: "order-0", agreementKey: agreementKeyOf(COMPOSED_DESIGN), clauses: { [K("figaro-topology")]: { parentOrderHashes: [] } } },
        { id: "order-1", agreementKey: agreementKeyOf(COMPOSED_DESIGN), clauses: { [K("figaro-topology")]: { parentOrderHashes: ["order-0"] } } },
        { id: "order-2", agreementKey: agreementKeyOf(COMPOSED_THREE), clauses: {} },
    ],
};

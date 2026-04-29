/**
 * Kleros subcourt catalog and arbitratorExtraData encoder.
 *
 * Kleros disputes are routed to a subcourt; each subcourt has its own
 * juror pool, juror-selection rules, and policy URL. The
 * `arbitratorExtraData` bytes passed to `createDispute` encode the
 * subcourt ID and the minimum juror count. Standard Kleros Liquid /
 * KlerosCore encoding is `abi.encode(uint96 subcourtID, uint96 minJurors)`,
 * which produces 64 bytes (two right-padded uint96 words).
 *
 * The IDs below are for **Kleros Liquid on Ethereum mainnet** at the time
 * of authoring. Kleros V2 (KlerosCore), Gnosis chain, and any other
 * deployment use different IDs. **Verify against the actual Kleros
 * deployment you're targeting before mainnet.** The Kleros governance
 * page at https://klerosboard.com/ shows the current canonical court tree.
 *
 * For Figaro consent disputes, the most relevant courts are:
 *   - General Court — catch-all
 *   - Blockchain Non-Technical — disputes hinging on protocol semantics
 *   - Blockchain Technical — disputes requiring technical evaluation
 *   - English Language — disputes hinging on language interpretation
 *
 * This catalog is small by design. Add subcourts here as they become
 * relevant; do not turn this into an exhaustive Kleros-wide registry.
 */

import { encodeAbiParameters } from "viem";

export interface KlerosCourt {
    /** Subcourt ID on the target deployment. Verify against klerosboard. */
    id: number;
    /** Stable key used by the UI selector. */
    key: string;
    /** Human-readable name. */
    name: string;
    /** Short description shown in the UI. */
    description: string;
    /** Default minimum juror count for this court (Kleros default is 3). */
    defaultMinJurors: number;
}

/**
 * Curated catalog of subcourts most relevant to Figaro consent disputes.
 * IDs are for Kleros Liquid on Ethereum mainnet — verify before mainnet
 * deployment.
 */
export const KLEROS_COURTS: readonly KlerosCourt[] = [
    {
        id: 1,
        key: "general",
        name: "General Court",
        description:
            "Catch-all subcourt for disputes that don't fit a specific category. Default for most consent disputes.",
        defaultMinJurors: 3,
    },
    {
        id: 2,
        key: "blockchain-nontechnical",
        name: "Blockchain — Non-Technical",
        description:
            "Disputes about on-chain agreements where technical-protocol expertise is not required.",
        defaultMinJurors: 3,
    },
    {
        id: 3,
        key: "blockchain-technical",
        name: "Blockchain — Technical",
        description:
            "Disputes requiring technical evaluation of smart contracts, signatures, or protocol semantics.",
        defaultMinJurors: 3,
    },
    {
        id: 4,
        key: "english-language",
        name: "English Language",
        description:
            "Disputes hinging on the interpretation of English-language documents or messages.",
        defaultMinJurors: 3,
    },
] as const;

export const KLEROS_COURT_KEYS = KLEROS_COURTS.map((c) => c.key);
export type KlerosCourtKey = (typeof KLEROS_COURTS)[number]["key"] | "custom";

export function getKlerosCourt(key: string): KlerosCourt | null {
    return KLEROS_COURTS.find((c) => c.key === key) ?? null;
}

/**
 * Encode `arbitratorExtraData` for a subcourt + min-juror selection.
 *
 * Standard Kleros Liquid / KlerosCore shape:
 *   abi.encode(uint96 subcourtID, uint96 minJurors)
 *
 * Always produces exactly 64 bytes (32 + 32, right-padded uint96 words).
 */
export function encodeArbitratorExtraData(
    subcourtId: number,
    minJurors: number,
): `0x${string}` {
    if (!Number.isInteger(subcourtId) || subcourtId < 0) {
        throw new Error(`subcourtId must be a non-negative integer; got ${subcourtId}`);
    }
    if (!Number.isInteger(minJurors) || minJurors < 1) {
        throw new Error(`minJurors must be a positive integer; got ${minJurors}`);
    }
    return encodeAbiParameters(
        [
            { name: "subcourtID", type: "uint96" },
            { name: "minJurors", type: "uint96" },
        ],
        [BigInt(subcourtId), BigInt(minJurors)],
    );
}

/**
 * The minimum juror count Kleros itself enforces.
 * Submissions below this revert at the arbitrator level.
 */
export const KLEROS_MIN_JURORS_FLOOR = 1;

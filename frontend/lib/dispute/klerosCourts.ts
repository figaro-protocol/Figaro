/**
 * Kleros subcourt catalog — display metadata for the recourse forum a
 * dispute-resolution clause names.
 *
 * A clause's `klerosCourt` field carries a court key; `getKlerosCourt`
 * resolves it to the human-readable court this catalog describes, which the
 * recourse panel surfaces. Figaro does NOT create disputes on-chain (Kleros's
 * own UI, resolve.kleros.io, does that), so no `arbitratorExtraData` encoding
 * lives here — this is read/display only.
 *
 * The IDs below are for **Kleros Liquid on Ethereum mainnet** at the time of
 * authoring. Kleros V2 (KlerosCore), Gnosis chain, and any other deployment
 * use different IDs. The Kleros governance page at https://klerosboard.com/
 * shows the current canonical court tree.
 *
 * This catalog is small by design. Add subcourts here as they become
 * relevant; do not turn this into an exhaustive Kleros-wide registry.
 */

export interface KlerosCourt {
    /** Subcourt ID on the target deployment. Verify against klerosboard. */
    id: number;
    /** Stable key a clause's `klerosCourt` field references. */
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

export function getKlerosCourt(key: string): KlerosCourt | null {
    return KLEROS_COURTS.find((c) => c.key === key) ?? null;
}

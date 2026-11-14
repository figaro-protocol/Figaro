/**
 * What the wallet's signing prompt shows for a commitment: every field of the
 * typed data the app asks it to sign. The field list is `COMMITMENT_TYPES`
 * (the SDK's one definition, which the signing flow in `orderCommitmentFlow`
 * signs with), so the screen cannot list a field the party does not sign or
 * leave one out. The meaning table is keyed by that list's field names at the
 * type level: a field added to or removed from the typed data stops this file
 * compiling until the table is updated.
 */
import { COMMITMENT_TYPES } from "@figaro-protocol/sdk";

type SignedFieldName = (typeof COMMITMENT_TYPES.Commitment)[number]["name"];

/** What each field means for the party who signs, in plain words. */
export const SIGNED_FIELD_MEANING: Record<SignedFieldName, string> = {
    processId:
        "The process this order joins. All zeros means this order opens a new process.",
    buyer: "The wallet that pays and closes the process.",
    seller: "The wallet that adds value in this order.",
    currency: "The token the payment and both bonds are in.",
    payment: "The amount of that token the buyer pays this seller when the buyer closes the process.",
    expectedCumulativeValue:
        "The running total: the sum of the payments of every order committed in this process so far, this one included. A seller's bond is twice this running total. The buyer's bond is twice the payment.",
    checkoutHash: "The fingerprint of the agreement you reviewed above.",
    salt: "A number that makes this commitment unique. It carries no term of the trade.",
    deadline:
        "The last moment this signed commitment can be submitted to the chain. It is not a deadline for the work.",
};

export interface SignedFieldRow {
    name: SignedFieldName;
    type: string;
    meaning: string;
}

/** One row per field of the typed data, in its order. */
export function signedFieldRows(): SignedFieldRow[] {
    return COMMITMENT_TYPES.Commitment.map((f) => ({ name: f.name, type: f.type, meaning: SIGNED_FIELD_MEANING[f.name] }));
}

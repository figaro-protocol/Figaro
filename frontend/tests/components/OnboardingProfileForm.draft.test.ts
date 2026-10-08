/**
 * OnboardingProfileForm — the draft ⇄ form round trip behind the identity
 * step and the edit-identity page. An edit re-pins the whole profile from
 * the form, so every accepted-token field must survive it, including the
 * ones the form does not show (`name`, `logoURI`) and the seller's pool
 * declaration (`poolFeeTier`).
 */
import { describe, expect, it } from "vitest";
import { fromDraft, toDraft } from "@/components/members/OnboardingProfileForm";
import type { OnboardingProfileDraft } from "@/lib/member/onboardingState";

const BASIS = ("0x" + "22".repeat(20)) as `0x${string}`;
const PICKED = ("0x" + "11".repeat(20)) as `0x${string}`;

describe("OnboardingProfileForm draft round trip", () => {
    it("keeps every accepted-token field through an edit — name, logoURI and the pool", () => {
        const draft: OnboardingProfileDraft = {
            name: "A seller",
            acceptedTokens: [
                { address: BASIS, symbol: "BAS", name: "Basis Token", logoURI: "ipfs://bafybas" },
                { address: PICKED, symbol: "PIK", name: "Picked Token", logoURI: "https://example.org/pik.svg", poolFeeTier: 3000 },
            ],
            defaultTokenAddress: BASIS,
        };
        const out = toDraft(fromDraft(draft));
        expect(out.acceptedTokens).toEqual(draft.acceptedTokens);
        expect(out.defaultTokenAddress).toBe(BASIS);
    });

    it("an entry with no name, logo or pool stays without them (optional fields absent, never empty)", () => {
        const draft: OnboardingProfileDraft = {
            name: "A seller",
            acceptedTokens: [{ address: BASIS, symbol: "BAS" }],
            defaultTokenAddress: BASIS,
        };
        const [token] = toDraft(fromDraft(draft)).acceptedTokens!;
        expect(token).toEqual({ address: BASIS, symbol: "BAS" });
        expect(Object.keys(token)).toEqual(["address", "symbol"]);
    });

    it("a malformed row is dropped; the well-formed rows keep their fields", () => {
        const form = fromDraft({
            name: "A seller",
            acceptedTokens: [
                { address: BASIS, symbol: "BAS", name: "Basis Token" },
                { address: "0xnot-an-address" as `0x${string}`, symbol: "BAD", name: "Bad" },
            ],
            defaultTokenAddress: BASIS,
        });
        expect(toDraft(form).acceptedTokens).toEqual([{ address: BASIS, symbol: "BAS", name: "Basis Token" }]);
    });

    it("the default pricing token carries no pool — it is the quote basis itself", () => {
        const form = fromDraft({
            name: "A seller",
            acceptedTokens: [{ address: BASIS, symbol: "BAS", poolFeeTier: 500 }],
            defaultTokenAddress: BASIS,
        });
        expect(toDraft(form).acceptedTokens).toEqual([{ address: BASIS, symbol: "BAS" }]);
    });
});

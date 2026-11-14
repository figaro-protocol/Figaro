/**
 * The signing modal tells the party what its wallet will show: every field of
 * the typed data the app asks the wallet to sign (`COMMITMENT_TYPES`, the one
 * definition the signing flow uses), each with what it means for the party.
 * The list is derived from that definition, so a field added to or removed
 * from the signed type changes the screen, and the meaning table fails to
 * compile and fails here until it is updated.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { COMMITMENT_TYPES } from "@figaro-protocol/sdk";

vi.mock("wagmi", () => ({ useConnection: () => ({ chainId: 31337 }), useChainId: () => 31337 }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => <div data-testid="review-stub" /> }));
vi.mock("@/components/ui/ModalChrome", () => ({
    ModalChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";
import { SIGNED_FIELD_MEANING, signedFieldRows } from "@/lib/checkout/signedCommitmentFields";

const modal = (intent: "sign" | "commit") => (
    <AgreementPreviewModal commitment={{} as never} agreement={null} intent={intent} onConfirm={() => {}} onCancel={() => {}} />
);

describe("the signing modal lists every field the wallet shows", () => {
    it("has one row per field of the typed data, in its order, and no other", () => {
        render(modal("sign"));
        const shown = screen.getAllByTestId(/^preview-wallet-field-/).map((n) => n.getAttribute("data-testid")!.replace("preview-wallet-field-", ""));
        expect(shown).toEqual(COMMITMENT_TYPES.Commitment.map((f) => f.name));
    });

    it("has a meaning for each field of the typed data and none for a field it lacks", () => {
        expect(Object.keys(SIGNED_FIELD_MEANING).sort()).toEqual(COMMITMENT_TYPES.Commitment.map((f) => f.name).sort());
        expect(signedFieldRows().every((r) => r.meaning.length > 0)).toBe(true);
    });

    it("no longer says the wallet shows only the checkoutHash", () => {
        render(modal("sign"));
        expect(document.body.textContent).not.toMatch(/display only/i);
    });

    it("says the deadline is the last moment to submit the signed commitment and no deadline for the work", () => {
        render(modal("sign"));
        const deadline = screen.getByTestId("preview-wallet-field-deadline").textContent ?? "";
        expect(deadline).toMatch(/last moment/);
        expect(deadline).toMatch(/submitted/);
        expect(deadline).toMatch(/not a deadline for the work/);
    });

    it("says a seller's bond is twice the running total shown", () => {
        render(modal("sign"));
        const total = screen.getByTestId("preview-wallet-field-expectedCumulativeValue").textContent ?? "";
        expect(total).toMatch(/running total/);
        expect(total).toMatch(/seller.*twice/i);
    });

    it("says the checkoutHash is the fingerprint of the agreement the party reviewed", () => {
        render(modal("sign"));
        expect(screen.getByTestId("preview-wallet-field-checkoutHash").textContent).toMatch(/fingerprint of the agreement you reviewed/);
    });

    it("shows the list for the signature only, never for the commit broadcast", () => {
        render(modal("commit"));
        expect(screen.queryByTestId("preview-wallet-fields")).toBeNull();
    });
});

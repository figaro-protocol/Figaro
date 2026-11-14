/**
 * The checkout's line on what the party signs: a commitment that carries the
 * checkoutHash, never "the hash of the agreement" alone (the wallet shows
 * every field of the commitment; `AgreementPreviewModalWalletFields.test.tsx`).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckoutSigningNote } from "@/components/runtime/CheckoutSigningNote";

describe("CheckoutSigningNote", () => {
    it("says the party signs a commitment that carries the agreement's fingerprint", () => {
        render(<CheckoutSigningNote />);
        const text = screen.getByTestId("checkout-security-link").textContent ?? "";
        expect(text).toMatch(/You sign a commitment/);
        expect(text).toMatch(/checkoutHash, the fingerprint of the agreement above/);
        expect(text).not.toMatch(/What you sign is the hash/);
    });
});

/**
 * ContractEntry — two-tier catalogue row. `splitFirstSentence` is the pure
 * derivation (first ". " boundary → lead / rest); the component always
 * shows `lead` and puts `rest` behind a native `<details>` disclosure so the
 * text still renders in static HTML (no JS-gated content).
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContractEntry, splitFirstSentence } from "@/components/shared/ContractEntry";

afterEach(cleanup);

describe("splitFirstSentence", () => {
    it("splits a well-formed multi-sentence description on the first '. ' boundary", () => {
        const { lead, rest } = splitFirstSentence(
            "Protocol kernel. commit and resolveProcess. EIP-712 dual-signed commitments."
        );
        expect(lead).toBe("Protocol kernel.");
        expect(rest).toBe("commit and resolveProcess. EIP-712 dual-signed commitments.");
    });

    it("does not split on a dotted code identifier with no trailing space", () => {
        // "FigaroCore.orderStatus" has a period with no adjacent space — must
        // not be mistaken for a sentence boundary.
        const { lead, rest } = splitFirstSentence(
            "Reads FigaroCore.orderStatus. It answers for the direct path only."
        );
        expect(lead).toBe("Reads FigaroCore.orderStatus.");
        expect(rest).toBe("It answers for the direct path only.");
    });

    it("malformed input — a single sentence with no internal '. ' boundary — collapses to lead-only", () => {
        const { lead, rest } = splitFirstSentence("EIP-712 typed structs and hash functions.");
        expect(lead).toBe("EIP-712 typed structs and hash functions.");
        expect(rest).toBe("");
    });

    it("optional-field handling — an empty string produces an empty lead and no rest", () => {
        const { lead, rest } = splitFirstSentence("");
        expect(lead).toBe("");
        expect(rest).toBe("");
    });
});

describe("ContractEntry", () => {
    it("renders the title, meta, and the one-line lead always visible, with the remainder collapsed", () => {
        render(
            <ContractEntry
                title="FigaroCore.sol"
                meta="2 fns · 3 mappings · no owner"
                desc="Protocol kernel. commit and resolveProcess handle bonding and settlement."
            />
        );
        expect(screen.getByText("FigaroCore.sol")).toBeInTheDocument();
        expect(screen.getByText("2 fns · 3 mappings · no owner")).toBeInTheDocument();
        expect(screen.getByText("Protocol kernel.")).toBeInTheDocument();

        // The remainder is present in the DOM (static-export-safe — no
        // JS-required content hiding) even though <details> is collapsed by
        // default.
        const details = document.querySelector("details");
        expect(details).not.toBeNull();
        expect(details).not.toHaveAttribute("open");
        expect(screen.getByText("commit and resolveProcess handle bonding and settlement.")).toBeInTheDocument();
    });

    it("well-formed input with a single-sentence desc renders no disclosure at all", () => {
        render(<ContractEntry title="CommitmentTypes.sol" desc="EIP-712 typed structs and hash functions." />);
        expect(screen.getByText("EIP-712 typed structs and hash functions.")).toBeInTheDocument();
        expect(document.querySelector("details")).toBeNull();
    });

    it("optional-field handling — renders with no id, href, or meta", () => {
        render(<ContractEntry title="Minimal.sol" desc="A minimal entry. Nothing else to say." />);
        expect(screen.getByText("Minimal.sol")).toBeInTheDocument();
        // No <a> wrapper when href is omitted.
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("optional-field handling — renders the source link when href is supplied", () => {
        render(
            <ContractEntry
                title="FigaroCore.sol"
                href="https://github.com/figaro-protocol/Figaro/blob/main/src/FigaroCore.sol"
                desc="Protocol kernel. Handles bonding and settlement."
            />
        );
        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("href", "https://github.com/figaro-protocol/Figaro/blob/main/src/FigaroCore.sol");
        expect(link).toHaveAttribute("target", "_blank");
    });
});

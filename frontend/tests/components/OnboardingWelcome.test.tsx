import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingWelcome } from "@/components/sellers/OnboardingWelcome";

// Audit workstream A (finding 10): the seller's welcome must narrate the
// bonded-commitment WHY — what Figaro is and the seller's own 2× bond
// obligation — not just the registration prerequisites.
describe("OnboardingWelcome — bonded-commitment framing", () => {
    it("opens with 'What you are joining' and states the seller's bond + no-escape-hatch", () => {
        render(<OnboardingWelcome />);
        expect(screen.getByText("What you are joining")).toBeInTheDocument();
        // The seller's defining obligation — the 2× bond — is now on the surface.
        expect(screen.getByText(/lock twice its cumulative value/i)).toBeInTheDocument();
        expect(screen.getByText(/no admin, arbitrator, or timeout/i)).toBeInTheDocument();
    });

    it("links to /protocol for how the bond works, and still shows Prerequisites", () => {
        render(<OnboardingWelcome />);
        const link = screen.getByRole("link", { name: /how the bond works/i });
        expect(link).toHaveAttribute("href", "/protocol");
        expect(screen.getByText("Prerequisites")).toBeInTheDocument();
    });
});

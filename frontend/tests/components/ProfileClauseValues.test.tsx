import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileClauseValues } from "@/components/members/ProfileClauseValues";
import { primeClauseSpecs } from "../lib/primeClauseSpecs";

/**
 * The profile-authored clause values are seller master data the seller's
 * BOUND assemblies read at checkout. The beta panel's caterer met every
 * registered clause's profile fields, marked required, on the Identity step
 * before anything was bound. Two rules, both asserted here: the section is
 * scoped to the clauses the caller names (the bound assemblies' composition),
 * and no field carries a required mark — a seller authors what applies.
 */

vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 1 }) }));

beforeAll(async () => {
    await primeClauseSpecs(["figaro-dimweight", "figaro-credential"]);
});

describe("ProfileClauseValues", () => {
    it("renders only the profile fields of the clauses in scope", () => {
        render(<ProfileClauseValues values={{}} onChange={vi.fn()} clauseIds={["figaro-dimweight", "figaro-commerce"]} />);
        expect(screen.getByTestId("profile-clause-figaro-dimweight")).toBeTruthy();
        expect(screen.queryByTestId("profile-clause-figaro-credential")).toBeNull();
    });

    it("renders nothing when no clause in scope declares profile fields", () => {
        const { container } = render(<ProfileClauseValues values={{}} onChange={vi.fn()} clauseIds={["figaro-commerce"]} />);
        expect(container.querySelector('[data-testid="profile-clauses"]')).toBeNull();
    });

    it("renders every profile-sourced clause when no scope is given", () => {
        render(<ProfileClauseValues values={{}} onChange={vi.fn()} />);
        expect(screen.getByTestId("profile-clause-figaro-dimweight")).toBeTruthy();
        expect(screen.getByTestId("profile-clause-figaro-credential")).toBeTruthy();
    });

    it("marks no field required — the checkout obligation is not the seller's", () => {
        const { container } = render(<ProfileClauseValues values={{}} onChange={vi.fn()} />);
        expect(container.querySelector('[data-testid$="-required"]')).toBeNull();
    });
});

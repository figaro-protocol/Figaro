import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DisclosurePolicyEditor } from "@/components/members/DisclosurePolicyEditor";
import type { AssemblyChoice } from "@/lib/protocol/assemblyChoices";

// Posture scoping (maintainer instruction 2026-08-06): each side's data
// derives from its OWN assembly list — the seller assemblies step
// mounts the editor with ["seller"], the buyer step with ["buyer"], and
// the two are never interleaved on one step.

const CHOICE: AssemblyChoice = {
    slug: "aerial-survey",
    registeredBy: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    compositionHash: `0x${"ab".repeat(32)}` as `0x${string}`,
    contentURI: "ipfs://QmTemplate",
    blockNumber: 1n,
    networkTargets: ["31337"],
    state: "loaded",
    name: "Aerial survey",
    summary: "A licensed drone operator flies for you.",
    agreementCount: 1,
    clauses: ["figaro-commerce"],
    assemblyTemplate: null,
    stakeWithdrawn: false,
};

describe("DisclosurePolicyEditor — posture scoping", () => {
    it("renders only buyer rows when mounted with postures=[\"buyer\"]", () => {
        const { container } = render(
            <DisclosurePolicyEditor
                choices={[CHOICE]}
                entries={[]}
                onChange={() => {}}
                postures={["buyer"]}
            />,
        );
        expect(container.querySelector('[data-testid$="-buyer-offer"]')).not.toBeNull();
        expect(container.querySelector('[data-testid$="-seller-offer"]')).toBeNull();
    });

    it("renders only seller rows when mounted with postures=[\"seller\"]", () => {
        const { container } = render(
            <DisclosurePolicyEditor
                choices={[CHOICE]}
                entries={[]}
                onChange={() => {}}
                postures={["seller"]}
            />,
        );
        expect(container.querySelector('[data-testid$="-seller-offer"]')).not.toBeNull();
        expect(container.querySelector('[data-testid$="-buyer-offer"]')).toBeNull();
    });

    it("renders nothing with zero choices", () => {
        const { container } = render(
            <DisclosurePolicyEditor choices={[]} entries={[]} onChange={() => {}} postures={["buyer"]} />,
        );
        expect(container).toBeEmptyDOMElement();
    });
});

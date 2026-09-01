import { describe, expect, it } from "vitest";

import { compositionTarget } from "@/lib/composition/compositionTarget";

// The standard-interface registry is currently EMPTY (the descending auction —
// its first tenant — was abandoned 2026-07-02). The seam's contract is that an
// unknown interface resolves to null, never to a fabricated target; when the
// next standard lands (carbon-aggregator), add a resolution case here.
describe("compositionTarget", () => {
    it("returns null for an interface with no registered handler", () => {
        expect(compositionTarget("no-such-interface")).toBeNull();
    });

    it("returns null for the unregistered descending-auction interface", () => {
        expect(compositionTarget("descending-auction")).toBeNull();
    });
});

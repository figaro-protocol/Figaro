/**
 * PinnedTokenNote — the binding surface tells a seller what a designer's
 * token pin means before it binds: every payment and bond under the assembly
 * moves in that token. The pin is read by its declared field from the
 * assembly-scoped terms once the specs are read; while they are being read
 * the note says so, never a silence a seller would read as "no pin"; an
 * assembly with no pin gets no note.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Assembly } from "@figaro-protocol/sdk";

vi.mock("@/hooks/useTokenSymbol", () => ({
    useTokenSymbol: (address: string) => ({ data: address ? "MOCK" : undefined }),
}));
const specsState = { loaded: true };
vi.mock("@/lib/protocol/useClauseSpecs", () => ({
    useClauseSpecs: () => ({ version: 0, loaded: specsState.loaded, errors: [] }),
}));

import { PinnedTokenNote } from "@/components/members/PinnedTokenNote";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";

const TOKEN = "0x00000000000000000000000000000000000000a1";

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology", "figaro-utility-token"]);
});

describe("PinnedTokenNote — binding a pinned assembly accepts its token", () => {
    // Built per test: the specs are primed in beforeAll, after collection.
    const pinned = (): Assembly => ({
        agreements: [],
        assemblyClauses: { [keyOf("figaro-utility-token")]: { currency: TOKEN } },
    });

    it("names the pinned token, by symbol and address, for every payment and bond under the assembly", () => {
        specsState.loaded = true;
        render(<PinnedTokenNote assembly={pinned()} slug="pinned" />);
        const note = screen.getByTestId("seller-assembly-pinned-token-pinned");
        expect(note.textContent).toContain("By binding this assembly you accept MOCK (" + TOKEN + ")");
        expect(note.textContent).toContain("every payment and bond under it");
    });

    it("renders nothing for an assembly whose designer pinned no token", () => {
        specsState.loaded = true;
        const assembly: Assembly = { agreements: [], assemblyClauses: {} };
        const { container } = render(<PinnedTokenNote assembly={assembly} slug="open" />);
        expect(container.textContent).toBe("");
        expect(screen.queryByTestId("seller-assembly-pinned-token-open")).toBeNull();
    });

    it("says the terms are being read while the specs load, instead of a silence read as no pin", () => {
        specsState.loaded = false;
        render(<PinnedTokenNote assembly={pinned()} slug="loading" />);
        expect(screen.getByTestId("seller-assembly-terms-reading-loading").textContent).toMatch(/Reading/);
        expect(screen.queryByTestId("seller-assembly-pinned-token-loading")).toBeNull();
        specsState.loaded = true;
    });
});

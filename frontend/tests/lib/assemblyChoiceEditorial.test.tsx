import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { agreementHashOf } from "@figaro-protocol/sdk";

/**
 * The editorial projection: an assembly reaches a reader as the designer's
 * NAME and SUMMARY, with the content-derived slug secondary. A list of slugs
 * and clause names is what made a mug seller bind a freight assembly.
 *
 * Both come from the pinned assembly and neither is invented: a assembly with
 * no name is read as its slug, a assembly with no prose has no summary.
 */

const publishedMock = vi.fn();
const fetchHydratedAssemblyMock = vi.fn();
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    getAssemblyLoadError: () => undefined,
    usePublishedAssemblies: () => publishedMock(),
    fetchHydratedAssembly: (...args: unknown[]) => fetchHydratedAssemblyMock(...args),
}));

import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";

const EVENT = {
    slug: "asm-9ffb1eb79755a9ab",
    registeredBy: "0xA",
    assemblyHash: "0x1",
    contentURI: "ipfs://tmpl",
    blockNumber: 2n,
    stakeWithdrawn: false,
};

const flush = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

/** The hydrated read of a assembly whose agreements each bind the agreement
 *  their clauses key to. */
function hydrated(assembly: Record<string, unknown> & { agreements: { id: string; clauses: Record<string, Record<string, unknown>> }[] }) {
    const agreements: Record<string, { clauses: Record<string, Record<string, unknown>> }> = {};
    const entries = assembly.agreements.map((entry) => {
        const agreementHash = agreementHashOf({ clauses: entry.clauses as Record<`0x${string}`, Record<string, unknown>> });
        agreements[agreementHash.toLowerCase()] = { clauses: entry.clauses };
        return { id: entry.id, agreementHash, clauses: {} };
    });
    return { assembly: { ...assembly, agreements: entries }, agreements };
}

/** Render the projection over one published assembly with the given assembly. */
async function choiceFor(assembly: (Record<string, unknown> & { agreements: { id: string; clauses: Record<string, Record<string, unknown>> }[] }) | null) {
    fetchHydratedAssemblyMock.mockResolvedValue(assembly ? hydrated(assembly) : null);
    const { result } = renderHook(() => useAssemblyChoices());
    await flush();
    return result.current.data![0];
}

describe("useAssemblyChoices — the designer's words reach the reader", () => {
    beforeEach(() => {
        publishedMock.mockReturnValue({ data: [EVENT], isLoading: false, failed: false, refetch: vi.fn() });
        fetchHydratedAssemblyMock.mockReset();
    });

    it("carries the assembly's name and summary", async () => {
        const choice = await choiceFor({
            name: "Point of sale",
            summary: "One bonded order at the counter: buyer and seller, no process in between.",
            agreements: [{ id: "order-0", clauses: {} }],
        });
        expect(choice).toMatchObject({
            state: "loaded",
            name: "Point of sale",
            summary: "One bonded order at the counter: buyer and seller, no process in between.",
        });
    });

    it("falls back to the assembly's description when the designer wrote only that", async () => {
        const choice = await choiceFor({
            name: "Equipment hire",
            description: "A single bonded rental, resolved in the studio's own token.",
            agreements: [],
        });
        expect(choice.summary).toBe("A single bonded rental, resolved in the studio's own token.");
    });

    it("has no summary when the assembly carries no prose — nothing is invented", async () => {
        const choice = await choiceFor({ name: "Rate-priced haul", agreements: [] });
        expect(choice.summary).toBeNull();
        expect(choice.name).toBe("Rate-priced haul");
    });

    it("shows the slug when the assembly has no name", async () => {
        const choice = await choiceFor({ summary: "Six bonded parties move a container.", agreements: [] });
        expect(choice.name).toBe("asm-9ffb1eb79755a9ab");
        expect(choice.summary).toBe("Six bonded parties move a container.");
    });

    it("shows the slug and no summary while the assembly is unresolved", async () => {
        const choice = await choiceFor(null);
        expect(choice.name).toBe("asm-9ffb1eb79755a9ab");
        expect(choice.summary).toBeNull();
    });
});

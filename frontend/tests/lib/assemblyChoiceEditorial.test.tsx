import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * The editorial projection: an assembly reaches a reader as the designer's
 * NAME and SUMMARY, with the content-derived slug secondary. A list of slugs
 * and clause names is what made a mug seller bind a freight assembly.
 *
 * Both come from the pinned template and neither is invented: a template with
 * no name is read as its slug, a template with no prose has no summary.
 */

const publishedMock = vi.fn();
const fetchAssemblyTemplateMock = vi.fn();
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => publishedMock(),
    fetchAssemblyTemplate: (...args: unknown[]) => fetchAssemblyTemplateMock(...args),
}));

import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";

const EVENT = {
    slug: "asm-33ce205ea77e79e8",
    registeredBy: "0xA",
    compositionHash: "0x1",
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

/** Render the projection over one published assembly with the given template. */
async function choiceFor(template: Record<string, unknown> | null) {
    fetchAssemblyTemplateMock.mockResolvedValue(template);
    const { result } = renderHook(() => useAssemblyChoices());
    await flush();
    return result.current.data![0];
}

describe("useAssemblyChoices — the designer's words reach the reader", () => {
    beforeEach(() => {
        publishedMock.mockReturnValue({ data: [EVENT], isLoading: false, failed: false, refetch: vi.fn() });
        fetchAssemblyTemplateMock.mockReset();
    });

    it("carries the template's name and summary", async () => {
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

    it("falls back to the template's description when the designer wrote only that", async () => {
        const choice = await choiceFor({
            name: "Equipment hire",
            description: "A single bonded rental, settled in the studio's own token.",
            agreements: [],
        });
        expect(choice.summary).toBe("A single bonded rental, settled in the studio's own token.");
    });

    it("has no summary when the template carries no prose — nothing is invented", async () => {
        const choice = await choiceFor({ name: "Rate-priced haul", agreements: [] });
        expect(choice.summary).toBeNull();
        expect(choice.name).toBe("Rate-priced haul");
    });

    it("shows the slug when the template has no name", async () => {
        const choice = await choiceFor({ summary: "Six bonded parties move a container.", agreements: [] });
        expect(choice.name).toBe("asm-33ce205ea77e79e8");
        expect(choice.summary).toBe("Six bonded parties move a container.");
    });

    it("shows the slug and no summary while the template is unresolved", async () => {
        const choice = await choiceFor(null);
        expect(choice.name).toBe("asm-33ce205ea77e79e8");
        expect(choice.summary).toBeNull();
    });
});

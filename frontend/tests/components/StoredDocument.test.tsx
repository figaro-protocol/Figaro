/**
 * StoredDocument.test.tsx — the "as stored" disclosure on `/registries`.
 *
 * What this surface owes a reader who has to reason about what a registration
 * BINDS: the pinned bytes exactly as served, the digest the chain anchors, and
 * the recomputation shown rather than asserted. Three things must hold or the
 * disclosure is worse than nothing —
 *
 *   the document is rendered as TEXT (content is data; a registry is
 *   permissionless, so a pinned document is untrusted input and must never
 *   reach the page as markup),
 *
 *   the panel opens no gateway connection until it is opened (100+ rows, one
 *   round-trip each, on every page load otherwise),
 *
 *   and a hash that does NOT reproduce says so — a drifted pin is a finding,
 *   never a silent pass.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { canonicalContentHash, templateCompositionHash } from "@figaro-protocol/sdk";

const fetchCappedContentMock = vi.fn();
const resolveFetchUrlMock = vi.fn();
vi.mock("@/lib/shared/ipfsService", () => ({
    DEFAULT_IPFS_SERVICE: { resolveFetchUrl: (uri: string) => resolveFetchUrlMock(uri) },
    fetchCappedContent: (url: string) => fetchCappedContentMock(url),
}));

import { StoredDocument } from "@/components/registries/StoredDocument";

const SPEC = {
    clauseId: "figaro-applicable-law",
    version: 1,
    title: "Applicable law",
    description: "The law the parties named.",
    fields: [{ name: "jurisdiction", type: "string" }],
};
const SPEC_JSON = JSON.stringify(SPEC, null, 2);
const SPEC_HASH = canonicalContentHash(SPEC);
const URI = "ipfs://bafyspec";

function served(text: string) {
    return { ok: true, status: 200, statusText: "OK", text: async () => text };
}

function mount(over: Partial<React.ComponentProps<typeof StoredDocument>> = {}) {
    return render(
        <StoredDocument id="clause-figaro-applicable-law" contentURI={URI} anchoredHash={SPEC_HASH} anchor="content-hash" {...over} />,
    );
}

describe("StoredDocument — the pinned document, verbatim", () => {
    beforeEach(() => {
        fetchCappedContentMock.mockReset();
        resolveFetchUrlMock.mockReset();
        resolveFetchUrlMock.mockReturnValue("http://127.0.0.1:8080/ipfs/bafyspec");
        fetchCappedContentMock.mockResolvedValue(served(SPEC_JSON));
    });

    it("reads NOTHING until the disclosure is opened", () => {
        mount();
        expect(fetchCappedContentMock).not.toHaveBeenCalled();
        expect(screen.queryByTestId("stored-json-clause-figaro-applicable-law")).toBeNull();
    });

    it("shows the served bytes verbatim, in a <pre>, with the anchored hash beside them", async () => {
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();

        const pre = await screen.findByTestId("stored-json-clause-figaro-applicable-law");
        // Byte-for-byte what the gateway served — the pinned indentation and
        // key order intact, not a re-serialization of a parsed object.
        expect(pre.textContent).toBe(SPEC_JSON);
        expect(pre.tagName).toBe("PRE");
        expect(screen.getByTestId("stored-hash-clause-figaro-applicable-law").textContent).toBe(SPEC_HASH);
        expect(fetchCappedContentMock).toHaveBeenCalledWith("http://127.0.0.1:8080/ipfs/bafyspec");
    });

    it("finishes a read that lands AFTER the panel has moved to 'reading' (the network is never synchronous)", async () => {
        // A resolved mock lands before React commits "reading"; a real gateway
        // answers later. The effect must not cancel its own fetch when the
        // state it set re-renders the panel.
        fetchCappedContentMock.mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(served(SPEC_JSON)), 30)),
        );
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();
        expect(await screen.findByTestId("stored-reading-clause-figaro-applicable-law")).toBeTruthy();
        const pre = await screen.findByTestId("stored-json-clause-figaro-applicable-law", {}, { timeout: 2_000 });
        expect(pre.textContent).toBe(SPEC_JSON);
        expect(fetchCappedContentMock).toHaveBeenCalledTimes(1);
    });

    it("states that the anchor is the keccak256 of the canonical bytes, and shows the recomputation agreeing", async () => {
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();

        const verdict = await screen.findByTestId("stored-verdict-clause-figaro-applicable-law");
        expect(verdict.textContent).toContain(SPEC_HASH);
        expect(verdict.textContent).toMatch(/reproduces the anchor/i);
        expect(screen.getByTestId("stored-panel-clause-figaro-applicable-law").textContent).toMatch(/keccak256/);
        expect(screen.getByTestId("stored-panel-clause-figaro-applicable-law").textContent).toMatch(/canonical form/i);
    });

    it("a document that is served but does NOT hash to the anchor is called out", async () => {
        fetchCappedContentMock.mockResolvedValue(served(JSON.stringify({ ...SPEC, title: "Edited in place" })));
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();

        const verdict = await screen.findByTestId("stored-verdict-clause-figaro-applicable-law");
        expect(verdict.textContent).toMatch(/does NOT reproduce the anchor/i);
        expect(verdict.textContent).toMatch(/not the document the chain names/i);
    });

    it("bytes that will not parse recompute nothing, and say so", async () => {
        fetchCappedContentMock.mockResolvedValue(served("<html>gateway error page</html>"));
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();

        const verdict = await screen.findByTestId("stored-verdict-clause-figaro-applicable-law");
        expect(verdict.textContent).toMatch(/do not parse/i);
        // Untrusted served content reaches the page as TEXT, never as markup.
        const pre = screen.getByTestId("stored-json-clause-figaro-applicable-law");
        expect(pre.textContent).toBe("<html>gateway error page</html>");
        expect(pre.querySelector("html")).toBeNull();
    });

    it("an unserved document is stated as the absence of a copy, not as a bad registration", async () => {
        fetchCappedContentMock.mockResolvedValue({ ok: false, status: 504, statusText: "Gateway Timeout", text: async () => "" });
        mount();
        screen.getByTestId("stored-toggle-clause-figaro-applicable-law").click();

        await waitFor(() =>
            expect(screen.getByTestId("stored-unreachable-clause-figaro-applicable-law").textContent).toMatch(
                /never evidence that the registration is wrong/i,
            ),
        );
        expect(screen.queryByTestId("stored-json-clause-figaro-applicable-law")).toBeNull();
    });

    it("an assembly's note names the COMPOSITION its anchor covers, not the whole document", async () => {
        const template = {
            name: "Equipment hire",
            summary: "Editorial wording, outside the anchor.",
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": { payment: "1" } } }],
        };
        const hash = templateCompositionHash(template as Parameters<typeof templateCompositionHash>[0]);
        fetchCappedContentMock.mockResolvedValue(served(JSON.stringify(template, null, 2)));
        mount({ id: "assembly-asm-1", anchoredHash: hash, anchor: "composition-hash" });
        screen.getByTestId("stored-toggle-assembly-asm-1").click();

        expect((await screen.findByTestId("stored-verdict-assembly-asm-1")).textContent).toMatch(/reproduces the anchor/i);
        const panel = screen.getByTestId("stored-panel-assembly-asm-1");
        expect(panel.textContent).toMatch(/composition/i);
        expect(panel.textContent).toMatch(/editorial wording rides in the same document/i);
    });
});

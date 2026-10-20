/**
 * registryDocument.test.ts — the two reads every staked-intent registry's document family
 * shares: the binding by key, and the pinned document verified against its anchor.
 * Absence is null (no binding, an unreachable pin, a document that is not the anchor's);
 * a rejected document is reported once to the family's own failure recorder.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
    urls: new Map<string, string | null>(),
    bodies: new Map<string, { ok: boolean; text: string } | "throw">(),
}));

vi.mock("@/lib/shared/wagmi", () => ({ publicClient: { readContract: async () => { throw new Error("no default client in this test"); } }, activeChain: { id: 31337 } }));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/ipfsService")>();
    return {
        ...actual,
        DEFAULT_IPFS_SERVICE: { ...actual.DEFAULT_IPFS_SERVICE, resolveFetchUrl: (uri: string) => io.urls.get(uri) ?? null },
        fetchCappedContent: async (url: string) => {
            const body = io.bodies.get(url);
            if (body === undefined || body === "throw") throw new Error("unreachable");
            return { ok: body.ok, status: body.ok ? 200 : 404, statusText: "", text: async () => body.text };
        },
    };
});

import { fetchPinnedDocument, readRegistryBinding } from "@/lib/protocol/registryDocument";

const REGISTRY = "0x00000000000000000000000000000000000a9e01" as const;
const KEY = `0x${"ab".repeat(32)}` as const;
const BINDING = ["0x0000000000000000000000000000000000005e11", 7n, false, "ipfs://x"] as const;

describe("readRegistryBinding", () => {
    const clientFor = (result: unknown) => ({ readContract: async () => { if (result instanceof Error) throw result; return result; } }) as never;

    it("returns the bindings tuple of a bound key", async () => {
        expect(await readRegistryBinding(REGISTRY, [] as never, KEY, clientFor(BINDING))).toEqual(BINDING);
    });

    it("is null for an unbound key, a binding with no contentURI, and a failed read", async () => {
        expect(await readRegistryBinding(REGISTRY, [] as never, KEY, clientFor(["0x0", 0n, false, ""]))).toBeNull();
        expect(await readRegistryBinding(REGISTRY, [] as never, KEY, clientFor(["0x0", 7n, false, ""]))).toBeNull();
        expect(await readRegistryBinding(REGISTRY, [] as never, KEY, clientFor(new Error("rpc down")))).toBeNull();
    });
});

describe("fetchPinnedDocument", () => {
    beforeEach(() => { io.urls.clear(); io.bodies.clear(); });
    const read = (text: string) => (text === "good" ? { v: 1 } : null);

    it("returns what `read` verifies from the pinned bytes", async () => {
        io.urls.set("ipfs://a", "u-a"); io.bodies.set("u-a", { ok: true, text: "good" });
        const rejected = vi.fn();
        expect(await fetchPinnedDocument("ipfs://a", read, rejected)).toEqual({ v: 1 });
        expect(rejected).not.toHaveBeenCalled();
    });

    it("is null, and reports a rejection once, when the served bytes are not the anchor's document", async () => {
        io.urls.set("ipfs://a", "u-a"); io.bodies.set("u-a", { ok: true, text: "tampered" });
        const rejected = vi.fn();
        expect(await fetchPinnedDocument("ipfs://a", read, rejected)).toBeNull();
        expect(rejected).toHaveBeenCalledTimes(1);
    });

    it("is null without a report for an unresolvable URI, a gateway miss and an unreachable pin", async () => {
        const rejected = vi.fn();
        expect(await fetchPinnedDocument("ipfs://none", read, rejected)).toBeNull();
        io.urls.set("ipfs://a", "u-a"); io.bodies.set("u-a", { ok: false, text: "" });
        expect(await fetchPinnedDocument("ipfs://a", read, rejected)).toBeNull();
        io.bodies.set("u-a", "throw");
        expect(await fetchPinnedDocument("ipfs://a", read, rejected)).toBeNull();
        expect(rejected).not.toHaveBeenCalled();
    });
});

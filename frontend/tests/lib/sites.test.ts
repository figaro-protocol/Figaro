import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// The site map's reader: which host carries a route, and how a link is
// written from one page to another when the sites are split.
async function load(split: boolean) {
    vi.resetModules();
    if (split) process.env.NEXT_PUBLIC_SPLIT_SITES = "1";
    else delete process.env.NEXT_PUBLIC_SPLIT_SITES;
    return await import("@/lib/shared/sites");
}

describe("sitesOfRoute", () => {
    it("matches the longest prefix and treats / as exact", async () => {
        const { sitesOfRoute } = await load(false);
        expect(sitesOfRoute("/")).toEqual(["apex"]);
        expect(sitesOfRoute("/kernel/")).toEqual(["core"]);
        expect(sitesOfRoute("/papers/asymmetric-bonding")).toEqual(["core"]);
        expect(sitesOfRoute("/data")).toEqual(["app"]);
        expect(sitesOfRoute("/data/yours")).toEqual(["app"]);
        expect(sitesOfRoute("/data/explore?layer=x")).toEqual(["core", "app"]);
        expect(sitesOfRoute("/audit/view#top")).toEqual(["app", "core", "build"]);
        expect(sitesOfRoute("/no-such-route")).toEqual([]);
    });
});

describe("resolveHref, sites not split", () => {
    it("leaves every href untouched", async () => {
        const { resolveHref } = await load(false);
        expect(resolveHref("/kernel", "/use")).toBe("/kernel");
        expect(resolveHref("https://x.y/z", "/use")).toBe("https://x.y/z");
    });
});

describe("resolveHref, sites split", () => {
    beforeEach(() => { delete process.env.NEXT_PUBLIC_SITE_HOST_CORE; });
    afterEach(() => { delete process.env.NEXT_PUBLIC_SPLIT_SITES; });

    it("keeps a link relative when the target is on the same host", async () => {
        const { resolveHref } = await load(true);
        expect(resolveHref("/invariants", "/kernel")).toBe("/invariants");
        expect(resolveHref("/orders", "/use")).toBe("/orders");
    });
    it("makes a link absolute to the owning host when the target is elsewhere", async () => {
        const { resolveHref } = await load(true);
        expect(resolveHref("/kernel", "/use")).toBe("https://core.figaroprotocol.com/kernel");
        expect(resolveHref("/faq#keys", "/kernel")).toBe("https://app.figaroprotocol.com/faq#keys");
        expect(resolveHref("/", "/kernel")).toBe("https://figaroprotocol.com/");
    });
    it("from a shared page, stays relative only if every host carrying the page carries the target", async () => {
        const { resolveHref } = await load(true);
        // /audit is on app, core, build; /about is on all four → relative.
        expect(resolveHref("/about", "/audit")).toBe("/about");
        // /orders is app-only → absolute, even though app is one of /audit's hosts.
        expect(resolveHref("/orders", "/audit")).toBe("https://app.figaroprotocol.com/orders");
    });
    it("passes external, protocol-relative, anchor, and unknown hrefs through", async () => {
        const { resolveHref } = await load(true);
        expect(resolveHref("https://github.com/x", "/use")).toBe("https://github.com/x");
        expect(resolveHref("//cdn.x/y", "/use")).toBe("//cdn.x/y");
        expect(resolveHref("#refusals", "/kernel")).toBe("#refusals");
        expect(resolveHref("/no-such-route", "/use")).toBe("/no-such-route");
    });
    it("honours a host override from the environment", async () => {
        process.env.NEXT_PUBLIC_SITE_HOST_CORE = "http://localhost:3101/";
        const { resolveHref } = await load(true);
        expect(resolveHref("/kernel", "/use")).toBe("http://localhost:3101/kernel");
    });
});

describe("servedPath and aliases", () => {
    afterEach(() => { delete process.env.NEXT_PUBLIC_SPLIT_SITES; vi.doUnmock("@/lib/shared/sites.json"); });

    it("serves a source route at its alias on that host only, keeping query and hash", async () => {
        vi.doMock("@/lib/shared/sites.json", async (orig) => {
            const real = (await orig()) as { default: Record<string, unknown> };
            return { default: { ...real.default, routes: [...(real.default.routes as unknown[]), ["/faq-build", ["build"]]], aliases: [["/faq-build", "build", "/faq"]] } };
        });
        const { servedPath, resolveHref } = await load(true);
        expect(servedPath("/faq-build", "build")).toBe("/faq");
        expect(servedPath("/faq-build#stake", "build")).toBe("/faq#stake");
        expect(servedPath("/faq-build/deep?x=1", "build")).toBe("/faq/deep?x=1");
        expect(servedPath("/faq-build", "core")).toBe("/faq-build");
        // From a build page, the link is the served path; from elsewhere, absolute on build's origin.
        expect(resolveHref("/faq-build#stake", "/clauses")).toBe("/faq#stake");
        expect(resolveHref("/faq-build", "/kernel")).toBe("https://build.figaroprotocol.com/faq");
    });
});


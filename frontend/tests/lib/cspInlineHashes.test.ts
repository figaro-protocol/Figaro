import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withInlineScriptPolicy } from "@/scripts/csp-inline-hashes.mjs";

// Frontend invariant S-4: the static export carries no server to mint a nonce,
// so each page names the hash of every inline script it ships, and an injected
// inline script matches none of them.
const sha = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
const page = (head: string, body: string) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe("withInlineScriptPolicy", () => {
    it("names the hash of every inline script, first in the head, and none of a src script", () => {
        const html = page(`<meta charset="utf-8"/><script src="/_next/a.js"></script>`, `<script>self.__next_f.push([1,"x"])</script><script id="t">a()</script>`);
        const out = withInlineScriptPolicy(html);
        const meta = out.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/?>/);
        expect(meta).not.toBeNull();
        expect(out.indexOf(meta![0])).toBe(out.indexOf("<head>") + "<head>".length);
        expect(meta![1]).toContain(sha('self.__next_f.push([1,"x"])'));
        expect(meta![1]).toContain(sha("a()"));
        expect(meta![1]).toMatch(/^script-src 'self' 'wasm-unsafe-eval' /);
        expect(meta![1]).not.toContain("unsafe-inline");
    });

    it("hashes the script body as served, after the export's prettify pass (a newline inside the closing tag)", () => {
        const out = withInlineScriptPolicy(page("", "<script>b()</script\n>"));
        expect(out).toContain(sha("b()"));
    });

    it("is idempotent: a second pass replaces the policy, never stacks a second one", () => {
        const once = withInlineScriptPolicy(page("", "<script>c()</script>"));
        const twice = withInlineScriptPolicy(once);
        expect(twice).toBe(once);
        expect(twice.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
    });

    it("leaves a page without a head unchanged", () => {
        expect(withInlineScriptPolicy("<p>fragment</p>")).toBe("<p>fragment</p>");
    });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFile } from "@/scripts/serve-export.mjs";

// The static export's server reads only files under its root: every candidate
// path is resolved and checked against the root and a separator before the
// disk is read.
describe("resolveFile", () => {
    let parent: string;
    let root: string;

    beforeAll(() => {
        parent = fs.mkdtempSync(path.join(os.tmpdir(), "serve-export-"));
        root = path.join(parent, "out");
        fs.mkdirSync(path.join(root, "s", "view"), { recursive: true });
        fs.writeFileSync(path.join(root, "index.html"), "home");
        fs.writeFileSync(path.join(root, "s", "view", "index.html"), "view");
        fs.writeFileSync(path.join(root, "flat.html"), "flat");
        fs.writeFileSync(path.join(parent, "secret.txt"), "secret");
        // A sibling whose name starts with the root's: a prefix check without a separator admits it.
        fs.mkdirSync(path.join(parent, "out-evil"));
        fs.writeFileSync(path.join(parent, "out-evil", "index.html"), "evil");
    });

    afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

    it("serves the export's clean URLs", () => {
        expect(resolveFile(root, "/")).toBe(path.join(root, "index.html"));
        expect(resolveFile(root, "/s/view")).toBe(path.join(root, "s", "view", "index.html"));
        expect(resolveFile(root, "/s/view/")).toBe(path.join(root, "s", "view", "index.html"));
        expect(resolveFile(root, "/flat")).toBe(path.join(root, "flat.html"));
        expect(resolveFile(root, "/missing")).toBeNull();
    });

    it("refuses every path that leaves the root", () => {
        expect(resolveFile(root, "/../secret.txt")).toBeNull();
        expect(resolveFile(root, "/%2e%2e/secret.txt")).toBeNull();
        expect(resolveFile(root, "/..%2fsecret.txt")).toBeNull();
        expect(resolveFile(root, "/../out-evil/")).toBeNull();
        expect(resolveFile(root, "/../out-evil")).toBeNull();
        expect(resolveFile(root, "/%E0%A4%A")).toBeNull();
    });
});

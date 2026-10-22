import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paperExportDir } from "@/scripts/paper-latex.mjs";

// The export root every postbuild step reads: a production build records it in
// <distDir>/export-detail.json (the export lands in out/); an e2e build exports into
// its dist dir itself and records nothing.
describe("paperExportDir", () => {
    it("reads the root a production build records", () => {
        const cwd = mkdtempSync(join(tmpdir(), "export-root-"));
        mkdirSync(join(cwd, ".next"));
        writeFileSync(join(cwd, ".next", "export-detail.json"), JSON.stringify({ outDirectory: join(cwd, "out") }));
        expect(paperExportDir(cwd, ".next")).toBe(resolve(cwd, "out"));
    });

    it("is the dist dir itself when the export landed there and nothing is recorded", () => {
        const cwd = mkdtempSync(join(tmpdir(), "export-root-"));
        mkdirSync(join(cwd, ".next-e2e"));
        writeFileSync(join(cwd, ".next-e2e", "index.html"), "<!DOCTYPE html>");
        expect(paperExportDir(cwd, ".next-e2e")).toBe(join(cwd, ".next-e2e"));
    });

    it("refuses when there is no export at all", () => {
        const cwd = mkdtempSync(join(tmpdir(), "export-root-"));
        expect(() => paperExportDir(cwd, ".next")).toThrow(/run next build first/);
    });
});

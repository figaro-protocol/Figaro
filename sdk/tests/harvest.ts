/**
 * The one way a suite's harvest switch writes a committed fixture. The
 * harvest writes the bytes the SDK now produces, then compares them with the
 * bytes the file held before it wrote: unchanged, the run is a check like
 * any other; changed, the file is rewritten AND the run fails, naming the
 * file, so a harvest is never counted as a passing test while it moves a
 * fixture. The rewritten file is reviewed as a diff and committed on purpose.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";

export function writeHarvestedFixture(file: string, text: string): void {
    const before = existsSync(file) ? readFileSync(file, "utf8") : null;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    expect(text, `${file} was rewritten by the harvest: review its diff and commit it; this run is not a pass`).toBe(before);
}

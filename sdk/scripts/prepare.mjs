// prepare: build dist/ — but only where a build is possible. A `file:` install
// of a dist-only copy (no devDependencies) used to hit `rm -rf dist && tsc`,
// destroy the shipped dist, fail on the unresolvable `tsc`, and leave the
// package bricked (run-13/14 adopter probes, same trap twice). Resolve the
// compiler FIRST: absent → keep the shipped dist and say so; present → build,
// propagating the real exit code so genuine build failures still fail.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
try {
    require.resolve("typescript");
} catch {
    console.warn("[sdk] prepare: typescript is not installed here — keeping the shipped dist/ as-is.");
    process.exit(0);
}

const r = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);

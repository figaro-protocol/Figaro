#!/usr/bin/env node
// check-release-revision.mjs — the tree in hand builds what the release
// revision builds.
//
// The release is one line of work: every bench runs once at the release
// revision, the verification key is built from the guest at that revision, and
// the stack is broadcast from it. This check ties each of those steps to the
// one revision. It holds when both of these hold:
//
//   1. the working tree is clean: `git status --porcelain` prints nothing;
//   2. `git diff --stat <release> HEAD` prints nothing over the paths the
//      contracts, the guest, their proofs and their build read (COMPARED).
//
// It refuses a release revision that is not a full 40-character sha, and one
// the checkout does not carry. A missing revision is a refusal, never a skip.
//
//   node scripts/check-release-revision.mjs <release sha>
//   RELEASE_COMMIT=<release sha> node scripts/check-release-revision.mjs
//
// It prints the release sha, HEAD's sha and the paths compared, then either
// `RELEASE-REVISION-HOLDS` or what does not hold. Exit 0 when it holds, 1
// otherwise. The deploy wrappers, the fork rehearsal and the prover box's key
// build run it first. scripts/test-check-release-revision.mjs holds its
// behavior.

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The paths whose bytes decide the deployed code and the guest key. `src`,
 *  `prover`, `certora`, `formal`, `test` and `script` are the release's code,
 *  its guest and its proofs; `lib`, `foundry.toml` and `remappings.txt` are
 *  what the compiler reads beside them, so a dependency or a compiler setting
 *  moved after the release changes the bytecode too. `scripts/prover-box` is
 *  the recipe the guest and its key are built by: a recipe edited after the
 *  release builds another key from the same sources. */
export const COMPARED = ["src", "prover", "certora", "formal", "test", "script", "lib", "foundry.toml", "remappings.txt", "scripts/prover-box"];

function git(cwd, args) {
    const run = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { code: run.status ?? 1, out: (run.stdout ?? "").trimEnd(), err: (run.stderr ?? "").trim() };
}

/**
 * Check the checkout at `repo` against the release revision `release`.
 * `requireClean: false` drops the first condition: scripts/check-deployment.mjs
 * reports a record's revision that way, since it compares the code itself.
 * @returns {{ holds: boolean, release: string, head: string|null, compared: string[], problems: string[] }}
 */
export function checkReleaseRevision({ repo, release, requireClean = true }) {
    const problems = [];
    const result = { holds: false, release: release ?? "", head: null, compared: COMPARED, problems };
    if (!release) {
        problems.push("no release revision: pass the full sha as the first argument or as RELEASE_COMMIT");
        return result;
    }
    if (!/^[0-9a-f]{40}$/.test(release)) {
        problems.push(`the release revision must be a full 40-character lowercase sha, not "${release}"`);
        return result;
    }
    const head = git(repo, ["rev-parse", "HEAD"]);
    if (head.code !== 0) {
        problems.push(`${repo} is not a git checkout: ${head.err}`);
        return result;
    }
    result.head = head.out;
    if (git(repo, ["cat-file", "-e", `${release}^{commit}`]).code !== 0) {
        problems.push(`this checkout does not carry the commit ${release}; fetch it first`);
        return result;
    }
    if (requireClean) {
        const status = git(repo, ["status", "--porcelain"]);
        if (status.code !== 0) problems.push(`git status failed: ${status.err}`);
        else if (status.out) problems.push(`the working tree is not clean:\n${status.out}`);
    }
    const diff = git(repo, ["diff", "--stat", release, "HEAD", "--", ...COMPARED]);
    if (diff.code !== 0) problems.push(`git diff failed: ${diff.err}`);
    else if (diff.out) problems.push(`HEAD differs from the release revision in the compared paths:\n${diff.out}`);
    result.holds = problems.length === 0;
    return result;
}

function main() {
    const release = process.argv[2] ?? process.env.RELEASE_COMMIT ?? "";
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const r = checkReleaseRevision({ repo, release });
    console.log(`release revision: ${r.release || "(none)"}`);
    console.log(`HEAD:             ${r.head ?? "(unread)"}`);
    console.log(`paths compared:   ${r.compared.join(" ")}`);
    if (r.holds) {
        console.log("RELEASE-REVISION-HOLDS");
        return;
    }
    console.log("❌ the release revision does not hold:");
    for (const p of r.problems) console.log(`   - ${p.replace(/\n/g, "\n     ")}`);
    process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env node
// The behavior of scripts/check-release-revision.mjs, against a throwaway
// repository on disk (no network, no chain).
//
//   node --test scripts/test-check-release-revision.mjs
//
// Cases: HEAD at the release revision holds; a later commit outside the
// compared paths holds; a later commit under a compared path fails, naming
// the file; a dirty tree fails, an untracked file included; no revision, an
// abbreviated one and one the checkout lacks each refuse; the command prints
// both shas and the paths compared, and exits 1 on a refusal.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkReleaseRevision, COMPARED } from "./check-release-revision.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-release-revision.mjs");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

function git(repo, ...args) {
    const run = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", env: ENV });
    if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
}

function write(repo, file, text) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
}

function commit(repo, file, text) {
    write(repo, file, text);
    git(repo, "add", file);
    git(repo, "commit", "--quiet", "-m", `change ${file}`);
    return git(repo, "rev-parse", "HEAD");
}

/** A repository whose first commit carries a file under each compared path. */
function fixture() {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "release-revision-"));
    git(repo, "init", "--quiet");
    for (const p of COMPARED) write(repo, p.includes(".") ? p : `${p}/a.txt`, "release\n");
    write(repo, "docs/a.md", "release\n");
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "release");
    return { repo, release: git(repo, "rev-parse", "HEAD") };
}

test("HEAD at the release revision holds", () => {
    const { repo, release } = fixture();
    const r = checkReleaseRevision({ repo, release });
    assert.deepEqual(r.problems, []);
    assert.equal(r.holds, true);
    assert.equal(r.head, release);
});

test("a later commit outside the compared paths holds", () => {
    const { repo, release } = fixture();
    const head = commit(repo, "docs/a.md", "later\n");
    const r = checkReleaseRevision({ repo, release });
    assert.equal(r.holds, true);
    assert.equal(r.head, head);
    assert.notEqual(r.head, release);
});

for (const p of ["src/a.txt", "prover/a.txt", "certora/a.txt", "formal/a.txt", "test/a.txt", "script/a.txt", "foundry.toml", "scripts/prover-box/a.txt"]) {
    test(`a later commit to ${p} fails, naming the file`, () => {
        const { repo, release } = fixture();
        commit(repo, p, "later\n");
        const r = checkReleaseRevision({ repo, release });
        assert.equal(r.holds, false);
        assert.match(r.problems.join("\n"), new RegExp(p.replace(".", "\\.")));
    });
}

test("a modified tracked file fails, outside the compared paths too", () => {
    const { repo, release } = fixture();
    write(repo, "docs/a.md", "dirty\n");
    const r = checkReleaseRevision({ repo, release });
    assert.equal(r.holds, false);
    assert.match(r.problems.join("\n"), /not clean/);
});

test("an untracked file fails", () => {
    const { repo, release } = fixture();
    write(repo, "src/new.txt", "new\n");
    const r = checkReleaseRevision({ repo, release });
    assert.equal(r.holds, false);
    assert.match(r.problems.join("\n"), /src\/new\.txt/);
});

test("requireClean: false reports the revision on a dirty tree, and still fails a moved path", () => {
    const { repo, release } = fixture();
    write(repo, "docs/a.md", "dirty\n");
    assert.equal(checkReleaseRevision({ repo, release, requireClean: false }).holds, true);
    commit(repo, "src/a.txt", "later\n");
    assert.equal(checkReleaseRevision({ repo, release, requireClean: false }).holds, false);
});

test("no revision, an abbreviated one and one the checkout lacks each refuse", () => {
    const { repo, release } = fixture();
    assert.match(checkReleaseRevision({ repo, release: "" }).problems[0], /no release revision/);
    assert.match(checkReleaseRevision({ repo, release: release.slice(0, 12) }).problems[0], /full 40-character/);
    assert.match(checkReleaseRevision({ repo, release: release.toUpperCase() }).problems[0], /full 40-character/);
    assert.match(checkReleaseRevision({ repo, release: "0".repeat(40) }).problems[0], /does not carry/);
});

test("the command prints both shas and the paths, and exits 1 on a refusal", () => {
    // The command checks its own repository; it is run here for its output and
    // exit code only, with a revision no checkout carries.
    const run = spawnSync(process.execPath, [SCRIPT, "f".repeat(40)], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stdout, new RegExp(`release revision: ${"f".repeat(40)}`));
    assert.match(run.stdout, /HEAD: +[0-9a-f]{40}/);
    assert.match(run.stdout, new RegExp(`paths compared: +${COMPARED.join(" ")}`));
    const none = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, RELEASE_COMMIT: "" } });
    assert.equal(none.status, 1);
    assert.match(none.stdout, /no release revision/);
});

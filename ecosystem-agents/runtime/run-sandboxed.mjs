#!/usr/bin/env node
/**
 * run-sandboxed — the sandbox wrapper (component 4, F5/F6).
 *
 *   run-sandboxed.mjs --policy <policy.json> --workspace <dir> \
 *     [--signer-socket <path>] [--deny-read <path>]... -- <cmd> [args...]
 *
 * Launches <cmd> with the three structural boundaries prose cannot enforce:
 *   1. NETWORK — the OS profile denies all outbound except loopback; the
 *      policy-driven egress proxy (started here, OUTSIDE the sandbox) is the
 *      only way out, and it forwards only to the policy's `egress` hosts.
 *   2. WRITES — only the workspace and temp dirs.
 *   3. SECRETS — the launcher scrubs the child's environment of anything
 *      key-shaped and marks the named secret paths unreadable; the signing
 *      key itself never was in reach (the policy signer holds it).
 *
 * macOS: sandbox-exec with sandbox-macos.sb. Linux: run the same launcher
 * inside a container with equivalent mounts — the README's variant; this
 * script refuses rather than pretending.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePolicy } from "@figaro/sdk/signer";
import { startEgressProxy } from "./egress-proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fail(message) {
    console.error(`run-sandboxed: ${message}`);
    process.exit(1);
}

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0 || sep === argv.length - 1) {
    fail("usage: run-sandboxed --policy <file> --workspace <dir> [--signer-socket <path>] [--deny-read <path>]... -- <cmd> [args...]");
}
const opts = argv.slice(0, sep);
const command = argv.slice(sep + 1);

function opt(name) {
    const i = opts.indexOf(`--${name}`);
    return i >= 0 ? opts[i + 1] : undefined;
}
function optAll(name) {
    const out = [];
    for (let i = 0; i < opts.length - 1; i++) {
        if (opts[i] === `--${name}`) out.push(opts[i + 1]);
    }
    return out;
}

const policyPath = opt("policy") ?? fail("--policy <file> is required");
const workspace = path.resolve(opt("workspace") ?? fail("--workspace <dir> is required"));
const signerSocket = opt("signer-socket") ?? path.join(os.tmpdir(), "figaro-signer.sock");
const extraDenies = optAll("deny-read");

if (process.platform !== "darwin") {
    fail("this launcher wraps sandbox-exec (macOS). On Linux, run inside a container with equivalent mounts — see README § 'The Linux variant'.");
}

const policyResult = validatePolicy(JSON.parse(fs.readFileSync(policyPath, "utf-8")));
if (!policyResult.ok) fail(`policy refused:\n  ${policyResult.errors.join("\n  ")}`);
const policy = policyResult.policy;

fs.mkdirSync(workspace, { recursive: true });

// ── Environment: scrubbed, then pointed at the proxy ───────────────────────
// Anything key-shaped is dropped rather than filtered by name — a secret the
// scrub misses is a bug, so the pattern is deliberately broad.

const SECRET_ENV = /KEY|SECRET|TOKEN|JWT|PASSPHRASE|MNEMONIC|PRIVATE/i;
function scrubbedEnv(extra) {
    const env = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (SECRET_ENV.test(k)) continue;
        env[k] = v;
    }
    return { ...env, ...extra };
}

// ── The default unreadable paths (plus any --deny-read) ────────────────────

const home = os.homedir();
// The kernel matches CANONICAL paths (/var is a symlink to /private/var on
// macOS) — an uncanonicalized deny silently matches nothing.
const canonical = (p) => {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
};
const denyReads = [
    ...extraDenies,
    path.join(home, ".figaro-deploy.env"),
    path.join(home, ".ssh"),
].map(canonical);
// The profile takes exactly three deny params; collapse extras into the
// nearest common directories rather than silently dropping any.
while (denyReads.length > 3) {
    const last = denyReads.pop();
    denyReads[denyReads.length - 1] = path.dirname(path.resolve(last));
}
while (denyReads.length < 3) denyReads.push(denyReads[denyReads.length - 1]);

// ── Launch ─────────────────────────────────────────────────────────────────

const proxy = await startEgressProxy({ policy, port: 0 });
console.error(`run-sandboxed: egress proxy on 127.0.0.1:${proxy.port} — allowed hosts from ${policyPath}`);

const profile = path.join(__dirname, "sandbox-macos.sb");
const child = spawn("sandbox-exec", [
    "-f", profile,
    "-D", `WORKSPACE=${workspace}`,
    "-D", `TMPDIR=${fs.realpathSync(os.tmpdir())}`,
    "-D", `SIGNER_SOCKET=${signerSocket}`,
    "-D", `DENY_READ_A=${denyReads[0]}`,
    "-D", `DENY_READ_B=${denyReads[1]}`,
    "-D", `DENY_READ_C=${denyReads[2]}`,
    ...command,
], {
    cwd: workspace,
    stdio: "inherit",
    env: scrubbedEnv({
        HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
        HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
        NODE_OPTIONS: `--import ${path.join(__dirname, "proxy-bootstrap.mjs")}`,
        FIGARO_SIGNER_SOCKET: signerSocket,
    }),
});

child.on("exit", async (code, signal) => {
    await proxy.close();
    process.exit(signal ? 1 : code ?? 1);
});

#!/usr/bin/env node
/**
 * run-sandboxed — the sandbox wrapper (component 4, F5/F6).
 *
 *   run-sandboxed.mjs --policy <policy.json> --workspace <dir> \
 *     [--signer-socket <path>] [--keystore <path>] [--deny-read <path>]... \
 *     [--allow-read <path>]... -- <cmd> [args...]
 *
 * Launches <cmd> with the three structural boundaries prose cannot enforce:
 *   1. NETWORK — the OS profile denies all outbound except the egress
 *      proxy's one loopback port; the policy-driven proxy (started here,
 *      OUTSIDE the sandbox) is the only way out, and it forwards only to the
 *      policy's `egress` origins (host, port and scheme).
 *   2. WRITES — only the workspace and temp dirs, and never the signer's own
 *      directory (its socket, spend journal and audit log), which must be
 *      a directory apart from both.
 *   3. SECRETS — the launcher scrubs the child's environment of anything
 *      key-shaped (by name, and by a credential inside a URL value) and makes
 *      the secret paths unreadable BY DEFAULT — keystores, credentials, shell
 *      histories (sandboxProfile.mjs § DEFAULT_DENY_READ), the --keystore
 *      the signer decrypts, any `*keystore*.json` under the home directory,
 *      and every --deny-read; --allow-read opens one default. The signing
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
import { resolveSignerPaths, validatePolicy } from "@figaro-protocol/sdk/signer";
import { startEgressProxy } from "./egress-proxy.mjs";
import { applyAllowReads, canonical, defaultDenyReads, renderProfile, scrubEnv } from "./sandboxProfile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fail(message) {
    console.error(`run-sandboxed: ${message}`);
    process.exit(1);
}

// ── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0 || sep === argv.length - 1) {
    fail("usage: run-sandboxed --policy <file> --workspace <dir> [--signer-socket <path>] [--keystore <path>] [--deny-read <path>]... [--allow-read <path>]... -- <cmd> [args...]  (the signer's socket defaults to ~/.figaro-signer/signer.sock)");
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
const signerSocketArg = path.resolve(
    opt("signer-socket") ?? resolveSignerPaths({}, os.homedir()).socketPath,
);
const keystore = opt("keystore");
const extraDenies = optAll("deny-read");
const allowReads = optAll("allow-read");

if (process.platform !== "darwin") {
    fail("this launcher wraps sandbox-exec (macOS). On Linux, run inside a container with equivalent mounts — see README § 'The Linux variant'.");
}

const policyResult = validatePolicy(JSON.parse(fs.readFileSync(policyPath, "utf-8")));
if (!policyResult.ok) fail(`policy refused:\n  ${policyResult.errors.join("\n  ")}`);
const policy = policyResult.policy;

fs.mkdirSync(workspace, { recursive: true });

// ── The unreadable paths: the defaults, minus --allow-read, plus the rest ──
// Deny by default: a secret the operator forgot to name is unreadable all the
// same. Every path gets its own rule — none is collapsed into a parent.

const home = os.homedir();
const allowed = applyAllowReads(defaultDenyReads(home), allowReads);
if (allowed.unknown.length > 0) {
    fail(`--allow-read opens a default unreadable path, and these are not on the list: ${allowed.unknown.join(", ")} (the list: sandboxProfile.mjs § DEFAULT_DENY_READ)`);
}
const denyReads = [
    ...allowed.denies,
    ...(keystore ? [keystore] : []),
    ...extraDenies,
].map(canonical);

// ── The signer's directory: connectable, never writable ───────────────────
// The spend journal and the audit log sit beside the socket. The profile
// denies writes to that directory and what is under it, matched by REAL path;
// it cannot protect the directory from a rename of a parent. So the
// directory must exist (start the signer first: a path that does not exist
// yet has no real path to match), and must be neither inside, nor contain, a
// directory the sandbox may write.

let signerDir;
try {
    signerDir = fs.realpathSync(path.dirname(signerSocketArg));
} catch {
    fail(`the signer's directory ${path.dirname(signerSocketArg)} does not exist — start the signer first`);
}
const signerSocket = path.join(signerDir, path.basename(signerSocketArg));
const tmpDir = canonical(os.tmpdir());
for (const writable of [canonical(workspace), tmpDir, canonical("/tmp")]) {
    const contains = (outer, inner) => inner === outer || inner.startsWith(outer + path.sep);
    if (contains(signerDir, writable) || contains(writable, signerDir)) {
        fail(`the signer's socket is in ${signerDir}, which is inside or contains a directory the sandbox may write (${writable}) — give the signer a directory of its own (default ~/.figaro-signer)`);
    }
}

// ── Launch ─────────────────────────────────────────────────────────────────

const proxy = await startEgressProxy({ policy, port: 0 });
console.error(`run-sandboxed: egress proxy on 127.0.0.1:${proxy.port} — allowed origins from ${policyPath}`);

// Environment: anything key-shaped is dropped — by name, or by a credential
// inside a URL value (sandboxProfile.mjs § valueCarriesUrlCredential) — then
// pointed at the proxy. NO_PROXY is emptied: the proxy's port is the only
// loopback port open, so a bypass would only fail.
const { env, scrubbed } = scrubEnv(process.env, {
    HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
    HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
    NO_PROXY: "",
    no_proxy: "",
    NODE_OPTIONS: `--import ${path.join(__dirname, "proxy-bootstrap.mjs")}`,
    FIGARO_SIGNER_SOCKET: signerSocket,
});
if (scrubbed.length > 0) console.error(`run-sandboxed: held back from the sandbox's environment: ${scrubbed.join(", ")}`);

const child = spawn("sandbox-exec", [
    "-p", renderProfile({ denyReads, home }),
    "-D", `WORKSPACE=${workspace}`,
    "-D", `TMPDIR=${tmpDir}`,
    "-D", `SIGNER_SOCKET=${signerSocket}`,
    "-D", `SIGNER_DIR=${signerDir}`,
    "-D", `PROXY_PORT=${proxy.port}`,
    ...command,
], {
    cwd: workspace,
    stdio: "inherit",
    env,
});

child.on("exit", async (code, signal) => {
    await proxy.close();
    process.exit(signal ? 1 : code ?? 1);
});

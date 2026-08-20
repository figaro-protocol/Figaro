/**
 * The sandbox wrapper's boundaries, tested as DENY CASES — each test is an
 * escape attempt that must fail. The egress proxy's decisions are unit-
 * tested everywhere; the OS-profile cases run only where sandbox-exec
 * exists (macOS) and skip elsewhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedHosts, hostAllowed, startEgressProxy } from "../egress-proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(__dirname, "..", "sandbox-macos.sb");

const POLICY = {
    egress: ["https://ethereum-sepolia-rpc.publicnode.com", "https://ipfs.io", "http://127.0.0.1"],
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
};

// ── Egress proxy decisions ──────────────────────────────────────────────────

test("the allowlist derives hostnames from policy origins", () => {
    const hosts = allowedHosts(POLICY);
    assert.ok(hostAllowed(hosts, "ipfs.io"));
    assert.ok(hostAllowed(hosts, "ETHEREUM-SEPOLIA-RPC.PUBLICNODE.COM"));
    assert.ok(hostAllowed(hosts, "127.0.0.1"));
    assert.ok(!hostAllowed(hosts, "evil.example"));
    assert.ok(!hostAllowed(hosts, "publicnode.com"), "no suffix matching — exact hosts only");
});

test("the proxy refuses a CONNECT to a host off the allowlist, tunnels one on it", async () => {
    // A local echo target stands in for an allowed host (127.0.0.1 is on the
    // test policy's list).
    const echo = http.createServer((_req, res) => res.end("reached"));
    await new Promise((r) => echo.listen(0, "127.0.0.1", r));
    const denials = [];
    const proxy = await startEgressProxy({
        policy: POLICY, port: 0,
        onDecision: (d) => { if (!d.allowed) denials.push(d.host); },
    });

    const connectStatus = (host, port) => new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1", port: proxy.port, method: "CONNECT", path: `${host}:${port}`,
        });
        req.on("connect", (res, socket) => { socket.destroy(); resolve(res.statusCode); });
        req.on("error", reject);
        req.end();
    });

    assert.equal(await connectStatus("evil.example", 443), 403);
    assert.equal(await connectStatus("127.0.0.1", echo.address().port), 200);
    assert.deepEqual(denials, ["evil.example"]);

    await proxy.close();
    await new Promise((r) => echo.close(r));
});

// ── OS-profile deny cases (macOS only) ──────────────────────────────────────

const HAS_SANDBOX_EXEC = process.platform === "darwin" &&
    spawnSync("which", ["sandbox-exec"]).status === 0;

function sandboxed({ workspace, denyRead, cmd }) {
    const deny = denyRead ?? "/nonexistent-deny";
    return spawnSync("sandbox-exec", [
        "-f", PROFILE,
        "-D", `WORKSPACE=${workspace}`,
        "-D", `TMPDIR=${fs.realpathSync(os.tmpdir())}`,
        "-D", `SIGNER_SOCKET=${path.join(workspace, "signer.sock")}`,
        "-D", `DENY_READ_A=${deny}`,
        "-D", `DENY_READ_B=${deny}`,
        "-D", `DENY_READ_C=${deny}`,
        "/bin/sh", "-c", cmd,
    ], { encoding: "utf-8" });
}

test("a write outside the workspace is denied; inside, it lands", { skip: !HAS_SANDBOX_EXEC }, () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const outside = fs.mkdtempSync(path.join(os.homedir(), ".sbx-outside-"));
    try {
        const escape = sandboxed({ workspace, cmd: `echo pwned > ${outside}/x` });
        assert.notEqual(escape.status, 0, "write escaped the workspace");
        assert.ok(!fs.existsSync(`${outside}/x`));

        const inside = sandboxed({ workspace, cmd: `echo ok > ${workspace}/x` });
        assert.equal(inside.status, 0, inside.stderr);
        assert.equal(fs.readFileSync(`${workspace}/x`, "utf-8").trim(), "ok");
    } finally {
        fs.rmSync(outside, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("a named secret path is unreadable", { skip: !HAS_SANDBOX_EXEC }, () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const secretDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-secret-")));
    const secret = path.join(secretDir, "keystore.json");
    fs.writeFileSync(secret, "{}");
    try {
        const read = sandboxed({ workspace, denyRead: secretDir, cmd: `cat ${secret}` });
        assert.notEqual(read.status, 0, "secret was readable");
    } finally {
        fs.rmSync(secretDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("direct outbound network is denied; loopback is not", { skip: !HAS_SANDBOX_EXEC }, async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const local = http.createServer((_req, res) => res.end("loopback"));
    await new Promise((r) => local.listen(0, "127.0.0.1", r));
    try {
        // 1.1.1.1:443 — a reachable host on the open internet; the sandbox
        // must refuse the connection attempt itself.
        const direct = sandboxed({ workspace, cmd: "nc -z -G 3 1.1.1.1 443" });
        assert.notEqual(direct.status, 0, "outbound escaped the sandbox");

        const loop = sandboxed({ workspace, cmd: `nc -z 127.0.0.1 ${local.address().port}` });
        assert.equal(loop.status, 0, loop.stderr);
    } finally {
        await new Promise((r) => local.close(r));
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the launcher scrubs key-shaped environment variables", { skip: !HAS_SANDBOX_EXEC }, () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify({
        chainId: 11155111,
        verifyingContracts: ["0x1111111111111111111111111111111111111111"],
        contracts: { "0x1111111111111111111111111111111111111111": ["0xaaaaaaaa"] },
        token: "0x3333333333333333333333333333333333333333",
        ceilings: { perAction: "1", perPeriod: "1", periodSecs: 60 },
        egress: [], rpcUrl: "http://127.0.0.1:1",
    }));
    try {
        const out = execFileSync("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", policyFile, "--workspace", workspace,
            "--", "/bin/sh", "-c", "env",
        ], {
            encoding: "utf-8",
            env: { ...process.env, PRIVATE_KEY: "0xdead", PINATA_DAO_JWT: "j", MY_PASSPHRASE: "p" },
        });
        assert.ok(!out.includes("0xdead"), "PRIVATE_KEY leaked into the sandbox");
        assert.ok(!/PINATA_DAO_JWT|MY_PASSPHRASE/.test(out));
        assert.match(out, /HTTPS_PROXY=http:\/\/127\.0\.0\.1:\d+/);
        assert.match(out, /FIGARO_SIGNER_SOCKET=/);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

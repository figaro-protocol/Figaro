/**
 * The sandbox wrapper's boundaries, tested as DENY CASES — each test is an
 * escape attempt that must fail. The egress proxy's decisions are unit-
 * tested everywhere; the OS-profile cases run only where sandbox-exec
 * exists (macOS) and skip elsewhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
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

function sandboxArgs({ workspace, denyRead, signerDir, cmd }) {
    const deny = denyRead ?? "/nonexistent-deny";
    const signer = signerDir ?? `${workspace}-signer`;
    return [
        "-f", PROFILE,
        "-D", `WORKSPACE=${workspace}`,
        "-D", `TMPDIR=${fs.realpathSync(os.tmpdir())}`,
        "-D", `SIGNER_SOCKET=${path.join(signer, "signer.sock")}`,
        "-D", `SIGNER_DIR=${signer}`,
        "-D", `DENY_READ_A=${deny}`,
        "-D", `DENY_READ_B=${deny}`,
        "-D", `DENY_READ_C=${deny}`,
        "/bin/sh", "-c", cmd,
    ];
}

function sandboxed(opts) {
    return spawnSync("sandbox-exec", sandboxArgs(opts), { encoding: "utf-8" });
}

/** The same, without blocking this process: a stub signer served from here
 *  must answer while the sandboxed command runs. */
function sandboxedAsync(opts) {
    return new Promise((resolve) => {
        const child = spawn("sandbox-exec", sandboxArgs(opts));
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
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
    // The launcher requires the signer's directory to exist.
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    try {
        const out = execFileSync("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", policyFile, "--workspace", workspace,
            "--signer-socket", path.join(signerDir, "signer.sock"),
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
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the signer's directory is never writable; its socket stays connectable", { skip: !HAS_SANDBOX_EXEC }, async () => {
    // The spend journal bounds the period and the audit log is the owner's
    // record. Both sit beside the socket, in a directory the sandbox may not
    // write, under the home directory as the default is.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const signerDir = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-")));
    const socket = path.join(signerDir, "signer.sock");
    const journal = path.join(signerDir, "window.jsonl");
    const audit = path.join(signerDir, "audit.jsonl");
    const entry = '{"ts":1000,"token":"5000000","native":"0"}\n';
    fs.writeFileSync(journal, entry);
    fs.writeFileSync(audit, '{"allow":true}\n');
    const stub = net.createServer((c) => c.end("figaro-signer-stub\n"));
    await new Promise((r) => stub.listen(socket, r));
    const run = (cmd) => sandboxedAsync({ workspace, signerDir, cmd });
    try {
        const connect = await run(`nc -U ${socket} < /dev/null`);
        assert.equal(connect.status, 0, connect.stderr);
        assert.match(connect.stdout, /figaro-signer-stub/, "the socket did not cross the boundary");

        const escapes = {
            "append a negative entry": `echo '{"ts":1001,"token":"-5000000","native":"0"}' >> ${journal}`,
            "truncate the journal": `: > ${journal}`,
            "delete the journal": `rm -f ${journal}`,
            "replace the journal": `echo x > ${signerDir}/new && mv ${signerDir}/new ${journal}`,
            "rewrite the audit log": `: > ${audit}`,
            "delete the socket": `rm -f ${socket}`,
            "move the directory aside": `mv ${signerDir} ${signerDir}-moved`,
            "write through a hard link made in the workspace": `ln ${journal} ${workspace}/alias && echo x >> ${workspace}/alias`,
            "write through a symlink made in the workspace": `ln -s ${journal} ${workspace}/sym && echo x >> ${workspace}/sym`,
        };
        for (const [what, cmd] of Object.entries(escapes)) {
            const attempt = await run(cmd);
            assert.notEqual(attempt.status, 0, `${what}: the write landed`);
        }
        assert.equal(fs.readFileSync(journal, "utf-8"), entry, "the journal changed");
        assert.equal(fs.readFileSync(audit, "utf-8"), '{"allow":true}\n', "the audit log changed");
        assert.ok(fs.existsSync(socket), "the socket is absent");
        assert.ok(!fs.existsSync(`${signerDir}-moved`), "the directory moved");
    } finally {
        await new Promise((r) => stub.close(r));
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the launcher refuses a signer socket in a directory the sandbox may write", { skip: !HAS_SANDBOX_EXEC }, () => {
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
    const launch = (socket) => spawnSync("node", [
        path.join(__dirname, "..", "run-sandboxed.mjs"),
        "--policy", policyFile, "--workspace", workspace, "--signer-socket", socket,
        "--", "/bin/sh", "-c", "true",
    ], { encoding: "utf-8" });
    try {
        // A directory under a temp dir the sandbox may write: renaming the
        // parent takes the journal out from under the deny rule.
        const underTmp = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-signer-"));
        try {
            for (const socket of [
                path.join(os.tmpdir(), "figaro-signer.sock"),
                path.join(underTmp, "signer.sock"),
                path.join(workspace, "signer.sock"),
                // A directory that CONTAINS the workspace: denying it would
                // deny the workspace too.
                path.join(path.dirname(workspace), "signer.sock"),
            ]) {
                const refused = launch(socket);
                assert.notEqual(refused.status, 0, `${socket}: launched`);
                assert.match(refused.stderr, /directory of its own/, socket);
            }
        } finally {
            fs.rmSync(underTmp, { recursive: true, force: true });
        }
        // A directory that does not exist yet has no real path to deny.
        const missing = launch(path.join(os.homedir(), ".sbx-signer-missing", "signer.sock"));
        assert.notEqual(missing.status, 0, "launched on a missing signer directory");
        assert.match(missing.stderr, /start the signer first/);
        // A directory of the signer's own, under the home directory, launches.
        const own = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
        try {
            const ok = launch(path.join(own, "signer.sock"));
            assert.equal(ok.status, 0, ok.stderr);
        } finally {
            fs.rmSync(own, { recursive: true, force: true });
        }
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("an outside process cannot be signalled from the sandbox; the agent's own children can", { skip: !HAS_SANDBOX_EXEC }, async () => {
    // The signer daemon runs outside. An agent that could kill it could force
    // a restart, or deny the owner every signature.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const victim = spawn("sleep", ["30"]);
    try {
        const kill = sandboxed({ workspace, cmd: `kill -9 ${victim.pid}` });
        assert.notEqual(kill.status, 0, "the signal reached an outside process");
        assert.equal(victim.exitCode, null);
        assert.equal(victim.signalCode, null);
        const own = sandboxed({ workspace, cmd: "sleep 5 & kill $! && echo ok" });
        assert.equal(own.status, 0, own.stderr);
    } finally {
        victim.kill();
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

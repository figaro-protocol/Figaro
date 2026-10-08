/**
 * The sandbox wrapper's boundaries, tested as DENY CASES — each test is an
 * escape attempt that must fail. The egress proxy's decisions are unit-
 * tested everywhere; the OS-profile cases run only where sandbox-exec
 * exists (macOS) and skip elsewhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedOrigins, originAllowed, startEgressProxy } from "../egress-proxy.mjs";
import {
    applyAllowReads, canonical, defaultDenyReads, renderProfile, scrubEnv, valueCarriesUrlCredential,
} from "../sandboxProfile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLICY = {
    egress: ["https://ethereum-sepolia-rpc.publicnode.com", "https://ipfs.io", "http://127.0.0.1"],
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
};

// ── Egress proxy decisions ──────────────────────────────────────────────────

test("the allowlist derives host, port and scheme from policy origins", () => {
    const origins = allowedOrigins(POLICY);
    assert.ok(originAllowed(origins, { host: "ipfs.io", port: 443 }));
    assert.ok(originAllowed(origins, { host: "ETHEREUM-SEPOLIA-RPC.PUBLICNODE.COM", port: 443 }));
    assert.ok(originAllowed(origins, { host: "127.0.0.1", port: 80, protocol: "http:" }));
    assert.ok(!originAllowed(origins, { host: "evil.example", port: 443 }));
    assert.ok(!originAllowed(origins, { host: "publicnode.com", port: 443 }), "no suffix matching — exact hosts only");
    // The port is part of the origin: an allowed host on another port is not.
    assert.ok(!originAllowed(origins, { host: "ipfs.io", port: 22 }));
    assert.ok(!originAllowed(origins, { host: "127.0.0.1", port: 8545 }));
    // A host listed as https: is never reached in the clear.
    assert.ok(!originAllowed(origins, { host: "ipfs.io", port: 443, protocol: "http:" }));
    assert.ok(!originAllowed(origins, { host: "ipfs.io", port: 80, protocol: "http:" }));
    // An explicit port, and a bare host (TLS on 443 unless given).
    const more = allowedOrigins({ egress: ["http://127.0.0.1:8545", "api.example", "grpc.example:5556"] });
    assert.ok(originAllowed(more, { host: "127.0.0.1", port: 8545, protocol: "http:" }));
    assert.ok(originAllowed(more, { host: "api.example", port: 443 }));
    assert.ok(!originAllowed(more, { host: "api.example", port: 80 }));
    assert.ok(originAllowed(more, { host: "grpc.example", port: 5556 }));
});

test("the proxy refuses a CONNECT off the allowlist or on another port, tunnels one on it", async () => {
    // A local echo target stands in for an allowed origin.
    const echo = http.createServer((_req, res) => res.end("reached"));
    await new Promise((r) => echo.listen(0, "127.0.0.1", r));
    const denials = [];
    const proxy = await startEgressProxy({
        policy: { egress: [`http://127.0.0.1:${echo.address().port}`], rpcUrl: "https://ipfs.io" }, port: 0,
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
    assert.equal(await connectStatus("127.0.0.1", 22), 403, "an allowed host on another port");
    assert.equal(await connectStatus("ipfs.io", 8080), 403, "an allowed host on another port");
    assert.deepEqual(denials, ["evil.example:443", "127.0.0.1:22", "ipfs.io:8080"]);

    await proxy.close();
    await new Promise((r) => echo.close(r));
});

test("absolute-URI forwarding refuses every scheme but http: cleanly, and checks the port", async () => {
    // An https:/ftp: absolute URI to an ALLOWED host once threw inside the
    // request handler and took the launcher down; it is a refusal now, and
    // the proxy keeps answering.
    const echo = http.createServer((_req, res) => res.end("reached"));
    await new Promise((r) => echo.listen(0, "127.0.0.1", r));
    const port = echo.address().port;
    const proxy = await startEgressProxy({
        policy: { egress: [`http://127.0.0.1:${port}`, "https://ipfs.io"], rpcUrl: "https://ipfs.io" }, port: 0,
    });
    const forward = (target) => new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port: proxy.port, method: "GET", path: target }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end();
    });
    try {
        assert.equal((await forward("https://ipfs.io/")).status, 400);
        assert.equal((await forward("ftp://ipfs.io/")).status, 400);
        assert.equal((await forward(`https://127.0.0.1:${port}/`)).status, 400);
        assert.equal((await forward("http://ipfs.io/")).status, 403, "plain http to a host listed as https:");
        assert.equal((await forward("http://127.0.0.1:1/")).status, 403, "an allowed host on another port");
        const ok = await forward(`http://127.0.0.1:${port}/`);
        assert.equal(ok.status, 200);
        assert.equal(ok.body, "reached", "the proxy still answers after every refusal");
    } finally {
        await proxy.close();
        await new Promise((r) => echo.close(r));
    }
});

// ── The launcher's pure decisions ───────────────────────────────────────────

test("the environment scrub drops secret-shaped names and URL-embedded credentials", () => {
    const { env, scrubbed } = scrubEnv({
        PRIVATE_KEY: "0xdead",
        DB_PASSWORD: "p",
        GH_AUTH: "a",
        MY_CREDENTIALS: "c",
        SITE_COOKIE: "k",
        RPC_URL: "https://eth-sepolia.g.alchemy.com/v2/AbCdEfGh1234567890ijklMN",
        INFURA: "https://sepolia.infura.io/v3/0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgres://user:hunter2@db.example:5432/app",
        GATEWAYS: "https://ipfs.io,https://gw.example/?apikey=abc",
        PUBLIC_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
        DEPLOYMENT_RECORD: "/home/u/deployments/11155111.json",
        IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
        PATH: "/usr/bin:/bin",
    }, { HTTPS_PROXY: "http://127.0.0.1:9" });
    assert.deepEqual(scrubbed, [
        "DATABASE_URL", "DB_PASSWORD", "GATEWAYS", "GH_AUTH", "INFURA", "MY_CREDENTIALS",
        "PRIVATE_KEY", "RPC_URL", "SITE_COOKIE",
    ]);
    assert.deepEqual(Object.keys(env).sort(), ["DEPLOYMENT_RECORD", "HTTPS_PROXY", "IPFS_GATEWAY_URL", "PATH", "PUBLIC_RPC"]);
    assert.equal(valueCarriesUrlCredential("https://quick.example.quiknode.pro/a1b2c3d4e5f6a7b8c9d0e1f2/"), true);
    assert.equal(valueCarriesUrlCredential("not a url"), false);
});

test("--allow-read opens exactly a default unreadable path, and names one that is not", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-home-"));
    try {
        const defaults = defaultDenyReads(home);
        const root = canonical(home);
        for (const rel of [".ssh", ".aws", ".config/gh", ".gnupg", ".npmrc", ".zsh_history", ".bash_history", ".foundry/keystores"]) {
            assert.ok(defaults.includes(path.join(root, rel)), `${rel} is unreadable by default`);
        }
        const opened = applyAllowReads(defaults, [path.join(home, ".npmrc")]);
        assert.ok(!opened.denies.includes(path.join(root, ".npmrc")));
        assert.equal(opened.denies.length, defaults.length - 1);
        assert.deepEqual(applyAllowReads(defaults, ["/etc/hosts"]).unknown, [canonical("/etc/hosts")]);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

// ── OS-profile deny cases (macOS only) ──────────────────────────────────────

const HAS_SANDBOX_EXEC = process.platform === "darwin" &&
    spawnSync("which", ["sandbox-exec"]).status === 0;

/** The profile exactly as the launcher renders it (sandboxProfile.mjs). */
function sandboxArgs({ workspace, denyRead, signerDir, proxyPort, cmd }) {
    const signer = signerDir ?? `${workspace}-signer`;
    return [
        "-p", renderProfile({ denyReads: denyRead ? [denyRead] : [] }),
        "-D", `WORKSPACE=${workspace}`,
        "-D", `TMPDIR=${fs.realpathSync(os.tmpdir())}`,
        "-D", `SIGNER_SOCKET=${path.join(signer, "signer.sock")}`,
        "-D", `SIGNER_DIR=${signer}`,
        "-D", `PROXY_PORT=${proxyPort ?? 1}`,
        "/bin/sh", "-c", cmd,
    ];
}

const SBX_POLICY = {
    chainId: 11155111,
    verifyingContracts: ["0x1111111111111111111111111111111111111111"],
    contracts: { "0x1111111111111111111111111111111111111111": ["0xaaaaaaaa"] },
    token: "0x3333333333333333333333333333333333333333",
    ceilings: { perAction: "1", perPeriod: "1", periodSecs: 60 },
    egress: [], rpcUrl: "http://127.0.0.1:1",
};

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

test("direct outbound network is denied, and so is every loopback port but the proxy's", { skip: !HAS_SANDBOX_EXEC }, async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    // One loopback listener stands in for the egress proxy; the other for
    // what else listens on a host — a local IPFS API, a devnet, a proxy that
    // forwards anywhere. Only the first is a way out.
    const proxy = http.createServer((_req, res) => res.end("proxy"));
    const other = http.createServer((_req, res) => res.end("other"));
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    await new Promise((r) => other.listen(0, "127.0.0.1", r));
    const proxyPort = proxy.address().port;
    try {
        // 1.1.1.1:443 — a reachable host on the open internet; the sandbox
        // must refuse the connection attempt itself.
        const direct = sandboxed({ workspace, proxyPort, cmd: "nc -z -G 3 1.1.1.1 443" });
        assert.notEqual(direct.status, 0, "outbound escaped the sandbox");

        const loop = sandboxed({ workspace, proxyPort, cmd: `nc -z 127.0.0.1 ${other.address().port}` });
        assert.notEqual(loop.status, 0, "a loopback service other than the proxy was reachable");

        const toProxy = sandboxed({ workspace, proxyPort, cmd: `nc -z 127.0.0.1 ${proxyPort}` });
        assert.equal(toProxy.status, 0, toProxy.stderr);
    } finally {
        await new Promise((r) => proxy.close(r));
        await new Promise((r) => other.close(r));
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the launcher makes the secret paths unreadable BY DEFAULT; every --deny-read stands alone", { skip: !HAS_SANDBOX_EXEC }, () => {
    // A home directory of the test's own, holding what a real one holds.
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-home-")));
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify(SBX_POLICY));
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-opt-")));
    const put = (p, body = "secret") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
    const secrets = {
        aws: put(path.join(home, ".aws", "credentials")),
        gh: put(path.join(home, ".config", "gh", "hosts.yml")),
        gnupg: put(path.join(home, ".gnupg", "private-keys-v1.d", "k.key")),
        npmrc: put(path.join(home, ".npmrc")),
        zsh: put(path.join(home, ".zsh_history")),
        bash: put(path.join(home, ".bash_history")),
        ssh: put(path.join(home, ".ssh", "id_ed25519")),
        foundry: put(path.join(home, ".foundry", "keystores", "operator")),
        // The documented keystore path (sdk/README.md: ~/operator.keystore.json),
        // never named to the launcher.
        keystoreJson: put(path.join(home, "operator.keystore.json")),
        // A keystore outside the home directory, named with --keystore.
        named: put(path.join(elsewhere, "keys", "signer-key.json")),
        // Three --deny-read paths in one parent: each stands alone.
        a: put(path.join(elsewhere, "a", "x")),
        b: put(path.join(elsewhere, "b", "x")),
        c: put(path.join(elsewhere, "c", "x")),
    };
    const readable = {
        sibling: put(path.join(elsewhere, "d", "x"), "open"),
        homeFile: put(path.join(home, "notes.txt"), "open"),
    };
    const script = Object.entries({ ...secrets, ...readable })
        .map(([name, p]) => `if cat '${p}' >/dev/null 2>&1; then echo "READ ${name}"; else echo "DENIED ${name}"; fi`)
        .join("; ");
    const launch = (extra) => spawnSync("node", [
        path.join(__dirname, "..", "run-sandboxed.mjs"),
        "--policy", policyFile, "--workspace", workspace,
        "--signer-socket", path.join(signerDir, "signer.sock"),
        "--keystore", secrets.named,
        "--deny-read", path.join(elsewhere, "a"),
        "--deny-read", path.join(elsewhere, "b"),
        "--deny-read", path.join(elsewhere, "c"),
        ...extra,
        "--", "/bin/sh", "-c", script,
    ], { encoding: "utf-8", env: { ...process.env, HOME: home } });
    try {
        const run = launch([]);
        assert.equal(run.status, 0, run.stderr);
        for (const name of Object.keys(secrets)) assert.match(run.stdout, new RegExp(`^DENIED ${name}$`, "m"), `${name} was readable`);
        for (const name of Object.keys(readable)) assert.match(run.stdout, new RegExp(`^READ ${name}$`, "m"), `${name} was over-denied`);

        // --allow-read opens one default, and only that one.
        const opened = launch(["--allow-read", path.join(home, ".npmrc")]);
        assert.equal(opened.status, 0, opened.stderr);
        assert.match(opened.stdout, /^READ npmrc$/m);
        assert.match(opened.stdout, /^DENIED aws$/m);

        // An --allow-read that names no default is refused, never ignored.
        const refused = launch(["--allow-read", "/etc/hosts"]);
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /not on the list/);
    } finally {
        for (const d of [home, workspace, signerDir, elsewhere]) fs.rmSync(d, { recursive: true, force: true });
    }
});

test("the launcher scrubs key-shaped environment variables", { skip: !HAS_SANDBOX_EXEC }, () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify(SBX_POLICY));
    // The launcher requires the signer's directory to exist.
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    try {
        const run = spawnSync("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", policyFile, "--workspace", workspace,
            "--signer-socket", path.join(signerDir, "signer.sock"),
            "--", "/bin/sh", "-c", "env",
        ], {
            encoding: "utf-8",
            env: {
                ...process.env, PRIVATE_KEY: "0xdead", PINATA_DAO_JWT: "j", MY_PASSPHRASE: "p",
                DB_PASSWORD: "hunter2", GH_AUTH: "ghauth", AWS_CREDENTIALS: "awscred", SITE_COOKIE: "cookie",
                RPC_URL: "https://eth-sepolia.g.alchemy.com/v2/AbCdEfGh1234567890ijklMN",
                DATABASE_URL: "postgres://user:pw0rd@db.example:5432/app",
                PUBLIC_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
            },
        });
        assert.equal(run.status, 0, run.stderr);
        const out = run.stdout;
        assert.ok(!out.includes("0xdead"), "PRIVATE_KEY leaked into the sandbox");
        for (const leaked of ["PINATA_DAO_JWT", "MY_PASSPHRASE", "DB_PASSWORD", "GH_AUTH", "AWS_CREDENTIALS", "SITE_COOKIE", "RPC_URL", "DATABASE_URL"]) {
            assert.ok(!new RegExp(`^${leaked}=`, "m").test(out), `${leaked} crossed into the sandbox`);
        }
        for (const value of ["hunter2", "AbCdEfGh1234567890ijklMN", "pw0rd"]) assert.ok(!out.includes(value));
        assert.match(out, /^PUBLIC_RPC=https:\/\/ethereum-sepolia-rpc\.publicnode\.com$/m, "a credential-free URL crosses");
        // The launcher names what it held back — names only, never values.
        assert.match(run.stderr, /held back from the sandbox's environment: .*RPC_URL/);
        assert.ok(!run.stderr.includes("hunter2"));
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
    fs.writeFileSync(policyFile, JSON.stringify(SBX_POLICY));
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

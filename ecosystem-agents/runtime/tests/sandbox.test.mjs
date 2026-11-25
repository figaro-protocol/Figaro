/**
 * The sandbox wrapper's OS-profile boundaries on macOS, tested as DENY CASES —
 * each test is an escape attempt that must fail under `sandbox-exec`. The file
 * fails at once where `sandbox-exec` is absent: `npm test` does not select it,
 * and `npm run test:macos` runs it (sdk-ci.yml's macOS job). The egress
 * proxy's decisions and the rendered profile are tested on every platform in
 * sandboxPortable.test.mjs.
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
import { renderProfile } from "../sandboxProfile.mjs";
import { RPC_KEY, keyedRpcStub } from "./rpcStub.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── sandbox-exec, or the file fails ─────────────────────────────────────────

if (process.platform !== "darwin" || spawnSync("which", ["sandbox-exec"]).status !== 0) {
    throw new Error(`sandbox.test.mjs needs macOS sandbox-exec, which is not on this host (${process.platform}): run it on macOS (npm run test:macos)`);
}

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

test("a write outside the workspace is denied; inside, it lands", () => {
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

test("a named secret path is unreadable", () => {
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

test("a read nobody granted is denied; the system and the workspace stay readable", () => {
    const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-")));
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".sbx-unnamed-")));
    const unnamed = path.join(outside, "notes.txt");
    fs.writeFileSync(unnamed, "not secret, not granted");
    fs.writeFileSync(path.join(workspace, "w.txt"), "mine");
    try {
        const read = sandboxed({ workspace, cmd: `cat ${unnamed}` });
        assert.notEqual(read.status, 0, "an ungranted path outside the workspace was readable");
        const list = sandboxed({ workspace, cmd: `ls ${outside}` });
        assert.notEqual(list.status, 0, "an ungranted directory was listable");
        const own = sandboxed({ workspace, cmd: `cat ${workspace}/w.txt && cat /etc/hosts >/dev/null && /usr/bin/true` });
        assert.equal(own.status, 0, own.stderr);
    } finally {
        fs.rmSync(outside, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

/** A shell that is already sandboxed (an agent harness's own sandbox) restricts a nested
 *  sandbox-exec further: it cannot reach a loopback port the outer sandbox does not open.
 *  The probe runs the same `nc` under a permissive nested profile; when THAT cannot reach
 *  the port, the environment — not this profile — is what blocks it. */
function nestedLoopbackBlocked(port) {
    const probe = spawnSync("sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/nc", "-z", "127.0.0.1", String(port)], { encoding: "utf-8" });
    return probe.status !== 0;
}

test("direct outbound network is denied, and so is every loopback port but the proxy's", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    // One loopback listener stands in for the egress proxy; the other for
    // what else listens on a host — a local IPFS API, a devnet, a proxy that
    // forwards anywhere. Only the first is a way out.
    const proxy = http.createServer((_req, res) => res.end("proxy"));
    const other = http.createServer((_req, res) => res.end("other"));
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    await new Promise((r) => other.listen(0, "127.0.0.1", r));
    const proxyPort = proxy.address().port;
    if (nestedLoopbackBlocked(proxyPort)) {
        await new Promise((r) => proxy.close(r));
        await new Promise((r) => other.close(r));
        fs.rmSync(workspace, { recursive: true, force: true });
        throw new Error("the shell is already sandboxed: a nested sandbox-exec cannot reach the loopback port of the stand-in proxy even under a permissive profile, so this host cannot run the test; run it from a shell outside any sandbox");
    }
    try {
        // 1.1.1.1:443 — a reachable host on the open internet; the sandbox
        // must refuse the connection attempt itself.
        const direct = sandboxed({ workspace, proxyPort, cmd: "nc -z -G 3 1.1.1.1 443" });
        assert.notEqual(direct.status, 0, "outbound escaped the sandbox");

        const loop = sandboxed({ workspace, proxyPort, cmd: `nc -z 127.0.0.1 ${other.address().port}` });
        assert.notEqual(loop.status, 0, "a loopback service other than the proxy was reachable");

        // The kernel now and then refuses a connect to the port the profile
        // opens (EPERM; its log reads `Sandbox: nc deny(1) network-outbound
        // remote:*:<proxy port>`), about one connect in forty, alone or under
        // load, while the permissive probe above never is. One connect that
        // lands proves the profile opens the port; the denials above are
        // single attempts, and a spurious refusal only ever adds a deny.
        let toProxy;
        for (let attempt = 0; attempt < 5; attempt++) {
            toProxy = sandboxed({ workspace, proxyPort, cmd: `nc -vz -G 3 127.0.0.1 ${proxyPort}` });
            if (toProxy.status === 0) break;
        }
        assert.equal(toProxy.status, 0, toProxy.stderr);
    } finally {
        await new Promise((r) => proxy.close(r));
        await new Promise((r) => other.close(r));
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the launcher makes the secret paths unreadable BY DEFAULT; every --deny-read stands alone", () => {
    // A home directory of the test's own, holding what a real one holds, and
    // a directory beside it — both outside temp, which the sandbox may read.
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".sbx-home-")));
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify(SBX_POLICY));
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".sbx-opt-")));
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
    // Reads are denied by default: a path nobody granted is unreadable
    // whether or not anyone thought it secret.
    const ungranted = {
        sibling: put(path.join(elsewhere, "d", "x"), "open"),
        homeFile: put(path.join(home, "notes.txt"), "open"),
        // A keystore inside a granted directory stays a keystore.
        keystoreInGrant: put(path.join(home, "records", "wallet-keystore.json")),
    };
    const granted = {
        record: put(path.join(home, "records", "11155111.json"), "open"),
        workspaceFile: put(path.join(workspace, "in-workspace.txt"), "open"),
    };
    const script = Object.entries({ ...secrets, ...ungranted, ...granted })
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
        "--allow-read", path.join(home, "records"),
        ...extra,
        "--", "/bin/sh", "-c", script,
    ], { encoding: "utf-8", env: { ...process.env, HOME: home } });
    try {
        const run = launch([]);
        assert.equal(run.status, 0, run.stderr);
        for (const name of Object.keys(secrets)) assert.match(run.stdout, new RegExp(`^DENIED ${name}$`, "m"), `${name} was readable`);
        for (const name of Object.keys(ungranted)) assert.match(run.stdout, new RegExp(`^DENIED ${name}$`, "m"), `${name} was readable without a grant`);
        for (const name of Object.keys(granted)) assert.match(run.stdout, new RegExp(`^READ ${name}$`, "m"), `${name} was granted and still denied`);

        // --allow-read opens one default, and only that one.
        const opened = launch(["--allow-read", path.join(home, ".npmrc")]);
        assert.equal(opened.status, 0, opened.stderr);
        assert.match(opened.stdout, /^READ npmrc$/m);
        assert.match(opened.stdout, /^DENIED aws$/m);

        // A grant that would undo the default is refused, never widened.
        for (const broad of [home, "/", path.join(home, ".ssh", "known_hosts")]) {
            const refused = launch(["--allow-read", broad]);
            assert.notEqual(refused.status, 0, `${broad}: launched`);
            assert.match(refused.stderr, /--allow-read refused/, broad);
        }
    } finally {
        for (const d of [home, workspace, signerDir, elsewhere]) fs.rmSync(d, { recursive: true, force: true });
    }
});

test("the launcher scrubs key-shaped environment variables", () => {
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
                PROVIDER_URL: "https://eth-sepolia.g.alchemy.com/v2/AbCdEfGh1234567890ijklMN",
                DATABASE_URL: "postgres://user:pw0rd@db.example:5432/app",
                PUBLIC_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
            },
        });
        assert.equal(run.status, 0, run.stderr);
        const out = run.stdout;
        assert.ok(!out.includes("0xdead"), "PRIVATE_KEY leaked into the sandbox");
        for (const leaked of ["PINATA_DAO_JWT", "MY_PASSPHRASE", "DB_PASSWORD", "GH_AUTH", "AWS_CREDENTIALS", "SITE_COOKIE", "PROVIDER_URL", "DATABASE_URL"]) {
            assert.ok(!new RegExp(`^${leaked}=`, "m").test(out), `${leaked} crossed into the sandbox`);
        }
        for (const value of ["hunter2", "AbCdEfGh1234567890ijklMN", "pw0rd"]) assert.ok(!out.includes(value));
        assert.match(out, /^PUBLIC_RPC=https:\/\/ethereum-sepolia-rpc\.publicnode\.com$/m, "a credential-free URL crosses");
        // The launcher names what it held back — names only, never values.
        assert.match(run.stderr, /held back from the sandbox's environment: .*PROVIDER_URL/);
        assert.ok(!run.stderr.includes("hunter2"));
        assert.match(out, /HTTPS_PROXY=http:\/\/127\.0\.0\.1:\d+/);
        assert.match(out, /FIGARO_SIGNER_SOCKET=/);
    } finally {
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the launcher keeps keyed RPC endpoints outside and hands the agent the proxy's relays", async () => {
    const stub = await keyedRpcStub();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify({ ...SBX_POLICY, egress: [stub.origin] }));
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    // The agent reads RPC_URL and calls it from inside the sandbox, where the
    // stub's own port is closed: an answer can only have come through the relay.
    // The probe calls once: the kernel's intermittent EPERM on the proxy's
    // own port is the bootstrap's to retry (proxy-bootstrap.mjs).
    const probe = path.join(workspace, "probe.mjs");
    fs.writeFileSync(probe, [
        "const res = await fetch(process.env.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' },",
        "  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });",
        "console.log(`RPC_URL=${process.env.RPC_URL}`);",
        "console.log(`CHAIN=${(await res.json()).result}`);",
    ].join("\n"));
    const run = await new Promise((resolve) => {
        const child = spawn("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", policyFile, "--workspace", workspace,
            "--signer-socket", path.join(signerDir, "signer.sock"),
            "--", "/bin/sh", "-c", `env; node ${probe}`,
        ], { env: { ...process.env, RPC_URL: stub.keyedUrl, FIGARO_ANALYST_CROSSCHECK_RPC_URLS: `${stub.keyedUrl}, ${stub.keyedUrl}` } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    try {
        assert.equal(run.status, 0, run.stderr);
        assert.ok(!run.stdout.includes(RPC_KEY), "the key crossed into the sandbox");
        assert.ok(!run.stderr.includes(RPC_KEY), "the launcher printed the key");
        assert.match(run.stdout, /^RPC_URL=http:\/\/127\.0\.0\.1:(\d+)\/rpc\/0$/m);
        assert.match(run.stdout, /^FIGARO_ANALYST_CROSSCHECK_RPC_URLS=http:\/\/127\.0\.0\.1:\d+\/rpc\/1,http:\/\/127\.0\.0\.1:\d+\/rpc\/2$/m);
        assert.match(run.stdout, /^CHAIN=0xaa36a7$/m, "the relay did not answer inside the sandbox");
        assert.ok(stub.seen.includes(`/v3/${RPC_KEY}`), "the relay never reached the keyed path");
    } finally {
        await stub.close();
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }

    // An RPC_URL whose origin the policy does not name is refused at launch.
    const offList = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const offPolicy = path.join(offList, "policy.json");
    fs.writeFileSync(offPolicy, JSON.stringify(SBX_POLICY));
    const own = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    try {
        const refused = spawnSync("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", offPolicy, "--workspace", offList, "--signer-socket", path.join(own, "signer.sock"),
            "--", "/bin/sh", "-c", "true",
        ], { encoding: "utf-8", env: { ...process.env, RPC_URL: `https://rpc.example/v3/${RPC_KEY}` } });
        assert.notEqual(refused.status, 0);
        assert.match(refused.stderr, /not on the policy egress allowlist/);
        assert.ok(!refused.stderr.includes(RPC_KEY));
    } finally {
        fs.rmSync(own, { recursive: true, force: true });
        fs.rmSync(offList, { recursive: true, force: true });
    }
});

test("the analyst starts under the wrapper with keyed RPC endpoints, syncs through the relays, and serves", async () => {
    const stub = await keyedRpcStub();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify({ ...SBX_POLICY, egress: [stub.origin] }));
    const record = path.join(workspace, "deployment.json");
    fs.writeFileSync(record, JSON.stringify({ figaroCore: "0x1111111111111111111111111111111111111111", deploymentBlock: 0 }));
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    const free = net.createServer();
    await new Promise((r) => free.listen(0, "127.0.0.1", r));
    const analystPort = free.address().port;
    await new Promise((r) => free.close(r));

    const env = {
        ...process.env, RPC_URL: stub.keyedUrl, FIGARO_ANALYST_CROSSCHECK_RPC_URLS: stub.keyedUrl,
        DEPLOYMENT_RECORD: record, FIGARO_ANALYST_PORT: String(analystPort),
    };
    for (const name of ["IPFS_GATEWAY_URL", "FIGARO_AGREEMENTS_DIR", "FIGARO_ANALYST_FROM_BLOCK", "FIGARO_ANALYST_BEARER_FILE"]) delete env[name];
    // Detached: the launcher and the sandboxed analyst share one process
    // group, ended together below.
    const launcher = spawn("node", [
        path.join(__dirname, "..", "run-sandboxed.mjs"),
        "--policy", policyFile, "--workspace", workspace,
        "--signer-socket", path.join(signerDir, "signer.sock"),
        "--", process.execPath, path.join(__dirname, "..", "figaro-analyst.mjs"),
    ], { env, detached: true });
    let stderr = "";
    const listening = new Promise((resolve, reject) => {
        launcher.stderr.on("data", (c) => {
            stderr += c;
            if (/figaro-analyst: listening on/.test(stderr)) resolve();
        });
        launcher.on("exit", () => reject(new Error(`the analyst exited at start:\n${stderr}`)));
    });
    try {
        await listening;
        assert.ok(!stderr.includes(RPC_KEY), "the key was printed");
        assert.doesNotMatch(stderr, /missing env RPC_URL/);
        assert.ok(stub.seen.length > 0 && stub.seen.every((p) => p === `/v3/${RPC_KEY}`), "the sync did not go through the relays");
        const status = await new Promise((resolve, reject) => {
            http.get({ host: "127.0.0.1", port: analystPort, path: "/status" }, (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => resolve({ code: res.statusCode, body }));
            }).on("error", reject);
        });
        assert.equal(status.code, 200, status.body);
        // The bearer token's file lands in the workspace, the default path.
        assert.ok(fs.existsSync(path.join(workspace, "analyst.token")));
    } finally {
        try { process.kill(-launcher.pid, "SIGTERM"); } catch { /* already gone */ }
        await stub.close();
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("figaro-fetch under the wrapper: a file read nobody granted is refused promptly; a granted one and a gateway read on the allowlist are served, and absent content is named as absence", async () => {
    const rpc = await keyedRpcStub();
    const gatewaySeen = [];
    const ABSENT_CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
    const gateway = http.createServer((req, res) => {
        gatewaySeen.push(req.url);
        if (req.url.endsWith(ABSENT_CID)) { res.statusCode = 404; return res.end(); }
        res.end("granted-content");
    });
    await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
    const gatewayOrigin = `http://127.0.0.1:${gateway.address().port}`;
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-ws-"));
    const policyFile = path.join(workspace, "policy.json");
    fs.writeFileSync(policyFile, JSON.stringify({ ...SBX_POLICY, egress: [rpc.origin, gatewayOrigin] }));
    const signerDir = fs.mkdtempSync(path.join(os.homedir(), ".sbx-signer-"));
    // The deployment record sits outside every default grant: readable only by --allow-read.
    const recordDir = fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(), ".sbx-record-")));
    const record = path.join(recordDir, "deployment.json");
    fs.writeFileSync(record, JSON.stringify({ figaroCore: "0x2222222222222222222222222222222222222222", clauseRegistry: "0x1111111111111111111111111111111111111111", deploymentBlock: 0 }));
    const env = { ...process.env, RPC_URL: rpc.keyedUrl, IPFS_GATEWAY_URL: gatewayOrigin, DEPLOYMENT_RECORD: record };
    for (const name of ["IPFS_FALLBACK_GATEWAY_URL", "DEPLOYMENT_BLOCK"]) delete env[name];

    // A run past BOUND_MS is a hang: the launcher's process group is killed and the run fails.
    const BOUND_MS = 20_000;
    const fetchUnderWrapper = (launcherArgs, fetchArgs) => new Promise((resolve) => {
        const child = spawn("node", [
            path.join(__dirname, "..", "run-sandboxed.mjs"),
            "--policy", policyFile, "--workspace", workspace,
            "--signer-socket", path.join(signerDir, "signer.sock"), ...launcherArgs,
            "--", process.execPath, path.join(__dirname, "..", "figaro-fetch.mjs"), ...fetchArgs,
        ], { env, detached: true });
        let stdout = "";
        let stderr = "";
        let hung = false;
        const timer = setTimeout(() => { hung = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, BOUND_MS);
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr, hung }); });
    });
    const clauseKey = `0x${"11".repeat(32)}`;
    try {
        // A gateway read on the egress allowlist reaches the model framed.
        const cid = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
        const ipfs = await fetchUnderWrapper([], ["ipfs", cid]);
        assert.ok(!ipfs.hung, `figaro-fetch ipfs hung under the wrapper:\n${ipfs.stderr}`);
        assert.equal(ipfs.status, 0, ipfs.stderr);
        assert.match(ipfs.stdout, new RegExp(`^⟦FIGARO-DATA [0-9a-f]{24} source=ipfs cid=${cid} `));
        assert.match(ipfs.stdout, /\ngranted-content\n/);
        assert.deepEqual(gatewaySeen, [`/ipfs/${cid}`]);

        // Content no gateway holds is absence, named by what was asked for.
        const absent = await fetchUnderWrapper([], ["ipfs", ABSENT_CID]);
        assert.ok(!absent.hung, `figaro-fetch hung on absent content:\n${absent.stderr}`);
        assert.notEqual(absent.status, 0);
        assert.match(absent.stderr, new RegExp(`figaro-fetch: content \\S*${ABSENT_CID} is not published — absence, not an error`));

        // The deployment record nobody granted: refused at the read, before the chain is asked anything.
        const denied = await fetchUnderWrapper([], ["clause", clauseKey]);
        assert.ok(!denied.hung, `figaro-fetch hung on a read nobody granted:\n${denied.stderr}`);
        assert.notEqual(denied.status, 0);
        assert.match(denied.stderr, /figaro-fetch: EPERM: operation not permitted, open/);
        assert.deepEqual(rpc.seen, [], "the chain was read past a refused file read");

        // The same record granted by --allow-read: read, and the registries asked through the relay.
        const granted = await fetchUnderWrapper(["--allow-read", recordDir], ["clause", clauseKey]);
        assert.ok(!granted.hung, `figaro-fetch hung on a granted read:\n${granted.stderr}`);
        assert.doesNotMatch(granted.stderr, /EPERM/);
        assert.match(granted.stderr, new RegExp(`figaro-fetch: clause ${clauseKey} is not live on the registry`));
        assert.ok(rpc.seen.length > 0 && rpc.seen.every((p) => p === `/v3/${RPC_KEY}`), "the registries were not read through the relay");
    } finally {
        await rpc.close();
        await new Promise((r) => gateway.close(r));
        fs.rmSync(recordDir, { recursive: true, force: true });
        fs.rmSync(signerDir, { recursive: true, force: true });
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("the signer's directory is never writable; its socket stays connectable", async () => {
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

test("the launcher refuses a signer socket in a directory the sandbox may write", () => {
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

test("an outside process cannot be signalled from the sandbox; the agent's own children can", async () => {
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

/**
 * The sandbox wrapper's platform-independent half, tested as DENY CASES —
 * each test is an escape attempt that must fail: the egress proxy's decisions
 * and the profile the launcher renders. They run on every platform. The
 * OS-profile cases, which need macOS `sandbox-exec`, are in sandbox.test.mjs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedOrigin, egressOrigins, originAllowed, rpcRelayUrl, startEgressProxy } from "../egress-proxy.mjs";
import {
    applyAllowReads, canonical, defaultDenyReads, renderProfile, runtimeReadRoots, scrubEnv, valueCarriesUrlCredential,
} from "../sandboxProfile.mjs";
import { RPC_KEY, keyedRpcStub } from "./rpcStub.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLICY = {
    egress: ["https://ethereum-sepolia-rpc.publicnode.com", "https://ipfs.io", "http://127.0.0.1"],
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
};

// ── Egress proxy decisions ──────────────────────────────────────────────────

test("the allowlist derives host, port and scheme from policy origins", () => {
    const origins = egressOrigins(POLICY);
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
    const more = egressOrigins({ egress: ["http://127.0.0.1:8545", "api.example", "grpc.example:5556"] });
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

test("the proxy forwards to the allowlist entry's own host and port; the client supplies only path and query", async () => {
    const origins = egressOrigins({ egress: ["http://127.0.0.1:8545", "https://ipfs.io"] });
    const entry = allowedOrigin(origins, { host: "127.0.0.1", port: 8545, protocol: "http:" });
    assert.ok(origins.includes(entry), "the decision returns the policy's own entry");
    assert.equal(allowedOrigin(origins, { host: "127.0.0.1.evil.example", port: 8545, protocol: "http:" }), undefined);
    assert.equal(allowedOrigin(origins, { host: "ipfs.io", port: 443, protocol: "http:" }), undefined);

    const seen = [];
    const echo = http.createServer((req, res) => { seen.push({ url: req.url, host: req.headers.host }); res.end("reached"); });
    await new Promise((r) => echo.listen(0, "127.0.0.1", r));
    const port = echo.address().port;
    const proxy = await startEgressProxy({ policy: { egress: [`http://127.0.0.1:${port}`], rpcUrl: "https://ipfs.io" }, port: 0 });
    const forward = (target) => new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port: proxy.port, method: "GET", path: target }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end();
    });
    try {
        assert.equal(await forward(`http://127.0.0.1:${port}/a/b?c=1`), 200);
        assert.equal(await forward(`http://127.0.0.1.evil.example:${port}/`), 403);
        assert.equal(await forward(`http://user@evil.example:${port}/`), 403);
        assert.deepEqual(seen, [{ url: "/a/b?c=1", host: `127.0.0.1:${port}` }]);
    } finally {
        await proxy.close();
        await new Promise((r) => echo.close(r));
    }
});

/** The status a CONNECT through the proxy at `proxyPort` answers. */
function connectStatus(proxyPort, host, port) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port: proxyPort, method: "CONNECT", path: `${host}:${port}` });
        req.on("connect", (res, socket) => { socket.destroy(); resolve(res.statusCode); });
        req.on("error", reject);
        req.end();
    });
}

test("the proxy relays JSON-RPC to the keyed endpoint it holds; the client never sees the key", async () => {
    const stub = await keyedRpcStub();
    const proxy = await startEgressProxy({
        policy: { egress: [stub.origin], rpcUrl: "https://ipfs.io" }, port: 0, rpcUpstreams: [stub.keyedUrl],
    });
    const send = (path, method = "POST") => new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1", port: proxy.port, method, path, headers: { "content-type": "application/json" },
        }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
        req.end(method === "POST" ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) : undefined);
    });
    try {
        // Origin-form, and the absolute form a proxied fetch sends for loopback.
        for (const target of ["/rpc/0", rpcRelayUrl(proxy.port, 0)]) {
            const res = await send(target);
            assert.equal(res.status, 200, target);
            assert.equal(JSON.parse(res.body).result, "0xaa36a7");
            assert.ok(!res.body.includes(RPC_KEY));
        }
        assert.deepEqual(stub.seen, [`/v3/${RPC_KEY}`, `/v3/${RPC_KEY}`], "the relay reached the keyed path");
        assert.equal((await send("/rpc/0", "GET")).status, 405, "the relay takes POSTs only");
        assert.equal((await send("/rpc/1")).status, 404, "a relay path past the endpoints given");
        // A proxied fetch tunnels to the proxy's own port to reach the relay.
        assert.equal(await connectStatus(proxy.port, "127.0.0.1", proxy.port), 200);
    } finally {
        await proxy.close();
    }

    // No endpoint given: the relay path is absent, never a stub.
    const bare = await startEgressProxy({ policy: { egress: [stub.origin], rpcUrl: "https://ipfs.io" }, port: 0 });
    try {
        const res = await new Promise((resolve, reject) => {
            const req = http.request({ host: "127.0.0.1", port: bare.port, method: "POST", path: "/rpc/0" }, resolve);
            req.on("error", reject);
            req.end("{}");
        });
        assert.equal(res.statusCode, 404);
        assert.equal(await connectStatus(bare.port, "127.0.0.1", bare.port), 403, "no relay, no tunnel to itself");
    } finally {
        await bare.close();
    }

    // An endpoint off the allowlist is refused at start, and the refusal
    // names the origin, never the keyed path.
    await assert.rejects(
        startEgressProxy({ policy: { egress: [], rpcUrl: "https://ipfs.io" }, port: 0, rpcUpstreams: [stub.keyedUrl] }),
        (e) => /not on the policy egress allowlist/.test(e.message) && !e.message.includes(RPC_KEY),
    );
    await stub.close();
});

// ── The bootstrap's connect to the proxy ────────────────────────────────────

/** Fetch `target` from a node process that loads proxy-bootstrap.mjs and
 *  whose first `refusals` connects to the proxy's port fail with EPERM — the
 *  error the macOS kernel now and then returns for the one port the profile
 *  opens. Connects to any other port are left as they are. */
async function fetchThroughRefusingConnect({ refusals, refusePort, proxyPort, target }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-eperm-"));
    const inject = path.join(dir, "inject.mjs");
    fs.writeFileSync(inject, [
        "import net from 'node:net';",
        "const connect = net.connect;",
        `let left = ${refusals};`,
        "net.connect = function (...args) {",
        "  const o = typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };",
        `  if (Number(o.port) === ${refusePort} && left > 0) {`,
        "    left--;",
        "    const s = new net.Socket();",
        "    process.nextTick(() => s.destroy(Object.assign(new Error(`connect EPERM 127.0.0.1:${o.port}`),",
        "      { code: 'EPERM', errno: -1, syscall: 'connect', address: '127.0.0.1', port: Number(o.port) })));",
        "    return s;",
        "  }",
        "  return connect.apply(this, args);",
        "};",
    ].join("\n"));
    const probe = path.join(dir, "probe.mjs");
    fs.writeFileSync(probe, `const r = await fetch(${JSON.stringify(target)}); console.log("BODY=" + (await r.text()));`);
    try {
        return await new Promise((resolve) => {
            const child = spawn(process.execPath, [
                "--no-warnings", "--import", inject, "--import", path.join(__dirname, "..", "proxy-bootstrap.mjs"), probe,
            ], { env: { PATH: process.env.PATH, HTTP_PROXY: `http://127.0.0.1:${proxyPort}`, HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: "", no_proxy: "" } });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (c) => (stdout += c));
            child.stderr.on("data", (c) => (stderr += c));
            child.on("close", (status) => resolve({ status, stdout, stderr }));
        });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test("the bootstrap retries a connect EPERM to the proxy's port, and a refusal that persists still fails", async () => {
    const origin = http.createServer((_req, res) => res.end("through"));
    await new Promise((r) => origin.listen(0, "127.0.0.1", r));
    const target = `http://127.0.0.1:${origin.address().port}/`;
    const proxy = await startEgressProxy({ policy: { egress: [target.slice(0, -1)], rpcUrl: "https://ipfs.io" }, port: 0 });
    try {
        const spurious = await fetchThroughRefusingConnect({ refusals: 2, refusePort: proxy.port, proxyPort: proxy.port, target });
        assert.equal(spurious.status, 0, spurious.stderr);
        assert.match(spurious.stdout, /^BODY=through$/m, "a spurious refusal of the proxy's port ended the fetch");

        const persistent = await fetchThroughRefusingConnect({ refusals: 1000, refusePort: proxy.port, proxyPort: proxy.port, target });
        assert.notEqual(persistent.status, 0, "a refusal that persists was hidden");
        assert.match(persistent.stderr, /EPERM/);
    } finally {
        await proxy.close();
        await new Promise((r) => origin.close(r));
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

test("--allow-read opens exactly a default secret path, grants any other path, and refuses a grant that undoes the default", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "sbx-home-"));
    try {
        const defaults = defaultDenyReads(home);
        const root = canonical(home);
        for (const rel of [".ssh", ".aws", ".config/gh", ".gnupg", ".npmrc", ".zsh_history", ".bash_history", ".foundry/keystores"]) {
            assert.ok(defaults.includes(path.join(root, rel)), `${rel} is unreadable by default`);
        }
        const opened = applyAllowReads(defaults, [path.join(home, ".npmrc")], { home });
        assert.ok(!opened.denies.includes(path.join(root, ".npmrc")));
        assert.equal(opened.denies.length, defaults.length - 1);
        assert.deepEqual(opened.grants, [path.join(root, ".npmrc")], "opening a default grants it, and nothing else");
        // Every other path is a read grant: reads are denied by default.
        const granted = applyAllowReads(defaults, ["/etc/hosts", path.join(home, "records")], { home });
        assert.deepEqual(granted.grants, [canonical("/etc/hosts"), path.join(root, "records")]);
        assert.deepEqual(granted.refused, []);
        // A grant that would undo the default is refused, never widened.
        const refused = applyAllowReads(defaults, ["/", home, path.dirname(home), path.join(home, ".ssh", "known_hosts")], { home });
        assert.deepEqual(refused.grants, []);
        assert.equal(refused.refused.length, 4);
        assert.match(refused.refused[3].reason, /inside the default unreadable path/);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("the launcher grants what the runtime itself reads: its own directory, its linked packages, and node's install", () => {
    const runtimeDir = path.join(__dirname, "..");
    const roots = runtimeReadRoots({ runtimeDir, execPath: process.execPath, command: [process.execPath] });
    assert.ok(roots.includes(canonical(runtimeDir)), "the runtime directory");
    assert.ok(roots.includes(canonical(path.join(runtimeDir, "node_modules", "@figaro-protocol", "sdk"))), "the SDK, linked by file:");
    const nodePrefix = path.dirname(path.dirname(fs.realpathSync(process.execPath)));
    assert.ok(roots.includes(nodePrefix), "node's install prefix");
    for (const r of roots) {
        assert.notEqual(r, "/", "never the root");
        assert.ok(!canonical(os.homedir()).startsWith(r + path.sep) && r !== canonical(os.homedir()), `${r} contains the home directory`);
    }
});

test("the rendered profile denies every read before it grants any, and its secret denies come last", () => {
    const profile = renderProfile({ denyReads: ["/h/.ssh"], allowReads: ["/h/records"], home: "/h" });
    const denyAll = profile.indexOf("(deny file-read*)\n");
    const grant = profile.indexOf('(allow file-read* (subpath "/h/records"))');
    const secret = profile.indexOf('(deny file-read* (subpath "/h/.ssh"))');
    assert.ok(denyAll >= 0, "reads are denied by default");
    assert.ok(!/\(allow default\)[\s\S]*$/.test(profile.slice(denyAll)), "nothing re-allows by default after the read deny");
    assert.ok(denyAll < grant && grant < secret, "deny-all, then grants, then the secret denies (the last match wins)");
});
